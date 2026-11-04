# BPMN barrierefrei

Macht aus BPMN-2.0-Modellen Dokumente, die Menschen mit Sehbehinderung gut nutzen können: mit Screenreader, Vergrößerung oder hohem Kontrast. Das Dokument führt chronologisch durch den ganzen Prozess, nennt Wechsel zwischen Beteiligten, stellt Zweige unter ihre Entscheidung und nutzt Links nur für echte Sprünge.

Stand: Der Kern läuft über die Kommandozeile. Geplant ist ein Web-Frontend, das auf dem eigenen Server läuft und Modelle nur im Browser verarbeitet, es folgt in Phase 3.

## Benutzung

Voraussetzung ist Node.js ab Version 24.

```bash
npm install
```

```bash
npm run convert -- modell.bpmn -o dokument.html
```

Der Prüfbericht zeigt, wo das Modell für Lesende Lücken hat, etwa fehlende Namen.

Unter Windows geht es auch ohne Kommandozeile: Eine BPMN-Datei auf `bpmn-testen.cmd` ziehen. Das Dokument entsteht neben dem Modell und öffnet sich im Browser.

Zum Ausprobieren gibt es eine [Testanleitung](docs/test/TESTANLEITUNG.md) mit Beispielmodellen und Verständnisfragen.

## Entwicklung

```bash
npm test
```

```bash
npm run typecheck
```

## Aufbau

- `src/core`: Umwandlung ohne Abhängigkeit vom Browser oder von Node.js.
- `src/cli`: Kommandozeile.
- `test`: Tests. Die erzeugten Beispieldokumente unter `docs` sind zugleich die erwartete Ausgabe.

## Weiterlesen

- [Konzept und Plan](docs/KONZEPT.md)
- [Beispieldokument Bauantrag](docs/test/bauantrag.html) aus dem [Modell](docs/test/bauantrag.bpmn)
- [Beispieldokument Urlaubsantrag](docs/beispiel/urlaubsantrag.html) aus dem [Modell](docs/beispiel/urlaubsantrag.bpmn)
