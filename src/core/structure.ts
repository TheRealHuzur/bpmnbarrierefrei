import type { BoundaryInfo, Exit, GraphNode, ProcessGraph } from './analyze.ts';
import { reversePostorder } from './linearize.ts';

export interface Jump {
  kind: 'back' | 'forward';
  target: GraphNode;
}

export interface Branch {
  label: string;
  body: Item[];
  jump?: Jump;
  /** Der Zweig hat keine eigenen Schritte und führt zu diesem Schritt hinter der Entscheidung. */
  fallsTo?: GraphNode;
  /** Der Zweig läuft ohne Einrückung im umgebenden Ablauf weiter. */
  continues?: boolean;
}

export type Item =
  | { type: 'step'; node: GraphNode; jump?: Jump }
  | { type: 'subprocess'; node: GraphNode; body: Item[]; detached: Item[]; jump?: Jump }
  | { type: 'choice'; node: GraphNode; branches: Branch[] }
  | { type: 'parallel'; node: GraphNode; branches: Branch[] }
  | { type: 'side'; boundary: BoundaryInfo; body: Item[]; jumps: Jump[] }
  | { type: 'join'; node: GraphNode; absorbed: boolean; jump?: Jump }
  | { type: 'section'; section: 'together' | 'regular' | 'other-start' | 'special' }
  | { type: 'later'; node: GraphNode }
  | { type: 'unconnected'; node: GraphNode };

interface ScopePlan {
  main: Item[];
  /** Vom Start aus nicht erreichbar. */
  unreachable: Item[];
}

export interface ModelPlan extends ScopePlan {
  /** Beginn von Teilen, die keine Nachricht mit dem Rest verbindet. */
  unconnected: GraphNode[];
}

/** Eine Nachricht zwischen zwei Schritten legt fest, was zeitlich zuerst kommt. */
export interface MessageLink {
  from: GraphNode;
  to: GraphNode;
}

const ROOT = -1;

function successorsOf(node: GraphNode): GraphNode[] {
  return [...node.exits, ...node.boundaries.flatMap((boundary) => boundary.exits)].map((exit) => exit.target);
}

/** Zeitliche Reihenfolge über alle Pools: Wer eine Nachricht empfängt, steht hinter dem, der sie sendet. */
function chronologicalOrder(graphs: ProcessGraph[], messages: Map<GraphNode, GraphNode[]>): GraphNode[] {
  const all = graphs.flatMap((graph) => graph.nodes);
  const receivers = new Set([...messages.values()].flat());
  const next = (node: GraphNode): GraphNode[] => [...successorsOf(node), ...(messages.get(node) ?? [])];
  const opens = (node: GraphNode): boolean => node.kind === 'start' || node.entries.every((entry) => entry === node);

  const seen = new Set<GraphNode>();
  const reachable = all.filter((node) => !node.unreachable);
  const order = reversePostorder(reachable.filter((node) => opens(node) && !receivers.has(node) && !node.special), next, seen);
  const addRest = (candidates: GraphNode[]): void => {
    let rest = candidates.filter((node) => !seen.has(node));
    while (rest.length) {
      const starts = rest.filter(opens);
      order.push(...reversePostorder(starts.length ? starts : rest.slice(0, 1), next, seen));
      rest = rest.filter((node) => !seen.has(node));
    }
  };
  addRest(reachable);
  addRest(all);
  return order;
}

/**
 * Dominatorbaum nach Cooper, Harvey und Kennedy: Ein Knoten dominiert einen anderen,
 * wenn jeder Weg vom Start dorthin über ihn führt. Nicht erreichbare Teile zählen getrennt.
 */
