import { convertBpmn, renderHtml, type ConvertResult } from '../src/core/index.ts';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

/** Baut ein minimales Modell aus dem Inhalt eines Prozesses. */
export function model(processBody: string, processAttrs = 'id="P" name="Testprozess"'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${BPMN_NS}" id="D" targetNamespace="urn:test">
  <bpmn:process ${processAttrs}>${processBody}</bpmn:process>
</bpmn:definitions>`;
}

/** Kurzform für Sequenzflüsse: flows('S>A', 'A>B'). */
export function flows(...pairs: string[]): string {
  return pairs
    .map((pair, index) => {
      const [source, target] = pair.split('>');
      return `<bpmn:sequenceFlow id="f${index}" sourceRef="${source}" targetRef="${target}" />`;
    })
    .join('');
}

export interface Converted extends ConvertResult {
  html: string;
  headings: string[];
  /** Absätze und Listenpunkte eines Schritts als einfacher Text, Links als ihr Text. */
  stepText(step: number): string;
  codes: string[];
}

export async function convert(xml: string | Uint8Array): Promise<Converted> {
  const result = await convertBpmn(xml, { fallbackTitle: 'Dateiname' });
  const steps = result.document.sections.flatMap((section) => section.steps);
  const inlineText = (inline: string | { text: string }): string => (typeof inline === 'string' ? inline : inline.text);
  return {
    ...result,
    html: renderHtml(result.document),
    headings: steps.map((step) => step.heading),
    codes: result.findings.map((finding) => finding.code),
    stepText: (number) => {
      const step = steps.find((candidate) => candidate.number === number);
      if (!step) throw new Error(`Schritt ${number} fehlt`);
      return step.blocks
        .flatMap((block) =>
          block.type === 'paragraph'
            ? [block.content.map(inlineText).join('')]
            : block.items.map((item) => item.map(inlineText).join('')),
        )
        .join(' | ');
    },
  };
}
