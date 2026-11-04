import { hasRole, isTaskLike, type BoundaryInfo, type Exit, type GraphNode, type ProcessGraph } from './analyze.ts';
import type { Block, FlowSection, Inline, ProcessDocument, Step, StepRef } from './document.ts';
import type { BpmnElement } from './parse.ts';
import { clean, plainText } from './text.ts';
import { de } from './texts.de.ts';

const list = (value: unknown): BpmnElement[] => (Array.isArray(value) ? value : []);

const ref = (node: GraphNode): StepRef => ({ step: node.number, text: de.steps.ref(node.number, node.label) });

const inlineText = (inline: Inline): string => (typeof inline === 'string' ? inline : inline.text);

/** Schließt einen Satz ab, ohne „genehmigt?.“ zu erzeugen. */
function sentence(...content: Inline[]): Block {
  const last = content.at(-1);
  const needsStop = last !== undefined && !/[.?!:]$/.test(inlineText(last).trim());
  return { type: 'paragraph', content: needsStop ? [...content, '.'] : content };
}

function joined(nodes: GraphNode[]): Inline[] {
  return nodes.flatMap((node, index) => (index === 0 ? [ref(node)] : [', ', ref(node)]));
}

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

export interface StepAttachments {
  notes: string[];
  messages: Inline[][];
}

function exitBlocks(node: GraphNode, nextNumber: number | undefined): Block[] {
  const { kind, exits, element } = node;
  if (kind === 'end') {
    const terminates = list(element.eventDefinitions).some((def) => def.$instanceOf('bpmn:TerminateEventDefinition'));
    return [sentence(terminates ? de.steps.processEnds : de.steps.pathEnds)];
  }
  if (exits.length === 0) return [sentence(de.steps.deadEnd)];
  if (exits.length === 1) {
    const [exit] = exits as [Exit];
    return exit.target.number === nextNumber ? [] : [sentence(de.steps.next, ref(exit.target))];
  }

  const labelled = (): Inline[][] => exits.map((exit) => [de.steps.exitTo(exit.label), ref(exit.target)]);
  const plain = (): Inline[][] => exits.map((exit) => [ref(exit.target)]);

  if (kind === 'decision') return [{ type: 'list', items: labelled() }];
  if (kind === 'branch') return [sentence(de.steps.branchExits), { type: 'list', items: labelled() }];
  if (kind === 'split' || kind === 'join-split') return [sentence(de.steps.parallelExits), { type: 'list', items: plain() }];
  if (exits.some((exit) => exit.conditional)) return [sentence(de.steps.conditionalExits), { type: 'list', items: labelled() }];
  return [sentence(de.steps.parallelExits), { type: 'list', items: plain() }];
}

function boundaryBlock({ element, exits }: BoundaryInfo): Block {
  const intro = de.steps.boundary(eventKindOf(element) ?? de.genericEventKind, clean(element.name));
  const interrupting = element.cancelActivity !== false;
  const docs = documentationOf(element);
  if (!exits.length) {
    return sentence(intro + (interrupting ? de.steps.interruptingNoExit : de.steps.nonInterruptingNoExit), ...docs.map((doc) => ` ${doc}`));
  }
  const targets = exits.map((exit) => exit.target);
  return sentence(
    intro + (interrupting ? de.steps.interrupting : de.steps.nonInterrupting),
    ...joined(targets),
    ...docs.map((doc) => `. ${doc}`),
  );
}

function entryBlocks(node: GraphNode, previous: GraphNode | undefined): Block[] {
  const entries = node.entries.filter((entry) => entry !== node);
  if (node.kind === 'join' || node.kind === 'join-split') {
    return entries.length ? [sentence(de.steps.waitFor, ...joined(entries))] : [];
  }
  if (node.unreachable && entries.length === 0) return [sentence(de.steps.noWayIn)];
  const previousLeadsHere = previous !== undefined && entries.includes(previous);
  const others = entries.filter((entry) => entry !== previous);
  if (!others.length) return [];
  return [sentence(previousLeadsHere ? de.steps.alsoFrom : de.steps.from, ...joined(others))];
}

