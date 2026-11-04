import type { Finding } from './findings.ts';
import { reversePostorder } from './linearize.ts';
import type { BpmnElement } from './parse.ts';
import { clean } from './text.ts';
import { de } from './texts.de.ts';

export type StepKind =
  | 'start'
  | 'end'
  | 'task'
  | 'subprocess'
  | 'event'
  | 'decision'
  | 'split'
  | 'join'
  | 'join-split'
  | 'merge'
  | 'branch'
  | 'other';

export interface Exit {
  target: GraphNode;
  label: string;
  conditional: boolean;
}

export interface BoundaryInfo {
  element: BpmnElement;
  exits: Exit[];
}

export interface GraphNode {
  element: BpmnElement;
  kind: StepKind;
  label: string;
  /** Der Name stammt nicht aus dem Modell, sondern beschreibt nur die Struktur. */
  labelIsGenerated: boolean;
  role?: string;
  /** Pool oder Prozess, zu dem der Schritt gehört. */
  pool?: string;
  exits: Exit[];
  boundaries: BoundaryInfo[];
  entries: GraphNode[];
  /** Vom Start aus führt kein Weg hierher. */
  unreachable: boolean;
  /** Sichtbare Schrittnummer. 0 bei Start und Ende, die keine Arbeitsschritte sind. */
  number: number;
  /** Eindeutiges Sprungziel, das auch Start und Ende haben. */
  anchor: number;
}

export interface ProcessGraph {
  process: BpmnElement;
  title?: string;
  poolName?: string;
  nodes: GraphNode[];
  /** Rollen in Modellreihenfolge, auch solche ohne eigene Schritte. */
  roles: string[];
  /** Löst Elemente auf ihren Schritt auf, Grenzereignisse auf den Schritt, an dem sie hängen. */
  nodeOf: Map<BpmnElement, GraphNode>;
}

export type Position = { x: number; y: number };

export interface AnalyzeContext {
  positions: Map<string, Position>;
  poolName?: string;
  addFinding(finding: Finding): void;
}

const ROLE_KINDS: ReadonlySet<StepKind> = new Set(['task', 'subprocess', 'decision', 'branch']);

const list = (value: unknown): BpmnElement[] => (Array.isArray(value) ? value : []);

export function isTaskLike(kind: StepKind): boolean {
  return kind === 'task' || kind === 'subprocess';
}

export function hasRole(kind: StepKind): boolean {
  return ROLE_KINDS.has(kind);
}

export function readPositions(definitions: BpmnElement): Map<string, Position> {
  const positions = new Map<string, Position>();
  for (const diagram of list(definitions.diagrams)) {
    for (const shape of list(diagram.plane?.planeElement)) {
      const id = shape.bpmnElement?.id;
      const bounds = shape.bounds;
      if (id && typeof bounds?.x === 'number' && typeof bounds?.y === 'number') {
        positions.set(id, { x: bounds.x, y: bounds.y });
      }
    }
  }
  return positions;
}

/** Oben vor unten, links vor rechts. Fehlen Diagrammdaten, bleibt die Reihenfolge der Datei. */
function byPosition<T>(items: T[], elementOf: (item: T) => BpmnElement, positions: Map<string, Position>): T[] {
  const located = items.map((item) => ({ item, position: positions.get(elementOf(item).id) }));
  if (located.some((entry) => !entry.position)) return items;
  return located
    .sort((a, b) => a.position!.y - b.position!.y || a.position!.x - b.position!.x)
    .map((entry) => entry.item);
}

function readLanes(process: BpmnElement): { laneOf: Map<BpmnElement, string>; roles: string[] } {
  const laneOf = new Map<BpmnElement, string>();
  const roles: string[] = [];
  const walk = (lanes: BpmnElement[], parentName?: string): void => {
    for (const lane of lanes) {
      const name = clean(lane.name) || parentName;
      if (name) for (const node of list(lane.flowNodeRef)) laneOf.set(node, name);
      const children = list(lane.childLaneSet?.lanes);
      if (children.length) walk(children, name);
      else if (name && !roles.includes(name)) roles.push(name);
    }
  };
  for (const laneSet of list(process.laneSets)) walk(list(laneSet.lanes));
  return { laneOf, roles };
}

/** Findet Gateways, die für Lesende nichts aussagen und deshalb entfallen. */
function findPassThroughGateways(
  nodes: BpmnElement[],
  outgoing: Map<BpmnElement, BpmnElement[]>,
  incoming: Map<BpmnElement, BpmnElement[]>,
): Set<BpmnElement> {
  const passThrough = new Set(
    nodes.filter((node) => {
      const inCount = incoming.get(node)!.length;
      if (outgoing.get(node)!.length !== 1 || inCount === 0) return false;
      if (clean(node.name) || list(node.documentation).length) return false;
      if (node.$instanceOf('bpmn:ExclusiveGateway')) return true;
      return node.$instanceOf('bpmn:ParallelGateway') && inCount === 1;
    }),
  );
  // Ein Kreis aus lauter solchen Gateways hätte kein Ziel: Eines davon bleibt sichtbar.
  for (const start of passThrough) {
    const seen = new Set<BpmnElement>();
    let current: BpmnElement = start;
    while (passThrough.has(current)) {
      if (seen.has(current)) {
        passThrough.delete(current);
        break;
      }
      seen.add(current);
      current = outgoing.get(current)![0]!.targetRef;
    }
  }
  return passThrough;
}

