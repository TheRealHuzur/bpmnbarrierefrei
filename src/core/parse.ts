import { BpmnModdle } from 'bpmn-moddle';
import { ConvertError } from './findings.ts';
import { de } from './texts.de.ts';

/** Das Modell kommt aus beliebigen Werkzeugen und ist zur Laufzeit nur lose typisiert. */
export type BpmnElement = { $type: string; $instanceOf(type: string): boolean; [key: string]: any };

export const MAX_INPUT_CHARS = 20_000_000;

export interface ParsedBpmn {
  definitions: BpmnElement;
  warnings: string[];
}

/** Liest Bytes in der Kodierung, die der Export angibt. Windows-Werkzeuge nutzen auch UTF-16 und Latin-1. */
export function decodeBpmn(bytes: Uint8Array): string {
  const [a, b] = bytes;
  if (a === 0xff && b === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (a === 0xfe && b === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /^\s*<\?xml[^>]*encoding=["']([\w.-]+)["']/i.exec(head)?.[1];
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Unbekannte Kodierung: UTF-8 ist die beste Annahme.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function parseBpmn(input: string | Uint8Array): Promise<ParsedBpmn> {
  const xml = (typeof input === 'string' ? input : decodeBpmn(input)).replace(/^﻿/, '');
  if (xml.length > MAX_INPUT_CHARS) throw new ConvertError('too-large', de.errors.tooLarge);
  if (!xml.trim()) throw new ConvertError('not-bpmn', de.errors.notBpmn);

  try {
    const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
    if (!rootElement) throw new ConvertError('not-bpmn', de.errors.notBpmn);
    return {
      definitions: rootElement as unknown as BpmnElement,
      warnings: (warnings ?? []).map((warning: { message: string }) => warning.message.replace(/\s+/g, ' ').trim()),
    };
  } catch (error) {
    if (error instanceof ConvertError) throw error;
    throw new ConvertError('not-bpmn', de.errors.notBpmn);
  }
}
