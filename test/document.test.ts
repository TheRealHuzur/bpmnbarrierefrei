import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert, flows, model } from './helpers.ts';

const task = (id: string, name = id) => `<bpmn:task id="${id}" name="${name}" />`;
const start = '<bpmn:startEvent id="S" name="Start" />';
const end = (id = 'E', name = 'Fertig') => `<bpmn:endEvent id="${id}" name="${name}" />`;
const named = (id: string, name: string, source: string, target: string) =>
  `<bpmn:sequenceFlow id="${id}" name="${name}" sourceRef="${source}" targetRef="${target}" />`;

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

/** Die Nummern laufen lückenlos, und jedes benannte Element steht genau einmal als eigener Schritt da. */
function expectEveryStepOnce(html: string, namedIds: string[]): void {
  const ids = stepIds(html);
  expect(ids).toEqual(Array.from({ length: ids.length }, (_, index) => index + 1));
  for (const id of namedIds) {
    const placed = html.match(new RegExp(`<strong>[^<]*Element ${id}\\.</strong>|: Element ${id}</p>`, 'g'));
    expect(placed, `Element ${id}`).toHaveLength(1);
  }
}

describe('Zweige unter der Entscheidung', () => {
  it('stellt beide Fälle mit Überschrift dar und führt danach gemeinsam weiter', async () => {
    const { text, links } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Passt das?" />' + task('A') + task('B') + '<bpmn:exclusiveGateway id="M" />' + task('Z') + end() +
          named('j', 'Ja', 'G', 'A') + named('n', 'Nein', 'G', 'B') + flows('S>G', 'A>M', 'B>M', 'M>Z', 'Z>E'),
      ),
    );
    expect(text).toContain('Schritt 1, Entscheidung: Passt das?\nFalls Ja\nSchritt 2: A.\nFalls Nein\nSchritt 3: B.\nDanach gemeinsam weiter\nSchritt 4: Z.');
    expect(links).toBe(0);
  });

  it('rückt einen Zweig, der nicht zurückkommt, nicht ein: Der größere Weg läuft flach weiter', async () => {
    const { text, links } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Passt das?" />' + task('A') + task('B') + end('E1', 'Abbruch') + end('E2', 'Fertig') +
          named('n', 'Nein', 'G', 'E1') + named('j', 'Ja', 'G', 'A') + flows('S>G', 'A>B', 'B>E2'),
      ),
    );
    expect(text).toContain('Falls Nein\nEnde: Abbruch. Dieser Weg endet hier.\nFalls Ja\nSchritt 2: A.\nSchritt 3: B.\nEnde: Fertig.');
    expect(links).toBe(0);
  });

  it('sagt ausdrücklich, dass es weitergeht, wenn sonst eine leere Überschrift bliebe', async () => {
    const { text } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Erste?" />' + end('E1', 'Abbruch') + '<bpmn:exclusiveGateway id="H" name="Zweite?" />' + task('A') + task('B') +
          named('n', 'Nein', 'G', 'E1') + named('j', 'Ja', 'G', 'H') + named('x', 'X', 'H', 'A') + named('y', 'Y', 'H', 'B') + flows('S>G'),
      ),
    );
    expect(text).toContain('Falls Ja\nEs geht direkt hier weiter.\nSchritt');
  });

  it('lässt „Regulär geht es so weiter“ weg, wenn direkt eine Überschrift folgt', async () => {
    const { text } = await convert(
      model(
        start + task('A') + task('Nach') + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('X') + task('Y') +
          '<bpmn:boundaryEvent id="BE" name="Spät" attachedToRef="A"><bpmn:timerEventDefinition id="T" /></bpmn:boundaryEvent>' +
          named('x', 'X', 'G', 'X') + named('y', 'Y', 'G', 'Y') + flows('S>A', 'A>G', 'BE>Nach'),
      ),
    );
    expect(text).not.toContain('Regulär geht es so weiter');
    expect(text).toContain('Schritt');
  });

  it('nutzt für Rücksprünge einen Link und sagt „zurück“', async () => {
    const { text, links, html } = await convert(
      model(
        start + task('A') + '<bpmn:exclusiveGateway id="G" name="Fertig?" />' + end() +
          named('n', 'Nein', 'G', 'A') + named('j', 'Ja', 'G', 'E') + flows('S>A', 'A>G'),
      ),
    );
    expect(text).toContain('Falls Nein\nZurück zu Schritt 1: A.');
    expect(links).toBe(1);
    expect(html).toContain('id="s2"');
  });

  it('nennt den Standardweg „Sonst“ und setzt ihn ans Ende', async () => {
    const { text } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" default="d" />' + task('A') + task('B') + '<bpmn:exclusiveGateway id="M" />' + end() +
          '<bpmn:sequenceFlow id="d" sourceRef="G" targetRef="B" />' + named('j', 'Ja', 'G', 'A') + flows('S>G', 'A>M', 'B>M', 'M>E'),
      ),
    );
    expect(text).toMatch(/Falls Ja[\s\S]*Sonst/);
  });

  it('stellt einen leeren Fall ausdrücklich dar', async () => {
    const { text } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + '<bpmn:exclusiveGateway id="M" />' + end() +
          named('j', 'Ja', 'G', 'A') + named('n', 'Nein', 'G', 'M') + flows('S>G', 'A>M', 'M>E'),
      ),
    );
    expect(text).toContain('Falls Nein\nIn diesem Fall gibt es keinen eigenen Schritt.');
  });

  it('kommt mit zwei Flüssen zum selben Ziel zurecht', async () => {
    const { html, text } = await convert(
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
    const { text } = await convert(
      model(
        start + '<bpmn:parallelGateway id="PS" />' + task('A') + task('B') + '<bpmn:parallelGateway id="PJ" />' + task('Z') + end() +
          flows('S>PS', 'PS>A', 'PS>B', 'A>PJ', 'B>PJ', 'PJ>Z', 'Z>E'),
      ),
    );
    expect(text).toContain('Schritt 1: 2 Wege laufen gleichzeitig\nSchritt 2: A.\nSchritt 3: B.\nSchritt 4: Warten, bis alle gleichzeitigen Wege fertig sind\nSchritt 5: Z.');
  });

  it('gibt mehrschrittigen Wegen eigene Überschriften', async () => {
    const { text, html } = await convert(parallel('A'));
    expect(text).toMatch(/Weg 1\nSchritt \d+: A\.\nSchritt \d+: A2\.\nWeg 2\nSchritt \d+: B\./);
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
    const { text } = await convert(withBoundary('', 'Nach', 'Nach>E'));
    expect(text).toMatch(/Sonderfall Frist: Zu spät\nDie Aufgabe wird dabei abgebrochen\.\nSchritt \d+: Nach\./);
    expect(text).toContain('Regulär geht es so weiter');
  });

  it('nennt nicht unterbrechende Fälle als zusätzlich', async () => {
    const { text } = await convert(withBoundary('cancelActivity="false"', 'Nach', 'Nach>E'));
    expect(text).toContain('Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:');
  });
});

