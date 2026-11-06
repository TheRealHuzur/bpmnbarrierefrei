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
    'event-branch': 'Warten auf Ereignis',
    other: 'Element',
  } satisfies Record<StepKind, string>,

  /** Verständliche Namen für den Prüfbericht. */
  elementType(type: string): string {
    if (/Task$/.test(type)) return 'Eine Aufgabe';
    const names: Record<string, string> = {
      'bpmn:StartEvent': 'Ein Startereignis',
      'bpmn:EndEvent': 'Ein Endereignis',
      'bpmn:IntermediateCatchEvent': 'Ein Zwischenereignis',
      'bpmn:IntermediateThrowEvent': 'Ein Zwischenereignis',
      'bpmn:BoundaryEvent': 'Ein Grenzereignis',
      'bpmn:ExclusiveGateway': 'Eine Entscheidung',
      'bpmn:InclusiveGateway': 'Eine Verzweigung',
      'bpmn:ComplexGateway': 'Eine Verzweigung',
      'bpmn:SubProcess': 'Ein Teilprozess',
      'bpmn:Transaction': 'Ein Teilprozess',
      'bpmn:AdHocSubProcess': 'Ein Teilprozess',
      'bpmn:CallActivity': 'Ein Prozessaufruf',
    };
    return names[type] ?? 'Ein Element';
  },

  labels: {
    unnamed: 'ohne Namen im Modell',
    defaultExit: 'Sonst',
    unlabeledExit: 'Ohne Beschriftung',
    split: (count: number) => `${count} Wege laufen gleichzeitig`,
    join: 'Warten, bis alle gleichzeitigen Wege fertig sind',
    inclusiveJoin: 'Warten, bis alle begonnenen Wege fertig sind',
    joinSplit: (count: number) => `Warten auf alle Wege, dann laufen ${count} Wege gleichzeitig`,
    eventBranch: 'Warten auf das erste von mehreren Ereignissen',
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
    trigger: (kind: string) => `Auslöser: ${kind}`,
    waitsFor: (kind: string) => `Wartet auf: ${kind}`,
    triggers: (kind: string) => `Löst aus: ${kind}`,
    writes: (names: string) => `Schreibt in: ${names}`,
    reads: (names: string) => `Liest aus: ${names}`,
    loopStandard: 'Dieser Schritt wird wiederholt, solange es nötig ist.',
    loopSequential: 'Dieser Schritt wird mehrfach nacheinander ausgeführt.',
    loopParallel: 'Dieser Schritt wird mehrfach gleichzeitig ausgeführt.',
    eventSubprocess: 'Dieser Teilprozess läuft nicht im normalen Ablauf. Er beginnt, sobald sein Startereignis eintritt.',
    compensation: 'Dieser Schritt läuft nicht im normalen Ablauf. Er macht eine erledigte Aufgabe rückgängig.',
    adHoc: 'Die Schritte dieses Teilprozesses haben keine feste Reihenfolge.',
    produces: (names: string) => `Erzeugt: ${names}`,
    needs: (names: string) => `Benötigt: ${names}`,
    sends: (message: string) => (message ? `Sendet „${message}“ an ` : 'Sendet eine Nachricht an '),
    receives: (message: string) => (message ? `Empfängt „${message}“ von ` : 'Empfängt eine Nachricht von '),
    externalParty: 'eine externe Stelle',
    noWayIn: 'Zu diesem Schritt führt im Modell kein Weg vom Start aus.',
    waitFor: 'Weiter erst, wenn diese Schritte abgeschlossen sind: ',
    waitForInclusive: 'Weiter erst, wenn von diesen Schritten alle begonnenen abgeschlossen sind: ',
    next: 'Weiter mit ',
    conditionalExits: 'Je nach Bedingung geht es so weiter:',
    pathEnds: 'Dieser Weg endet hier.',
    processEnds: 'Der gesamte Prozess endet hier sofort.',
    deadEnd: 'Danach ist im Modell kein weiterer Schritt vorgesehen.',
    callInternal: (called: string) => `Dieser Schritt ruft den Prozess „${called}“ auf. Dieser steht ebenfalls in diesem Dokument.`,
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
    caseOf: (title: string, number: number) => `${title}, zu Schritt ${number}`,
    wayLabeled: (label: string) => `Weg: ${label}`,
    way: (number: number) => `Weg ${number}`,
    unlabeledCase: 'Fall ohne Beschriftung',
    noOwnStepTo: 'In diesem Fall gibt es keinen eigenen Schritt. Weiter mit ',
    firstEvent: (label: string) => `Wenn zuerst eintritt: ${label}`,
    branchIntro: 'Mehrere dieser Wege können zutreffen.',
    eventBranchIntro: 'Es geht weiter, sobald das erste dieser Ereignisse eintritt.',
    subprocessDone: (name: string) => `Damit ist der Teilprozess „${name}“ abgeschlossen.`,
    compensationHint: 'Wird diese Aufgabe später rückgängig gemacht, gilt der passende Schritt unter „Sonderabläufe“.',
    continuesHere: 'Es geht direkt hier weiter.',
    parallelIntro: 'Diese Wege laufen gleichzeitig.',
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
      special: 'Sonderabläufe',
    },
  },

  overview: {
    summary: (steps: number, tasks: number, subprocesses: number, decisions: number) =>
      `Dieser Prozess hat ${plural(steps, 'Schritt', 'Schritte')}, davon ${plural(tasks, 'Aufgabe', 'Aufgaben')}${subprocesses ? `, ${plural(subprocesses, 'Teilprozess', 'Teilprozesse')}` : ''} und ${plural(decisions, 'Entscheidung', 'Entscheidungen')}.`,
    outcomes: 'Mögliche Ergebnisse: ',
    noOutcomes: 'Das Modell benennt keine Ergebnisse.',
    readingHelp: (showPools: boolean) =>
      `So lesen Sie das Dokument: Der Ablauf führt in zeitlicher Reihenfolge durch den Prozess, die Schritte sind durchgehend nummeriert. Bei einer Entscheidung steht jeder Fall in einer eigenen Zeile, darunter folgen seine Schritte.${showPools ? ' Wechsel zwischen den beteiligten Organisationen stehen ebenfalls in einer eigenen Zeile.' : ''} Wer zuständig ist, steht beim Schritt, sobald es wechselt. Links gibt es nur dort, wo der Ablauf an eine andere Stelle springt. Nach einem Sprung führt die Zurück-Funktion wieder an die vorige Stelle.`,
    rolesOf: (pool: string) => `Alle gehören zu: ${pool}.`,
    roleExternal: (role: string) => `${role}, externe Stelle`,
    messageBetween: (message: string, from: string, to: string) =>
      message ? `„${message}“ von ${from} an ${to}` : `Nachricht von ${from} an ${to}`,
    generalNote: (text: string) => `Anmerkung: ${text}`,
  },

  docx: {
    language: 'de-DE',
    description: 'Barrierefreie Prozessbeschreibung, erzeugt aus einem BPMN-Modell',
    creator: 'BPMN barrierefrei',
  },

  errors: {
    notBpmn: 'Die Datei ist kein lesbares BPMN-2.0-Modell. Bitte prüfen Sie, ob sie als BPMN 2.0 XML exportiert wurde.',
    noProcess: 'Das Modell enthält keinen Prozess mit Elementen.',
    tooLarge: 'Das Modell ist zu groß für die Umwandlung.',
  },

  findings: {
    parserWarning: (message: string) => `Hinweis beim Einlesen: ${message}`,
    brokenFlow: (id: string) => `Eine Verbindung (ID ${id}) führt von oder zu einem Element, das hier nicht vorhanden ist. Sie fehlt im Dokument.`,
    missingName: (type: string, id: string) => `${type} (ID ${id}) hat keinen Namen. Lesende erfahren so nicht, worum es dort geht.`,
    unlabeledExit: (id: string, source: string) => `Ein Ausgang (ID ${id}) von ${source} hat keine lesbare Beschriftung. Lesende erfahren so nicht, wann dieser Weg gilt.`,
    duplicateEnd: (name: string) => `Mehrere Enden heißen „${name}“. Lesende erkennen so nicht, welches Ergebnis gemeint ist.`,
    noStart: (name: string) => `Der Prozess ${name ? `„${name}“ ` : ''}hat kein Startereignis. Der Ablauf beginnt deshalb beim ersten Schritt ohne Vorgänger.`,
    unreachable: (label: string) => `Zu „${label}“ führt vom Start aus kein Weg. Der Schritt steht am Ende des Ablaufs.`,
    deadEnd: (label: string) => `Nach „${label}“ geht es nicht weiter, obwohl dort kein Endereignis steht.`,
    implicitSplit: (label: string) => `„${label}“ hat mehrere Ausgänge ohne Gateway. Ein Gateway macht deutlicher, ob die Wege gleichzeitig oder wahlweise gelten.`,
    unsupportedGateway: (label: string) => `Die Regel von „${label}“ wird nur allgemein als Verzweigung beschrieben.`,
    externalCall: (label: string) => `„${label}“ ruft einen Prozess auf, der nicht in dieser Datei steht. Sein Inhalt fehlt deshalb im Dokument.`,
    unlinkedEvent: (label: string) => `Zum Verbindungsereignis „${label}“ gibt es kein Gegenstück mit demselben Namen. Der Weg ist dort unterbrochen.`,
    unsupportedGroup: (id: string) => `Die Gruppe (ID ${id}) ist nur optisch und erscheint nicht im Dokument.`,
    unconnectedPool: (name: string) =>
      `Keine Nachricht verbindet ${name} mit dem Rest des Modells. Die zeitliche Reihenfolge ist dort nicht festgelegt.`,
  },
};
