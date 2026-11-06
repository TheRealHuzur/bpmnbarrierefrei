import { hasRole, isTaskLike, type BoundaryInfo, type GraphNode, type ProcessGraph } from './analyze.ts';
import type { Block, Inline, ProcessDocument, StepRef } from './document.ts';
import type { BpmnElement } from './parse.ts';
import type { Branch, Item, Jump, ModelPlan } from './structure.ts';
import { clean, plainLines, plainText } from './text.ts';
import { de } from './texts.de.ts';

const list = (value: unknown): BpmnElement[] => (Array.isArray(value) ? value : []);

/** „Ende: Ende“ wäre nur ein Stottern. */
const repeatsKind = (node: GraphNode): boolean => node.label.toLowerCase() === de.kinds[node.kind].toLowerCase();

/** So wird ein Schritt genannt, wenn von anderswo auf ihn verwiesen wird. */
export const refText = (node: GraphNode): string => {
  if (node.number) return de.steps.ref(node.number, node.label);
  return repeatsKind(node) ? node.label : `${de.kinds[node.kind]}: ${node.label}`;
};

const ref = (node: GraphNode): StepRef => ({ step: node.anchor, text: refText(node) });

const inlineText = (inline: Inline): string => {
  if (typeof inline === 'string') return inline;
  return 'strong' in inline ? inline.strong : inline.text;
};

/** Schließt einen Satz ab, ohne „genehmigt?.“ zu erzeugen. */
function sentence(...content: Inline[]): Block {
  const last = content.at(-1);
  const needsStop = last !== undefined && !/[.?!:;,\-–—]$/.test(inlineText(last).trim());
  return { type: 'paragraph', content: needsStop ? [...content, '.'] : content };
}

/** Verweise, die kein Sprung sind, stehen nur in Worten da. Links bleiben echten Sprüngen vorbehalten. */
const plainList = (nodes: GraphNode[]): string => nodes.map(refText).join(', ');

const toInlines = (blocks: Block[]): Inline[] =>
  blocks.flatMap((block, index) => {
    if (block.type !== 'paragraph') return [];
    return index === 0 ? block.content : [' ', ...block.content];
  });

function documentationOf(element: BpmnElement): string[] {
  return list(element.documentation)
    .map((doc) => plainText(doc.text, doc.textFormat))
    .filter(Boolean);
}

function eventKindOf(element: BpmnElement): string | undefined {
  const [definition] = list(element.eventDefinitions);
  return definition ? (de.eventKinds[definition.$type] ?? de.genericEventKind) : undefined;
}

/** Beschreibungen können lang sein: Eine Zeile bleibt beim Schritt, mehrere werden zu eigenen Absätzen und Listen. */
function documentationParts(element: BpmnElement): { inline: Block[]; separate: Block[] } {
  const lines = list(element.documentation).flatMap((doc) => plainLines(doc.text, doc.textFormat));
  const isItem = (line: string): boolean => /^[-–•*]\s/.test(line);
  const [only] = lines;
  if (lines.length === 1 && only && !isItem(only)) return { inline: [sentence(only)], separate: [] };

  const separate: Block[] = [];
  for (const line of lines) {
    if (!isItem(line)) {
      separate.push({ type: 'paragraph', content: [line] });
      continue;
    }
    const item = line.replace(/^[-–•*]\s+/, '');
    const last = separate.at(-1);
    if (last?.type === 'list') last.items.push(item);
    else separate.push({ type: 'list', items: [item] });
  }
  return { inline: [], separate };
}

function dataNames(associations: unknown, pick: (association: BpmnElement) => unknown, stores: boolean): string[] {
  const names = list(associations).flatMap((association) => {
    const picked = pick(association);
    return (Array.isArray(picked) ? picked : [picked])
      .filter((item: BpmnElement | undefined) => Boolean(item?.$instanceOf?.('bpmn:DataStoreReference')) === stores)
      .map((item: BpmnElement | undefined) => clean(item?.name) || clean(item?.dataObjectRef?.name));
  });
  return [...new Set(names.filter(Boolean))];
}

