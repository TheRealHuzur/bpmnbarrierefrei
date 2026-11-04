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
});

describe('Ein chronologischer Ablauf über alle Pools', () => {
  const BPMN = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t"';
  const pools = (participants: string, messages: string, processes: string) =>
    `<bpmn:definitions ${BPMN}><bpmn:collaboration id="C">${participants}${messages}</bpmn:collaboration>${processes}</bpmn:definitions>`;
  const pool = (id: string, name: string, process: string) => `<bpmn:participant id="${id}" name="${name}" processRef="${process}" />`;
  const message = (id: string, name: string, source: string, target: string) => `<bpmn:messageFlow id="${id}" name="${name}" sourceRef="${source}" targetRef="${target}" />`;
  const process = (id: string, body: string) => `<bpmn:process id="${id}">${body}</bpmn:process>`;
  /** Sequenzflüsse mit eindeutigen IDs, auch über mehrere Prozesse hinweg. */
  const flowsIn = (prefix: string, ...pairs: string[]) =>
    pairs
      .map((pair, index) => {
        const [source, target] = pair.split('>');
        return `<bpmn:sequenceFlow id="${prefix}${index}" sourceRef="${source}" targetRef="${target}" />`;
      })
      .join('');

  const expectInOrder = (text: string, parts: string[]): void => {
    let position = -1;
    for (const part of parts) {
      const next = text.indexOf(part, position + 1);
      expect(next, `„${part}“ steht nicht hinter dem vorigen Teil`).toBeGreaterThan(position);
      position = next;
    }
  };

  const conversation = (firstPool: 'kunde' | 'amt') => {
    const kunde = pool('P1', 'Kunde', 'K');
    const amt = pool('P2', 'Amt', 'A');
    return pools(
      firstPool === 'kunde' ? kunde + amt : amt + kunde,
      message('M1', 'Anfrage', 'K1', 'SA') + message('M2', 'Antwort', 'A1', 'KW'),
      process('K', '<bpmn:startEvent id="SK" name="Bedarf" />' + task('K1', 'Anfrage senden') +
        '<bpmn:intermediateCatchEvent id="KW" name="Antwort da"><bpmn:messageEventDefinition id="m" /></bpmn:intermediateCatchEvent>' +
        task('K2', 'Antwort lesen') + end('EK', 'Erledigt') + flowsIn('k', 'SK>K1', 'K1>KW', 'KW>K2', 'K2>EK')) +
      process('A', '<bpmn:startEvent id="SA" name="Anfrage da" />' + task('A1', 'Antwort senden') + end('EA', 'Beantwortet') + flowsIn('a', 'SA>A1', 'A1>EA')),
    );
  };

  it('folgt der Unterhaltung zwischen den Pools', async () => {
    const { text, html, links } = await b(conversation('kunde'));
    expectInOrder(text, [
      '### Beginn bei Kunde', 'Bedarf', 'Anfrage senden', 'Sendet „Anfrage“ an Amt',
      '### Wechsel zu Amt', 'Anfrage da', 'Empfängt „Anfrage“ von Kunde', 'Antwort senden', 'Sendet „Antwort“ an Kunde',
      '### Wechsel zu Kunde', 'Antwort da', 'Empfängt „Antwort“ von Amt', 'Antwort lesen', 'Erledigt',
    ]);
    expect(links).toBe(0);
    expectValidDocument(html);
  });

  it('beginnt beim Auslöser, auch wenn der Pool in der Datei später steht', async () => {
    const { text } = await b(conversation('amt'));
    expect(text).toContain('### Beginn bei Kunde');
    expectInOrder(text, ['Bedarf', 'Anfrage senden', 'Anfrage da', 'Antwort senden', 'Antwort da']);
  });

  it('hat nur einen Abschnitt „Ablauf“, keine Abschnitte je Pool und keinen Hauptweg', async () => {
    const { text, document } = await b(conversation('kunde'));
    expect(document.sections.map((section) => section.heading)).toEqual(['Ablauf']);
    expect(text).not.toContain('Ablauf:');
    expect(text).not.toContain('Hauptweg');
  });

  it('nennt nichts doppelt, wenn eine Nachricht den Start auslöst', async () => {
    const { text } = await b(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        message('M1', 'Anfrage', 'K1', 'SA'),
        process('K', task('K1', 'Senden')) +
          process('A', '<bpmn:startEvent id="SA" name="Eingang"><bpmn:messageEventDefinition id="m" /></bpmn:startEvent>'),
      ),
    );
    expect(text).toContain('Start: Eingang. Empfängt „Anfrage“ von Kunde.');
    expect(text).not.toContain('Art des Ereignisses');
  });

  it('führt eine Nachricht an den Rand eines Pools zu dessen Start', async () => {
    const { text, codes } = await b(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        message('M1', 'Anfrage', 'K1', 'P2'),
        process('A', '<bpmn:startEvent id="SA" name="Eingang" />' + task('A1', 'Bearbeiten') + flowsIn('a', 'SA>A1')) +
          process('K', '<bpmn:startEvent id="SK" name="Bedarf" />' + task('K1', 'Senden') + flowsIn('k', 'SK>K1')),
      ),
    );
    expectInOrder(text, ['### Beginn bei Kunde', 'Senden', 'Sendet „Anfrage“ an Amt', '### Wechsel zu Amt', 'Eingang', 'Empfängt „Anfrage“ von Kunde', 'Bearbeiten']);
    expect(codes).not.toContain('unconnected-pool');
  });

  it('wechselt auch aus einem Zweig heraus in den anderen Pool und zurück', async () => {
    const { text, html } = await b(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        message('M1', 'Beschwerde', 'K1', 'SA'),
        process('K',
          '<bpmn:startEvent id="SK" name="Bedarf" /><bpmn:exclusiveGateway id="G" name="Zufrieden?" />' + task('K1', 'Beschweren') + task('K2', 'Bewerten') + end('EK', 'Erledigt') +
            named('n', 'Nein', 'G', 'K1') + named('j', 'Ja', 'G', 'K2') + flowsIn('k', 'SK>G', 'K1>EK', 'K2>EK')) +
          process('A', '<bpmn:startEvent id="SA" name="Beschwerde da" />' + task('A1', 'Prüfen') + end('EA', 'Geprüft') + flowsIn('a', 'SA>A1', 'A1>EA')),
      ),
    );
    expectValidDocument(html);
    expectInOrder(text, ['Beginn bei Kunde', 'Falls Nein', 'Beschweren', 'Wechsel zu Amt', 'Prüfen']);
    expect(text).toMatch(/Wechsel zu Kunde[\s\S]*Bewerten|Bewerten[\s\S]*Wechsel zu Amt/);
  });

  it('sagt offen, wenn Pools nicht verbunden sind, und meldet es', async () => {
    const { text, codes, html } = await b(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        '',
        process('K', '<bpmn:startEvent id="SK" name="Bedarf" />' + task('K1', 'Senden') + flowsIn('k', 'SK>K1')) +
          process('A', '<bpmn:startEvent id="SA" name="Eingang" />' + task('A1', 'Bearbeiten') + flowsIn('a', 'SA>A1')),
      ),
    );
    expect(text).toContain('### Weiterer Teil: Amt\nDas Modell verbindet diesen Teil nicht mit dem vorigen. Die zeitliche Reihenfolge ist deshalb nicht festgelegt.');
    expect(text).not.toContain('Wechsel zu');
    expect(codes).toContain('unconnected-pool');
    expectValidDocument(html);
  });

  it('kommt mit einer Nachricht an ein Grenzereignis zurecht', async () => {
    const { html, text } = await b(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        message('M1', 'Storno', 'K1', 'BE'),
        process('K', '<bpmn:startEvent id="SK" name="Bedarf" />' + task('K1', 'Stornieren') + flowsIn('k', 'SK>K1')) +
          process('A', '<bpmn:startEvent id="SA" name="Eingang" />' + task('A1', 'Bearbeiten') + task('A2', 'Rückabwickeln') +
            '<bpmn:boundaryEvent id="BE" name="Storno" attachedToRef="A1"><bpmn:messageEventDefinition id="m" /></bpmn:boundaryEvent>' + flowsIn('a', 'SA>A1', 'BE>A2')),
      ),
    );
    expectValidDocument(html);
    expect(text).toContain('Rückabwickeln');
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

  it.each(Array.from({ length: 100 }, (_, index) => index + 1))('Startwert %i mit zwei Pools und Nachrichten: jeder Schritt genau einmal', async (seed) => {
    const next = random(seed * 7919);
    const types = ['task', 'task', 'task', 'exclusiveGateway', 'parallelGateway'];
    const buildProcess = (prefix: string) => {
      const count = 3 + Math.floor(next() * 12);
      const ids = Array.from({ length: count }, (_, index) => `${prefix}${index}`);
      let body = `<bpmn:startEvent id="${prefix}S" name="Start ${prefix}" />`;
      for (const id of ids) body += `<bpmn:${types[Math.floor(next() * types.length)]} id="${id}" name="Element ${id}" />`;
      const edges = new Set([`${prefix}S>${prefix}0`]);
      for (let index = 0; index < count * 1.4; index++) {
        const source = Math.floor(next() * count);
        const target = next() < 0.8 ? Math.min(count - 1, source + 1 + Math.floor(next() * 3)) : Math.floor(next() * count);
        edges.add(`${ids[source]}>${ids[target]}`);
      }
      const flowXml = [...edges]
        .map((edge, index) => {
          const [source, target] = edge.split('>');
          return `<bpmn:sequenceFlow id="${prefix}f${index}" sourceRef="${source}" targetRef="${target}" />`;
        })
        .join('');
      return { ids, xml: `<bpmn:process id="Proc${prefix}">${body}${flowXml}</bpmn:process>` };
    };
    const first = buildProcess('X');
    const second = buildProcess('Y');
    let messages = '';
    for (let index = 0; index < 1 + Math.floor(next() * 4); index++) {
      const [from, to] = next() < 0.5 ? [first.ids, second.ids] : [second.ids, first.ids];
      messages += `<bpmn:messageFlow id="M${index}" name="Nachricht ${index}" sourceRef="${from[Math.floor(next() * from.length)]}" targetRef="${to[Math.floor(next() * to.length)]}" />`;
    }
    const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
      <bpmn:collaboration id="C"><bpmn:participant id="PX" name="Pool X" processRef="ProcX" /><bpmn:participant id="PY" name="Pool Y" processRef="ProcY" />${messages}</bpmn:collaboration>
      ${first.xml}${second.xml}</bpmn:definitions>`;

    const a = await convert(xml, 'a');
    const result = await b(xml);
    expectValidDocument(result.html);
    const stepsInA = a.document.sections.flatMap((section) => section.steps).length;
    expect(stepIds(result.html)).toEqual(Array.from({ length: stepsInA }, (_, index) => index + 1));
    expect(result.document.sections).toHaveLength(1);
  });
});

describe('Beispiele', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url));

  it('Bauantrag: kaum Links, und die Lösungen der Testanleitung stimmen', async () => {
    const { html, text, links, findings } = await b(read('../docs/test/bauantrag.bpmn'));
    expect(findings).toEqual([]);
    expect(links).toBe(1);
    expectValidDocument(html);
    expect(text).toContain('### Beginn bei Antragstellende Person\n[1] Start: Bauvorhaben geplant.\n[2] Bauantrag einreichen.');
    expect(text).toContain('Sendet „Bauantrag“ an Bauamt.\n### Wechsel zu Bauamt\n[3] Start: Bauantrag eingegangen. Empfängt „Bauantrag“ von Antragstellende Person.');
    expect(text).toContain('[4] Unterlagen auf Vollständigkeit prüfen. Zuständig: Eingangsstelle.');
    expect(text).toMatch(/#### Falls Nein\n\[6\] Fehlende Unterlagen nachfordern\.[^\n]*Danach zurück zu Schritt 4/);
    expect(text).toContain('Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:\n[7] Erinnerung senden.');
    expect(text).toContain('[10] Bauordnungsrecht prüfen.');
    expect(text).toContain('[11] Brandschutz prüfen.');
    expect(text).toContain('Schritt 12: Warten, bis alle gleichzeitigen Wege fertig sind');
    expect(text).toContain('#### Falls Ja\n[14] Genehmigung erstellen.');
    expect(text).toContain('#### Falls Nein\n[15] Ablehnung mit Begründung erstellen.');
    expect(text).toContain('### Danach gemeinsam weiter\n[16] Bescheid zeichnen. Zuständig: Amtsleitung.');
    expect(text).toContain('von Feuerwehr');
    expect(text).toContain('[17] Bescheid versenden. Zuständig: Eingangsstelle. Sendet „Bescheid“ an Antragstellende Person.');
    expect(text).toContain('### Wechsel zu Antragstellende Person\n[19] Ereignis: Bescheid erhalten. Empfängt „Bescheid“ von Bauamt.\n[20] Ende: Verfahren abgeschlossen.');
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
