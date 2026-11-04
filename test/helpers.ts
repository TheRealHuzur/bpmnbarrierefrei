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

export interface Converted extends ConvertResult {
  html: string;
  text: string;
  links: number;
  codes: string[];
}

export async function convert(xml: string | Uint8Array): Promise<Converted> {
  const result = await convertBpmn(xml, { fallbackTitle: 'Dateiname' });
  const html = renderHtml(result.document);
  return {
    ...result,
    html,
    text: visibleText(html),
    links: (html.match(/<a /g) ?? []).length,
    codes: result.findings.map((finding) => finding.code),
  };
}
