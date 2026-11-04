import { analyzeProcess, readPositions, type GraphNode, type ProcessGraph } from './analyze.ts';
import { composeDocument, refText, type StepAttachments } from './compose.ts';
import type { ProcessDocument } from './document.ts';
import { planModel, type MessageLink } from './structure.ts';
import { ConvertError, type Finding } from './findings.ts';
import { parseBpmn, type BpmnElement } from './parse.ts';
import { clean, plainText } from './text.ts';
import { de } from './texts.de.ts';

export { ConvertError } from './findings.ts';
export type { Finding, Severity, FindingCode, FatalCode } from './findings.ts';
export type { ProcessDocument } from './document.ts';
export { renderFragment, renderHtml } from './render-html.ts';

export const MAX_FLOW_NODES = 5000;

export interface ConvertOptions {
  /** Titel, falls das Modell selbst keinen Namen nennt, etwa der Dateiname. */
  fallbackTitle?: string;
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

  // Auch die Inhalte von Teilprozessen zählen zur Größe des Modells.
  const countFlowNodes = (container: BpmnElement): number =>
    list(container.flowElements)
      .filter((element) => element.$instanceOf('bpmn:FlowNode'))
      .reduce((sum, element) => sum + 1 + countFlowNodes(element), 0);
  if (ordered.reduce((sum, process) => sum + countFlowNodes(process), 0) > MAX_FLOW_NODES) {
    throw new ConvertError('too-large', de.errors.tooLarge);
  }

  const processNames = new Map<string, string>();
  for (const process of ordered) {
    const name = poolOf.get(process) ?? clean(process.name);
    if (name && process.id) processNames.set(process.id, name);
  }

  const positions = readPositions(definitions);
  const graphs: ProcessGraph[] = ordered.map((process) => {
    const poolName = poolOf.get(process);
    return analyzeProcess(process, { positions, processNames, addFinding, ...(poolName ? { poolName } : {}) });
  });

  /** Alle Graphen einschließlich der Teilprozesse. */
  const allGraphs = (scope: ProcessGraph[]): ProcessGraph[] =>
    scope.flatMap((graph) => [graph, ...allGraphs(graph.nodes.flatMap((node) => (node.child ? [node.child] : [])))]);

  const nodeOf = new Map<BpmnElement, GraphNode>(allGraphs(graphs).flatMap((graph) => [...graph.nodeOf]));
  // Grenzereignisse zählen als Teil ihres Schritts.
  const stepOf = (element: BpmnElement | undefined): GraphNode | undefined => {
    if (!element) return undefined;
    if (element.$instanceOf?.('bpmn:SequenceFlow')) return stepOf(element.sourceRef);
    return nodeOf.get(element) ?? (element.attachedToRef ? nodeOf.get(element.attachedToRef) : undefined);
  };

  const messageFlows = collaborations.flatMap((collaboration) => list(collaboration.messageFlows));

  // Eine Nachricht an den Rand eines Pools führt zu dessen Start.
  const receiverOf = (target: BpmnElement | undefined): GraphNode | undefined => {
    const direct = stepOf(target);
    if (direct || !target?.processRef) return direct;
    return graphs.find((graph) => graph.process === target.processRef)?.nodes.find((node) => node.kind === 'start');
  };

  const links: MessageLink[] = [];
  for (const { sourceRef: source, targetRef: target } of messageFlows) {
    const from = stepOf(source);
    const to = receiverOf(target);
    // Ein Grenzereignis unterbricht eine laufende Aufgabe und legt keine Reihenfolge der Schritte fest.
    if (!from || !to || target?.$instanceOf?.('bpmn:BoundaryEvent')) continue;
    // Innerhalb eines Pools legt der Sequenzfluss die Reihenfolge fest.
    if (from.pool === to.pool) continue;
    links.push({ from, to });
  }

  const plan = planModel(graphs, links);
  for (const node of plan.unconnected) {
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
  for (const graph of graphs) {
    for (const scope of allGraphs([graph])) collectArtifacts(list(scope.process.artifacts), graph);
  }
  for (const collaboration of collaborations) collectArtifacts(list(collaboration.artifacts), graphs[0]!);

  const nameOfParty = (element: BpmnElement | undefined): string =>
    clean(element?.name) || de.steps.externalParty;

  // An der Schnittstelle zählt, mit wem ausgetauscht wird, nicht welcher Schritt das dort ist.
  const partyName = (other: GraphNode | undefined, self: GraphNode, element: BpmnElement): string => {
    if (!other) return nameOfParty(element);
    return other.pool && other.pool !== self.pool ? other.pool : refText(other);
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
    if (sender) attachmentOf(sender).messages.push(de.steps.sends(message) + partyName(receiver, sender, target));
    if (receiver) attachmentOf(receiver).messages.push(de.steps.receives(message) + partyName(sender, receiver, source));
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

  return {
    document: composeDocument({ title, graphs, plan, attachments, generalNotes, externals, freeMessages }),
    findings,
  };
}