describe('Weniger Ansagen', () => {
  it('nennt die Zuständigkeit nur beim Wechsel', async () => {
    const { text } = await convert(
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
    const { text, html, links } = await convert(conversation('kunde'));
    expectInOrder(text, [
      'Beginn bei Kunde', 'Bedarf', 'Anfrage senden', 'Sendet „Anfrage“ an Amt',
      'Wechsel zu Amt', 'Anfrage da', 'Empfängt „Anfrage“ von Kunde', 'Antwort senden', 'Sendet „Antwort“ an Kunde',
      'Wechsel zu Kunde', 'Antwort da', 'Empfängt „Antwort“ von Amt', 'Antwort lesen', 'Erledigt',
    ]);
    expect(links).toBe(0);
    expectValidDocument(html);
  });

  it('beginnt beim Auslöser, auch wenn der Pool in der Datei später steht', async () => {
    const { text } = await convert(conversation('amt'));
    expect(text).toContain('Beginn bei Kunde');
    expectInOrder(text, ['Bedarf', 'Anfrage senden', 'Anfrage da', 'Antwort senden', 'Antwort da']);
  });

  it('hat nur einen Abschnitt „Ablauf“, keine Abschnitte je Pool und keinen Hauptweg', async () => {
    const { text } = await convert(conversation('kunde'));
    expect(text.match(/^## Ablauf/gm)).toHaveLength(1);
    expect(text).not.toContain('Ablauf:');
    expect(text).not.toContain('Hauptweg');
  });

  it('nennt nichts doppelt, wenn eine Nachricht den Start auslöst', async () => {
    const { text } = await convert(
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
    const { text, codes } = await convert(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        message('M1', 'Anfrage', 'K1', 'P2'),
        process('A', '<bpmn:startEvent id="SA" name="Eingang" />' + task('A1', 'Bearbeiten') + flowsIn('a', 'SA>A1')) +
          process('K', '<bpmn:startEvent id="SK" name="Bedarf" />' + task('K1', 'Senden') + flowsIn('k', 'SK>K1')),
      ),
    );
    expectInOrder(text, ['Beginn bei Kunde', 'Senden', 'Sendet „Anfrage“ an Amt', 'Wechsel zu Amt', 'Eingang', 'Empfängt „Anfrage“ von Kunde', 'Bearbeiten']);
    expect(codes).not.toContain('unconnected-pool');
  });

  it('wechselt auch aus einem Zweig heraus in den anderen Pool und zurück', async () => {
    const { text, html } = await convert(
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
    const { text, codes, html } = await convert(
      pools(
        pool('P1', 'Kunde', 'K') + pool('P2', 'Amt', 'A'),
        '',
        process('K', '<bpmn:startEvent id="SK" name="Bedarf" />' + task('K1', 'Senden') + flowsIn('k', 'SK>K1')) +
          process('A', '<bpmn:startEvent id="SA" name="Eingang" />' + task('A1', 'Bearbeiten') + flowsIn('a', 'SA>A1')),
      ),
    );
    expect(text).toContain('Weiterer Teil: Amt\nDas Modell verbindet diesen Teil nicht mit dem vorigen. Die zeitliche Reihenfolge ist deshalb nicht festgelegt.');
    expect(text).not.toContain('Wechsel zu');
    expect(codes).toContain('unconnected-pool');
    expectValidDocument(html);
  });

  it('kommt mit einer Nachricht an ein Grenzereignis zurecht', async () => {
    const { html, text } = await convert(
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
    const { text, html } = await convert(model(start + task('A') + task('Insel') + flows('S>A')));
    expect(text).toContain('Schritte ohne Weg vom Start\nSchritt 2: Insel. Zu diesem Schritt führt im Modell kein Weg vom Start aus.');
    expectValidDocument(html);
  });

  it('behauptet bei einem toten Ende nicht, es gehe weiter', async () => {
    const { text } = await convert(model(start + task('A') + flows('S>A')));
    expect(text).toContain('Danach ist im Modell kein weiterer Schritt vorgesehen.');
  });

  it('kommt mit einem Kreis aus lauter Zusammenführungen zurecht', async () => {
    const { html } = await convert(model(start + '<bpmn:exclusiveGateway id="M1" /><bpmn:exclusiveGateway id="M2" />' + flows('S>M1', 'M1>M2', 'M2>M1')));
    expectValidDocument(html);
  });

  it('bleibt bei sehr tiefer Verschachtelung ohne Überschriften gültig', async () => {
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
    const { html } = await convert(model(body + labelled + flows(...edges)));
    expectValidDocument(html);
    expect(html.slice(html.indexOf('<h2>Ablauf'))).not.toMatch(/<h[3-6]|role="heading"/);
    expect(html).toMatch(/<p class="abschnitt" id="s\d+">Schritt \d+, Entscheidung: Frage 4\?<\/p>/);
    expect(stepIds(html)).toHaveLength(2 + depth * 3);
  });

  it('kommt mit einer sehr langen Kette ohne Rekursionsproblem durch', async () => {
    const count = 4900;
    const tasks = Array.from({ length: count }, (_, index) => task(`T${index}`)).join('');
    const edges = Array.from({ length: count - 1 }, (_, index) => `T${index}>T${index + 1}`);
    const { html } = await convert(model(start + tasks + flows('S>T0', ...edges)));
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
    const { html } = await convert(model(body + flows(...edges)));
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
    const namedIds: string[] = [];
    for (const id of ids) {
      const type = types[Math.floor(next() * types.length)]!;
      const unnamed = next() < 0.3 && type !== 'task';
      if (!unnamed) namedIds.push(id);
      body += `<bpmn:${type} id="${id}"${unnamed ? '' : ` name="Element ${id}"`} />`;
    }
    const edges = new Set<string>(['S>N0']);
    for (let index = 0; index < count * 1.6; index++) {
      const source = Math.floor(next() * count);
      // Meist nach vorn, manchmal zurück, damit Schleifen und unsaubere Sprünge entstehen.
      const target = next() < 0.8 ? Math.min(count - 1, source + 1 + Math.floor(next() * 4)) : Math.floor(next() * count);
      edges.add(`N${source}>N${target}`);
    }

    const result = await convert(model(body + flows(...edges)));
    expectValidDocument(result.html);
    expectEveryStepOnce(result.html, namedIds);
  });

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))('Startwert %i mit verschachtelten Teilprozessen: jeder Schritt genau einmal', async (seed) => {
    const next = random(seed * 104729);
    const namedIds: string[] = [];
    let idCounter = 0;
    const buildBody = (depth: number): string => {
      const count = 2 + Math.floor(next() * 6);
      const ids: string[] = [];
      let body = '';
      for (let index = 0; index < count; index++) {
        const id = `N${idCounter++}`;
        ids.push(id);
        namedIds.push(id);
        const roll = next();
        if (roll < 0.25 && depth < 3) body += `<bpmn:subProcess id="${id}" name="Element ${id}">${buildBody(depth + 1)}</bpmn:subProcess>`;
        else if (roll < 0.45) body += `<bpmn:exclusiveGateway id="${id}" name="Element ${id}" />`;
        else if (roll < 0.55) body += `<bpmn:inclusiveGateway id="${id}" name="Element ${id}" />`;
        else if (roll < 0.65) body += `<bpmn:parallelGateway id="${id}" name="Element ${id}" />`;
        else body += `<bpmn:task id="${id}" name="Element ${id}" />`;
      }
      for (let index = 0; index < count * 1.4; index++) {
        const source = Math.floor(next() * count);
        const target = next() < 0.8 ? Math.min(count - 1, source + 1 + Math.floor(next() * 2)) : Math.floor(next() * count);
        body += `<bpmn:sequenceFlow id="F${idCounter++}" sourceRef="${ids[source]}" targetRef="${ids[target]}" />`;
      }
      return body;
    };
    const result = await convert(model(start + buildBody(0) + '<bpmn:sequenceFlow id="Z" sourceRef="S" targetRef="N0" />'));
    expectValidDocument(result.html);
    expectEveryStepOnce(result.html, namedIds);
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

    const result = await convert(xml);
    expectValidDocument(result.html);
    expectEveryStepOnce(result.html, [...first.ids, ...second.ids]);
    expect(result.text.match(/^## Ablauf/gm)).toHaveLength(1);
  });
});

describe('Beispiele', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url));

  it('Bauantrag: kaum Links, und die Lösungen der Testanleitung stimmen', async () => {
    const { html, text, links, findings } = await convert(read('../docs/test/bauantrag.bpmn'));
    expect(findings).toEqual([]);
    expect(links).toBe(1);
    expectValidDocument(html);
    expect(text).toContain('Dieser Prozess hat 16 Schritte, davon 10 Aufgaben und 2 Entscheidungen.');
    expect(text).toContain('Beginn bei Antragstellende Person\nStart: Bauvorhaben geplant.\nSchritt 1: Bauantrag einreichen.');
    expect(text).toContain('Sendet „Bauantrag“ an Bauamt.\nWechsel zu Bauamt\nSchritt 2, Start: Bauantrag eingegangen. Empfängt „Bauantrag“ von Antragstellende Person.');
    expect(text).toContain('Schritt 3: Unterlagen auf Vollständigkeit prüfen. Zuständig: Eingangsstelle.');
    expect(text).toMatch(/Falls Nein\nSchritt 5: Fehlende Unterlagen nachfordern\.[^\n]*Danach zurück zu Schritt 3/);
    expect(text).toContain('Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:\nSchritt 6: Erinnerung senden.');
    expect(text).toContain('Schritt 8: Bauordnungsrecht prüfen.');
    expect(text).toContain('Schritt 9: Brandschutz prüfen.');
    expect(text).toContain('Schritt 10: Warten, bis alle gleichzeitigen Wege fertig sind');
    expect(text).toContain('Falls Ja\nSchritt 12: Genehmigung erstellen.');
    expect(text).toContain('Falls Nein\nSchritt 13: Ablehnung mit Begründung erstellen.');
    expect(text).toContain('Danach gemeinsam weiter\nSchritt 14: Bescheid zeichnen. Zuständig: Amtsleitung.');
    expect(text).toContain('von Feuerwehr');
    expect(text).toContain('Schritt 15: Bescheid versenden. Zuständig: Eingangsstelle. Sendet „Bescheid“ an Antragstellende Person.');
    expect(text).toContain('Wechsel zu Antragstellende Person\nSchritt 16, Ereignis: Bescheid erhalten. Empfängt „Bescheid“ von Bauamt.\nEnde: Verfahren abgeschlossen.');
    await expect(html).toMatchFileSnapshot('../docs/test/bauantrag.html');
  });

  it('Urlaubsantrag: Dokument ist stabil', async () => {
    const { html, links } = await convert(read('../docs/beispiel/urlaubsantrag.bpmn'));
    expect(links).toBeLessThanOrEqual(3);
    expectValidDocument(html);
    await expect(html).toMatchFileSnapshot('../docs/beispiel/urlaubsantrag.html');
  });

  it('Modell mit Fehlern: Kein Element fehlt, und alle Fehlerarten werden gemeldet', async () => {
    const { html, findings, codes, text } = await convert(read('../docs/test/mit-absichtlichen-fehlern.bpmn'));
    expectValidDocument(html);
    for (const name of ['Aufgabe ohne Fortsetzung', 'Teilprozess mit Inhalt', 'Welche Prüfungen?', 'Prüfung A', 'Prüfung B', 'Aufgabe ohne Verbindung']) {
      expect(text).toContain(name);
    }
    expect(findings).toHaveLength(10);
    expect(new Set(codes)).toEqual(new Set(['missing-name', 'unlabeled-exit', 'dead-end', 'unreachable']));
    await expect(html).toMatchFileSnapshot('../docs/test/mit-absichtlichen-fehlern.html');
  });
});

describe('Befunde aus echten Modellen', () => {
  const lanes = (...pairs: [string, string[]][]) =>
    `<bpmn:laneSet id="LS">${pairs
      .map(([name, refs], index) => `<bpmn:lane id="L${index}" name="${name}">${refs.map((ref) => `<bpmn:flowNodeRef>${ref}</bpmn:flowNodeRef>`).join('')}</bpmn:lane>`)
      .join('')}</bpmn:laneSet>`;

  it('nennt am Ziel eines Sprungs die Zuständigkeit, auch wenn sie im Text zuletzt gleich war', async () => {
    const { text } = await convert(
      model(
        lanes(['Skript', ['Z']], ['KI', ['A', 'G']]) +
          start + task('Z', 'Holen') + task('A', 'Arbeiten') + '<bpmn:exclusiveGateway id="G" name="Fertig?" />' + end() +
          named('n', 'Nein', 'G', 'Z') + named('j', 'Ja', 'G', 'E') + flows('S>Z', 'Z>A', 'A>G'),
      ),
    );
    expect(text).toContain('Schritt 1: Holen. Zuständig: Skript.');
    expect(text).toContain('Zurück zu Schritt 1: Holen');
  });

  it('nennt die Zuständigkeit bei einem Sprungziel, obwohl sie sich zum Schritt davor nicht ändert', async () => {
    const { text } = await convert(
      model(
        lanes(['Rolle', ['A', 'B', 'G']]) +
          start + task('A') + task('B') + '<bpmn:exclusiveGateway id="G" name="Nochmal?" />' + end() +
          named('n', 'Ja', 'G', 'B') + named('j', 'Nein', 'G', 'E') + flows('S>A', 'A>B', 'B>G'),
      ),
    );
    expect(text).toContain('Schritt 1: A. Zuständig: Rolle.\nSchritt 2: B. Zuständig: Rolle.');
  });

  it('macht aus mehrzeiligen Beschreibungen Absätze und Listen', async () => {
    const { text, html } = await convert(
      model(
        start +
          `<bpmn:task id="A" name="Einladen"><bpmn:documentation>Bitte Folgendes klären:&#10;- Thema&#10;- Ziele&#10;&#10;Danach die Mail senden.</bpmn:documentation></bpmn:task>` +
          task('B') + end() + flows('S>A', 'A>B', 'B>E'),
      ),
    );
    expect(text).toContain('Schritt 1: Einladen.\nBitte Folgendes klären:\n[] Thema\n[] Ziele\nDanach die Mail senden.\nSchritt 2: B.');
    expect(html).toContain('<ul>\n<li>Thema</li>\n<li>Ziele</li>\n</ul>');
  });

  it('hält eine einzeilige Beschreibung beim Schritt', async () => {
    const { text } = await convert(model(start + '<bpmn:task id="A" name="A"><bpmn:documentation>Kurz erklärt</bpmn:documentation></bpmn:task>' + flows('S>A')));
    expect(text).toContain('Schritt 1: A. Kurz erklärt.');
  });

  it('hängt keinen Punkt an einen Strich am Ende der Beschreibung', async () => {
    const { text } = await convert(model(start + '<bpmn:task id="A" name="A"><bpmn:documentation>Offen -</bpmn:documentation></bpmn:task>' + flows('S>A')));
    expect(text).toContain('Offen -');
    expect(text).not.toContain('-.');
  });

  it('bleibt mit mehrzeiliger Beschreibung bei einer Entscheidung gültig', async () => {
    const { text, html } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?"><bpmn:documentation>Erste Zeile&#10;Zweite Zeile</bpmn:documentation></bpmn:exclusiveGateway>' +
          task('A') + task('B') + named('x', 'X', 'G', 'A') + named('y', 'Y', 'G', 'B') + flows('S>G'),
      ),
    );
    expect(text).toContain('Schritt 1, Entscheidung: Frage?\nErste Zeile\nZweite Zeile\nFalls X');
    expectValidDocument(html);
  });

  it('nennt bei einem leeren Fall das Ziel, mit Link nur wenn andere Fälle übersprungen werden', async () => {
    const skipping = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + '<bpmn:exclusiveGateway id="M" />' + task('Z') +
          named('n', 'Vorhanden', 'G', 'M') + named('j', 'Fehlt', 'G', 'A') + flows('S>G', 'A>M', 'M>Z'),
      ),
    );
    expect(skipping.text).toContain('Falls Vorhanden\nIn diesem Fall gibt es keinen eigenen Schritt. Weiter mit Schritt 3: Z.');
    expect(skipping.links).toBe(1);

    const last = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + '<bpmn:exclusiveGateway id="M" />' + task('Z') +
          named('j', 'Fehlt', 'G', 'A') + named('n', 'Vorhanden', 'G', 'M') + flows('S>G', 'A>M', 'M>Z'),
      ),
    );
    expect(last.text).toContain('Falls Vorhanden\nIn diesem Fall gibt es keinen eigenen Schritt. Weiter mit Schritt 3: Z.');
    expect(last.links).toBe(0);
  });

  it('schreibt bei unbenannten Entscheidungen keinen technischen Hinweis in den Lesetext', async () => {
    const { text, findings } = await convert(
      model(start + '<bpmn:exclusiveGateway id="G" />' + task('A') + task('B') + named('x', 'Bekannt', 'G', 'A') + named('y', 'Neu', 'G', 'B') + flows('S>G')),
    );
    expect(text).toContain('Schritt 1: Entscheidung\nFalls Bekannt');
    expect(text).not.toContain('ohne Namen');
    expect(findings.map((finding) => finding.message).join(' ')).toContain('Eine Entscheidung (ID G) hat keinen Namen.');
  });

  it('nennt im Prüfbericht bei einem unbeschrifteten Ausgang die betroffene Entscheidung', async () => {
    const { findings } = await convert(model(start + '<bpmn:exclusiveGateway id="G" />' + task('A') + task('B') + flows('S>G', 'G>A', 'G>B')));
    expect(findings.find((finding) => finding.code === 'unlabeled-exit')?.message).toContain('von der Entscheidung (ID G)');
  });

  it('formuliert die Fälle eines ereignisbasierten Gateways als Ereignisse', async () => {
    const { text } = await convert(
      model(
        start + '<bpmn:eventBasedGateway id="G" />' +
          '<bpmn:intermediateCatchEvent id="B" name="Zwei Wochen sind verstrichen"><bpmn:timerEventDefinition id="t" /></bpmn:intermediateCatchEvent>' +
          '<bpmn:intermediateCatchEvent id="A" name="Antwort ist eingegangen"><bpmn:messageEventDefinition id="m" /></bpmn:intermediateCatchEvent>' +
          flows('S>G', 'G>B', 'G>A'),
      ),
    );
    expect(text).toContain('Wenn zuerst eintritt: Zwei Wochen sind verstrichen');
    expect(text).not.toContain('Falls Zwei Wochen');
  });

  it('unterscheidet Datenspeicher von erzeugten Datenobjekten', async () => {
    const { text } = await convert(
      model(
        start +
          `<bpmn:dataStoreReference id="DB" name="Datenbank" />
           <bpmn:dataObjectReference id="DO" name="Bescheid" dataObjectRef="O" /><bpmn:dataObject id="O" />
           <bpmn:task id="A" name="A">
             <bpmn:dataInputAssociation id="i"><bpmn:sourceRef>DB</bpmn:sourceRef></bpmn:dataInputAssociation>
             <bpmn:dataOutputAssociation id="o1"><bpmn:targetRef>DB</bpmn:targetRef></bpmn:dataOutputAssociation>
             <bpmn:dataOutputAssociation id="o2"><bpmn:targetRef>DO</bpmn:targetRef></bpmn:dataOutputAssociation>
           </bpmn:task>` +
          flows('S>A'),
      ),
    );
    expect(text).toContain('Erzeugt: Bescheid. Schreibt in: Datenbank. Liest aus: Datenbank.');
  });

  const onePool = (body: string) => `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
    <bpmn:collaboration id="C"><bpmn:participant id="P1" name="Fachbereich" processRef="P" /></bpmn:collaboration>
    <bpmn:process id="P" name="Antrag">${body}</bpmn:process>
  </bpmn:definitions>`;

  it('nennt den Pool bei den Beteiligten, wenn er Lanes hat', async () => {
    const { text } = await convert(onePool(lanes(['Sachbearbeitung', ['A']]) + task('A')));
    expect(text).toContain('## Beteiligte\nAlle gehören zu: Fachbereich.\n[] Sachbearbeitung');
  });

  it('wiederholt den Pool nicht, wenn er selbst der einzige Beteiligte ist', async () => {
    const { text } = await convert(onePool(task('A')));
    expect(text).not.toContain('Alle gehören zu');
    expect(text).toContain('[] Fachbereich');
  });

  it('stottert nicht bei gleichnamigen Enden und meldet sie', async () => {
    const { text, codes } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + end('E1', 'Ende') + end('E2', 'Ende') +
          named('x', 'X', 'G', 'E1') + named('y', 'Y', 'G', 'E2') + flows('S>G'),
      ),
    );
    expect(text).toContain('Mögliche Ergebnisse: Ende.');
    expect(text).not.toContain('Ende: Ende');
    expect(codes).toContain('duplicate-end');
  });

  it('sagt gleichzeitige Wege nicht doppelt an, bei einem Namen aber schon', async () => {
    const parallel = (attrs: string) =>
      model(start + `<bpmn:parallelGateway id="Q" ${attrs} />` + task('A') + task('B') + flows('S>Q', 'Q>A', 'Q>B'));
    expect((await convert(parallel(''))).text).not.toContain('Diese Wege laufen gleichzeitig');
    expect((await convert(parallel('name="Prüfen"'))).text).toContain('Diese Wege laufen gleichzeitig.');
  });

  it('nennt ein Sprungziel im Link genauso wie an der Stelle selbst', async () => {
    const { text, html } = await convert(
      model(
        start + '<bpmn:parallelGateway id="PS" />' + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + task('B') + '<bpmn:parallelGateway id="PJ" />' +
          named('x', 'Kurz', 'G', 'PJ') + named('y', 'Lang', 'G', 'A') + flows('S>PS', 'PS>G', 'PS>B', 'A>PJ', 'B>PJ'),
      ),
    );
    const link = /<a [^>]*>([^<]*)<\/a>/.exec(html)?.[1];
    expect(link).toMatch(/^Schritt \d+: Warten, bis alle gleichzeitigen Wege fertig sind$/);
    expect(text).toContain(`${link}`);
  });

  it('zählt ereignisbasierte Gateways nicht als Entscheidungen und Teilprozesse getrennt', async () => {
    const { text } = await convert(
      model(
        start + '<bpmn:subProcess id="SP" name="Teil"><bpmn:task id="I" name="Innen" /></bpmn:subProcess><bpmn:eventBasedGateway id="G" />' +
          '<bpmn:intermediateCatchEvent id="A" name="X"><bpmn:signalEventDefinition id="s1" /></bpmn:intermediateCatchEvent>' +
          '<bpmn:intermediateCatchEvent id="B" name="Y"><bpmn:signalEventDefinition id="s2" /></bpmn:intermediateCatchEvent>' +
          flows('S>SP', 'SP>G', 'G>A', 'G>B'),
      ),
    );
    expect(text).toContain('davon 1 Aufgabe, 1 Teilprozess und 0 Entscheidungen.');
  });

  it('erwähnt Wechsel zwischen Organisationen in der Lesehilfe nur, wenn es sie gibt', async () => {
    const single = await convert(model(start + task('A') + flows('S>A')));
    expect(single.text).not.toContain('Organisationen');
    expect(single.text).toContain('Wer zuständig ist, steht beim Schritt, sobald es wechselt.');
    const { text } = await convert(read('../docs/test/bauantrag.bpmn'));
    expect(text).toContain('Wechsel zwischen den beteiligten Organisationen stehen ebenfalls in einer eigenen Zeile.');
  });

  const read = (path: string) => readFileSync(new URL(path, import.meta.url));
});

