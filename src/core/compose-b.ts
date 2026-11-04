import { hasRole, isTaskLike, type BoundaryInfo, type GraphNode, type ProcessGraph } from './analyze.ts';
import {
  detailBlocks,
  documentationOf,
  eventKindOf,
  inlineText,
  ref,
  sectionName,
  sentence,
  type ComposeInput,
  type StepAttachments,
} from './compose.ts';
import type { Block, FlowSection, Inline, NumberedItem, ProcessDocument } from './document.ts';
import { clean } from './text.ts';
import { de } from './texts.de.ts';
import type { Branch, Item, Jump, ProcessPlan } from './structure.ts';

const TOP_LEVEL = 3;

/** Nachrichten verweisen hier nur in Worten auf andere Schritte, Links bleiben echten Sprüngen vorbehalten. */
const plain = (content: Inline[]): Inline[] => content.map(inlineText);

const toInlines = (blocks: Block[]): Inline[] =>
  blocks.flatMap((block, index) => {
    if (block.type !== 'paragraph') return [];
    return index === 0 ? block.content : [' ', ...block.content];
  });

function jumpSentence(jump: Jump, afterStep = false): Block {
  if (jump.kind === 'forward') return sentence(de.steps.next, ref(jump.target));
  return sentence(afterStep ? de.formB.backAfterStep : de.formB.back, ref(jump.target));
}

/** Diese Bausteine beginnen mit einer eigenen Überschrift. */
const opensWithHeading = (item: Item | undefined): boolean =>
  item !== undefined && item.type !== 'step' && item.type !== 'section';

const stepLabel = (node: GraphNode): string =>
  node.kind === 'task' || node.labelIsGenerated ? node.label : `${de.kinds[node.kind]}: ${node.label}`;

const headingFor = (node: GraphNode): string =>
  node.labelIsGenerated
    ? de.steps.headingGenerated(node.number, node.label)
    : de.steps.heading(node.number, de.kinds[node.kind], node.label);

function branchTitle(node: GraphNode, branch: Branch, index: number, parallel: boolean): string {
  if (parallel) return de.formB.way(index + 1);
  if (branch.label === de.labels.defaultExit) return branch.label;
  if (branch.label === de.labels.unlabeledExit) return de.formB.unlabeledCase;
  return node.kind === 'branch' ? de.formB.wayLabeled(branch.label) : de.formB.caseLabeled(branch.label);
}

class SequenceWriter {
  private lastRole: string | undefined;
  private readonly attachments: Map<GraphNode, StepAttachments>;

  constructor(attachments: Map<GraphNode, StepAttachments>) {
    this.attachments = attachments;
  }

