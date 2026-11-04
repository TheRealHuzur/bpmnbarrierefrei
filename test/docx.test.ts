import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { convertBpmn } from '../src/core/index.ts';
import { renderDocx } from '../src/core/render-docx.ts';
import { flows, model } from './helpers.ts';

async function open(xml: string | Uint8Array) {
  const { document } = await convertBpmn(xml, { fallbackTitle: 'Datei' });
  const zip = await JSZip.loadAsync(await renderDocx(document));
  const read = (path: string) => zip.file(path)!.async('string');
  return { document, body: await read('word/document.xml'), styles: await read('word/styles.xml'), core: await read('docProps/core.xml') };
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const textOf = (xml: string): string => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

describe('Word-Dokument', () => {
  it('nutzt echte Überschriften in der richtigen Reihenfolge', async () => {
    const { body } = await open(read('../docs/test/bauantrag.bpmn'));
    const levels = [...body.matchAll(/<w:pStyle w:val="Heading(\d)"\/>/g)].map((match) => Number(match[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels.length).toBeGreaterThan(8);
    levels.forEach((level, index) => {
      if (index > 0) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1);
    });
  });

  it('enthält dieselben Inhalte wie das HTML-Dokument', async () => {
    const { body } = await open(read('../docs/test/bauantrag.bpmn'));
    const text = textOf(body);
    for (const part of [
      'Dieser Prozess hat 16 Schritte',
      'Bauamt, Eingangsstelle',
      'Beginn bei Antragstellende Person',
      'Schritt 1: Bauantrag einreichen.',
      'Wechsel zu Bauamt',
      'Schritt 4, Entscheidung: Unterlagen vollständig?',
      'Falls Nein',
      'Danach zurück zu ',
      'Schritt 3: Unterlagen auf Vollständigkeit prüfen',
      'Ende: Verfahren abgeschlossen.',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('verlinkt nur echte Sprünge, und jedes Ziel existiert', async () => {
    const { body } = await open(read('../docs/test/bauantrag.bpmn'));
    const anchors = [...body.matchAll(/<w:hyperlink w:history="1" w:anchor="([^"]+)"|<w:hyperlink w:anchor="([^"]+)"/g)].map((match) => match[1] ?? match[2]);
    expect(anchors).toHaveLength(1);
    const bookmarks = [...body.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(bookmarks).size).toBe(bookmarks.length);
    for (const anchor of anchors) expect(bookmarks).toContain(anchor);
  });

  it('setzt Sprache und Titel, nutzt aber keine festen Farben', async () => {
    const { styles, core } = await open(read('../docs/test/bauantrag.bpmn'));
    expect(styles).toContain('w:lang w:val="de-DE"');
    expect(core).toContain('Bauantrag: Prozessbeschreibung');
    const own = styles.slice(styles.indexOf('w:styleId="Heading1"'));
    expect(own.match(/w:styleId="Heading6"[\s\S]*?<\/w:style>/)?.[0]).not.toMatch(/w:color/);
  });

  it('enthält im Ablauf keine Aufzählung, bei den Beteiligten aber schon', async () => {
    const { body } = await open(read('../docs/test/bauantrag.bpmn'));
    const flowStart = body.indexOf('Beginn bei Antragstellende Person');
    expect(body.slice(0, flowStart)).toContain('<w:numPr>');
    expect(body.slice(flowStart)).not.toContain('<w:numPr>');
  });

  it('maskiert präparierte Texte', async () => {
    const { body } = await open(
      model('<bpmn:startEvent id="S" name="&lt;w:evil&gt; &amp;amp;" /><bpmn:task id="A" name="&lt;/w:t&gt;x" />' + flows('S>A')),
    );
    expect(body).not.toContain('<w:evil>');
    expect(body).toContain('&lt;w:evil&gt;');
    expect(body).toContain('&lt;/w:t&gt;x');
  });

  it('nutzt auch die tieferen Überschriftenebenen von Word', async () => {
    const depth = 5;
    let body = '<bpmn:startEvent id="S" name="Start" /><bpmn:endEvent id="E" name="Ende" />';
    const edges = ['S>G0', 'M0>E'];
    let labelled = '';
    for (let index = 0; index < depth; index++) {
      body += `<bpmn:exclusiveGateway id="G${index}" name="Frage ${index}?" /><bpmn:task id="B${index}" name="B" /><bpmn:task id="Z${index}" name="Z" /><bpmn:exclusiveGateway id="M${index}" />`;
      const inner = index + 1 < depth ? `G${index + 1}` : `Z${index}`;
      labelled += `<bpmn:sequenceFlow id="x${index}" name="Links" sourceRef="G${index}" targetRef="${inner}" /><bpmn:sequenceFlow id="y${index}" name="Rechts" sourceRef="G${index}" targetRef="B${index}" />`;
      edges.push(`B${index}>M${index}`);
      if (index + 1 < depth) edges.push(`M${index + 1}>Z${index}`);
      edges.push(`Z${index}>M${index}`);
    }
    const { body: xml } = await open(model(body + labelled + flows(...edges)));
    expect(xml).toContain('w:pStyle w:val="Heading7"');
    expect(textOf(xml)).toContain('Frage 4?');
  });
});