function kindOf(element: BpmnElement, inCount: number, outCount: number): StepKind {
  const is = (type: string): boolean => element.$instanceOf(type);
  if (is('bpmn:StartEvent')) return 'start';
  if (is('bpmn:EndEvent')) return 'end';
  if (is('bpmn:Event')) return 'event';
  if (is('bpmn:ExclusiveGateway')) return outCount > 1 ? 'decision' : 'merge';
  if (is('bpmn:ParallelGateway')) {
    if (inCount > 1 && outCount > 1) return 'join-split';
    return inCount > 1 ? 'join' : 'split';
  }
  if (is('bpmn:Gateway')) return 'branch';
  if (is('bpmn:SubProcess') || is('bpmn:CallActivity')) return 'subprocess';
  if (is('bpmn:Activity')) return 'task';
  return 'other';
}

function generatedLabel(kind: StepKind, outCount: number): string | undefined {
  if (kind === 'split') return de.labels.split(outCount);
  if (kind === 'join') return de.labels.join;
  if (kind === 'join-split') return de.labels.joinSplit(outCount);
  return undefined;
}

export function analyzeProcess(process: BpmnElement, context: AnalyzeContext): ProcessGraph {
  const { positions, poolName, addFinding } = context;
  const flowElements = list(process.flowElements);
  const elements = flowElements.filter((element) => element.$instanceOf('bpmn:FlowNode'));
  const elementSet = new Set(elements);

  const outgoing = new Map<BpmnElement, BpmnElement[]>(elements.map((element) => [element, []]));
  const incoming = new Map<BpmnElement, BpmnElement[]>(elements.map((element) => [element, []]));
  for (const flow of flowElements.filter((element) => element.$instanceOf('bpmn:SequenceFlow'))) {
    if (!elementSet.has(flow.sourceRef) || !elementSet.has(flow.targetRef)) {
      addFinding({ severity: 'warning', code: 'broken-flow', message: de.findings.brokenFlow(flow.id), elementId: flow.id });
      continue;
    }
    outgoing.get(flow.sourceRef)!.push(flow);
    incoming.get(flow.targetRef)!.push(flow);
  }

  const passThrough = findPassThroughGateways(elements, outgoing, incoming);
  const { laneOf, roles } = readLanes(process);
  if (!roles.length && poolName) roles.push(poolName);

  const isAttached = (element: BpmnElement): boolean =>
    element.$instanceOf('bpmn:BoundaryEvent') && elementSet.has(element.attachedToRef);

  const nodeOf = new Map<BpmnElement, GraphNode>();
  const nodes: GraphNode[] = [];
  for (const element of elements) {
    if (passThrough.has(element) || isAttached(element)) continue;
    const inCount = incoming.get(element)!.length;
    const outCount = outgoing.get(element)!.length;
    const kind = kindOf(element, inCount, outCount);
    const name = clean(element.name);
    const generated = name ? undefined : generatedLabel(kind, outCount);
    const node: GraphNode = {
      element,
      kind,
      label: name || generated || de.labels.unnamed,
      labelIsGenerated: Boolean(generated),
      exits: [],
      boundaries: [],
      entries: [],
      unreachable: false,
      number: 0,
      anchor: 0,
    };
    const role = laneOf.get(element) ?? poolName;
    if (role && hasRole(kind)) node.role = role;
    const pool = poolName ?? clean(process.name);
    if (pool) node.pool = pool;
    nodes.push(node);
    nodeOf.set(element, node);
  }

  const resolve = (element: BpmnElement): GraphNode => {
    let current = element;
    while (passThrough.has(current)) current = outgoing.get(current)![0]!.targetRef;
    if (isAttached(current)) current = current.attachedToRef;
    return nodeOf.get(current)!;
  };

  const sortedFlows = (element: BpmnElement): BpmnElement[] => {
    const flows = byPosition(outgoing.get(element)!, (flow) => flow.targetRef, positions);
    return [...flows.filter((flow) => flow !== element.default), ...flows.filter((flow) => flow === element.default)];
  };

  const toExit = (source: BpmnElement, flow: BpmnElement): Exit => {
    const condition = clean(flow.conditionExpression?.body);
    const isDefault = flow === source.default;
    return {
      target: resolve(flow.targetRef),
      label: clean(flow.name) || condition || (isDefault ? de.labels.defaultExit : de.labels.unlabeledExit),
      conditional: Boolean(condition) || isDefault,
    };
  };

  for (const node of nodes) {
    node.exits = sortedFlows(node.element).map((flow) => toExit(node.element, flow));
  }
  for (const element of elements.filter(isAttached)) {
    const host = nodeOf.get(element.attachedToRef);
    host?.boundaries.push({ element, exits: sortedFlows(element).map((flow) => toExit(element, flow)) });
  }

  const successors = (node: GraphNode): GraphNode[] => [
    ...node.exits.map((exit) => exit.target),
    ...node.boundaries.flatMap((boundary) => boundary.exits.map((exit) => exit.target)),
  ];
  for (const node of nodes) {
    for (const target of new Set(successors(node))) target.entries.push(node);
  }

  const startNodes = byPosition(
    nodes.filter((node) => node.kind === 'start'),
    (node) => node.element,
    positions,
  );
  const firstNodes = startNodes.length ? startNodes : nodes.filter((node) => node.entries.length === 0);
  if (!startNodes.length) {
    addFinding({ severity: 'warning', code: 'no-start', message: de.findings.noStart(clean(process.name)), elementId: process.id });
  }

  const seen = new Set<GraphNode>();
  const ordered = reversePostorder(firstNodes.length ? firstNodes : nodes.slice(0, 1), successors, seen);

  // Nichts geht verloren: Was vom Start aus nicht erreichbar ist, steht am Ende.
  let rest = nodes.filter((node) => !seen.has(node));
  while (rest.length) {
    const orphans = rest.filter((node) => node.entries.every((entry) => entry === node));
    const group = reversePostorder(orphans.length ? orphans : rest.slice(0, 1), successors, seen);
    for (const node of group) {
      node.unreachable = true;
      addFinding({ severity: 'warning', code: 'unreachable', message: de.findings.unreachable(node.label), elementId: node.element.id });
    }
    ordered.push(...group);
    rest = rest.filter((node) => !seen.has(node));
  }

  for (const element of elements) reportElement(element, nodeOf.get(element), isAttached(element), outgoing.get(element)!, addFinding);

  const title = clean(process.name) || poolName;
  return { process, ...(title ? { title } : {}), ...(poolName ? { poolName } : {}), nodes: ordered, roles, nodeOf };
}