describe('Form des Dokuments', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url));

  it.each(['../docs/test/bauantrag.bpmn', '../docs/beispiel/urlaubsantrag.bpmn', '../docs/test/mit-absichtlichen-fehlern.bpmn'])(
    '%s: Unter „Ablauf“ gibt es keine einzige Überschrift',
    async (path) => {
      const { html } = await convert(read(path));
      const start = html.indexOf('<h2>Ablauf</h2>');
      expect(start).toBeGreaterThan(0);
      expect(html.slice(start + 1)).not.toMatch(/<h[1-6]\b|role="heading"/);
      expect(html.slice(0, start)).toContain('<h2>Überblick</h2>');
    },
  );

  it('sagt bei einem Fall nach einer inneren Entscheidung, wozu er gehört', async () => {
    const { text } = await convert(read('../docs/beispiel/urlaubsantrag.bpmn'));
    expect(text).toContain('Falls Ja\nZurück zu Schritt 1');
    expect(text).toContain('Falls Ja, zu Schritt 4');
  });

  it('nennt den Bezug nicht, solange nichts verschachtelt ist', async () => {
    const { text } = await convert(read('../docs/test/bauantrag.bpmn'));
    expect(text).not.toContain(', zu Schritt');
  });

  it('zählt bei den Beteiligten nur die Namen auf, ohne ihre Aufgaben', async () => {
    const { html } = await convert(read('../docs/test/bauantrag.bpmn'));
    const roles = html.slice(html.indexOf('<h2>Beteiligte</h2>'), html.indexOf('<h2>Ablauf</h2>'));
    expect([...roles.matchAll(/<li>([^<]*)<\/li>/g)].map((match) => match[1])).toEqual([
      'Antragstellende Person',
      'Bauamt, Eingangsstelle',
      'Bauamt, Sachbearbeitung',
      'Bauamt, Amtsleitung',
      'Feuerwehr, externe Stelle',
    ]);
  });

  it('nennt auch Beteiligte, die keine Aufgaben haben', async () => {
    const { html } = await convert(
      model('<bpmn:laneSet id="LS"><bpmn:lane id="L" name="Beirat" /></bpmn:laneSet>' + start + task('A') + flows('S>A')),
    );
    expect(html).toContain('<li>Beirat</li>');
  });

  it.each(['../docs/test/bauantrag.bpmn', '../docs/beispiel/urlaubsantrag.bpmn', '../docs/test/mit-absichtlichen-fehlern.bpmn'])(
    '%s: Der Ablauf enthält keine Aufzählung',
    async (path) => {
      const { html } = await convert(read(path));
      expect(html.slice(html.indexOf('<h2>Ablauf</h2>'))).not.toMatch(/<(ol|ul|li)\b/);
    },
  );

  it('schreibt vor jeden Arbeitsschritt „Schritt“, die Nummern laufen lückenlos', async () => {
    const { text } = await convert(read('../docs/test/bauantrag.bpmn'));
    const flow = text.slice(text.indexOf('## Ablauf'));
    const numbers = [...flow.matchAll(/^(?:#+ )?Schritt (\d+)[,:]/gm)].map((match) => Number(match[1]));
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
  });

  it('gibt Start und Ende keine Nummer', async () => {
    const { text } = await convert(model(start + task('A') + end() + flows('S>A', 'A>E')));
    expect(text).toContain('Start.\nSchritt 1: A.\nEnde: Fertig. Dieser Weg endet hier.');
    expect(text).toContain('Dieser Prozess hat 1 Schritt, davon 1 Aufgabe');
  });

  it('kann auch zu einem Ende ohne Nummer springen', async () => {
    const { text, html } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Erste?" />' + '<bpmn:exclusiveGateway id="H" name="Zweite?" />' + task('A') + task('B') + end() +
          named('x', 'X', 'G', 'H') + named('y', 'Y', 'G', 'E') + named('p', 'P', 'H', 'A') + named('q', 'Q', 'H', 'B') + flows('S>G', 'A>E', 'B>E'),
      ),
    );
    expectValidDocument(html);
    expect(text).toContain('Ende: Fertig.');
    expect(text).not.toContain('Schritt 0');
  });

  it('nennt nie eine Nummer 0, auch nicht bei einem Start mit mehreren Ausgängen', async () => {
    const { text, html } = await convert(model(start + task('A') + task('B') + flows('S>A', 'S>B')));
    expect(text).not.toContain('Schritt 0');
    expect(text).toContain('Start\nDiese Wege laufen gleichzeitig.');
    expectValidDocument(html);
  });
});

