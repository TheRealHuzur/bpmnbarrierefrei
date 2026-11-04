import { convertBpmn, renderHtml, type ConvertResult, type DocumentForm } from '../src/core/index.ts';
import { inlineText } from '../src/core/compose.ts';

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

/** Der sichtbare Text eines Dokuments, jeder Block in einer Zeile, Überschriften mit #. */
export function visibleText(html: string): string {
  return html
    .slice(html.indexOf('<main>'))
    .replace(/<h([1-6])[^>]*>/g, (_match, level: string) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<li(?:\s+value="(\d+)")?[^>]*>/g, (_match, value?: string) => `\n[${value ?? ''}] `)
    .replace(/<\/?p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

export async function convert(xml: string | Uint8Array, form: DocumentForm = 'a'): Promise<Converted> {
  const result = await convertBpmn(xml, { fallbackTitle: 'Dateiname', form });
  const steps = result.document.sections.flatMap((section) => section.steps);
  return {
    ...result,
    html: renderHtml(result.document),
    headings: steps.map((step) => step.heading),
    codes: result.findings.map((finding) => finding.code),
    stepText: (number) => {
      const step = steps.find((candidate) => candidate.number === number);
      if (!step) throw new Error(`Schritt ${number} fehlt`);
      return step.blocks
        .flatMap((block) => {
          if (block.type === 'paragraph') return [block.content.map(inlineText).join('')];
          return block.type === 'list' ? block.items.map((item) => item.map(inlineText).join('')) : [];
        })
        .join(' | ');
    },
  };
}
