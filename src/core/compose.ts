import { hasRole, isTaskLike, type BoundaryInfo, type GraphNode, type ProcessGraph } from './analyze.ts';
import type { Block, Inline, ProcessDocument, StepRef } from './document.ts';
import type { BpmnElement } from './parse.ts';
import type { Branch, Item, Jump, ModelPlan } from './structure.ts';
import { clean, plainText } from './text.ts';
import { de } from './texts.de.ts';

const TOP_LEVEL = 3;

const list = (value: unknown): BpmnElement[] => (Array.isArray(value) ? value : []);

/** So wird ein Schritt genannt, wenn von anderswo auf ihn verwiesen wird. */
export const refText = (node: GraphNode): string =>
  node.number ? de.steps.ref(node.number, node.label) : `${de.kinds[node.kind]}: ${node.label}`;

const ref = (node: GraphNode): StepRef => ({ step: node.anchor, text: refText(node) });

const inlineText = (inline: Inline): string => {
  if (typeof inline === 'string') return inline;
  return 'strong' in inline ? inline.strong : inline.text;
};

/** Schließt einen Satz ab, ohne „genehmigt?.“ zu erzeugen. */
function sentence(...content: Inline[]): Block {
  const last = content.at(-1);
  const needsStop = last !== undefined && !/[.?!:]$/.test(inlineText(last).trim());
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

function dataNames(associations: unknown, pick: (association: BpmnElement) => unknown): string[] {
  const names = list(associations).flatMap((association) => {
    const picked = pick(association);
    return (Array.isArray(picked) ? picked : [picked]).map((item: BpmnElement | undefined) =>
      clean(item?.name) || clean(item?.dataObjectRef?.name),
    );
  });
  return [...new Set(names.filter(Boolean))];
}

function detailBlocks(node: GraphNode, showEventKind: boolean): Block[] {
  const { element } = node;
  const blocks: Block[] = [];
  if (showEventKind && element.$instanceOf('bpmn:Event') && node.kind !== 'other') {
    const eventKind = eventKindOf(element);
    if (eventKind) blocks.push(sentence(de.steps.eventKind(eventKind)));
  }
  if (element.$instanceOf('bpmn:CallActivity')) {
    blocks.push(sentence(de.steps.callActivity(clean(element.calledElement))));
  } else if (node.kind === 'subprocess') {
    const count = list(element.flowElements).filter((child) => child.$instanceOf('bpmn:FlowNode')).length;
    if (count) blocks.push(sentence(de.steps.subprocessContent(count)));
  }
  const produces = dataNames(element.dataOutputAssociations, (association) => association.targetRef);
  if (produces.length) blocks.push(sentence(de.steps.produces(produces.join(', '))));
  const needs = dataNames(element.dataInputAssociations, (association) => association.sourceRef);
  if (needs.length) blocks.push(sentence(de.steps.needs(needs.join(', '))));
  return blocks;
}

function jumpSentence(jump: Jump, afterStep = false): Block {
  if (jump.kind === 'forward') return sentence(de.steps.next, ref(jump.target));
  return sentence(afterStep ? de.flow.backAfterStep : de.flow.back, ref(jump.target));
}

/** Diese Bausteine beginnen mit einer eigenen Überschrift. */
const opensWithHeading = (item: Item | undefined): boolean =>
  item !== undefined && item.type !== 'step' && item.type !== 'section';

/** Der vollständige Titel eines Schritts: „Schritt 3: …“, bei Besonderheiten mit deren Art. */
const stepTitle = (node: GraphNode): string => {
  if (!node.number || node.kind === 'task' || node.labelIsGenerated) return refText(node);
  return de.steps.heading(node.number, de.kinds[node.kind], node.label);
};

function branchTitle(node: GraphNode, branch: Branch, index: number, parallel: boolean): string {
  if (parallel) return de.flow.way(index + 1);
  if (branch.label === de.labels.defaultExit) return branch.label;
  if (branch.label === de.labels.unlabeledExit) return de.flow.unlabeledCase;
  return node.kind === 'branch' ? de.flow.wayLabeled(branch.label) : de.flow.caseLabeled(branch.label);
}

const nodeOfItem = (item: Item): GraphNode | undefined => {
  if (item.type === 'section' || item.type === 'side' || item.type === 'unconnected') return undefined;
  return item.node;
};

export interface StepAttachments {
  notes: string[];
  messages: string[];
}

class SequenceWriter {
  private lastRole: string | undefined;
  private lastPool: string | undefined;
  private readonly attachments: Map<GraphNode, StepAttachments>;
  private readonly showPools: boolean;

  constructor(attachments: Map<GraphNode, StepAttachments>, showPools: boolean) {
    this.attachments = attachments;
    this.showPools = showPools;
  }

  private details(node: GraphNode): Block[] {
    const attachment = this.attachments.get(node);
    const blocks: Block[] = [];
    for (const doc of documentationOf(node.element)) blocks.push(sentence(doc));
    for (const note of attachment?.notes ?? []) blocks.push(sentence(de.steps.note(note)));
    // „Empfängt …“ sagt schon, dass eine Nachricht der Auslöser ist.
    const receivesMessage = Boolean(attachment?.messages.length) && eventKindOf(node.element) === de.eventKinds['bpmn:MessageEventDefinition'];
    blocks.push(...detailBlocks(node, !receivesMessage));
    for (const message of attachment?.messages ?? []) blocks.push(sentence(message));
    if (node.unreachable && node.entries.every((entry) => entry === node)) blocks.push(sentence(de.steps.noWayIn));
    return blocks;
  }

  /** Die Zuständigkeit wird nur genannt, wenn sie wechselt, und nach jeder Überschrift neu. */
  private role(node: GraphNode): Block[] {
    if (!node.role || !hasRole(node.kind) || node.role === this.lastRole) return [];
    this.lastRole = node.role;
    return [sentence(de.steps.role(node.role))];
  }

  private heading(level: number, text: string, anchor?: number): Block {
    this.lastRole = undefined;
    return { type: 'heading', level, text, ...(anchor === undefined ? {} : { anchor }) };
  }

  private stepBlock(node: GraphNode, jump: Jump | undefined): Block {
    const title = stepTitle(node);
    const blocks: Block[] = [...this.role(node), ...this.details(node)];
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
    const rest = toInlines(blocks);
    return { type: 'step', anchor: node.anchor, content: [{ strong }, ...(rest.length ? [' ', ...rest] : [])] };
  }

  private side({ element, exits }: BoundaryInfo, body: Item[], jumps: Jump[], level: number): Block[] {
    const kind = eventKindOf(element) ?? de.genericEventKind;
    const interrupting = element.cancelActivity !== false;
    const out: Block[] = [this.heading(level, de.flow.sideCase(kind, clean(element.name)))];
    const texts = documentationOf(element).map((doc) => sentence(doc));
    const hasWayOn = exits.length > 0;
    out.push(sentence(interrupting ? de.flow.interrupting : hasWayOn ? de.flow.nonInterrupting : de.flow.nonInterruptingNoExit), ...texts);
    if (interrupting && !hasWayOn) out.push(sentence(de.steps.deadEnd));
    out.push(...this.write(body, level + 1), ...jumps.map((jump) => jumpSentence(jump)));
    return out;
  }

  private branches(node: GraphNode, branches: Branch[], level: number, parallel: boolean, nextIsStep: boolean): Block[] {
    return branches.flatMap((branch, index) => {
      if (parallel && branch.body.length === 0 && !branch.jump) return [];
      const out: Block[] = [this.heading(level, branchTitle(node, branch, index, parallel))];
      // Folgt direkt ein Schritt, ist klar, dass es hier weitergeht.
      if (branch.continues) return nextIsStep ? out : [...out, sentence(de.flow.continuesHere)];
      out.push(...this.write(branch.body, level + 1));
      if (branch.jump) out.push(jumpSentence(branch.jump));
      else if (branch.body.length === 0) out.push(sentence(de.flow.noOwnStep));
      return out;
    });
  }

  /** Wechsel zwischen Pools sind die Schnittstellen des Prozesses und deshalb Überschriften. */
  private poolChange(item: Item, level: number): Block[] {
    const pool = nodeOfItem(item)?.pool;
    if (!this.showPools || !pool || pool === this.lastPool) return [];
    const text = this.lastPool === undefined ? de.flow.beginAt(pool) : de.flow.changeTo(pool);
    this.lastPool = pool;
    return [this.heading(level, text)];
  }

  write(items: Item[], level: number): Block[] {
    const out: Block[] = [];

    for (const [index, item] of items.entries()) {
      const next = items[index + 1];
      out.push(...this.poolChange(item, level));
      switch (item.type) {
        case 'step':
          out.push(this.stepBlock(item.node, item.jump));
          break;
        case 'choice': {
          out.push(this.heading(level, stepTitle(item.node), item.node.anchor), ...this.role(item.node), ...this.details(item.node));
          if (item.node.kind === 'branch') out.push(sentence(de.flow.branchIntro));
          else if (item.node.kind !== 'decision') out.push(sentence(de.steps.conditionalExits));
          out.push(...this.branches(item.node, item.branches, level + 1, false, next?.type === 'step'));
          break;
        }
        case 'parallel': {
          if (item.node.kind !== 'join-split') out.push(this.heading(level, stepTitle(item.node), item.node.anchor));
          out.push(...this.role(item.node), ...this.details(item.node));
          out.push(sentence(de.flow.parallelIntro));
          const simple = item.branches.every(
            (branch) => !branch.jump && branch.body.length === 1 && branch.body[0]!.type === 'step',
          );
          if (simple) {
            this.lastRole = undefined;
            out.push(...this.write(item.branches.flatMap((branch) => branch.body), level));
          } else {
            out.push(...this.branches(item.node, item.branches, level + 1, true, false));
          }
          break;
        }
        case 'side':
          out.push(...this.side(item.boundary, item.body, item.jumps, level));
          break;
        case 'join': {
          const text = item.absorbed && item.node.labelIsGenerated ? de.flow.afterParallel(item.node.number) : stepTitle(item.node);
          out.push(this.heading(level, text, item.node.anchor), ...this.details(item.node));
          if (!item.absorbed) {
            const waits = item.node.entries.filter((entry) => entry !== item.node);
            if (waits.length) out.push(sentence(de.steps.waitFor, plainList(waits)));
          }
          if (item.jump) out.push(jumpSentence(item.jump));
          break;
        }
        case 'section':
          // Direkt vor einer anderen Überschrift bliebe dieser Abschnitt leer.
          if (!opensWithHeading(next) && !(next && this.showPools && nodeOfItem(next)?.pool !== this.lastPool)) {
            out.push(this.heading(level, de.flow.sections[item.section]));
          }
          break;
        case 'later': {
          const entries = item.node.entries.filter((entry) => entry !== item.node);
          // Der Name folgt direkt darunter beim Schritt selbst.
          out.push(this.heading(level, de.flow.later(item.node.number ? de.steps.short(item.node.number) : refText(item.node))));
          if (entries.length) out.push(sentence(de.flow.comesFrom, plainList(entries)));
          break;
        }
        case 'unconnected': {
          const name = item.node.pool ?? de.labels.unnamed;
          this.lastPool = item.node.pool;
          out.push(this.heading(level, de.flow.unconnected(name)), sentence(de.flow.unconnectedNote));
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
  const allNodes = graphs.flatMap((graph) => graph.nodes);
  const steps = allNodes.filter((node) => node.number > 0).length;
  const tasks = allNodes.filter((node) => isTaskLike(node.kind)).length;
  const decisions = allNodes.filter((node) => node.kind === 'decision' || node.kind === 'branch').length;
  const ends = allNodes.filter((node) => node.kind === 'end').sort((a, b) => a.anchor - b.anchor);
  const showPools = new Set(allNodes.map((node) => node.pool)).size > 1;

  const overview: Block[] = graphs.flatMap((graph) => documentationOf(graph.process)).map((doc) => ({ type: 'paragraph', content: [doc] }));
  overview.push(sentence(de.overview.summary(steps, tasks, decisions)));
  overview.push(
    ends.length ? sentence(de.overview.outcomes + ends.map((node) => node.label).join(', ')) : sentence(de.overview.noOutcomes),
  );
  overview.push({ type: 'paragraph', content: [de.overview.readingHelp] });

  const roles: string[] = [];
  for (const graph of graphs) {
    for (const role of graph.roles) {
      // Bei mehreren Prozessen zählt der Pool, denn Prozessnamen sind oft technisch („Process_1“).
      const owner = graph.poolName ?? graph.title;
      roles.push(graphs.length > 1 && owner && owner !== role ? `${owner}, ${role}` : role);
    }
  }
  for (const external of externals) roles.push(de.overview.roleExternal(external));

  const notes: Block[] = graphs
    .flatMap((graph) => generalNotes.get(graph) ?? [])
    .map((note) => ({ type: 'paragraph', content: [de.overview.generalNote(note)] }));
  const writer = new SequenceWriter(attachments, showPools);
  const flow: Block[] = [...notes, ...writer.write(plan.main, TOP_LEVEL)];
  if (plan.unreachable.length) {
    flow.push({ type: 'heading', level: TOP_LEVEL, text: de.flow.unreachable }, ...writer.write(plan.unreachable, TOP_LEVEL));
  }

  return {
    lang: de.lang,
    title,
    documentTitle: de.documentTitle(title),
    overviewHeading: de.headings.overview,
    overview,
    rolesHeading: de.headings.roles,
    roles,
    messagesHeading: de.headings.messages,
    messages: freeMessages,
    flowHeading: de.headings.flow,
    flow,
  };
}
