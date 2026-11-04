import { describe, expect, it } from 'vitest';
import { convert, flows, model } from './helpers.ts';

const task = (id: string, name = id) => `<bpmn:task id="${id}" name="${name}" />`;
const start = '<bpmn:startEvent id="S" name="Start" />';
const end = (id = 'E', name = 'Fertig') => `<bpmn:endEvent id="${id}" name="${name}" />`;

describe('Reihenfolge', () => {
  it('hält Zweige zusammen und stellt die gemeinsame Fortsetzung dahinter', async () => {
    const { headings } = await convert(
      model(
        start +
          '<bpmn:exclusiveGateway id="G" name="Passt das?" />' +
          task('A') + task('A2') + task('B') +
          '<bpmn:exclusiveGateway id="M" />' +
          task('Z') + end() +
          '<bpmn:sequenceFlow id="ja" name="Ja" sourceRef="G" targetRef="A" />' +
          '<bpmn:sequenceFlow id="nein" name="Nein" sourceRef="G" targetRef="B" />' +
          flows('S>G', 'A>A2', 'A2>M', 'B>M', 'M>Z', 'Z>E'),
      ),
    );
    expect(headings.map((heading) => heading.split(': ')[1])).toEqual(['Start', 'Passt das?', 'A', 'A2', 'B', 'Z', 'Fertig']);
  });

  it('ordnet Zweige nach der Position im Diagramm statt nach der Dateireihenfolge', async () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
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
    </bpmn:definitions>`;
    const { headings } = await convert(xml);
    expect(headings[2]).toContain('Oben');
    expect(headings[3]).toContain('Unten');
  });

  it('stellt mehrere Starts in Modellreihenfolge an den Anfang', async () => {
    const { headings, stepText } = await convert(
      model('<bpmn:startEvent id="S1" name="Erster" /><bpmn:startEvent id="S2" name="Zweiter" />' + task('A') + end() + flows('S1>A', 'S2>A', 'A>E')),
    );
    expect(headings[0]).toContain('Erster');
    expect(headings[1]).toContain('Zweiter');
    expect(stepText(1)).toContain('Weiter mit Schritt 3');
  });

  it('kommt ohne Rekursionsproblem durch eine sehr lange Kette', async () => {
    const count = 4900;
    const tasks = Array.from({ length: count }, (_, index) => task(`T${index}`)).join('');
    const edges = Array.from({ length: count - 1 }, (_, index) => `T${index}>T${index + 1}`);
    const { headings } = await convert(model(start + tasks + flows('S>T0', ...edges)));
    expect(headings).toHaveLength(count + 1);
  });
});

describe('Weiter-Angaben', () => {
  it('nennt den direkten Nachfolger nicht, wohl aber einen Sprung', async () => {
    const { stepText } = await convert(
      model(start + task('A') + task('B') + end() + flows('S>A', 'A>B', 'B>E')),
    );
    expect(stepText(2)).toBe('');
  });

  it('behauptet bei einem toten Ende nicht, es gehe weiter', async () => {
    const { stepText, codes } = await convert(model(start + task('A') + task('B') + flows('S>A', 'S>B')));
    expect(stepText(2)).toContain('kein weiterer Schritt');
    expect(codes).toContain('dead-end');
  });

  it('verliert keinen Weg, wenn eine Aufgabe mehrere Ausgänge ohne Gateway hat', async () => {
    const { stepText, codes } = await convert(
      model(start + task('A') + task('B') + task('C') + end() + flows('S>A', 'A>B', 'A>C', 'B>E', 'C>E')),
    );
    expect(stepText(2)).toContain('gleichzeitig');
    expect(stepText(2)).toContain('Schritt 3: B');
    expect(stepText(2)).toContain('Schritt 4: C');
    expect(codes).toContain('implicit-split');
  });

  it('beschreibt Ausgänge mit Bedingung als bedingt statt als gleichzeitig', async () => {
    const { stepText } = await convert(
      model(
        start + task('A') + task('B') + task('C') +
          '<bpmn:sequenceFlow id="s" sourceRef="S" targetRef="A" />' +
          '<bpmn:sequenceFlow id="x" name="Eilig" sourceRef="A" targetRef="B"><bpmn:conditionExpression>eilig</bpmn:conditionExpression></bpmn:sequenceFlow>' +
          '<bpmn:sequenceFlow id="y" sourceRef="A" targetRef="C"><bpmn:conditionExpression>normal</bpmn:conditionExpression></bpmn:sequenceFlow>',
      ),
    );
    expect(stepText(2)).toContain('Je nach Bedingung');
    expect(stepText(2)).toContain('Eilig: weiter mit Schritt');
    expect(stepText(2)).toContain('normal: weiter mit Schritt');
  });
});

describe('Entscheidungen', () => {
  const decision = (flowsXml: string, attrs = 'id="G" name="Frage?"') =>
    model(start + `<bpmn:exclusiveGateway ${attrs} />` + task('A') + task('B') + flows('S>G') + flowsXml);

  it('setzt den Standardweg ans Ende und nennt ihn „Sonst“', async () => {
    const { stepText, codes } = await convert(
      decision(
        '<bpmn:sequenceFlow id="d" sourceRef="G" targetRef="B" /><bpmn:sequenceFlow id="j" name="Ja" sourceRef="G" targetRef="A" />',
        'id="G" name="Frage?" default="d"',
      ),
    );
    expect(stepText(2)).toBe('Ja: weiter mit Schritt 3: A | Sonst: weiter mit Schritt 4: B');
    expect(codes).not.toContain('unlabeled-exit');
  });

  it('meldet unbeschriftete Ausgänge und unbenannte Entscheidungen', async () => {
    const { stepText, codes, findings } = await convert(
      decision('<bpmn:sequenceFlow id="j" sourceRef="G" targetRef="A" /><bpmn:sequenceFlow id="n" sourceRef="G" targetRef="B" />', 'id="G"'),
    );
    expect(stepText(2)).toContain('Ohne Beschriftung');
    expect(codes.filter((code) => code === 'unlabeled-exit')).toHaveLength(2);
    expect(findings.some((finding) => finding.code === 'missing-name' && finding.elementId === 'G')).toBe(true);
  });

  it('nutzt eine Bedingung als Text, meldet die fehlende Beschriftung aber', async () => {
    const { stepText, codes } = await convert(
      decision(
        '<bpmn:sequenceFlow id="j" sourceRef="G" targetRef="A"><bpmn:conditionExpression>Betrag über 100</bpmn:conditionExpression></bpmn:sequenceFlow>' +
          '<bpmn:sequenceFlow id="n" name="Nein" sourceRef="G" targetRef="B" />',
      ),
    );
    expect(stepText(2)).toContain('Betrag über 100: weiter mit');
    expect(codes).toContain('unlabeled-exit');
  });

  it('setzt nach einer Frage im Linktext keinen zusätzlichen Punkt', async () => {
    const { stepText } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="G" name="Frage?" />' + task('A') + end() +
          '<bpmn:sequenceFlow id="a" sourceRef="S" targetRef="G" />' +
          '<bpmn:sequenceFlow id="b" name="Ja" sourceRef="G" targetRef="A" />' +
          '<bpmn:sequenceFlow id="c" name="Nein" sourceRef="G" targetRef="E" />' +
          '<bpmn:sequenceFlow id="d" sourceRef="A" targetRef="G" />',
      ),
    );
    expect(stepText(3)).toBe('Weiter mit Schritt 2: Frage?');
  });
});

describe('Gateways, die entfallen oder bleiben', () => {
  it('überspringt unbenannte Zusammenführungen', async () => {
    const { headings } = await convert(
      model(start + '<bpmn:exclusiveGateway id="M" />' + task('A') + end() + flows('S>M', 'M>A', 'A>E')),
    );
    expect(headings).toHaveLength(3);
  });

  it('behält benannte Zusammenführungen, damit kein Name verloren geht', async () => {
    const { headings } = await convert(
      model(start + '<bpmn:exclusiveGateway id="M" name="Prüfung beendet" />' + task('A') + end() + flows('S>M', 'M>A', 'A>E')),
    );
    expect(headings[1]).toBe('Schritt 2, Zusammenführung: Prüfung beendet');
  });

  it('hängt nicht bei einem Kreis aus lauter Zusammenführungen', async () => {
    const { headings } = await convert(
      model(
        start + '<bpmn:exclusiveGateway id="M1" /><bpmn:exclusiveGateway id="M2" />' + flows('S>M1', 'M1>M2', 'M2>M1'),
      ),
    );
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it('nennt bei der parallelen Zusammenführung alle Wege, auf die gewartet wird', async () => {
    const { stepText, headings } = await convert(
      model(
        start + '<bpmn:parallelGateway id="PS" />' + task('A') + task('B') + '<bpmn:parallelGateway id="PJ" />' + end() +
          flows('S>PS', 'PS>A', 'PS>B', 'A>PJ', 'B>PJ', 'PJ>E'),
      ),
    );
    expect(headings[1]).toBe('Schritt 2: 2 Wege laufen gleichzeitig');
    expect(headings[4]).toBe('Schritt 5: Warten auf alle gleichzeitigen Wege');
    expect(stepText(5)).toBe('Weiter erst, wenn diese Schritte abgeschlossen sind: Schritt 3: A, Schritt 4: B.');
  });
});

describe('Nichts geht verloren', () => {
  it('führt nicht erreichbare Elemente am Ende auf und meldet sie', async () => {
    const { headings, stepText, codes } = await convert(
      model(start + task('A') + task('Insel') + end() + flows('S>A', 'A>E')),
    );
    expect(headings[3]).toContain('Insel');
    expect(stepText(4)).toContain('kein Weg vom Start');
    expect(codes).toContain('unreachable');
  });

  it('führt auch einen abgetrennten Kreis auf', async () => {
    const { headings, codes } = await convert(
      model(start + task('A') + task('K1') + task('K2') + flows('S>A', 'K1>K2', 'K2>K1')),
    );
    expect(headings).toHaveLength(4);
    expect(codes.filter((code) => code === 'unreachable')).toHaveLength(2);
  });

  it('kommt ohne Startereignis zurecht und meldet es', async () => {
    const { headings, codes } = await convert(model(task('A') + task('B') + flows('A>B')));
    expect(headings[0]).toContain('A');
    expect(codes).toContain('no-start');
    expect(codes).not.toContain('unreachable');
  });

  it('meldet Sequenzflüsse ins Leere', async () => {
    const { codes, headings } = await convert(model(start + task('A') + flows('S>A', 'A>Gibtsnicht')));
    expect(headings).toHaveLength(2);
    expect(codes).toContain('broken-flow');
  });

  it('meldet noch nicht unterstützte Elemente, statt sie zu übergehen', async () => {
    const { codes, stepText } = await convert(
      model(
        start + '<bpmn:subProcess id="SP" name="Teil"><bpmn:task id="Innen" name="Innen" /></bpmn:subProcess>' +
          '<bpmn:inclusiveGateway id="I" name="Welche?" />' + task('A') + task('B') +
          flows('S>SP', 'SP>I', 'I>A', 'I>B'),
      ),
    );
    expect(codes.filter((code) => code === 'unsupported')).toHaveLength(2);
    expect(stepText(2)).toContain('1 weiteres Element');
  });
});

describe('Grenzereignisse', () => {
  const withBoundary = (attrs: string) =>
    model(
      start + task('A') + task('Nach') + end() +
        `<bpmn:boundaryEvent id="B" name="Zu spät" attachedToRef="A" ${attrs}><bpmn:timerEventDefinition id="TD" /></bpmn:boundaryEvent>` +
        flows('S>A', 'A>E', 'B>Nach'),
    );

  it('beschreibt unterbrechende Ereignisse als Abbruch', async () => {
    const { stepText } = await convert(withBoundary(''));
    expect(stepText(2)).toContain('Frist „Zu spät“: Die Aufgabe wird abgebrochen, weiter mit Schritt');
  });

  it('beschreibt nicht unterbrechende Ereignisse als zusätzlichen Weg', async () => {
    const { stepText } = await convert(withBoundary('cancelActivity="false"'));
    expect(stepText(2)).toContain('Die Aufgabe läuft weiter, zusätzlich weiter mit Schritt');
  });
});

describe('Rollen und Pools', () => {
  it('nimmt bei verschachtelten Lanes die innerste', async () => {
    const { stepText } = await convert(
      model(
        `<bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Verwaltung"><bpmn:flowNodeRef>A</bpmn:flowNodeRef>
          <bpmn:childLaneSet id="LS2"><bpmn:lane id="L2" name="Einkauf"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:childLaneSet></bpmn:lane></bpmn:laneSet>` +
          start + task('A') + flows('S>A'),
      ),
    );
    expect(stepText(2)).toContain('Zuständig: Einkauf.');
  });

  it('beschreibt mehrere Pools mit durchgehender Nummerierung und Links dazwischen', async () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" name="Gesamtmodell" targetNamespace="urn:t">
      <bpmn:collaboration id="C">
        <bpmn:participant id="P1" name="Kunde" processRef="Pr1" />
        <bpmn:participant id="P2" name="Amt" processRef="Pr2" />
        <bpmn:participant id="P3" name="Bank" />
        <bpmn:messageFlow id="M1" name="Antrag" sourceRef="T1" targetRef="T2" />
        <bpmn:messageFlow id="M2" name="Auskunft" sourceRef="P3" targetRef="P2" />
        <bpmn:messageFlow id="M3" name="Gruß" sourceRef="P3" targetRef="P1" />
      </bpmn:collaboration>
      <bpmn:process id="Pr1"><bpmn:startEvent id="S1" name="Los" /><bpmn:task id="T1" name="Senden" />
        <bpmn:sequenceFlow id="a" sourceRef="S1" targetRef="T1" /></bpmn:process>
      <bpmn:process id="Pr2"><bpmn:startEvent id="S2" name="Eingang" /><bpmn:task id="T2" name="Bearbeiten" />
        <bpmn:sequenceFlow id="b" sourceRef="S2" targetRef="T2" /></bpmn:process>
    </bpmn:definitions>`;
    const { document, stepText, html } = await convert(xml);
    expect(document.title).toBe('Gesamtmodell');
    expect(document.sections.map((section) => section.heading)).toEqual(['Ablauf: Kunde', 'Ablauf: Amt']);
    expect(document.sections[1]!.steps[0]!.number).toBe(3);
    expect(stepText(2)).toContain('Zuständig: Kunde.');
    expect(stepText(2)).toContain('Sendet „Antrag“ an Schritt 4: Bearbeiten.');
    expect(stepText(4)).toContain('Empfängt „Antrag“ von Schritt 2: Senden.');
    expect(html).toContain('Bank: externe Stelle');
    expect(html).toContain('„Auskunft“ von Bank an Amt');
  });
});

