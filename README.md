# BPMN barrierefrei

Macht aus BPMN-2.0-Modellen Dokumente, die Menschen mit Sehbehinderung gut nutzen können: mit Screenreader, Vergrößerung oder hohem Kontrast. Das Dokument führt chronologisch durch den ganzen Prozess, nennt Wechsel zwischen Beteiligten, stellt Zweige unter ihre Entscheidung und nutzt Links nur für echte Sprünge.

**Testversion:** <https://therealhuzur.github.io/bpmnbarrierefrei/>

Die Umwandlung läuft vollständig im Browser, das Modell wird nicht hochgeladen. Das Ergebnis gibt es als HTML-Datei und als Word-Dokument, dazu einen Prüfbericht zu Lücken im Modell.

## Benutzung ohne Web-Frontend

Voraussetzung ist Node.js ab Version 24.

```bash
npm install
```

```bash
npm run convert -- modell.bpmn -o dokument.html
```

Endet die Ausgabe auf `.docx`, entsteht ein Word-Dokument.

Unter Windows geht es auch ohne Kommandozeile: Eine BPMN-Datei auf `bpmn-testen.cmd` ziehen. Das Dokument entsteht neben dem Modell und öffnet sich im Browser.

## Entwicklung

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run typecheck
```

Die Browsertests nutzen lokal den installierten Microsoft Edge.

## Aufbau

- `src/core`: Umwandlung ohne Abhängigkeit vom Browser oder von Node.js.
- `src/web`: Web-Frontend.
- `src/cli`: Kommandozeile.
- `test`: Unit-Tests. Die erzeugten Beispieldokumente unter `docs` sind zugleich die erwartete Ausgabe.
- `e2e`: Browsertests für Bedienung, Barrierefreiheit und Datenschutz.
- `deploy`, `Dockerfile`: Auslieferung auf einem eigenen Server.

## Weiterlesen

- [Konzept und Plan](docs/KONZEPT.md)
- [Betrieb, GitHub Pages und Docker](docs/BETRIEB.md)
- [Testanleitung](docs/test/TESTANLEITUNG.md) und [Leitfaden für den Test mit Betroffenen](docs/test/TEST-MIT-BETROFFENEN.md)
- [Beispieldokument Bauantrag](docs/test/bauantrag.html) aus dem [Modell](docs/test/bauantrag.bpmn)
- [Beispieldokument Urlaubsantrag](docs/beispiel/urlaubsantrag.html) aus dem [Modell](docs/beispiel/urlaubsantrag.bpmn)