describe('Reihenfolge', () => {
  it('ordnet Zweige nach der Position im Diagramm statt nach der Dateireihenfolge', async () => {
    const { text } = await convert(`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
      id="D" targetNamespace="urn:t">
      <bpmn:process id="P">
        <bpmn:startEvent id="S" name="Start" />
        <bpmn:exclusiveGateway id="G" name="Frage?" />
        <bpmn:task id="Unten" name="Unten" /><bpmn:task id="Oben" name="Oben" />
        <bpmn:sequenceFlow id="a" sourceRef="S" targetRef="G" />
        <bpmn:sequenceFlow id="b" name="x" sourceRef="G" targetRef="Unten" />
        <bpmn:sequenceFlow id="c" name="y" sourceRef="G" targetRef="Oben" />
      </bpmn:process>
      <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">
        <bpmndi:BPMNShape id="s1" bpmnElement="Unten"><dc:Bounds x="100" y="300" width="10" height="10" /></bpmndi:BPMNShape>
        <bpmndi:BPMNShape id="s2" bpmnElement="Oben"><dc:Bounds x="100" y="100" width="10" height="10" /></bpmndi:BPMNShape>
      </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
    </bpmn:definitions>`);
    expect(text.indexOf('Falls y')).toBeLessThan(text.indexOf('Falls x'));
  });

  it('stellt mehrere Starts in Modellreihenfolge an den Anfang', async () => {
    const { text } = await convert(
      model('<bpmn:startEvent id="S1" name="Erster" /><bpmn:startEvent id="S2" name="Zweiter" />' + task('A') + end() + flows('S1>A', 'S2>A', 'A>E')),
    );
    expect(text).toContain('Start: Erster. Weiter mit Schritt 1: A.\nWeiterer Start\nStart: Zweiter.\nDanach gemeinsam weiter\nSchritt 1: A.');
  });

  it('nennt den direkten Nachfolger nicht', async () => {
    const { text } = await convert(model(start + task('A') + task('B') + end() + flows('S>A', 'A>B', 'B>E')));
    expect(text).toContain('Start.\nSchritt 1: A.\nSchritt 2: B.\nEnde: Fertig.');
    expect(text).not.toContain('Weiter mit');
  });
});