function analyzeDominance(nodes: GraphNode[], messages: Map<GraphNode, GraphNode[]>) {
  const rpo = new Map(nodes.map((node, index) => [node, index]));
  const preds: number[][] = nodes.map(() => []);
  const forwardEdges = new Map<GraphNode, number>(nodes.map((node) => [node, 0]));
  const forwardFlows = new Map<GraphNode, number>(nodes.map((node) => [node, 0]));

  const addEdge = (source: GraphNode, target: GraphNode, isFlow: boolean): void => {
    if (source.unreachable !== target.unreachable) return;
    const from = rpo.get(source)!;
    const to = rpo.get(target)!;
    preds[to]!.push(from);
    if (from >= to) return;
    forwardEdges.set(target, forwardEdges.get(target)! + 1);
    if (isFlow) forwardFlows.set(target, forwardFlows.get(target)! + 1);
  };
  for (const node of nodes) {
    for (const target of successorsOf(node)) addEdge(node, target, true);
    for (const target of messages.get(node) ?? []) addEdge(node, target, false);
  }

  const idom: (number | undefined)[] = nodes.map(() => undefined);
  const intersect = (first: number, second: number): number => {
    let a = first;
    let b = second;
    while (a !== b) {
      while (a > b) a = a === ROOT ? ROOT : (idom[a] as number);
      while (b > a) b = b === ROOT ? ROOT : (idom[b] as number);
    }
    return a;
  };
  nodes.forEach((node, index) => {
    if (forwardEdges.get(node) === 0) idom[index] = ROOT;
  });
  for (let changed = true; changed; ) {
    changed = false;
    nodes.forEach((node, index) => {
      if (forwardEdges.get(node) === 0) return;
      let candidate: number | undefined;
      for (const pred of preds[index]!) {
        if (idom[pred] === undefined) continue;
        candidate = candidate === undefined ? pred : intersect(pred, candidate);
      }
      if (candidate !== undefined && idom[index] !== candidate) {
        idom[index] = candidate;
        changed = true;
      }
    });
  }

  const children = new Map<GraphNode | null, GraphNode[]>();
  const subtreeSize = new Map<GraphNode, number>(nodes.map((node) => [node, 1]));
  nodes.forEach((node, index) => {
    const parentIndex = idom[index] ?? ROOT;
    const parent = parentIndex === ROOT ? null : nodes[parentIndex]!;
    const siblings = children.get(parent);
    if (siblings) siblings.push(node);
    else children.set(parent, [node]);
  });
  for (let index = nodes.length - 1; index >= 0; index--) {
    const parentIndex = idom[index] ?? ROOT;
    if (parentIndex === ROOT) continue;
    const parent = nodes[parentIndex]!;
    subtreeSize.set(parent, subtreeSize.get(parent)! + subtreeSize.get(nodes[index]!)!);
  }
  return { rpo, children, subtreeSize, forwardEdges, forwardFlows };
}

/**
 * Ordnet alle Schritte des Modells zu einem einzigen Ablauf: Zweige stehen unter ihrer Entscheidung,
 * gemeinsame Fortsetzungen dahinter, Übergaben per Nachricht führen in den anderen Pool.
 * Was nicht in diese Form passt, wird zum Sprung. Jeder Knoten erscheint genau einmal,
 * denn er wird dort eingehängt, wo sein Vater im Dominatorbaum steht.
 */