describe('Namen bei mehreren Pools', () => {
  const twoPools = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
    <bpmn:collaboration id="C">
      <bpmn:participant id="P1" name="Bauamt" processRef="Process_1" />
      <bpmn:participant id="P2" name="Kunde" processRef="Process_2" />
    </bpmn:collaboration>
    <bpmn:process id="Process_1" name="Process_1">
      <bpmn:laneSet id="LS"><bpmn:lane id="L" name="Eingangsstelle"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
      <bpmn:task id="A" name="A" />
    </bpmn:process>
    <bpmn:process id="Process_2" name="Process_2"><bpmn:task id="B" name="B" /></bpmn:process>
  </bpmn:definitions>`;

  it('nennt den Pool statt eines technischen Prozessnamens', async () => {
    const { document, html } = await convert(twoPools);
    expect(document.sections.map((section) => section.heading)).toEqual(['Ablauf: Bauamt', 'Ablauf: Kunde']);
    expect(html).toContain('Bauamt, Eingangsstelle: ');
    expect(html).toContain('<li>Kunde: ');
    expect(html).not.toContain('Process_');
  });
});

describe('Anmerkungen und Daten', () => {
  it('ordnet Anmerkungen unabhängig von der Pfeilrichtung zu', async () => {
    for (const association of ['sourceRef="A" targetRef="N"', 'sourceRef="N" targetRef="A"']) {
      const { stepText } = await convert(
        model(
          start + task('A') + flows('S>A') +
            `<bpmn:textAnnotation id="N"><bpmn:text>Wichtig</bpmn:text></bpmn:textAnnotation><bpmn:association id="As" ${association} />`,
        ),
      );
      expect(stepText(2)).toContain('Hinweis: Wichtig');
    }
  });

  it('verliert auch lose Anmerkungen nicht', async () => {
    const { html } = await convert(
      model(start + task('A') + flows('S>A') + '<bpmn:textAnnotation id="N"><bpmn:text>Allgemein gültig</bpmn:text></bpmn:textAnnotation>'),
    );
    expect(html).toContain('Anmerkung: Allgemein gültig');
  });

  it('nennt gelesene und erzeugte Datenobjekte', async () => {
    const { stepText } = await convert(
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
    expect(stepText(2)).toContain('Benötigt: Formular.');
    expect(stepText(2)).toContain('Erzeugt: Bescheid.');
  });
});