describe('Mehrere Ausgänge ohne Gateway', () => {
  it('verliert keinen Weg und keine Zuständigkeit', async () => {
    const { text, codes } = await convert(
      model(
        '<bpmn:laneSet id="LS"><bpmn:lane id="L" name="Rolle"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
          start + task('A') + task('B') + task('C') + end() + flows('S>A', 'A>B', 'A>C', 'B>E', 'C>E'),
      ),
    );
    expect(text).toContain('Schritt 1: A\nZuständig: Rolle.\nDiese Wege laufen gleichzeitig.\nSchritt 2: B.\nSchritt 3: C.');
    expect(codes).toContain('implicit-split');
  });

  it('beschreibt Ausgänge mit Bedingung als bedingt statt als gleichzeitig', async () => {
    const { text } = await convert(
      model(
        start + task('A') + task('B') + task('C') +
          '<bpmn:sequenceFlow id="s" sourceRef="S" targetRef="A" />' +
          '<bpmn:sequenceFlow id="x" name="Eilig" sourceRef="A" targetRef="B"><bpmn:conditionExpression>eilig</bpmn:conditionExpression></bpmn:sequenceFlow>' +
          '<bpmn:sequenceFlow id="y" sourceRef="A" targetRef="C"><bpmn:conditionExpression>normal</bpmn:conditionExpression></bpmn:sequenceFlow>',
      ),
    );
    expect(text).toContain('Je nach Bedingung geht es so weiter:');
    expect(text).toContain('Falls Eilig');
    expect(text).toContain('Falls normal');
  });
});