function eventSentence(element: BpmnElement): Block | undefined {
  const eventKind = eventKindOf(element);
  // Ein Verbindungsereignis ist nur ein Sprung im Diagramm, dazu gibt es nichts zu sagen.
  if (!eventKind || eventKind === de.eventKinds['bpmn:LinkEventDefinition']) return undefined;
  if (element.$instanceOf('bpmn:IntermediateCatchEvent')) return sentence(de.steps.waitsFor(eventKind));
  if (element.$instanceOf('bpmn:IntermediateThrowEvent')) return sentence(de.steps.triggers(eventKind));
  if (element.$instanceOf('bpmn:StartEvent')) return sentence(de.steps.trigger(eventKind));
  return sentence(de.steps.eventKind(eventKind));
}

function loopSentence(element: BpmnElement): Block | undefined {
  const loop = element.loopCharacteristics;
  if (!loop) return undefined;
  if (loop.$instanceOf('bpmn:MultiInstanceLoopCharacteristics')) {
    return sentence(loop.isSequential ? de.steps.loopSequential : de.steps.loopParallel);
  }
  return sentence(de.steps.loopStandard);
}

function detailBlocks(node: GraphNode, showEventKind: boolean): Block[] {
  const { element } = node;
  const blocks: Block[] = [];
  if (showEventKind && element.$instanceOf('bpmn:Event') && node.kind !== 'other') {
    const event = eventSentence(element);
    if (event) blocks.push(event);
  }
  if (element.triggeredByEvent) blocks.push(sentence(de.steps.eventSubprocess));
  if (element.isForCompensation) blocks.push(sentence(de.steps.compensation));
  if (element.$instanceOf('bpmn:AdHocSubProcess')) blocks.push(sentence(de.steps.adHoc));
  if (element.$instanceOf('bpmn:CallActivity')) {
    blocks.push(sentence(node.calledName ? de.steps.callInternal(node.calledName) : de.steps.callActivity(clean(element.calledElement))));
  }
  const loop = loopSentence(element);
  if (loop) blocks.push(loop);
  const outputs = (association: BpmnElement): unknown => association.targetRef;
  const inputs = (association: BpmnElement): unknown => association.sourceRef;
  const add = (names: string[], text: (joined: string) => string): void => {
    if (names.length) blocks.push(sentence(text(names.join(', '))));
  };
  // Ein Datenspeicher besteht schon: Die Aufgabe schreibt hinein, sie erzeugt ihn nicht.
  add(dataNames(element.dataOutputAssociations, outputs, false), de.steps.produces);
  add(dataNames(element.dataOutputAssociations, outputs, true), de.steps.writes);
  add(dataNames(element.dataInputAssociations, inputs, false), de.steps.needs);
  add(dataNames(element.dataInputAssociations, inputs, true), de.steps.reads);
  return blocks;
}

function jumpSentence(jump: Jump, afterStep = false): Block {
  if (jump.kind === 'forward') return sentence(de.steps.next, ref(jump.target));
  return sentence(afterStep ? de.flow.backAfterStep : de.flow.back, ref(jump.target));
}

/** Diese Bausteine beginnen mit einer eigenen fetten Zeile. */
const opensWithLabel = (item: Item | undefined): boolean =>
  item !== undefined && item.type !== 'step' && item.type !== 'section';

/** Der vollständige Titel eines Schritts: „Schritt 3: …“, bei Besonderheiten mit deren Art. */
const stepTitle = (node: GraphNode): string => {
  if (!node.number || node.kind === 'task' || node.labelIsGenerated || repeatsKind(node)) return refText(node);
  return de.steps.heading(node.number, de.kinds[node.kind], node.label);
};

function branchTitle(node: GraphNode, branch: Branch, index: number, parallel: boolean): string {
  if (parallel) return de.flow.way(index + 1);
  if (branch.label === de.labels.defaultExit) return branch.label;
  if (branch.label === de.labels.unlabeledExit) return de.flow.unlabeledCase;
  if (node.kind === 'event-branch') return de.flow.firstEvent(branch.label);
  return node.kind === 'branch' ? de.flow.wayLabeled(branch.label) : de.flow.caseLabeled(branch.label);
}