  private details(node: GraphNode): Block[] {
    const attachment = this.attachments.get(node);
    const blocks: Block[] = [];
    for (const doc of documentationOf(node.element)) blocks.push(sentence(doc));
    for (const note of attachment?.notes ?? []) blocks.push(sentence(de.steps.note(note)));
    blocks.push(...detailBlocks(node));
    for (const message of attachment?.messages ?? []) blocks.push(sentence(...plain(message)));
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

  private stepItem(node: GraphNode, jump: Jump | undefined): NumberedItem {
    const label = stepLabel(node);
    const blocks: Block[] = [...this.role(node), ...this.details(node)];
    if (node.kind === 'end') {
      const terminates = (node.element.eventDefinitions ?? []).some((definition: { $instanceOf(type: string): boolean }) =>
        definition.$instanceOf('bpmn:TerminateEventDefinition'),
      );
      blocks.push(sentence(terminates ? de.steps.processEnds : de.steps.pathEnds));
    } else if (node.exits.length === 0) {
      blocks.push(sentence(de.steps.deadEnd));
    }
    if (jump) blocks.push(jumpSentence(jump, true));
    const strong = /[.?!:]$/.test(label) ? label : `${label}.`;
    const rest = toInlines(blocks);
    return { number: node.number, anchor: true, content: [{ strong }, ...(rest.length ? [' ', ...rest] : [])] };
  }

  private side({ element, exits }: BoundaryInfo, body: Item[], jumps: Jump[], level: number): Block[] {
    const kind = eventKindOf(element) ?? de.genericEventKind;
    const interrupting = element.cancelActivity !== false;
    const out: Block[] = [this.heading(level, de.formB.sideCase(kind, clean(element.name)))];
    const texts = documentationOf(element).map((doc) => sentence(doc));
    const hasWayOn = exits.length > 0;
    out.push(sentence(interrupting ? de.formB.interrupting : hasWayOn ? de.formB.nonInterrupting : de.formB.nonInterruptingNoExit), ...texts);
    if (interrupting && !hasWayOn) out.push(sentence(de.steps.deadEnd));
    out.push(...this.write(body, level + 1), ...jumps.map((jump) => jumpSentence(jump)));
    return out;
  }

  private branches(node: GraphNode, branches: Branch[], level: number, parallel: boolean, nextIsStep: boolean): Block[] {
    return branches.flatMap((branch, index) => {
      if (parallel && branch.body.length === 0 && !branch.jump) return [];
      const out: Block[] = [this.heading(level, branchTitle(node, branch, index, parallel))];
      // Folgt direkt ein Schritt, ist klar, dass es hier weitergeht.
      if (branch.continues) return nextIsStep ? out : [...out, sentence(de.formB.continuesHere)];
      out.push(...this.write(branch.body, level + 1));
      if (branch.jump) out.push(jumpSentence(branch.jump));
      else if (branch.body.length === 0) out.push(sentence(de.formB.noOwnStep));
      return out;
    });
  }

  write(items: Item[], level: number): Block[] {
    const out: Block[] = [];
    let pending: NumberedItem[] = [];
    const flush = (): void => {
      if (pending.length) out.push({ type: 'numbered', items: pending });
      pending = [];
    };

    for (const [index, item] of items.entries()) {
      const next = items[index + 1];
      if (item.type === 'step') {
        pending.push(this.stepItem(item.node, item.jump));
        continue;
      }
      flush();
      switch (item.type) {
        case 'choice': {
          out.push(this.heading(level, headingFor(item.node), item.node.number), ...this.role(item.node), ...this.details(item.node));
          if (item.node.kind === 'branch') out.push(sentence(de.formB.branchIntro));
          else if (item.node.kind !== 'decision') out.push(sentence(de.steps.conditionalExits));
          out.push(...this.branches(item.node, item.branches, level + 1, false, next?.type === 'step'));
          break;
        }
        case 'parallel': {
          if (item.node.kind !== 'join-split') out.push(this.heading(level, headingFor(item.node), item.node.number));
          out.push(...this.details(item.node));
          out.push(sentence(de.formB.parallelIntro));
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
          const text = item.absorbed && item.node.labelIsGenerated ? de.formB.afterParallel(item.node.number) : headingFor(item.node);
          out.push(this.heading(level, text, item.node.number), ...this.details(item.node));
          if (!item.absorbed) {
            const waits = item.node.entries.filter((entry) => entry !== item.node);
            if (waits.length) out.push(sentence(de.steps.waitFor, ...plain(waits.map(ref).flatMap((entry, index) => (index === 0 ? [entry] : [', ', entry])))));
          }
          if (item.jump) out.push(jumpSentence(item.jump));
          break;
        }
        case 'section':
          // Direkt vor einer anderen Überschrift bliebe dieser Abschnitt leer.
          if (!opensWithHeading(next)) out.push(this.heading(level, de.formB.sections[item.section]));
          break;
        case 'later': {
          const entries = item.node.entries.filter((entry) => entry !== item.node);
          out.push(this.heading(level, de.formB.later(item.node.number)));
          if (entries.length) out.push(sentence(de.formB.comesFrom, ...plain(entries.map(ref).flatMap((entry, index) => (index === 0 ? [entry] : [', ', entry])))));
          break;
        }
      }
    }
    flush();
    return out;
  }
}

/** Der Hauptweg nennt nur die oberste Ebene: das, was bleibt, wenn man alle Zweige einklappt. */
function mainPathItems(items: Item[]): NumberedItem[] {
  return items.flatMap((item): NumberedItem[] => {
    switch (item.type) {
      case 'step':
        return [{ number: item.node.number, anchor: false, content: [stepLabel(item.node)] }];
      case 'choice':
        return [{ number: item.node.number, anchor: false, content: [stepLabel(item.node)] }];
      case 'parallel': {
        const labels = item.branches.flatMap((branch) => {
          const first = branch.body[0];
          return first && first.type === 'step' ? [first.node.label] : [];
        });
        const text = labels.length === item.branches.length ? de.formB.mainParallel(labels) : item.node.label;
        return [{ number: item.node.number, anchor: false, content: [text] }];
      }
      default:
        return [];
    }
  });
}

export function composeDocumentB(input: ComposeInput, plans: Map<ProcessGraph, ProcessPlan>): ProcessDocument {
  const { title, graphs, attachments, generalNotes, externals, freeMessages } = input;
  const allNodes = graphs.flatMap((graph) => graph.nodes);
  const tasks = allNodes.filter((node) => isTaskLike(node.kind)).length;
  const decisions = allNodes.filter((node) => node.kind === 'decision' || node.kind === 'branch').length;
  const ends = allNodes.filter((node) => node.kind === 'end').sort((a, b) => a.number - b.number);

  const overview: Block[] = [];
  if (graphs.length === 1) {
    for (const doc of documentationOf(graphs[0]!.process)) overview.push({ type: 'paragraph', content: [doc] });
    overview.push(sentence(de.overview.single(allNodes.length, tasks, decisions)));
  } else {
    overview.push(sentence(de.overview.multiple(graphs.length, allNodes.length, tasks, decisions)));
  }
  overview.push(
    ends.length ? sentence(de.overview.outcomes + ends.map((node) => node.label).join(', ')) : sentence(de.overview.noOutcomes),
  );
  overview.push({ type: 'paragraph', content: [de.formB.readingHelp] });

  const roles: Inline[][] = [];
  for (const graph of graphs) {
    for (const role of graph.roles) {
      const own = graph.nodes
        .filter((node) => node.role === role && hasRole(node.kind))
        .sort((a, b) => a.number - b.number);
      const owner = sectionName(graph);
      const name = graphs.length > 1 && owner && owner !== role ? `${owner}, ${role}` : role;
      roles.push([own.length ? de.overview.roleSteps(name) + own.map((node) => node.label).join(', ') : de.overview.roleNoSteps(name)]);
    }
  }
  for (const external of externals) roles.push([de.overview.roleExternal(external)]);

  const sections: FlowSection[] = graphs.flatMap((graph) => {
    const plan = plans.get(graph)!;
    const owner = graphs.length > 1 ? sectionName(graph) : undefined;
    const notes: Block[] = (generalNotes.get(graph) ?? []).map((note) => ({ type: 'paragraph', content: [de.overview.generalNote(note)] }));
    if (graphs.length > 1) {
      for (const doc of documentationOf(graph.process)) notes.push({ type: 'paragraph', content: [doc] });
    }

    const writer = new SequenceWriter(attachments);
    const flow: Block[] = [...notes, ...writer.write(plan.main, TOP_LEVEL)];
    if (plan.unreachable.length) {
      flow.push({ type: 'heading', level: TOP_LEVEL, text: de.formB.unreachable }, ...writer.write(plan.unreachable, TOP_LEVEL));
    }

    const flowSection: FlowSection = { heading: owner ? de.headings.flowNamed(owner) : de.headings.flow, blocks: flow, steps: [] };
    // Ohne Verzweigungen würde der Hauptweg den Ablauf nur wiederholen.
    if (plan.main.every((item) => item.type === 'step')) return [flowSection];
    return [
      {
        heading: owner ? de.formB.mainPathNamed(owner) : de.formB.mainPath,
        blocks: [sentence(de.formB.mainPathIntro), { type: 'numbered', items: mainPathItems(plan.main) }],
        steps: [],
      },
      flowSection,
    ];
  });

  return {
    lang: de.lang,
    title,
    documentTitle: de.documentTitle(title),
    overviewHeading: de.headings.overview,
    overview,
    rolesHeading: de.headings.roles,
    roles,
    messagesHeading: de.headings.messages,
    messages: freeMessages.map((message) => [message]),
    sections,
  };
}