describe('Beschriftung von Entscheidungen', () => {
  const decision = (flowsXml: string, attrs = 'id="G" name="Frage?"') =>
    model(start + `<bpmn:exclusiveGateway ${attrs} />` + task('A') + task('B') + flows('S>G') + flowsXml);

  it('meldet unbeschriftete Ausgänge und unbenannte Entscheidungen', async () => {
    const { text, codes, findings } = await convert(
      decision('<bpmn:sequenceFlow id="j" sourceRef="G" targetRef="A" /><bpmn:sequenceFlow id="n" sourceRef="G" targetRef="B" />', 'id="G"'),
    );
    expect(text.match(/Fall ohne Beschriftung/g)).toHaveLength(2);
    expect(text).toContain('Schritt 1: Entscheidung');
    expect(codes.filter((code) => code === 'unlabeled-exit')).toHaveLength(2);
    expect(findings.some((finding) => finding.code === 'missing-name' && finding.elementId === 'G')).toBe(true);
  });

  it('nutzt eine Bedingung als Text, meldet die fehlende Beschriftung aber', async () => {
    const { text, codes } = await convert(
      decision(
        '<bpmn:sequenceFlow id="j" sourceRef="G" targetRef="A"><bpmn:conditionExpression>Betrag über 100</bpmn:conditionExpression></bpmn:sequenceFlow>' +
          '<bpmn:sequenceFlow id="n" name="Nein" sourceRef="G" targetRef="B" />',
      ),
    );
    expect(text).toContain('Falls Betrag über 100');
    expect(codes).toContain('unlabeled-exit');
  });

  it('setzt nach einer Frage im Linktext keinen zusätzlichen Punkt', async () => {
    const { text } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + end() +
          named('b', 'Ja', 'G', 'A') + named('c', 'Nein', 'G', 'E') + flows('S>G', 'A>G'),
      ),
    );
    expect(text).toContain('Danach zurück zu Schritt 1: Frage?');
    expect(text).not.toContain('?.');
  });
});

describe('Gateways, die entfallen oder bleiben', () => {
  it('überspringt unbenannte Zusammenführungen', async () => {
    const { html } = await convert(model(start + '<bpmn:exclusiveGateway id="M" />' + task('A') + end() + flows('S>M', 'M>A', 'A>E')));
    expect(stepIds(html)).toEqual([1, 2, 3]);
  });

  it('behält benannte Zusammenführungen, damit kein Name verloren geht', async () => {
    const { text } = await convert(model(start + '<bpmn:exclusiveGateway id="M" name="Prüfung beendet" />' + task('A') + end() + flows('S>M', 'M>A', 'A>E')));
    expect(text).toContain('Schritt 1, Zusammenführung: Prüfung beendet.');
  });
});

