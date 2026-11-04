import { analyzeProcess, readPositions, type GraphNode, type ProcessGraph } from './analyze.ts';
import { composeDocument, type StepAttachments } from './compose.ts';
import { composeDocumentB } from './compose-b.ts';
import type { Inline, ProcessDocument } from './document.ts';
import { planModel, type MessageLink } from './structure.ts';
import { ConvertError, type Finding } from './findings.ts';
import { parseBpmn, type BpmnElement } from './parse.ts';
import { clean, plainText } from './text.ts';
import { de } from './texts.de.ts';

export { ConvertError } from './findings.ts';
export type { Finding, Severity, FindingCode, FatalCode } from './findings.ts';
export type { ProcessDocument } from './document.ts';
export { renderHtml } from './render-html.ts';

export const MAX_FLOW_NODES = 5000;

/** A: je Pool eine flache Schrittliste mit Links. B: ein chronologischer Ablauf, Zweige unter ihrer Entscheidung. */
export type DocumentForm = 'a' | 'b';

export interface ConvertOptions {
  /** Titel, falls das Modell selbst keinen Namen nennt, etwa der Dateiname. */
  fallbackTitle?: string;
  form?: DocumentForm;
}

export interface ConvertResult {
  document: ProcessDocument;
  findings: Finding[];
}

const list = (value: unknown): BpmnElement[] => (Array.isArray(value) ? value : []);

const hasFlowNodes = (process: BpmnElement): boolean =>
  list(process.flowElements).some((element) => element.$instanceOf('bpmn:FlowNode'));

