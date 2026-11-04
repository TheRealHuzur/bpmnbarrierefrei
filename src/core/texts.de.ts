import type { StepKind } from './analyze.ts';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Alle sichtbaren Texte. Weitere Sprachen brauchen nur eine weitere Datei dieser Form. */
export const de = {
  lang: 'de',
  documentTitle: (name: string) => `${name}: Prozessbeschreibung`,
  untitled: 'Prozessmodell ohne Namen',

  headings: {
    overview: 'Überblick',
    roles: 'Beteiligte',
    messages: 'Nachrichten zwischen Beteiligten',
    flow: 'Ablauf',
    flowNamed: (name: string) => `Ablauf: ${name}`,
  },

  kinds: {
    start: 'Start',
    end: 'Ende',
    task: 'Aufgabe',
    subprocess: 'Teilprozess',
    event: 'Ereignis',
    decision: 'Entscheidung',
    split: 'Gleichzeitig',
    join: 'Warten',
    'join-split': 'Warten und gleichzeitig',
    merge: 'Zusammenführung',
    branch: 'Verzweigung',
    other: 'Element',
  } satisfies Record<StepKind, string>,

  labels: {
    unnamed: 'ohne Namen im Modell',
    defaultExit: 'Sonst',
    unlabeledExit: 'Ohne Beschriftung',
    split: (count: number) => `${count} Wege laufen gleichzeitig`,
    join: 'Warten auf alle gleichzeitigen Wege',
    joinSplit: (count: number) => `Warten auf alle Wege, dann laufen ${count} Wege gleichzeitig`,
  },

  eventKinds: {
    'bpmn:TimerEventDefinition': 'Frist',
    'bpmn:MessageEventDefinition': 'Nachricht',
    'bpmn:ErrorEventDefinition': 'Fehler',
    'bpmn:EscalationEventDefinition': 'Eskalation',
    'bpmn:SignalEventDefinition': 'Signal',
    'bpmn:ConditionalEventDefinition': 'Bedingung',
    'bpmn:CompensateEventDefinition': 'Kompensation',
    'bpmn:CancelEventDefinition': 'Abbruch',
    'bpmn:TerminateEventDefinition': 'Sofortiges Ende',
    'bpmn:LinkEventDefinition': 'Verbindung',
  } as Record<string, string | undefined>,
  genericEventKind: 'Ereignis',

  steps: {
    heading: (number: number, kind: string, label: string) => `Schritt ${number}, ${kind}: ${label}`,
    headingGenerated: (number: number, label: string) => `Schritt ${number}: ${label}`,
    ref: (number: number, label: string) => `Schritt ${number}: ${label}`,
    role: (role: string) => `Zuständig: ${role}`,
    note: (text: string) => `Hinweis: ${text}`,
    eventKind: (kind: string) => `Art des Ereignisses: ${kind}`,
    produces: (names: string) => `Erzeugt: ${names}`,
    needs: (names: string) => `Benötigt: ${names}`,
    sends: (message: string) => (message ? `Sendet „${message}“ an ` : 'Sendet eine Nachricht an '),
    receives: (message: string) => (message ? `Empfängt „${message}“ von ` : 'Empfängt eine Nachricht von '),
    externalParty: 'eine externe Stelle',
    alsoFrom: 'Auch erreichbar von: ',
    from: 'Erreichbar von: ',
    noWayIn: 'Zu diesem Schritt führt im Modell kein Weg vom Start aus.',
    waitFor: 'Weiter erst, wenn diese Schritte abgeschlossen sind: ',
    next: 'Weiter mit ',
    exitTo: (label: string) => `${label}: weiter mit `,
    parallelExits: 'Diese Wege laufen gleichzeitig:',
    conditionalExits: 'Je nach Bedingung geht es so weiter:',
    branchExits: 'Mögliche Wege:',
    pathEnds: 'Dieser Weg endet hier.',
    processEnds: 'Der gesamte Prozess endet hier sofort.',
    deadEnd: 'Danach ist im Modell kein weiterer Schritt vorgesehen.',
    boundary: (kind: string, name: string) => (name ? `${kind} „${name}“: ` : `${kind}: `),
    interrupting: 'Die Aufgabe wird abgebrochen, weiter mit ',
    nonInterrupting: 'Die Aufgabe läuft weiter, zusätzlich weiter mit ',
    interruptingNoExit: 'Die Aufgabe wird abgebrochen, danach ist kein weiterer Schritt vorgesehen.',
    nonInterruptingNoExit: 'Die Aufgabe läuft weiter.',
    subprocessContent: (count: number) =>
      `Dieser Teilprozess enthält ${plural(count, 'weiteres Element', 'weitere Elemente')}, die in diesem Dokument noch nicht beschrieben sind.`,
    callActivity: (called: string) =>
      called
        ? `Dieser Schritt ruft den Prozess „${called}“ auf. Dessen Inhalt ist nicht Teil dieses Dokuments.`
        : 'Dieser Schritt ruft einen anderen Prozess auf. Dessen Inhalt ist nicht Teil dieses Dokuments.',
  },

  formB: {
    mainPath: 'Hauptweg',
    mainPathNamed: (name: string) => `Hauptweg: ${name}`,
    mainPathIntro: 'Das sind die wichtigsten Schritte ohne Sonderfälle. Alle Einzelheiten stehen im Ablauf.',
    readingHelp:
      'So lesen Sie das Dokument: Der Hauptweg gibt einen schnellen Überblick. Im Ablauf ist jede Entscheidung eine Überschrift, und jeder ihrer Fälle ist eine Überschrift eine Ebene tiefer. Die Schritte haben durchgehende Nummern. Links gibt es nur dort, wo der Ablauf an eine andere Stelle springt. Nach einem Sprung führt die Zurück-Funktion des Browsers wieder an die vorige Stelle.',
    back: 'Zurück zu ',
    backAfterStep: 'Danach zurück zu ',
    caseLabeled: (label: string) => `Falls ${label}`,
    wayLabeled: (label: string) => `Weg: ${label}`,
    way: (number: number) => `Weg ${number}`,
    unlabeledCase: 'Fall ohne Beschriftung',
    noOwnStep: 'In diesem Fall gibt es keinen eigenen Schritt.',
    branchIntro: 'Mehrere dieser Wege können zutreffen.',
    continuesHere: 'Es geht direkt hier weiter.',
    parallelIntro: 'Diese Wege laufen gleichzeitig.',
    afterParallel: (number: number) => `Schritt ${number}: Warten, bis alle gleichzeitigen Wege fertig sind`,
    mainParallel: (labels: string[]) => `Gleichzeitig: ${labels.join(' und ')}`,
    sideCase: (kind: string, name: string) => (name ? `Sonderfall ${kind}: ${name}` : `Sonderfall ${kind}`),
    interrupting: 'Die Aufgabe wird dabei abgebrochen.',
    nonInterrupting: 'Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:',
    nonInterruptingNoExit: 'Die Aufgabe läuft weiter.',
    later: (number: number) => `Weiter ab Schritt ${number}`,
    comesFrom: 'Hierher führen: ',
    unreachable: 'Schritte ohne Weg vom Start',
    sections: {
      together: 'Danach gemeinsam weiter',
      regular: 'Regulär geht es so weiter',
      'other-start': 'Weiterer Start',
    },
  },

  overview: {
    single: (steps: number, tasks: number, decisions: number) =>
      `Dieser Prozess hat ${plural(steps, 'Schritt', 'Schritte')}, davon ${plural(tasks, 'Aufgabe', 'Aufgaben')} und ${plural(decisions, 'Entscheidung', 'Entscheidungen')}.`,
    multiple: (processes: number, steps: number, tasks: number, decisions: number) =>
      `Dieses Dokument beschreibt ${processes} Prozesse mit zusammen ${plural(steps, 'Schritt', 'Schritten')}, davon ${plural(tasks, 'Aufgabe', 'Aufgaben')} und ${plural(decisions, 'Entscheidung', 'Entscheidungen')}.`,
    outcomes: 'Mögliche Ergebnisse: ',
    noOutcomes: 'Das Modell nennt kein ausdrückliches Ende.',
    readingHelp:
      'So lesen Sie das Dokument: Jeder Schritt ist eine Überschrift der Ebene 3. Steht bei einem Schritt nichts anderes, geht es mit dem nächsten Schritt weiter. Nach einem Sprung führt die Zurück-Funktion des Browsers wieder an die vorige Stelle.',
    roleSteps: (role: string) => `${role}: `,
    roleNoSteps: (role: string) => `${role}: keine Aufgaben in diesem Modell`,
    roleExternal: (role: string) => `${role}: externe Stelle, im Modell ohne eigene Schritte`,
    messageBetween: (message: string, from: string, to: string) =>
      message ? `„${message}“ von ${from} an ${to}` : `Nachricht von ${from} an ${to}`,
    generalNote: (text: string) => `Anmerkung: ${text}`,
  },

  errors: {
    notBpmn: 'Die Datei ist kein lesbares BPMN-2.0-Modell. Bitte prüfen Sie, ob sie als BPMN 2.0 XML exportiert wurde.',
    noProcess: 'Das Modell enthält keinen Prozess mit Elementen.',
    tooLarge: 'Das Modell ist zu groß für die Umwandlung.',
  },

  findings: {
    parserWarning: (message: string) => `Hinweis beim Einlesen: ${message}`,
    brokenFlow: (id: string) => `Der Sequenzfluss ${id} führt von oder zu einem Element, das hier nicht vorhanden ist. Er fehlt im Dokument.`,
    missingName: (type: string, id: string) => `Ein Element vom Typ ${type} (${id}) hat keinen Namen.`,
    unlabeledExit: (id: string, label: string) => `Ein Ausgang (${id}) von „${label}“ hat keine lesbare Beschriftung.`,
    noStart: (name: string) => `Der Prozess ${name ? `„${name}“ ` : ''}hat kein Startereignis.`,
    unreachable: (label: string) => `„${label}“ ist vom Start aus nicht erreichbar.`,
    deadEnd: (label: string) => `Nach „${label}“ geht es nicht weiter, obwohl dort kein Endereignis steht.`,
    implicitSplit: (label: string) => `„${label}“ hat mehrere Ausgänge ohne Gateway. Das liest sich missverständlicher als ein Gateway.`,
    unsupportedGateway: (label: string, type: string) => `„${label}“ (${type}) wird nur allgemein als Verzweigung beschrieben.`,
    unsupportedSubprocess: (label: string) => `Der Inhalt von „${label}“ wird noch nicht im Dokument beschrieben.`,
    unsupportedLink: (label: string) => `Das Verbindungsereignis „${label}“ wird noch nicht mit seinem Gegenstück verknüpft.`,
    unsupportedGroup: (id: string) => `Die Gruppe ${id} ist nur optisch und erscheint nicht im Dokument.`,
  },
};
