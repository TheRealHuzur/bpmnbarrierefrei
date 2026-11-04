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
    ref: (number: number, label: string) => `Schritt ${number}: ${label}`,
    short: (number: number) => `Schritt ${number}`,
    role: (role: string) => `Zuständig: ${role}`,
    note: (text: string) => `Hinweis: ${text}`,
    eventKind: (kind: string) => `Art des Ereignisses: ${kind}`,
    produces: (names: string) => `Erzeugt: ${names}`,
    needs: (names: string) => `Benötigt: ${names}`,
    sends: (message: string) => (message ? `Sendet „${message}“ an ` : 'Sendet eine Nachricht an '),
    receives: (message: string) => (message ? `Empfängt „${message}“ von ` : 'Empfängt eine Nachricht von '),
    externalParty: 'eine externe Stelle',
    noWayIn: 'Zu diesem Schritt führt im Modell kein Weg vom Start aus.',
    waitFor: 'Weiter erst, wenn diese Schritte abgeschlossen sind: ',
    next: 'Weiter mit ',
    conditionalExits: 'Je nach Bedingung geht es so weiter:',
    pathEnds: 'Dieser Weg endet hier.',
    processEnds: 'Der gesamte Prozess endet hier sofort.',
    deadEnd: 'Danach ist im Modell kein weiterer Schritt vorgesehen.',
    subprocessContent: (count: number) =>
      `Dieser Teilprozess enthält ${plural(count, 'weiteres Element', 'weitere Elemente')}, die in diesem Dokument noch nicht beschrieben sind.`,
    callActivity: (called: string) =>
      called
        ? `Dieser Schritt ruft den Prozess „${called}“ auf. Dessen Inhalt ist nicht Teil dieses Dokuments.`
        : 'Dieser Schritt ruft einen anderen Prozess auf. Dessen Inhalt ist nicht Teil dieses Dokuments.',
  },

  flow: {
    beginAt: (pool: string) => `Beginn bei ${pool}`,
    changeTo: (pool: string) => `Wechsel zu ${pool}`,
    unconnected: (pool: string) => `Weiterer Teil: ${pool}`,
    unconnectedNote: 'Das Modell verbindet diesen Teil nicht mit dem vorigen. Die zeitliche Reihenfolge ist deshalb nicht festgelegt.',
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
    sideCase: (kind: string, name: string) => (name ? `Sonderfall ${kind}: ${name}` : `Sonderfall ${kind}`),
    interrupting: 'Die Aufgabe wird dabei abgebrochen.',
    nonInterrupting: 'Die Aufgabe läuft weiter, zusätzlich passiert Folgendes:',
    nonInterruptingNoExit: 'Die Aufgabe läuft weiter.',
    later: (target: string) => `Weiter ab ${target}`,
    comesFrom: 'Hierher führen: ',
    unreachable: 'Schritte ohne Weg vom Start',
    sections: {
      together: 'Danach gemeinsam weiter',
      regular: 'Regulär geht es so weiter',
      'other-start': 'Weiterer Start',
    },
  },

  overview: {
    summary: (steps: number, tasks: number, decisions: number) =>
      `Dieser Prozess hat ${plural(steps, 'Schritt', 'Schritte')}, davon ${plural(tasks, 'Aufgabe', 'Aufgaben')} und ${plural(decisions, 'Entscheidung', 'Entscheidungen')}.`,
    outcomes: 'Mögliche Ergebnisse: ',
    noOutcomes: 'Das Modell nennt kein ausdrückliches Ende.',
    readingHelp:
      'So lesen Sie das Dokument: Der Ablauf führt in zeitlicher Reihenfolge durch den Prozess, die Schritte sind durchgehend nummeriert. Wechsel zwischen den Beteiligten und Entscheidungen sind Überschriften, die Fälle einer Entscheidung sind Überschriften eine Ebene tiefer. Links gibt es nur dort, wo der Ablauf an eine andere Stelle springt. Nach einem Sprung führt die Zurück-Funktion des Browsers wieder an die vorige Stelle.',
    roleExternal: (role: string) => `${role}, externe Stelle`,
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
    unconnectedPool: (name: string) =>
      `Keine Nachricht verbindet ${name} mit dem Rest des Modells. Die zeitliche Reihenfolge ist dort nicht festgelegt.`,
  },
};
