import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert, flows, model } from './helpers.ts';

const sample = () => readFileSync(new URL('../docs/beispiel/urlaubsantrag.bpmn', import.meta.url));

describe('Beispielmodell', () => {
  it('bleibt stabil', async () => {
    const { html, findings } = await convert(sample());
    expect(findings).toEqual([]);
    await expect(html).toMatchFileSnapshot('snapshots/urlaubsantrag.html');
  });

  it('liefert bei gleicher Eingabe genau dasselbe Dokument', async () => {
    const first = await convert(sample());
    const second = await convert(sample());
    expect(second.html).toBe(first.html);
  });

  it('hat nur gültige interne Links', async () => {
    const { html } = await convert(sample());
    const targets = [...html.matchAll(/href="#(s\d+)"/g)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(html).toContain(`id="${target}"`);
  });

  it('hat keine Sprünge in der Überschriftenfolge', async () => {
    const { html } = await convert(sample());
    const levels = [...html.matchAll(/<h([1-6])/g)].map((match) => Number(match[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    levels.forEach((level, index) => {
      if (index > 0) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1);
    });
  });

  it('gibt jedem Link einen Text mit Kontext', async () => {
    const { html } = await convert(sample());
    for (const match of html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)) {
      expect(match[1]).toMatch(/^Schritt \d+: \S/);
    }
  });

  it('enthält keine doppelten Satzzeichen', async () => {
    const { html } = await convert(sample());
    expect(html).not.toMatch(/\?<\/a>\.|\.\.|\?\./);
  });
});

describe('Lesbarkeit bei Sehbehinderung', () => {
  it('legt weder Farben noch feste Pixelmaße fest', async () => {
    const { html } = await convert(sample());
    const style = /<style>([\s\S]*)<\/style>/.exec(html)![1]!;
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i);
    expect(style).not.toMatch(/\d(px|pt)\b/);
    expect(style).toContain('color-scheme:light dark');
  });

  it('erlaubt das Vergrößern', async () => {
    const { html } = await convert(sample());
    expect(html).not.toMatch(/user-scalable|maximum-scale/);
  });

  it('markiert das Sprungziel sichtbar und unterstreicht Links', async () => {
    const { html } = await convert(sample());
    expect(html).toContain('h3:target{outline');
    expect(html).toContain('a{text-decoration:underline');
  });

  it('gibt die Dokumentsprache an', async () => {
    const { html } = await convert(sample());
    expect(html).toContain('<html lang="de">');
  });
});

describe('Präparierte Modelle', () => {
  const evil = '&lt;script&gt;alert(1)&lt;/script&gt;';
  const hostile = model(
    `<bpmn:startEvent id="S" name="${evil}" />
     <bpmn:task id="A" name="&lt;img src=x onerror=alert(1)&gt;">
       <bpmn:documentation>${evil}</bpmn:documentation>
       <bpmn:documentation textFormat="text/html">&lt;img src=x onerror=alert(2)&gt;Text</bpmn:documentation>
     </bpmn:task>
     <bpmn:exclusiveGateway id="G" name="${evil}" />
     <bpmn:task id="B" name="&quot; onmouseover=&quot;alert(1)" />
     <bpmn:textAnnotation id="N"><bpmn:text>${evil}</bpmn:text></bpmn:textAnnotation>
     <bpmn:association id="As" sourceRef="A" targetRef="N" />
     <bpmn:sequenceFlow id="f0" sourceRef="S" targetRef="A" />
     <bpmn:sequenceFlow id="f1" sourceRef="A" targetRef="G" />
     <bpmn:sequenceFlow id="f2" name="${evil}" sourceRef="G" targetRef="B" />
     <bpmn:sequenceFlow id="f3" name="x" sourceRef="G" targetRef="A" />`,
    `id="P" name="${evil}"`,
  );

  it('maskiert alle Texte aus dem Modell', async () => {
    const { html } = await convert(hostile);
    expect(html).not.toMatch(/<script|<img|<\/script/i);
    expect(html).not.toMatch(/<[a-z]+[^>]*\sonmouseover=/i);
    expect(html.match(/<title>[^<]*<\/title>/)?.[0]).toContain('&#60;script');
  });

  it('erzeugt ein Dokument, das nichts nachladen und ausführen darf', async () => {
    const { html } = await convert(hostile);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<[a-z][^>]*\s(src|srcset|action)=/i);
    expect(html.indexOf('<meta charset')).toBeLessThan(html.indexOf('<title>'));
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<title>'));
  });

  it('löst externe XML-Entitäten nicht auf', async () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE d [<!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">]>
${model('<bpmn:startEvent id="S" name="&xxe;" />' + flows())}`;
    const { html } = await convert(xml);
    expect(html).not.toMatch(/fonts|16-bit|\[extensions\]/i);
  });
});
