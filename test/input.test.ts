import { describe, expect, it } from 'vitest';
import { ConvertError } from '../src/core/index.ts';
import { clean, plainText } from '../src/core/text.ts';
import { convert, flows, model } from './helpers.ts';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

const body = (prefix: string) => {
  const p = prefix ? `${prefix}:` : '';
  return `<${p}process id="P" name="Prozess">
    <${p}startEvent id="S" name="Start" />
    <${p}task id="A" name="Aufgabe" />
    <${p}sequenceFlow id="f" sourceRef="S" targetRef="A" />
  </${p}process>`;
};

describe('Exporte verschiedener Werkzeuge (nachgestellt)', () => {
  it.each([
    ['bpmn:', 'bpmn'],
    ['bpmn2:', 'bpmn2'],
    ['semantic:', 'semantic'],
    ['Standard-Namensraum', ''],
  ])('liest Präfix %s', async (_label, prefix) => {
    const ns = prefix ? `xmlns:${prefix}="${BPMN_NS}"` : `xmlns="${BPMN_NS}"`;
    const root = prefix ? `${prefix}:definitions` : 'definitions';
    const { headings } = await convert(`<${root} ${ns} id="D" targetNamespace="urn:t">${body(prefix)}</${root}>`);
    expect(headings).toEqual(['Schritt 1, Start: Start', 'Schritt 2, Aufgabe: Aufgabe']);
  });

  it('übersteht Herstellerfelder, fremde Attribute und unbekannte Namensräume', async () => {
    const { headings, stepText } = await convert(`<bpmn:definitions xmlns:bpmn="${BPMN_NS}"
      xmlns:hersteller="urn:hersteller" id="D" targetNamespace="urn:t" hersteller:version="9">
      <bpmn:extensionElements><hersteller:meta wert="1" /></bpmn:extensionElements>
      <bpmn:process id="P" hersteller:reifegrad="3">
        <bpmn:startEvent id="S" name="Start" hersteller:farbe="rot" />
        <bpmn:task id="A" name="Aufgabe">
          <bpmn:documentation>Beschreibung</bpmn:documentation>
          <bpmn:extensionElements><hersteller:kosten betrag="5"><hersteller:unter /></hersteller:kosten></bpmn:extensionElements>
        </bpmn:task>
        <bpmn:sequenceFlow id="f" sourceRef="S" targetRef="A" />
      </bpmn:process>
      <hersteller:eigenerKnoten />
    </bpmn:definitions>`);
    expect(headings).toHaveLength(2);
    expect(stepText(2)).toContain('Beschreibung');
  });

  it('kommt ohne Diagrammdaten aus', async () => {
    const { headings, codes } = await convert(
      model('<bpmn:startEvent id="S" name="Start" /><bpmn:task id="A" name="A" /><bpmn:endEvent id="E" name="Ende" />' + flows('S>A', 'A>E')),
    );
    expect(headings).toHaveLength(3);
    expect(codes).toEqual([]);
  });

  it('liest UTF-8 mit Byte-Order-Mark', async () => {
    const xml = `﻿${model('<bpmn:startEvent id="S" name="Prüfung" />')}`;
    const { headings } = await convert(new TextEncoder().encode(xml));
    expect(headings[0]).toContain('Prüfung');
  });

  it('liest UTF-16 mit Byte-Order-Mark', async () => {
    const xml = model('<bpmn:startEvent id="S" name="Prüfung" />').replace('UTF-8', 'UTF-16');
    const bytes = new Uint8Array(2 + xml.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < xml.length; index++) {
      const code = xml.charCodeAt(index);
      bytes[2 + index * 2] = code & 0xff;
      bytes[3 + index * 2] = code >> 8;
    }
    const { headings } = await convert(bytes);
    expect(headings[0]).toContain('Prüfung');
  });

  it('liest die im XML angegebene Kodierung ISO-8859-1', async () => {
    const xml = model('<bpmn:startEvent id="S" name="Prüfung" />').replace('UTF-8', 'ISO-8859-1');
    const bytes = Uint8Array.from(xml, (char) => char.charCodeAt(0));
    const { headings } = await convert(bytes);
    expect(headings[0]).toContain('Prüfung');
  });

  it('fügt für das Diagramm getrennte Namen wieder zusammen', async () => {
    const { headings } = await convert(
      model('<bpmn:startEvent id="S" name="Urlaubs-&#10;antrag&#10;prüfen" />'),
    );
    expect(headings[0]).toBe('Schritt 1, Start: Urlaubsantrag prüfen');
  });

  it('entfernt HTML aus der Dokumentation', async () => {
    const { stepText, html } = await convert(
      model(
        `<bpmn:task id="A" name="A"><bpmn:documentation textFormat="text/html">&lt;p&gt;Erst &lt;b&gt;das&lt;/b&gt;&lt;/p&gt;&lt;p&gt;dann &amp;amp; jenes&lt;/p&gt;</bpmn:documentation></bpmn:task>`,
      ),
    );
    expect(stepText(1)).toContain('Erst das dann & jenes');
    expect(html).not.toContain('&lt;p');
  });
});

describe('text', () => {
  it('lässt normale Bindestriche stehen', () => {
    expect(clean('E-Mail senden')).toBe('E-Mail senden');
    expect(clean('Vor-\nOrt-Termin')).toBe('Vor- Ort-Termin');
  });

  it('hält Vergleiche nicht für HTML', () => {
    expect(plainText('Wenn a < b und c > d')).toBe('Wenn a < b und c > d');
  });
});

describe('Dateien, die kein Modell sind', () => {
  const expectFatal = async (input: string, code: string) => {
    const error = await convert(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConvertError);
    expect((error as ConvertError).code).toBe(code);
  };

  it.each([
    ['leer', ''],
    ['nur Leerraum', '   \n'],
    ['kein XML', 'Das ist kein Modell.'],
    ['fremdes XML', '<rechnung><betrag>5</betrag></rechnung>'],
    ['abgeschnittenes XML', `<bpmn:definitions xmlns:bpmn="${BPMN_NS}"><bpmn:process`],
  ])('lehnt ab: %s', async (_label, input) => {
    await expectFatal(input, 'not-bpmn');
  });

  it('lehnt Modelle ohne Prozess ab', async () => {
    await expectFatal(`<bpmn:definitions xmlns:bpmn="${BPMN_NS}" id="D" targetNamespace="urn:t" />`, 'no-process');
  });

  it('lehnt Prozesse ohne Elemente ab', async () => {
    await expectFatal(model(''), 'no-process');
  });

  it('lehnt zu viele Elemente ab', async () => {
    const tasks = Array.from({ length: 5001 }, (_, index) => `<bpmn:task id="T${index}" name="x" />`).join('');
    await expectFatal(model(tasks), 'too-large');
  });

  it('lehnt zu große Dateien ab, ohne sie zu parsen', async () => {
    await expectFatal(' '.repeat(20_000_001), 'too-large');
  });
});
