# BPMN barrierefrei

Macht aus BPMN-2.0-Modellen Dokumente, die Menschen mit Sehbehinderung gut nutzen können: mit Screenreader, Vergrößerung oder hohem Kontrast. Geplant ist ein Web-Frontend, das auf dem eigenen Server läuft und Modelle nur im Browser verarbeitet.

Stand: Der Kern läuft über die Kommandozeile, das Web-Frontend folgt in Phase 3.

## Benutzung

Voraussetzung ist Node.js ab Version 24.

```bash
npm install
```

```bash
npm run convert -- modell.bpmn -o dokument.html --fassung b
```

Es gibt zwei Dokumentformen im Vergleich: Fassung `a` ist je Pool eine flache Schrittliste. Fassung `b` führt chronologisch durch den ganzen Prozess, nennt Wechsel zwischen Beteiligten, stellt Zweige unter ihre Entscheidung und nutzt Links nur für echte Sprünge. Ohne Angabe gilt `a`.

Der Prüfbericht zeigt, wo das Modell für Lesende Lücken hat, etwa fehlende Namen.

Unter Windows geht es auch ohne Kommandozeile: Eine BPMN-Datei auf `bpmn-testen.cmd` ziehen. Beide Fassungen entstehen neben dem Modell, Fassung B öffnet sich im Browser.

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
- `test`: Tests, die erwartete Ausgabe des Beispielmodells liegt in `test/snapshots`.

## Weiterlesen

- [Konzept und Plan](docs/KONZEPT.md)
- [Hörprobe](docs/beispiel/urlaubsantrag.html) aus dem [Beispielmodell](docs/beispiel/urlaubsantrag.bpmn)
- [Aktuelle Ausgabe für dieses Modell](test/snapshots/urlaubsantrag.html)