export async function convertBpmn(input: string | Uint8Array, options: ConvertOptions = {}): Promise<ConvertResult> {
  const { definitions, warnings } = await parseBpmn(input);
  const findings: Finding[] = warnings.map((warning) => ({
    severity: 'warning',
    code: 'parser-warning',
    message: de.findings.parserWarning(warning),
  }));
  const addFinding = (finding: Finding): void => void findings.push(finding);

  const roots = list(definitions.rootElements);
  const collaborations = roots.filter((root) => root.$instanceOf('bpmn:Collaboration'));
  const participants = collaborations.flatMap((collaboration) => list(collaboration.participants));
  const allProcesses = roots.filter((root) => root.$instanceOf('bpmn:Process'));

  // Reihenfolge der Pools vor Reihenfolge der Datei.
  const poolOf = new Map<BpmnElement, string>();
  const ordered: BpmnElement[] = [];
  for (const participant of participants) {
    const process: BpmnElement | undefined = participant.processRef;
    if (!process || !hasFlowNodes(process)) continue;
    const name = clean(participant.name);
    if (name) poolOf.set(process, name);
    if (!ordered.includes(process)) ordered.push(process);
  }
  for (const process of allProcesses) {
    if (hasFlowNodes(process) && !ordered.includes(process)) ordered.push(process);
  }
  if (!ordered.length) throw new ConvertError('no-process', de.errors.noProcess);

  const flowNodeCount = ordered.flatMap((process) =>
    list(process.flowElements).filter((element) => element.$instanceOf('bpmn:FlowNode')),
  ).length;
  if (flowNodeCount > MAX_FLOW_NODES) throw new ConvertError('too-large', de.errors.tooLarge);

  const positions = readPositions(definitions);
  const graphs: ProcessGraph[] = ordered.map((process) => {
    const poolName = poolOf.get(process);
    return analyzeProcess(process, { positions, addFinding, ...(poolName ? { poolName } : {}) });
  });

  const nodeOf = new Map<BpmnElement, GraphNode>(graphs.flatMap((graph) => [...graph.nodeOf]));
  // Grenzereignisse zählen als Teil ihres Schritts.
  const stepOf = (element: BpmnElement | undefined): GraphNode | undefined => {
    if (!element) return undefined;
    if (element.$instanceOf?.('bpmn:SequenceFlow')) return stepOf(element.sourceRef);
    return nodeOf.get(element) ?? (element.attachedToRef ? nodeOf.get(element.attachedToRef) : undefined);
  };

  const isFormB = options.form === 'b';
  const messageFlows = collaborations.flatMap((collaboration) => list(collaboration.messageFlows));

  // In Fassung B führt eine Nachricht an den Rand eines Pools zu dessen Start.
  const receiverOf = (target: BpmnElement | undefined): GraphNode | undefined => {
    const direct = stepOf(target);
    if (direct || !isFormB || !target?.processRef) return direct;
    return graphs.find((graph) => graph.process === target.processRef)?.nodes.find((node) => node.kind === 'start');
  };

  const links: MessageLink[] = [];
  for (const { sourceRef: source, targetRef: target } of messageFlows) {
    const from = stepOf(source);
    const to = receiverOf(target);
    // Ein Grenzereignis unterbricht eine laufende Aufgabe und legt keine Reihenfolge der Schritte fest.
    if (!from || !to || target?.$instanceOf?.('bpmn:BoundaryEvent')) continue;
    if (graphs.some((graph) => graph.nodes.includes(from) && graph.nodes.includes(to))) continue;
    links.push({ from, to });
  }

  const plan = isFormB ? planModel(graphs, links) : undefined;
  if (!plan) {
    let number = 0;
    for (const graph of graphs) for (const node of graph.nodes) node.number = ++number;
  }
  for (const node of plan?.unconnected ?? []) {
    addFinding({
      severity: 'warning',
      code: 'unconnected-pool',
      message: de.findings.unconnectedPool(node.pool ?? de.labels.unnamed),
      elementId: node.element.id,
    });
  }

  const attachments = new Map<GraphNode, StepAttachments>();
  const attachmentOf = (node: GraphNode): StepAttachments => {
    let entry = attachments.get(node);
    if (!entry) attachments.set(node, (entry = { notes: [], messages: [] }));
    return entry;
  };

  const generalNotes = new Map<ProcessGraph, string[]>();
  const collectArtifacts = (artifacts: BpmnElement[], graph: ProcessGraph): void => {
    const annotations = artifacts.filter((artifact) => artifact.$instanceOf('bpmn:TextAnnotation'));
    const attached = new Set<BpmnElement>();
    for (const association of artifacts.filter((artifact) => artifact.$instanceOf('bpmn:Association'))) {
      // Die Richtung der Verbindung ist je nach Werkzeug verschieden.
      const [annotation, other] = annotations.includes(association.sourceRef)
        ? [association.sourceRef, association.targetRef]
        : [association.targetRef, association.sourceRef];
      if (!annotations.includes(annotation)) continue;
      const node = stepOf(other);
      const text = plainText(annotation.text);
      if (node && text) {
        attachmentOf(node).notes.push(text);
        attached.add(annotation);
      }
    }
    const loose = annotations
      .filter((annotation) => !attached.has(annotation))
      .map((annotation) => plainText(annotation.text))
      .filter(Boolean);
    if (loose.length) generalNotes.set(graph, [...(generalNotes.get(graph) ?? []), ...loose]);
    for (const group of artifacts.filter((artifact) => artifact.$instanceOf('bpmn:Group'))) {
      findings.push({ severity: 'info', code: 'unsupported', message: de.findings.unsupportedGroup(group.id), elementId: group.id });
    }
  };
  for (const graph of graphs) collectArtifacts(list(graph.process.artifacts), graph);
  for (const collaboration of collaborations) collectArtifacts(list(collaboration.artifacts), graphs[0]!);

  const nameOfParty = (element: BpmnElement | undefined): string =>
    clean(element?.name) || de.steps.externalParty;

  // Fassung B nennt an der Schnittstelle den Beteiligten, Fassung A verlinkt den Schritt.
  const partyInline = (other: GraphNode | undefined, self: GraphNode, element: BpmnElement): Inline => {
    if (!other) return nameOfParty(element);
    if (isFormB && other.pool && other.pool !== self.pool) return other.pool;
    return { step: other.number, text: de.steps.ref(other.number, other.label) };
  };

  const freeMessages: string[] = [];
  for (const flow of messageFlows) {
    const { sourceRef: source, targetRef: target } = flow;
    if (!source || !target) {
      addFinding({ severity: 'warning', code: 'broken-flow', message: de.findings.brokenFlow(flow.id), elementId: flow.id });
      continue;
    }
    const message = clean(flow.name) || clean(flow.messageRef?.name);
    const sender = stepOf(source);
    const receiver = receiverOf(target);
    if (sender) attachmentOf(sender).messages.push([de.steps.sends(message), partyInline(receiver, sender, target)]);
    if (receiver) attachmentOf(receiver).messages.push([de.steps.receives(message), partyInline(sender, receiver, source)]);
    if (!sender && !receiver) {
      freeMessages.push(de.overview.messageBetween(message, nameOfParty(source), nameOfParty(target)));
    }
  }

  const externals = participants
    .filter((participant) => !participant.processRef || !hasFlowNodes(participant.processRef))
    .map((participant) => clean(participant.name))
    .filter(Boolean);

  const title =
    (graphs.length === 1 ? graphs[0]!.title : undefined) ||
    clean(definitions.name) ||
    clean(options.fallbackTitle) ||
    de.untitled;

  const composeInput = { title, graphs, attachments, generalNotes, externals, freeMessages };
  return {
    document: plan ? composeDocumentB(composeInput, plan) : composeDocument(composeInput),
    findings,
  };
}