const nodeOfItem = (item: Item): GraphNode | undefined => {
  if (item.type === 'section' || item.type === 'side' || item.type === 'unconnected') return undefined;
  return item.node;
};

/** Schritte, zu denen ein Link springt: Wer dort landet, hat die vorige Zuständigkeit nicht gehört. */
function collectJumpTargets(items: Item[], targets = new Set<GraphNode>()): Set<GraphNode> {
  for (const item of items) {
    if ('jump' in item && item.jump) targets.add(item.jump.target);
    if (item.type === 'side') {
      for (const jump of item.jumps) targets.add(jump.target);
      collectJumpTargets(item.body, targets);
    }
    if (item.type === 'subprocess') {
      collectJumpTargets(item.body, targets);
      collectJumpTargets(item.detached, targets);
    }
    if (item.type === 'choice' || item.type === 'parallel') {
      for (const branch of item.branches) {
        if (branch.jump) targets.add(branch.jump.target);
        if (branch.fallsTo) targets.add(branch.fallsTo);
        collectJumpTargets(branch.body, targets);
      }
    }
  }
  return targets;
}

/** Alle Schritte einschließlich der Inhalte von Teilprozessen. */
const allNodesOf = (graphs: ProcessGraph[]): GraphNode[] =>
  graphs.flatMap((graph) => graph.nodes.flatMap((node) => [node, ...(node.child ? allNodesOf([node.child]) : [])]));

export interface StepAttachments {
  notes: string[];
  messages: string[];
}

/** Enthält der Abschnitt selbst eine Entscheidung oder gleichzeitige Wege? */
const containsBranching = (items: Item[]): boolean =>
  items.some((item) => {
    if (item.type === 'choice' || item.type === 'parallel') return true;
    if (item.type === 'subprocess') return containsBranching(item.body);
    return item.type === 'side' && containsBranching(item.body);
  });

class SequenceWriter {
  private lastRole: string | undefined;
  private lastPool: string | undefined;
  private readonly attachments: Map<GraphNode, StepAttachments>;
  private readonly showPools: boolean;
  private readonly jumpTargets: Set<GraphNode>;

  constructor(attachments: Map<GraphNode, StepAttachments>, showPools: boolean, jumpTargets: Set<GraphNode>) {
    this.attachments = attachments;
    this.showPools = showPools;
    this.jumpTargets = jumpTargets;
  }

  /** Unter einer fetten Zeile stehen Beschreibungen einfach als Absätze. */
  private documentation(node: GraphNode): Block[] {
    const { inline, separate } = documentationParts(node.element);
    return [...inline, ...separate];
  }

  private details(node: GraphNode): Block[] {
    const attachment = this.attachments.get(node);
    const blocks: Block[] = [];
    for (const note of attachment?.notes ?? []) blocks.push(sentence(de.steps.note(note)));
    // „Empfängt …“ sagt schon, dass eine Nachricht der Auslöser ist.
    const receivesMessage = Boolean(attachment?.messages.length) && eventKindOf(node.element) === de.eventKinds['bpmn:MessageEventDefinition'];
    blocks.push(...detailBlocks(node, !receivesMessage));
    for (const message of attachment?.messages ?? []) blocks.push(sentence(message));
    if (node.unreachable && node.entries.every((entry) => entry === node)) blocks.push(sentence(de.steps.noWayIn));
    return blocks;
  }

  /** Die Zuständigkeit wird genannt, wenn sie wechselt, nach jeder fetten Zeile und bei jedem Sprungziel. */
  private role(node: GraphNode): Block[] {
    if (!node.role || !hasRole(node.kind)) return [];
    if (node.role === this.lastRole && !this.jumpTargets.has(node)) return [];
    this.lastRole = node.role;
    return [sentence(de.steps.role(node.role))];
  }