function reportElement(
  element: BpmnElement,
  node: GraphNode | undefined,
  attached: boolean,
  flows: BpmnElement[],
  addFinding: (finding: Finding) => void,
): void {
  const id: string = element.id;
  const name = clean(element.name);
  if (attached) {
    if (!name) addFinding({ severity: 'info', code: 'missing-name', message: de.findings.missingName(element.$type, id), elementId: id });
    return;
  }
  if (!node) return;

  if (!name && !node.labelIsGenerated) {
    const severity = node.kind === 'start' || node.kind === 'event' ? 'info' : 'warning';
    addFinding({ severity, code: 'missing-name', message: de.findings.missingName(element.$type, id), elementId: id });
  }
  if (node.kind === 'decision' || node.kind === 'branch') {
    for (const flow of flows) {
      if (!clean(flow.name) && flow !== element.default) {
        addFinding({ severity: 'warning', code: 'unlabeled-exit', message: de.findings.unlabeledExit(flow.id, node.label), elementId: flow.id });
      }
    }
  }
  if (node.kind === 'task' || node.kind === 'subprocess' || node.kind === 'event' || node.kind === 'start') {
    if (flows.length > 1) {
      addFinding({ severity: 'info', code: 'implicit-split', message: de.findings.implicitSplit(node.label), elementId: id });
    }
  }
  if (flows.length === 0 && node.kind !== 'end' && !isLinkThrow(element)) {
    addFinding({ severity: 'info', code: 'dead-end', message: de.findings.deadEnd(node.label), elementId: id });
  }
  if (node.kind === 'branch' || node.kind === 'other') {
    addFinding({ severity: 'warning', code: 'unsupported', message: de.findings.unsupportedGateway(node.label, element.$type), elementId: id });
  }
  if (node.kind === 'subprocess') {
    addFinding({ severity: 'warning', code: 'unsupported', message: de.findings.unsupportedSubprocess(node.label), elementId: id });
  }
  if (isLinkEvent(element)) {
    addFinding({ severity: 'warning', code: 'unsupported', message: de.findings.unsupportedLink(node.label), elementId: id });
  }
}

function isLinkEvent(element: BpmnElement): boolean {
  return list(element.eventDefinitions).some((definition) => definition.$instanceOf('bpmn:LinkEventDefinition'));
}

function isLinkThrow(element: BpmnElement): boolean {
  return isLinkEvent(element) && element.$instanceOf('bpmn:ThrowEvent');
}
