import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert, flows, model, visibleText } from './helpers.ts';

const task = (id: string, name = id) => `<bpmn:task id="${id}" name="${name}" />`;
const start = '<bpmn:startEvent id="S" name="Start" />';
const end = (id = 'E', name = 'Fertig') => `<bpmn:endEvent id="${id}" name="${name}" />`;
const named = (id: string, name: string, source: string, target: string) =>
  `<bpmn:sequenceFlow id="${id}" name="${name}" sourceRef="${source}" targetRef="${target}" />`;

const b = async (xml: string | Uint8Array) => {
  const result = await convert(xml, 'b');
  return { ...result, text: visibleText(result.html), links: (result.html.match(/<a /g) ?? []).length };
};

/** Prüft, was für jedes Dokument gelten muss, egal wie unsauber das Modell ist. */
function expectValidDocument(html: string): void {
  const ids = [...html.matchAll(/\sid="(s\d+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const match of html.matchAll(/href="#(s\d+)"/g)) expect(ids).toContain(match[1]);

  const levels = [...html.matchAll(/<h([1-6])/g)].map((match) => Number(match[1]));
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  levels.forEach((level, index) => {
    if (index > 0) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1);
  });
  expect(html).not.toMatch(/undefined|NaN|\[object/);
}

const stepIds = (html: string): number[] =>
  [...html.matchAll(/\sid="s(\d+)"/g)].map((match) => Number(match[1])).sort((x, y) => x - y);

describe('Zweige unter der Entscheidung', () => {
  it('stellt beide Fälle mit Überschrift dar und führt danach gemeinsam weiter', async () => {
    const { text, links } = await b(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Passt das?" />' + task('A') + task('B') + '<bpmn:exclusiveGateway id="M" />' + task('Z') + end() +
          named('j', 'Ja', 'G', 'A') + named('n', 'Nein', 'G', 'B') + flows('S>G', 'A>M', 'B>M', 'M>Z', 'Z>E'),
      ),
    );
    expect(text).toContain('### Schritt 2, Entscheidung: Passt das?\n#### Falls Ja\n[3] A.\n#### Falls Nein\n[4] B.\n### Danach gemeinsam weiter\n[5] Z.');
    expect(links).toBe(0);
  });

  it('rückt einen Zweig, der nicht zurückkommt, nicht ein: Der größere Weg läuft flach weiter', async () => {
    const { text, links } = await b(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Passt das?" />' + task('A') + task('B') + end('E1', 'Abbruch') + end('E2', 'Fertig') +
          named('n', 'Nein', 'G', 'E1') + named('j', 'Ja', 'G', 'A') + flows('S>G', 'A>B', 'B>E2'),
      ),
    );
    expect(text).toContain('#### Falls Nein\n[3] Ende: Abbruch. Dieser Weg endet hier.\n#### Falls Ja\n[4] A.\n[5] B.\n[6] Ende: Fertig.');
    expect(links).toBe(0);
  });

  it('sagt ausdrücklich, dass es weitergeht, wenn sonst eine leere Überschrift bliebe', async () => {
    const { text } = await b(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Erste?" />' + end('E1', 'Abbruch') + '<bpmn:exclusiveGateway id="H" name="Zweite?" />' + task('A') + task('B') +
          named('n', 'Nein', 'G', 'E1') + named('j', 'Ja', 'G', 'H') + named('x', 'X', 'H', 'A') + named('y', 'Y', 'H', 'B') + flows('S>G'),
      ),
    );
    expect(text).toContain('#### Falls Ja\nEs geht direkt hier weiter.\n### Schritt');
  });

  it('lässt „Regulär geht es so weiter“ weg, wenn direkt eine Überschrift folgt', async () => {
    const { text } = await b(
      model(
        start + task('A') + task('Nach') + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('X') + task('Y') +
          '<bpmn:boundaryEvent id="BE" name="Spät" attachedToRef="A"><bpmn:timerEventDefinition id="T" /></bpmn:boundaryEvent>' +
          named('x', 'X', 'G', 'X') + named('y', 'Y', 'G', 'Y') + flows('S>A', 'A>G', 'BE>Nach'),
      ),
    );
    expect(text).not.toContain('Regulär geht es so weiter');
    expect(text).toContain('### Schritt');
  });

  it('nutzt für Rücksprünge einen Link und sagt „zurück“', async () => {
    const { text, links, html } = await b(
      model(
        start + task('A') + '<bpmn:exclusiveGateway id="G" name="Fertig?" />' + end() +
          named('n', 'Nein', 'G', 'A') + named('j', 'Ja', 'G', 'E') + flows('S>A', 'A>G'),
      ),
    );
    expect(text).toContain('Falls Nein\nZurück zu Schritt 2: A.');
    expect(links).toBe(1);
    expect(html).toContain('id="s2"');
  });

  it('nennt den Standardweg „Sonst“ und setzt ihn ans Ende', async () => {
    const { text } = await b(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" default="d" />' + task('A') + task('B') + '<bpmn:exclusiveGateway id="M" />' + end() +
          '<bpmn:sequenceFlow id="d" sourceRef="G" targetRef="B" />' + named('j', 'Ja', 'G', 'A') + flows('S>G', 'A>M', 'B>M', 'M>E'),
      ),
    );
    expect(text).toMatch(/#### Falls Ja[\s\S]*#### Sonst/);
  });

  it('stellt einen leeren Fall ausdrücklich dar', async () => {
    const { text } = await b(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + '<bpmn:exclusiveGateway id="M" />' + end() +
          named('j', 'Ja', 'G', 'A') + named('n', 'Nein', 'G', 'M') + flows('S>G', 'A>M', 'M>E'),
      ),
    );
    expect(text).toContain('#### Falls Nein\nIn diesem Fall gibt es keinen eigenen Schritt.');
  });

  it('kommt mit zwei Flüssen zum selben Ziel zurecht', async () => {
    const { html, text } = await b(
      model(start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + named('x', 'X', 'G', 'A') + named('y', 'Y', 'G', 'A') + flows('S>G')),
    );
    expect(text).toContain('Falls X');
    expect(text).toContain('Falls Y');
    expect(stepIds(html)).toEqual([1, 2, 3]);
  });
});

