import { analyzeProcess, readPositions, type GraphNode, type ProcessGraph } from './analyze.ts';
import { composeDocument, type StepAttachments } from './compose.ts';
import { composeDocumentB } from './compose-b.ts';
import type { ProcessDocument } from './document.ts';
import { planProcess, type ProcessPlan } from './structure.ts';
import { ConvertError, type Finding } from './findings.ts';
import { parseBpmn, type BpmnElement } from './parse.ts';
import { clean, plainText } from './text.ts';
import { de } from './texts.de.ts';

export { ConvertError } from './findings.ts';
export type { Finding, Severity, FindingCode, FatalCode } from './findings.ts';
export type { ProcessDocument } from './document.ts';
export { renderHtml } from './render-html.ts';

export const MAX_FLOW_NODES = 5000;

/** A: flache Schrittliste mit Links. B: Zweige unter ihrer Entscheidung, Links nur für echte Sprünge. */
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

  const plans = new Map<ProcessGraph, ProcessPlan>();
  if (options.form === 'b') {
    let next = 1;
    for (const graph of graphs) {
      const { plan, nextNumber } = planProcess(graph, next);
      plans.set(graph, plan);
      next = nextNumber;
    }
  } else {
    let number = 0;
    for (const graph of graphs) for (const node of graph.nodes) node.number = ++number;
  }

  const nodeOf = new Map<BpmnElement, GraphNode>(graphs.flatMap((graph) => [...graph.nodeOf]));
  // Grenzereignisse zählen als Teil ihres Schritts.
  const stepOf = (element: BpmnElement | undefined): GraphNode | undefined => {
    if (!element) return undefined;
    if (element.$instanceOf?.('bpmn:SequenceFlow')) return stepOf(element.sourceRef);
    return nodeOf.get(element) ?? (element.attachedToRef ? nodeOf.get(element.attachedToRef) : undefined);
  };

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

  const freeMessages: string[] = [];
  for (const collaboration of collaborations) {
    for (const flow of list(collaboration.messageFlows)) {
      const { sourceRef: source, targetRef: target } = flow;
      if (!source || !target) {
        addFinding({ severity: 'warning', code: 'broken-flow', message: de.findings.brokenFlow(flow.id), elementId: flow.id });
        continue;
      }
      const message = clean(flow.name) || clean(flow.messageRef?.name);
      const sender = stepOf(source);
      const receiver = stepOf(target);
      if (sender) {
        attachmentOf(sender).messages.push([
          de.steps.sends(message),
          receiver ? { step: receiver.number, text: de.steps.ref(receiver.number, receiver.label) } : nameOfParty(target),
        ]);
      }
      if (receiver) {
        attachmentOf(receiver).messages.push([
          de.steps.receives(message),
          sender ? { step: sender.number, text: de.steps.ref(sender.number, sender.label) } : nameOfParty(source),
        ]);
      }
      if (!sender && !receiver) {
        freeMessages.push(de.overview.messageBetween(message, nameOfParty(source), nameOfParty(target)));
      }
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
    document: options.form === 'b' ? composeDocumentB(composeInput, plans) : composeDocument(composeInput),
    findings,
  };
}