  /** Eine fett gesetzte Zeile. Überschriften wären hier zu laut, weil der Screenreader jedes Mal die Ebene ansagt. */
  private label(text: string, anchor?: number): Block {
    this.lastRole = undefined;
    return { type: 'label', text, ...(anchor === undefined ? {} : { anchor }) };
  }

  private stepBlocks(node: GraphNode, jump: Jump | undefined): Block[] {
    const title = stepTitle(node);
    const { inline, separate } = documentationParts(node.element);
    const before: Block[] = [...this.role(node), ...inline];
    const blocks: Block[] = this.details(node);
    if (node.kind === 'end') {
      const terminates = list(node.element.eventDefinitions).some((definition) =>
        definition.$instanceOf('bpmn:TerminateEventDefinition'),
      );
      blocks.push(sentence(terminates ? de.steps.processEnds : de.steps.pathEnds));
    } else if (node.exits.length === 0) {
      blocks.push(sentence(de.steps.deadEnd));
    }
    if (jump) blocks.push(jumpSentence(jump, true));
    const strong = /[.?!:]$/.test(title) ? title : `${title}.`;
    const step = (rest: Inline[]): Block => ({ type: 'step', anchor: node.anchor, content: [{ strong }, ...(rest.length ? [' ', ...rest] : [])] });
    if (!separate.length) return [step(toInlines([...before, ...blocks]))];
    const after = toInlines(blocks);
    return [step(toInlines(before)), ...separate, ...(after.length ? [{ type: 'paragraph', content: after } as Block] : [])];
  }

  private side({ element, exits }: BoundaryInfo, body: Item[], jumps: Jump[]): Block[] {
    const kind = eventKindOf(element) ?? de.genericEventKind;
    const interrupting = element.cancelActivity !== false;
    const out: Block[] = [this.label(de.flow.sideCase(kind, clean(element.name)))];
    const texts = documentationOf(element).map((doc) => sentence(doc));
    const hasWayOn = exits.length > 0;
    // Eine Kompensation unterbricht nichts: Sie verweist auf den Ausgleich, falls die Aufgabe später rückgängig gemacht wird.
    if (kind === de.eventKinds['bpmn:CompensateEventDefinition']) {
      out.push(sentence(de.flow.compensationHint), ...texts);
      return out;
    }
    out.push(sentence(interrupting ? de.flow.interrupting : hasWayOn ? de.flow.nonInterrupting : de.flow.nonInterruptingNoExit), ...texts);
    if (interrupting && !hasWayOn) out.push(sentence(de.steps.deadEnd));
    out.push(...this.write(body), ...jumps.map((jump) => jumpSentence(jump)));
    return out;
  }

  private branches(node: GraphNode, branches: Branch[], parallel: boolean, nextIsStep: boolean): Block[] {
    return branches.flatMap((branch, index) => {
      if (parallel && branch.body.length === 0 && !branch.jump) return [];
      // Ohne Überschriftenebenen wäre nach einer inneren Entscheidung unklar, wozu dieser Fall gehört.
      const title = branchTitle(node, branch, index, parallel);
      const followsNested = node.number > 0 && branches.slice(0, index).some((earlier) => containsBranching(earlier.body));
      const out: Block[] = [this.label(followsNested ? de.flow.caseOf(title, node.number) : title)];
      // Folgt direkt ein Schritt, ist klar, dass es hier weitergeht.
      if (branch.continues) return nextIsStep ? out : [...out, sentence(de.flow.continuesHere)];
      out.push(...this.write(branch.body));
      if (branch.jump) out.push(jumpSentence(branch.jump));
      if (branch.fallsTo) {
        // Beim letzten Fall folgt das Ziel direkt darunter, sonst überspringt man die anderen Fälle: Das ist ein echter Sprung.
        const isLast = index === branches.length - 1;
        out.push(sentence(de.flow.noOwnStepTo, isLast ? refText(branch.fallsTo) : ref(branch.fallsTo)));
      }
      return out;
    });
  }