describe('Gleichzeitige Wege', () => {
  const parallel = (first: string) =>
    model(
      start + '<bpmn:parallelGateway id="PS" />' + task('A') + task('A2') + task('B') + '<bpmn:parallelGateway id="PJ" />' + task('Z') + end() +
        flows('S>PS', `PS>${first}`, 'PS>B', 'B>PJ', 'PJ>Z', 'Z>E', ...(first === 'A' ? ['A>A2', 'A2>PJ'] : ['A2>PJ', 'A>A2'])),
    );

  it('fasst einzelne Schritte in einer Liste zusammen und nennt das Warten', async () => {
    const { text } = await b(
      model(
        start + '<bpmn:parallelGateway id="PS" />' + task('A') + task('B') + '<bpmn:parallelGateway id="PJ" />' + task('Z') + end() +
          flows('S>PS', 'PS>A', 'PS>B', 'A>PJ', 'B>PJ', 'PJ>Z', 'Z>E'),
      ),
    );
    expect(text).toContain('### Schritt 2: 2 Wege laufen gleichzeitig\nDiese Wege laufen gleichzeitig.\n[3] A.\n[4] B.\n### Schritt 5: Warten, bis alle gleichzeitigen Wege fertig sind\n[6] Z.');
  });

  it('gibt mehrschrittigen Wegen eigene Überschriften', async () => {
    const { text, html } = await b(parallel('A'));
    expect(text).toMatch(/#### Weg 1\n\[\d+\] A\.\n\[\d+\] A2\.\n#### Weg 2\n\[\d+\] B\./);
    expectValidDocument(html);
  });

  it('nennt im Hauptweg beide gleichzeitigen Aufgaben', async () => {
    const { text } = await b(
      model(
        start + '<bpmn:parallelGateway id="PS" />' + task('A') + task('B') + '<bpmn:parallelGateway id="PJ" />' + end() +
          flows('S>PS', 'PS>A', 'PS>B', 'A>PJ', 'B>PJ', 'PJ>E'),
      ),
    );
    expect(text).toContain('Gleichzeitig: A und B');
  });
});

describe('Sonderfälle an Aufgaben', () => {
  const withBoundary = (attrs: string, target: string, extra = '') =>
    model(
      start + task('A') + task('Nach') + task('Regulaer') + end() +
        `<bpmn:boundaryEvent id="B" name="Zu spät" attachedToRef="A" ${attrs}><bpmn:timerEventDefinition id="TD" /></bpmn:boundaryEvent>` +
        flows('S>A', 'A>Regulaer', 'Regulaer>E', `B>${target}`, ...extra.split(',').filter(Boolean)),
    );

  it('trennt Sonderfall und regulären Weg', async () => {
    const { text } = await b(withBoundary('', 'Nach', 'Nach>E'));
    expect(text).toMatch(/### Sonderfall Frist: Zu spät\nDie Aufgabe wird dabei abgebrochen\.\n\[\d+\] Nach\./);
    expect(text).toContain('### Regulär geht es so weiter');
  });

  it('nennt nicht unterbrechende Fälle als zusätzlich', async () => {
    const { text } = await b(withBoundary('cancelActivity="false"', 'Nach', 'Nach>E'));
    expect(text).toContain('Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:');
  });
});

describe('Weniger Ansagen', () => {
  it('nennt die Zuständigkeit nur beim Wechsel', async () => {
    const { text } = await b(
      model(
        `<bpmn:laneSet id="LS">
           <bpmn:lane id="L1" name="Rolle Eins"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane>
           <bpmn:lane id="L2" name="Rolle Zwei"><bpmn:flowNodeRef>C</bpmn:flowNodeRef></bpmn:lane>
         </bpmn:laneSet>` +
          start + task('A') + task('B') + task('C') + flows('S>A', 'A>B', 'B>C'),
      ),
    );
    expect(text.match(/Zuständig: Rolle Eins/g)).toHaveLength(1);
    expect(text.match(/Zuständig: Rolle Zwei/g)).toHaveLength(1);
  });

  it('lässt den Hauptweg weg, wenn es nichts zu überblicken gibt', async () => {
    const { text } = await b(model(start + task('A') + end() + flows('S>A', 'A>E')));
    expect(text).not.toContain('## Hauptweg');
  });

  it('nennt im Hauptweg nur die oberste Ebene', async () => {
    const { text } = await b(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('Seitenweg') + end('E1', 'Abbruch') + task('Lang1') + task('Lang2') + end('E2', 'Fertig') +
          named('n', 'Nein', 'G', 'Seitenweg') + named('j', 'Ja', 'G', 'Lang1') + flows('S>G', 'Seitenweg>E1', 'Lang1>Lang2', 'Lang2>E2'),
      ),
    );
    const mainPath = text.slice(text.indexOf('## Hauptweg'), text.indexOf('## Ablauf'));
    expect(mainPath).toContain('Entscheidung: Frage?');
    expect(mainPath).toContain('Lang1');
    expect(mainPath).not.toContain('Seitenweg');
  });
});

describe('Vollständigkeit', () => {
  it('führt Elemente ohne Weg vom Start in einem eigenen Abschnitt', async () => {
    const { text, html } = await b(model(start + task('A') + task('Insel') + flows('S>A')));
    expect(text).toContain('### Schritte ohne Weg vom Start\n[3] Insel. Zu diesem Schritt führt im Modell kein Weg vom Start aus.');
    expectValidDocument(html);
  });

  it('behauptet bei einem toten Ende nicht, es gehe weiter', async () => {
    const { text } = await b(model(start + task('A') + flows('S>A')));
    expect(text).toContain('Danach ist im Modell kein weiterer Schritt vorgesehen.');
  });

  it('kommt mit einem Kreis aus lauter Zusammenführungen zurecht', async () => {
    const { html } = await b(model(start + '<bpmn:exclusiveGateway id="M1" /><bpmn:exclusiveGateway id="M2" />' + flows('S>M1', 'M1>M2', 'M2>M1')));
    expectValidDocument(html);
  });

  it('wandelt sehr tiefe Verschachtelung in hervorgehobene Absätze um', async () => {
    // Rauten in Rauten: Weil jede wieder zusammenläuft, kann kein Zweig flach weiterlaufen.
    const depth = 5;
    let body = start + end();
    const edges: string[] = ['S>G0', 'M0>E'];
    let labelled = '';
    for (let index = 0; index < depth; index++) {
      body += `<bpmn:exclusiveGateway id="G${index}" name="Frage ${index}?" />` + task(`B${index}`) + task(`Z${index}`) + `<bpmn:exclusiveGateway id="M${index}" />`;
      const inner = index + 1 < depth ? `G${index + 1}` : `Z${index}`;
      labelled += named(`x${index}`, 'Links', `G${index}`, inner) + named(`y${index}`, 'Rechts', `G${index}`, `B${index}`);
      edges.push(`B${index}>M${index}`);
      edges.push(index + 1 < depth ? `M${index + 1}>Z${index}` : `Z${index}>M${index}`);
      if (index + 1 < depth) edges.push(`Z${index}>M${index}`);
    }
    const { html } = await b(model(body + labelled + flows(...edges)));
    expectValidDocument(html);
    expect(html).toMatch(/<p id="s\d+"><strong>Schritt \d+, Entscheidung: Frage \d\?<\/strong><\/p>/);
    expect(html).toContain('<h6>Falls Links</h6>');
    expect(html).not.toMatch(/<h[7-9]/);
    expect(stepIds(html)).toHaveLength(2 + depth * 3);
  });

  it('kommt mit einer sehr langen Kette ohne Rekursionsproblem durch', async () => {
    const count = 4900;
    const tasks = Array.from({ length: count }, (_, index) => task(`T${index}`)).join('');
    const edges = Array.from({ length: count - 1 }, (_, index) => `T${index}>T${index + 1}`);
    const { html } = await b(model(start + tasks + flows('S>T0', ...edges)));
    expect(stepIds(html)).toHaveLength(count + 1);
  });

  it('übersteht viele Rautenmuster hintereinander', async () => {
    const count = 800;
    let body = start;
    const edges: string[] = [];
    let previous = 'S';
    for (let index = 0; index < count; index++) {
      body += `<bpmn:exclusiveGateway id="G${index}" name="Frage ${index}?" />` + task(`A${index}`) + task(`B${index}`) + `<bpmn:exclusiveGateway id="M${index}" />` + task(`Z${index}`);
      edges.push(`${previous}>G${index}`, `G${index}>A${index}`, `G${index}>B${index}`, `A${index}>M${index}`, `B${index}>M${index}`, `M${index}>Z${index}`);
      previous = `Z${index}`;
    }
    const { html } = await b(model(body + flows(...edges)));
    expect(stepIds(html)).toHaveLength(1 + count * 4);
  });
});

describe('Zufällige, auch unsaubere Modelle', () => {
  /** Einfacher Zufallsgenerator mit festem Startwert, damit Fehlschläge wiederholbar sind. */
  const random = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  it.each(Array.from({ length: 150 }, (_, index) => index + 1))('Startwert %i: jeder Schritt genau einmal, alle Links gültig', async (seed) => {
    const next = random(seed);
    const count = 3 + Math.floor(next() * 25);
    const ids = Array.from({ length: count }, (_, index) => `N${index}`);
    const types = ['task', 'task', 'task', 'exclusiveGateway', 'exclusiveGateway', 'parallelGateway', 'inclusiveGateway'];
    let body = '<bpmn:startEvent id="S" name="Start" />';
    for (const id of ids) {
      const type = types[Math.floor(next() * types.length)]!;
      const unnamed = next() < 0.3 && type !== 'task';
      body += `<bpmn:${type} id="${id}"${unnamed ? '' : ` name="Element ${id}"`} />`;
    }
    const edges = new Set<string>(['S>N0']);
    for (let index = 0; index < count * 1.6; index++) {
      const source = Math.floor(next() * count);
      // Meist nach vorn, manchmal zurück, damit Schleifen und unsaubere Sprünge entstehen.
      const target = next() < 0.8 ? Math.min(count - 1, source + 1 + Math.floor(next() * 4)) : Math.floor(next() * count);
      edges.add(`N${source}>N${target}`);
    }

    const a = await convert(model(body + flows(...edges)), 'a');
    const result = await b(model(body + flows(...edges)));
    expectValidDocument(result.html);

    // Beide Fassungen enthalten dieselben Schritte, B also nicht weniger als A.
    const stepsInA = a.document.sections.flatMap((section) => section.steps).length;
    expect(stepIds(result.html)).toEqual(Array.from({ length: stepsInA }, (_, index) => index + 1));
    for (const id of ids) {
      if (a.html.includes(`Element ${id}<`) || a.html.includes(`Element ${id}.`)) expect(result.html).toContain(`Element ${id}`);
    }
    expect(result.findings).toEqual(a.findings);
  });
});

describe('Beispiele', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url));

  it('Bauantrag: kaum Links, und die Lösungen der Testanleitung stimmen', async () => {
    const { html, text, links, findings } = await b(read('../docs/test/bauantrag.bpmn'));
    expect(findings).toEqual([]);
    expect(links).toBe(1);
    expectValidDocument(html);
    expect(text).toContain('[6] Unterlagen auf Vollständigkeit prüfen. Zuständig: Eingangsstelle.');
    expect(text).toMatch(/#### Falls Nein\n\[8\] Fehlende Unterlagen nachfordern\.[^\n]*Danach zurück zu Schritt 6/);
    expect(text).toContain('Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:\n[9] Erinnerung senden.');
    expect(text).toContain('[12] Bauordnungsrecht prüfen.');
    expect(text).toContain('[13] Brandschutz prüfen.');
    expect(text).toContain('Schritt 14: Warten, bis alle gleichzeitigen Wege fertig sind');
    expect(text).toContain('### Danach gemeinsam weiter\n[18] Bescheid zeichnen. Zuständig: Amtsleitung.');
    expect(text).toContain('von Feuerwehr');
    expect(text).toContain('Sendet „Bescheid“ an Schritt 3');
    await expect(html).toMatchFileSnapshot('../docs/test/bauantrag-fassung-b.html');
  });

  it('Urlaubsantrag: Dokument ist stabil', async () => {
    const { html, links } = await b(read('../docs/beispiel/urlaubsantrag.bpmn'));
    expect(links).toBeLessThanOrEqual(3);
    expectValidDocument(html);
    await expect(html).toMatchFileSnapshot('../docs/test/urlaubsantrag-fassung-b.html');
  });

  it('Modell mit Fehlern: Kein Element fehlt, und der Prüfbericht bleibt gleich', async () => {
    const bytes = read('../docs/test/mit-absichtlichen-fehlern.bpmn');
    const { html, findings, text } = await b(bytes);
    expectValidDocument(html);
    for (const name of ['Aufgabe ohne Fortsetzung', 'Teilprozess mit Inhalt', 'Welche Prüfungen?', 'Prüfung A', 'Prüfung B', 'Aufgabe ohne Verbindung']) {
      expect(text).toContain(name);
    }
    expect(findings).toEqual((await convert(bytes, 'a')).findings);
  });
});

describe('Präparierte Modelle', () => {
  it('maskiert auch in den neuen Bausteinen alle Texte', async () => {
    const evil = '&lt;img src=x onerror=alert(1)&gt;';
    const { html } = await b(
      model(
        start + `<bpmn:exclusiveGateway id="G" name="${evil}" />` + task('A', evil) + end('E1', evil) + task('B') +
          `<bpmn:boundaryEvent id="BE" name="${evil}" attachedToRef="A"><bpmn:timerEventDefinition id="T" /></bpmn:boundaryEvent>` +
          named('x', evil, 'G', 'A') + named('y', evil, 'G', 'E1') + flows('S>G', 'BE>B'),
      ),
    );
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&#60;img');
  });
});