function detailBlocks(node: GraphNode): Block[] {
  const { element } = node;
  const blocks: Block[] = [];
  if (element.$instanceOf('bpmn:Event') && node.kind !== 'other') {
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

function composeStep(
  node: GraphNode,
  previous: GraphNode | undefined,
  next: GraphNode | undefined,
  attachments: StepAttachments | undefined,
): Step {
  const blocks: Block[] = [];
  if (node.role) blocks.push(sentence(de.steps.role(node.role)));
  for (const doc of documentationOf(node.element)) blocks.push({ type: 'paragraph', content: [doc] });
  for (const note of attachments?.notes ?? []) blocks.push({ type: 'paragraph', content: [de.steps.note(note)] });
  blocks.push(...detailBlocks(node));
  for (const message of attachments?.messages ?? []) blocks.push(sentence(...message));
  blocks.push(...entryBlocks(node, previous));
  blocks.push(...exitBlocks(node, next?.number));
  for (const boundary of node.boundaries) blocks.push(boundaryBlock(boundary));

  return {
    number: node.number,
    heading: node.labelIsGenerated
      ? de.steps.headingGenerated(node.number, node.label)
      : de.steps.heading(node.number, de.kinds[node.kind], node.label),
    blocks,
  };
}

export interface ComposeInput {
  title: string;
  graphs: ProcessGraph[];
  attachments: Map<GraphNode, StepAttachments>;
  generalNotes: Map<ProcessGraph, string[]>;
  /** Pools ohne eigenen Prozess. */
  externals: string[];
  /** Nachrichten, die an keinem Schritt hängen. */
  freeMessages: string[];
}

export function composeDocument(input: ComposeInput): ProcessDocument {
  const { title, graphs, attachments, generalNotes, externals, freeMessages } = input;
  const allNodes = graphs.flatMap((graph) => graph.nodes);
  const tasks = allNodes.filter((node) => isTaskLike(node.kind)).length;
  const decisions = allNodes.filter((node) => node.kind === 'decision' || node.kind === 'branch').length;
  const ends = allNodes.filter((node) => node.kind === 'end');

  const overview: Block[] = [];
  if (graphs.length === 1) {
    for (const doc of documentationOf(graphs[0]!.process)) overview.push({ type: 'paragraph', content: [doc] });
    overview.push(sentence(de.overview.single(allNodes.length, tasks, decisions)));
  } else {
    overview.push(sentence(de.overview.multiple(graphs.length, allNodes.length, tasks, decisions)));
  }
  overview.push(ends.length ? sentence(de.overview.outcomes, ...joined(ends)) : sentence(de.overview.noOutcomes));
  overview.push({ type: 'paragraph', content: [de.overview.readingHelp] });

  const roles: Inline[][] = [];
  for (const graph of graphs) {
    for (const role of graph.roles) {
      const own = graph.nodes.filter((node) => node.role === role && hasRole(node.kind));
      const name = graphs.length > 1 && graph.title && graph.title !== role ? `${graph.title}, ${role}` : role;
      roles.push(own.length ? [de.overview.roleSteps(name), ...joined(own)] : [de.overview.roleNoSteps(name)]);
    }
  }
  for (const external of externals) roles.push([de.overview.roleExternal(external)]);

  const sections: FlowSection[] = graphs.map((graph) => {
    const blocks: Block[] = (generalNotes.get(graph) ?? []).map((note) => ({
      type: 'paragraph',
      content: [de.overview.generalNote(note)],
    }));
    if (graphs.length > 1) {
      for (const doc of documentationOf(graph.process)) blocks.push({ type: 'paragraph', content: [doc] });
    }
    return {
      heading: graphs.length > 1 && graph.title ? de.headings.flowNamed(graph.title) : de.headings.flow,
      blocks,
      steps: graph.nodes.map((node, index) =>
        composeStep(node, graph.nodes[index - 1], graph.nodes[index + 1], attachments.get(node)),
      ),
    };
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