  /** Wechsel zwischen Pools sind die Schnittstellen des Prozesses und bekommen deshalb eine eigene Zeile. */
  private poolChange(item: Item): Block[] {
    const pool = nodeOfItem(item)?.pool;
    if (!this.showPools || !pool || pool === this.lastPool) return [];
    const text = this.lastPool === undefined ? de.flow.beginAt(pool) : de.flow.changeTo(pool);
    this.lastPool = pool;
    return [this.label(text)];
  }

  write(items: Item[]): Block[] {
    const out: Block[] = [];

    for (const [index, item] of items.entries()) {
      const next = items[index + 1];
      out.push(...this.poolChange(item));
      switch (item.type) {
        case 'step':
          out.push(...this.stepBlocks(item.node, item.jump));
          break;
        case 'subprocess': {
          out.push(this.label(stepTitle(item.node), item.node.anchor), ...this.role(item.node), ...this.documentation(item.node), ...this.details(item.node));
          out.push(...this.write(item.body));
          if (item.detached.length) {
            out.push(this.label(de.flow.unreachable), ...this.write(item.detached));
          }
          out.push(sentence(de.flow.subprocessDone(item.node.label)));
          this.lastRole = undefined;
          if (item.jump) out.push(jumpSentence(item.jump));
          break;
        }
        case 'choice': {
          // Bei einem Teilprozess hat der Schritt seine Zeile schon.
          if (!item.node.child) out.push(this.label(stepTitle(item.node), item.node.anchor), ...this.role(item.node), ...this.documentation(item.node), ...this.details(item.node));
          if (item.node.kind === 'branch') out.push(sentence(de.flow.branchIntro));
          else if (item.node.kind === 'event-branch') out.push(sentence(de.flow.eventBranchIntro));
          else if (item.node.kind !== 'decision') out.push(sentence(de.steps.conditionalExits));
          out.push(...this.branches(item.node, item.branches, false, next?.type === 'step'));
          break;
        }
        case 'parallel': {
          if (item.node.kind !== 'join-split' && !item.node.child) {
            out.push(this.label(stepTitle(item.node), item.node.anchor), ...this.role(item.node), ...this.documentation(item.node), ...this.details(item.node));
          }
          // Ein erzeugter Titel sagt es schon: „2 Wege laufen gleichzeitig“.
          if (!item.node.labelIsGenerated) out.push(sentence(de.flow.parallelIntro));
          const simple = item.branches.every(
            (branch) => !branch.jump && branch.body.length === 1 && branch.body[0]!.type === 'step',
          );
          if (simple) {
            this.lastRole = undefined;
            out.push(...this.write(item.branches.flatMap((branch) => branch.body)));
          } else {
            out.push(...this.branches(item.node, item.branches, true, false));
          }
          break;
        }
        case 'side':
          out.push(...this.side(item.boundary, item.body, item.jumps));
          break;
        case 'join': {
          out.push(this.label(stepTitle(item.node), item.node.anchor), ...this.documentation(item.node), ...this.details(item.node));
          if (!item.absorbed) {
            const waits = item.node.entries.filter((entry) => entry !== item.node);
            const inclusive = item.node.element.$instanceOf('bpmn:InclusiveGateway');
            if (waits.length) out.push(sentence(inclusive ? de.steps.waitForInclusive : de.steps.waitFor, plainList(waits)));
          }
          if (item.jump) out.push(jumpSentence(item.jump));
          break;
        }
        case 'section':
          // Direkt vor einer anderen fetten Zeile bliebe dieser Abschnitt leer. Die Sonderabläufe gliedern aber mehrere Schritte.
          if (item.section === 'special' || (!opensWithLabel(next) && !(next && this.showPools && nodeOfItem(next)?.pool !== this.lastPool))) {
            out.push(this.label(de.flow.sections[item.section]));
          }
          break;
        case 'later': {
          const entries = item.node.entries.filter((entry) => entry !== item.node).sort((a, b) => a.anchor - b.anchor);
          // Der Name folgt direkt darunter beim Schritt selbst.
          out.push(this.label(de.flow.later(item.node.number ? de.steps.short(item.node.number) : refText(item.node))));
          if (entries.length) out.push(sentence(de.flow.comesFrom, plainList(entries)));
          break;
        }
        case 'unconnected': {
          const name = item.node.pool ?? de.labels.unnamed;
          this.lastPool = item.node.pool;
          out.push(this.label(de.flow.unconnected(name)), sentence(de.flow.unconnectedNote));
          break;
        }
      }
    }
    return out;
  }
}