describe('Lücken im Modell', () => {
  it('führt auch einen abgetrennten Kreis auf', async () => {
    const { text, codes } = await convert(model(start + task('A') + task('K1') + task('K2') + flows('S>A', 'K1>K2', 'K2>K1')));
    expect(text).toContain('Schritte ohne Weg vom Start');
    expect(text).toContain('K1.');
    expect(text).toContain('K2.');
    expect(codes.filter((code) => code === 'unreachable')).toHaveLength(2);
  });

  it('kommt ohne Startereignis zurecht und meldet es', async () => {
    const { text, codes } = await convert(model(task('A') + task('B') + flows('A>B')));
    expect(text).toContain('Schritt 1: A.\nSchritt 2: B.');
    expect(codes).toContain('no-start');
    expect(codes).not.toContain('unreachable');
  });

  it('meldet Sequenzflüsse ins Leere', async () => {
    const { html, codes } = await convert(model(start + task('A') + flows('S>A', 'A>Gibtsnicht')));
    expect(stepIds(html)).toEqual([1, 2]);
    expect(codes).toContain('broken-flow');
  });

  it('meldet Verzweigungen, deren Regel nicht beschreibbar ist', async () => {
    const { codes, text } = await convert(
      model(start + '<bpmn:complexGateway id="C" name="Regel?" />' + task('A') + task('B') + named('x', 'X', 'C', 'A') + named('y', 'Y', 'C', 'B') + flows('S>C')),
    );
    expect(codes).toContain('unsupported');
    expect(text).toContain('Schritt 1, Verzweigung: Regel?');
  });

  it('schreibt den Prüfbericht ohne technische BPMN-Begriffe', async () => {
    const { findings } = await convert(
      model(
        '<bpmn:startEvent id="S" /><bpmn:task id="A" /><bpmn:exclusiveGateway id="G" />' + task('X') + task('Y') + task('Insel') +
          flows('S>A', 'A>G', 'G>X', 'G>Y'),
      ),
    );
    expect(findings.length).toBeGreaterThan(3);
    for (const finding of findings) expect(finding.message).not.toMatch(/bpmn:|Gateway \(|StartEvent/);
    expect(findings.map((finding) => finding.message).join(' ')).toContain('Ein Startereignis (ID S) hat keinen Namen.');
  });
});

describe('Teilprozesse', () => {
  const sub = (id: string, name: string, body: string, attrs = '') => `<bpmn:subProcess id="${id}" name="${name}" ${attrs}>${body}</bpmn:subProcess>`;
  const inner = (prefix: string, ...pairs: string[]) =>
    pairs
      .map((pair, index) => {
        const [source, target] = pair.split('>');
        return `<bpmn:sequenceFlow id="${prefix}${index}" sourceRef="${source}" targetRef="${target}" />`;
      })
      .join('');

  it('beschreibt den Inhalt am Ort, mit durchgehenden Nummern und klarem Abschluss', async () => {
    const { text, html, codes } = await convert(
      model(
        start +
          sub('SP', 'Prüfung', '<bpmn:startEvent id="IS" name="Los" />' + task('I1', 'Innen eins') + task('I2', 'Innen zwei') + '<bpmn:endEvent id="IE" name="Innen fertig" />' + inner('i', 'IS>I1', 'I1>I2', 'I2>IE')) +
          task('Z', 'Danach') + end() + flows('S>SP', 'SP>Z', 'Z>E'),
      ),
    );
    expect(text).toContain('Schritt 1, Teilprozess: Prüfung\nStart: Los.\nSchritt 2: Innen eins.\nSchritt 3: Innen zwei.\nEnde: Innen fertig. Dieser Weg endet hier.\nDamit ist der Teilprozess „Prüfung“ abgeschlossen.\nSchritt 4: Danach.');
    expect(text).toContain('Mögliche Ergebnisse: Fertig.');
    expect(text).toContain('Dieser Prozess hat 4 Schritte');
    expect(codes).toEqual([]);
    expectValidDocument(html);
  });

  it('verschachtelt Teilprozesse und übernimmt die Zuständigkeit', async () => {
    const { text, html } = await convert(
      model(
        '<bpmn:laneSet id="LS"><bpmn:lane id="L" name="Rolle"><bpmn:flowNodeRef>SP</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
          start + sub('SP', 'Außen', sub('SQ', 'Innen', task('T', 'Tief')) ) + flows('S>SP'),
      ),
    );
    expect(text).toContain('Schritt 1, Teilprozess: Außen\nZuständig: Rolle.\nSchritt 2, Teilprozess: Innen\nZuständig: Rolle.\nSchritt 3: Tief.');
    expectValidDocument(html);
  });

  it('kommt ohne Startereignis im Teilprozess aus und meldet das nicht als Fehler', async () => {
    const { codes } = await convert(model(start + sub('SP', 'Teil', task('T', 'Innen') + end('IE', 'Aus') + inner('i', 'T>IE')) + end() + flows('S>SP', 'SP>E')));
    expect(codes).toEqual([]);
  });

  it('stellt Ereignis-Teilprozesse und Ausgleichsaufgaben als Sonderabläufe dar', async () => {
    const { text, codes, html } = await convert(
      model(
        start + task('A') + end() + flows('S>A', 'A>E') +
          sub('EV', 'Storno', '<bpmn:startEvent id="ES" name="Storno kommt"><bpmn:messageEventDefinition id="md" /></bpmn:startEvent>' + task('R', 'Rückabwickeln') + end('EE', 'Storniert') + inner('i', 'ES>R', 'R>EE'), 'triggeredByEvent="true"') +
          '<bpmn:task id="K" name="Rückbuchen" isForCompensation="true" />',
      ),
    );
    expect(text).toContain('Sonderabläufe\nSchritt 2, Teilprozess: Storno\nDieser Teilprozess läuft nicht im normalen Ablauf.');
    expect(text).toContain('Schritt 4: Rückbuchen. Dieser Schritt läuft nicht im normalen Ablauf.');
    expect(codes).not.toContain('unreachable');
    expect(codes).not.toContain('dead-end');
    expectValidDocument(html);
  });

  it('nennt die Anmerkung in einem Teilprozess beim richtigen Schritt', async () => {
    const { text } = await convert(
      model(
        start + sub('SP', 'Teil', task('T', 'Innen') + '<bpmn:textAnnotation id="N"><bpmn:text>Wichtig</bpmn:text></bpmn:textAnnotation><bpmn:association id="As" sourceRef="T" targetRef="N" />') + flows('S>SP'),
      ),
    );
    expect(text).toContain('Schritt 2: Innen. Hinweis: Wichtig.');
  });

  it('ordnet den Pool anhand einer Nachricht aus einem Teilprozess ein', async () => {
    const { text, html } = await convert(`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
      <bpmn:collaboration id="C">
        <bpmn:participant id="PA" name="Amt" processRef="A" /><bpmn:participant id="PK" name="Kunde" processRef="K" />
        <bpmn:messageFlow id="M" name="Antrag" sourceRef="T" targetRef="AS" />
      </bpmn:collaboration>
      <bpmn:process id="A"><bpmn:startEvent id="AS" name="Eingang" />${task('A1', 'Bearbeiten')}${inner('a', 'AS>A1')}</bpmn:process>
      <bpmn:process id="K"><bpmn:startEvent id="KS" name="Bedarf" />${sub('SP', 'Antrag stellen', task('T', 'Absenden'))}${inner('k', 'KS>SP')}</bpmn:process>
    </bpmn:definitions>`);
    expect(text.indexOf('Absenden')).toBeLessThan(text.indexOf('Eingang'));
    expect(text).toContain('Beginn bei Kunde');
    expect(text).toContain('Wechsel zu Amt');
    expectValidDocument(html);
  });

  it('beschreibt Aufrufe anderer Prozesse und meldet, wenn sie nicht in der Datei stehen', async () => {
    const internal = await convert(`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
      <bpmn:process id="A"><bpmn:startEvent id="S" name="Start" /><bpmn:callActivity id="C" name="Prüfen" calledElement="B" />${inner('a', 'S>C')}</bpmn:process>
      <bpmn:process id="B" name="Prüfprozess">${task('T', 'Prüfen')}</bpmn:process>
    </bpmn:definitions>`);
    expect(internal.text).toContain('Dieser Schritt ruft den Prozess „Prüfprozess“ auf.');
    expect(internal.codes).not.toContain('unsupported');

    const external = await convert(model(start + '<bpmn:callActivity id="C" name="Prüfen" calledElement="Fremd" />' + flows('S>C')));
    expect(external.text).toContain('ruft den Prozess „Fremd“ auf. Dessen Inhalt ist nicht Teil dieses Dokuments.');
    expect(external.findings.some((finding) => finding.code === 'unsupported' && finding.severity === 'info')).toBe(true);
  });
});

describe('Weitere Gateways und Ereignisse', () => {
  it('beschreibt inklusive Verzweigung und Zusammenführung', async () => {
    const { text, codes } = await convert(
      model(
        start + '<bpmn:inclusiveGateway id="I" name="Welche Prüfungen?" />' + task('A') + task('B') + '<bpmn:inclusiveGateway id="J" />' + task('Z') + end() +
          named('x', 'Bau', 'I', 'A') + named('y', 'Brandschutz', 'I', 'B') + flows('S>I', 'A>J', 'B>J', 'J>Z', 'Z>E'),
      ),
    );
    expect(text).toContain('Schritt 1, Verzweigung: Welche Prüfungen?\nMehrere dieser Wege können zutreffen.\nWeg: Bau\nSchritt 2: A.\nWeg: Brandschutz\nSchritt 3: B.');
    expect(text).toContain('Schritt 4: Warten, bis alle begonnenen Wege fertig sind\nWeiter erst, wenn von diesen Schritten alle begonnenen abgeschlossen sind: Schritt 2: A, Schritt 3: B.');
    expect(codes).not.toContain('unsupported');
  });

  it('beschreibt ein ereignisbasiertes Gateway mit den Ereignissen als Fällen', async () => {
    const { text, codes, html } = await convert(
      model(
        start + '<bpmn:eventBasedGateway id="G" />' +
          '<bpmn:intermediateCatchEvent id="A" name="Antwort da"><bpmn:messageEventDefinition id="m" /></bpmn:intermediateCatchEvent>' +
          '<bpmn:intermediateCatchEvent id="B" name="14 Tage vorbei"><bpmn:timerEventDefinition id="t" /></bpmn:intermediateCatchEvent>' +
          end('E1', 'Beantwortet') + end('E2', 'Abgebrochen') + flows('S>G', 'G>A', 'G>B', 'A>E1', 'B>E2'),
      ),
    );
    expect(text).toContain('Schritt 1: Warten auf das erste von mehreren Ereignissen\nEs geht weiter, sobald das erste dieser Ereignisse eintritt.\nWenn zuerst eintritt: Antwort da');
    expect(text).toContain('Wenn zuerst eintritt: 14 Tage vorbei');
    expect(text).toContain('Wartet auf: Nachricht.');
    expect(text).toContain('Wartet auf: Frist.');
    expect(codes).not.toContain('unlabeled-exit');
    expect(codes).not.toContain('unsupported');
    expectValidDocument(html);
  });

  it('unterscheidet auslösende und wartende Zwischenereignisse', async () => {
    const { text } = await convert(
      model(start + '<bpmn:intermediateThrowEvent id="T" name="Melden"><bpmn:signalEventDefinition id="s" /></bpmn:intermediateThrowEvent>' + flows('S>T')),
    );
    expect(text).toContain('Schritt 1, Ereignis: Melden. Löst aus: Signal.');
  });

  it('verbindet Verbindungsereignisse über ihren Namen', async () => {
    const { text, codes, html } = await convert(
      model(
        start + task('A') +
          '<bpmn:intermediateThrowEvent id="L1" name="Weiter auf Seite 2"><bpmn:linkEventDefinition id="d1" name="Seite2" /></bpmn:intermediateThrowEvent>' +
          '<bpmn:intermediateCatchEvent id="L2" name="Von Seite 1"><bpmn:linkEventDefinition id="d2" name="Seite2" /></bpmn:intermediateCatchEvent>' +
          task('B') + end() + flows('S>A', 'A>L1', 'L2>B', 'B>E'),
      ),
    );
    expect(text).toContain('Schritt 1: A.\nSchritt 2, Ereignis: Weiter auf Seite 2.\nSchritt 3, Ereignis: Von Seite 1.\nSchritt 4: B.');
    expect(codes).toEqual([]);
    expectValidDocument(html);
  });

  it('meldet ein Verbindungsereignis ohne Gegenstück', async () => {
    const { codes, findings } = await convert(
      model(start + '<bpmn:intermediateThrowEvent id="L1" name="Ins Leere"><bpmn:linkEventDefinition id="d1" name="Nirgends" /></bpmn:intermediateThrowEvent>' + flows('S>L1')),
    );
    expect(codes).toContain('unsupported');
    expect(findings.map((finding) => finding.message).join(' ')).toContain('kein Gegenstück');
  });

  it('nennt die Kompensation an einer Aufgabe, ohne einen Abbruch zu behaupten', async () => {
    const { text } = await convert(
      model(start + task('A') + '<bpmn:boundaryEvent id="B" attachedToRef="A"><bpmn:compensateEventDefinition id="c" /></bpmn:boundaryEvent><bpmn:task id="K" name="Rückbuchen" isForCompensation="true" />' + flows('S>A')),
    );
    expect(text).toContain('Sonderfall Kompensation\nWird diese Aufgabe später rückgängig gemacht');
    expect(text).not.toContain('abgebrochen');
  });

  it.each([
    ['<bpmn:standardLoopCharacteristics />', 'wird wiederholt'],
    ['<bpmn:multiInstanceLoopCharacteristics isSequential="true" />', 'mehrfach nacheinander'],
    ['<bpmn:multiInstanceLoopCharacteristics />', 'mehrfach gleichzeitig'],
  ])('nennt Wiederholungen: %s', async (loop, expected) => {
    const { text } = await convert(model(start + `<bpmn:task id="A" name="A">${loop}</bpmn:task>` + flows('S>A')));
    expect(text).toContain(expected);
  });
});

describe('Beteiligte', () => {
  it('nimmt bei verschachtelten Lanes die innerste', async () => {
    const { text } = await convert(
      model(
        `<bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Verwaltung"><bpmn:flowNodeRef>A</bpmn:flowNodeRef>
          <bpmn:childLaneSet id="LS2"><bpmn:lane id="L2" name="Einkauf"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:childLaneSet></bpmn:lane></bpmn:laneSet>` +
          start + task('A') + flows('S>A'),
      ),
    );
    expect(text).toContain('Zuständig: Einkauf.');
  });

  const twoPools = (messages = '') => `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" name="Gesamtmodell" targetNamespace="urn:t">
    <bpmn:collaboration id="C">
      <bpmn:participant id="P1" name="Bauamt" processRef="Process_1" />
      <bpmn:participant id="P2" name="Kunde" processRef="Process_2" />
      <bpmn:participant id="P3" name="Bank" />
      ${messages}
    </bpmn:collaboration>
    <bpmn:process id="Process_1" name="Process_1">
      <bpmn:laneSet id="LS"><bpmn:lane id="L" name="Eingangsstelle"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
      <bpmn:task id="A" name="A" />
    </bpmn:process>
    <bpmn:process id="Process_2" name="Process_2"><bpmn:task id="B" name="B" /></bpmn:process>
  </bpmn:definitions>`;

  it('nennt den Pool statt eines technischen Prozessnamens', async () => {
    const { document, html } = await convert(twoPools());
    expect(document.title).toBe('Gesamtmodell');
    expect(html).toContain('<li>Bauamt, Eingangsstelle</li>');
    expect(html).toContain('<li>Kunde</li>');
    expect(html).not.toContain('Process_');
  });

  it('nennt externe Stellen und Nachrichten, die an keinem Schritt hängen', async () => {
    const { text } = await convert(twoPools('<bpmn:messageFlow id="M" name="Auskunft" sourceRef="P3" targetRef="P3" />'));
    expect(text).toContain('Bank, externe Stelle');
    expect(text).toContain('„Auskunft“ von Bank an Bank');
  });
});

describe('Anmerkungen und Daten', () => {
  it('ordnet Anmerkungen unabhängig von der Pfeilrichtung zu', async () => {
    for (const association of ['sourceRef="A" targetRef="N"', 'sourceRef="N" targetRef="A"']) {
      const { text } = await convert(
        model(
          start + task('A') + flows('S>A') +
            `<bpmn:textAnnotation id="N"><bpmn:text>Wichtig</bpmn:text></bpmn:textAnnotation><bpmn:association id="As" ${association} />`,
        ),
      );
      expect(text).toContain('Schritt 1: A. Hinweis: Wichtig');
    }
  });

  it('verliert auch lose Anmerkungen nicht', async () => {
    const { text } = await convert(
      model(start + task('A') + flows('S>A') + '<bpmn:textAnnotation id="N"><bpmn:text>Allgemein gültig</bpmn:text></bpmn:textAnnotation>'),
    );
    expect(text).toContain('Anmerkung: Allgemein gültig');
  });

  it('nennt gelesene und erzeugte Datenobjekte', async () => {
    const { text } = await convert(
      model(
        start +
          `<bpmn:dataObjectReference id="In" name="Formular" dataObjectRef="DI" /><bpmn:dataObject id="DI" />
           <bpmn:dataObjectReference id="Out" dataObjectRef="DO" /><bpmn:dataObject id="DO" name="Bescheid" />
           <bpmn:task id="A" name="A">
             <bpmn:dataInputAssociation id="i"><bpmn:sourceRef>In</bpmn:sourceRef></bpmn:dataInputAssociation>
             <bpmn:dataOutputAssociation id="o"><bpmn:targetRef>Out</bpmn:targetRef></bpmn:dataOutputAssociation>
           </bpmn:task>` +
          flows('S>A'),
      ),
    );
    expect(text).toContain('Benötigt: Formular.');
    expect(text).toContain('Erzeugt: Bescheid.');
  });
});

describe('Präparierte Modelle', () => {
  it('maskiert auch in den neuen Bausteinen alle Texte', async () => {
    const evil = '&lt;img src=x onerror=alert(1)&gt;';
    const { html } = await convert(
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