export function planModel(graphs: ProcessGraph[], links: MessageLink[]): ModelPlan {
  // Eine Nachricht aus einem Teilprozess ordnet den umgebenden Schritt ein.
  const enclosing = new Map<GraphNode, GraphNode>();
  const register = (outer: GraphNode, graph: ProcessGraph): void => {
    for (const node of graph.nodes) {
      enclosing.set(node, outer);
      if (node.child) register(outer, node.child);
    }
  };
  for (const graph of graphs) for (const node of graph.nodes) if (node.child) register(node, node.child);

  const messages = new Map<GraphNode, GraphNode[]>();
  for (const { from, to } of links) {
    const source = enclosing.get(from) ?? from;
    const target = enclosing.get(to) ?? to;
    if (source !== target) messages.set(source, [...(messages.get(source) ?? []), target]);
  }

  const receivers = new Set(links.map((link) => link.to));
  // Start und Ende sind keine Arbeitsschritte. Ein Start, den eine Nachricht auslöst, ist aber eine Übergabe und zählt mit.
  const isNumbered = (node: GraphNode): boolean => node.kind !== 'end' && (node.kind !== 'start' || receivers.has(node));
  const unconnected: GraphNode[] = [];
  let number = 1;
  let anchor = 1;

  const planScope = (scope: ProcessGraph[], scopeMessages: Map<GraphNode, GraphNode[]>): ScopePlan => {
    const nodes = chronologicalOrder(scope, scopeMessages);
    const { rpo, children, subtreeSize, forwardEdges, forwardFlows } = analyzeDominance(nodes, scopeMessages);
    const graphOf = new Map(scope.flatMap((graph) => graph.nodes.map((node) => [node, graph] as const)));
    const absorbedJoins = new Set<GraphNode>();

    const childrenOf = (node: GraphNode | null): GraphNode[] => children.get(node) ?? [];

    const makeJump = (source: GraphNode, target: GraphNode, fallTo: GraphNode | undefined): Jump | undefined => {
      if (target === fallTo) return undefined;
      const sameArea = source.unreachable === target.unreachable;
      return { kind: sameArea && rpo.get(target)! <= rpo.get(source)! ? 'back' : 'forward', target };
    };

    const build = (first: GraphNode, inheritedFall: GraphNode | undefined): Item[] => {
      const items: Item[] = [];
      let current: GraphNode | undefined = first;

      while (current) {
        const node: GraphNode = current;
        current = undefined;
        node.anchor = anchor++;
        if (isNumbered(node)) node.number = number++;

        const flowTargets = successorsOf(node);
        const messageTargets = scopeMessages.get(node) ?? [];
        const own = childrenOf(node);
        const inline = own.filter(
          (child) => forwardEdges.get(child) === 1 && (flowTargets.includes(child) || messageTargets.includes(child)),
        );
        const merges = own.filter((child) => !inline.includes(child));
        const follow = merges[0];
        const isInline = (exit: Exit): boolean => inline.includes(exit.target);
        // Empfänger einer Nachricht, zu denen sonst nichts hinführt: Hier geht der Ablauf in den anderen Pool.
        const handovers = inline.filter((child) => !flowTargets.includes(child));

        const isJoinKind = node.kind === 'join' || node.kind === 'join-split';
        const absorbed = absorbedJoins.has(node);

        const pushSubprocess = (jump?: Jump): void => {
          const plan = planScope([node.child!], new Map());
          items.push({ type: 'subprocess', node, body: plan.main, detached: plan.unreachable, ...(jump ? { jump } : {}) });
        };
        const addSides = (): void => {
          for (const boundary of node.boundaries) {
            const body = boundary.exits.filter(isInline).flatMap((exit) => build(exit.target, follow));
            const jumps = boundary.exits
              .filter((exit) => !isInline(exit))
              .map((exit) => makeJump(node, exit.target, follow))
              .filter((jump): jump is Jump => jump !== undefined);
            items.push({ type: 'side', boundary, body, jumps });
          }
        };
        const addHandovers = (after: GraphNode | undefined): void => {
          handovers.forEach((handover, index) => items.push(...build(handover, handovers[index + 1] ?? after)));
        };

        let continuation: GraphNode | undefined;

        if (node.exits.length > 1) {
          const isParallel =
            node.kind === 'split' ||
            node.kind === 'join-split' ||
            ((node.kind === 'task' || node.kind === 'subprocess' || node.kind === 'event' || node.kind === 'start') &&
              !node.exits.some((exit) => exit.conditional));

          if (node.kind === 'join-split') items.push({ type: 'join', node, absorbed });
          if (node.child) pushSubprocess();

          // Bei Parallelität laufen alle Wege gleichrangig. Sonst läuft der größte Zweig flach weiter, wenn nichts zusammenläuft.
          // Er steht zuletzt, bei gleicher Größe bleibt so die Reihenfolge des Modells erhalten.
          const inlineExits = node.exits.filter(isInline);
          const main =
            !isParallel && merges.length === 0
              ? inlineExits.reduce<Exit | undefined>(
                  (best, exit) => (!best || subtreeSize.get(exit.target)! >= subtreeSize.get(best.target)! ? exit : best),
                  undefined,
                )
              : undefined;
          const sideFall = main ? undefined : (follow ?? inheritedFall);

          addSides();
          addHandovers(undefined);
          const exits = main ? [...node.exits.filter((exit) => exit !== main), main] : node.exits;
          const branches: Branch[] = exits.map((exit) => {
            if (exit === main) return { label: exit.label, body: [], continues: true };
            if (isInline(exit)) return { label: exit.label, body: build(exit.target, sideFall) };
            const jump = makeJump(node, exit.target, sideFall);
            return { label: exit.label, body: [], ...(jump ? { jump } : { fallsTo: exit.target }) };
          });

          if (isParallel) {
            if (follow?.kind === 'join') absorbedJoins.add(follow);
            items.push({ type: 'parallel', node, branches });
          } else {
            items.push({ type: 'choice', node, branches });
          }
          continuation = main?.target;
        } else {
          const [exit] = node.exits;
          const inlineNext = exit && isInline(exit) ? exit.target : undefined;
          const jump = exit && !inlineNext ? makeJump(node, exit.target, follow ?? inheritedFall) : undefined;

          if (isJoinKind) items.push({ type: 'join', node, absorbed, ...(jump ? { jump } : {}) });
          else if (node.child) pushSubprocess(jump);
          else items.push({ type: 'step', node, ...(jump ? { jump } : {}) });

          addSides();
          addHandovers(inlineNext ?? follow ?? inheritedFall);
          if (inlineNext) {
            if (node.boundaries.length) items.push({ type: 'section', section: 'regular' });
            if (merges.length) items.push(...build(inlineNext, follow));
            else continuation = inlineNext;
          }
        }

        if (continuation) {
          current = continuation;
          continue;
        }

        merges.forEach((merge, index) => {
          // Kommt nur eine Nachricht dazu, laufen keine Wege zusammen. Den Wechsel nennt dann die Pool-Überschrift.
          const flowsTogether = forwardFlows.get(merge)! >= 2;
          const opensWithHeading = merge.exits.length > 1 || merge.kind === 'join' || merge.kind === 'join-split';
          if (index > 0 && flowsTogether) items.push({ type: 'later', node: merge });
          else if (index === 0 && flowsTogether && !opensWithHeading) items.push({ type: 'section', section: 'together' });
          if (index === merges.length - 1) current = merge;
          else items.push(...build(merge, merges[index + 1]));
        });
      }
      return items;
    };

    const buildGroup = (group: GraphNode[], trackConnections: boolean): Item[] => {
      let specialsOpened = false;
      return group.flatMap((node, index) => {
        const items: Item[] = [];
        const previous = group[index - 1];
        if (node.special) {
          if (!specialsOpened) items.push({ type: 'section', section: 'special' });
          specialsOpened = true;
        } else if (previous) {
          const isOpening = forwardEdges.get(node) === 0;
          if (isOpening && graphOf.get(previous) !== graphOf.get(node) && trackConnections) {
            items.push({ type: 'unconnected', node });
            unconnected.push(node);
          } else if (isOpening) {
            items.push({ type: 'section', section: 'other-start' });
          } else if (forwardFlows.get(node)! >= 2 && !(node.exits.length > 1 || node.kind === 'join' || node.kind === 'join-split')) {
            items.push({ type: 'section', section: 'together' });
          }
        }
        return [...items, ...build(node, group[index + 1])];
      });
    };

    const roots = childrenOf(null);
    return {
      main: buildGroup(roots.filter((node) => !node.unreachable), true),
      unreachable: buildGroup(roots.filter((node) => node.unreachable), false),
    };
  };

  return { ...planScope(graphs, messages), unconnected };
}