export interface ComposeInput {
  title: string;
  graphs: ProcessGraph[];
  plan: ModelPlan;
  attachments: Map<GraphNode, StepAttachments>;
  generalNotes: Map<ProcessGraph, string[]>;
  /** Pools ohne eigenen Prozess. */
  externals: string[];
  /** Nachrichten, die an keinem Schritt hängen. */
  freeMessages: string[];
}

export function composeDocument(input: ComposeInput): ProcessDocument {
  const { title, graphs, plan, attachments, generalNotes, externals, freeMessages } = input;
  const allNodes = allNodesOf(graphs);
  const steps = allNodes.filter((node) => node.number > 0).length;
  const tasks = allNodes.filter((node) => node.kind === 'task').length;
  const subprocesses = allNodes.filter((node) => node.kind === 'subprocess').length;
  const decisions = allNodes.filter((node) => node.kind === 'decision' || node.kind === 'branch').length;
  // Ergebnisse des Prozesses sind nur die Enden der obersten Ebene, nicht die im Inneren von Teilprozessen.
  const ends = graphs
    .flatMap((graph) => graph.nodes)
    .filter((node) => node.kind === 'end')
    .sort((a, b) => a.anchor - b.anchor);
  const showPools = new Set(allNodes.map((node) => node.pool)).size > 1;

  const overview: Block[] = graphs.flatMap((graph) => documentationOf(graph.process)).map((doc) => ({ type: 'paragraph', content: [doc] }));
  overview.push(sentence(de.overview.summary(steps, tasks, subprocesses, decisions)));
  const outcomes = [...new Set(ends.filter((node) => clean(node.element.name)).map((node) => node.label))];
  overview.push(outcomes.length ? sentence(de.overview.outcomes + outcomes.join(', ')) : sentence(de.overview.noOutcomes));
  overview.push({ type: 'paragraph', content: [de.overview.readingHelp(showPools)] });

  const roles: string[] = [];
  for (const graph of graphs) {
    for (const role of graph.roles) {
      // Bei mehreren Prozessen zählt der Pool, denn Prozessnamen sind oft technisch („Process_1“).
      const owner = graph.poolName ?? graph.title;
      roles.push(graphs.length > 1 && owner && owner !== role ? `${owner}, ${role}` : role);
    }
  }
  for (const external of externals) roles.push(de.overview.roleExternal(external));
  // Bei nur einem Pool mit Lanes stünde sein Name sonst nirgends.
  const [onlyGraph] = graphs;
  const onlyPool = graphs.length === 1 ? onlyGraph?.poolName : undefined;
  const rolesIntro = onlyPool && !onlyGraph?.roles.includes(onlyPool) ? de.overview.rolesOf(onlyPool) : undefined;

  const notes: Block[] = graphs
    .flatMap((graph) => generalNotes.get(graph) ?? [])
    .map((note) => ({ type: 'paragraph', content: [de.overview.generalNote(note)] }));
  const writer = new SequenceWriter(attachments, showPools, collectJumpTargets([...plan.main, ...plan.unreachable]));
  const flow: Block[] = [...notes, ...writer.write(plan.main)];
  if (plan.unreachable.length) {
    flow.push({ type: 'label', text: de.flow.unreachable }, ...writer.write(plan.unreachable));
  }

  return {
    lang: de.lang,
    title,
    documentTitle: de.documentTitle(title),
    overviewHeading: de.headings.overview,
    overview,
    rolesHeading: de.headings.roles,
    ...(rolesIntro ? { rolesIntro } : {}),
    roles,
    messagesHeading: de.headings.messages,
    messages: freeMessages,
    flowHeading: de.headings.flow,
    flow,
  };
}
