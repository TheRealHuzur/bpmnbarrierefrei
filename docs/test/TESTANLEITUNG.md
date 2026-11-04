# Testanleitung

Dieser Test zeigt, ob man einen Prozess allein mit dem erzeugten Dokument versteht, welche der beiden Fassungen besser funktioniert und ob eigene Modelle durchlaufen. Alles läuft auf deinem Rechner, es wird nichts hochgeladen. Das Web-Frontend gibt es noch nicht, es folgt in Phase 3.

## Die zwei Fassungen

| | Fassung A | Fassung B |
| --- | --- | --- |
| Aufbau | Je Pool eine flache Liste, jeder Schritt ist eine Überschrift | Ein Ablauf in zeitlicher Reihenfolge über alle Beteiligten, Zweige stehen unter ihrer Entscheidung |
| Links im Bauantrag | 36 | 1 |
| Überschriften | Jeder Schritt | Wechsel zwischen Beteiligten, Entscheidungen und ihre Fälle |
| Zuständigkeit | Bei jedem Schritt | Beim Wechsel und nach Überschriften |
| Dokument | [bauantrag.html](bauantrag.html) | [bauantrag-fassung-b.html](bauantrag-fassung-b.html) |

Das Beispiel [urlaubsantrag-fassung-b.html](urlaubsantrag-fassung-b.html) zeigt Fassung B an einem kürzeren Prozess.

**Am aussagekräftigsten ist ein Vergleich durch jemanden, der täglich mit Screenreader oder Vergrößerung arbeitet.** Test 1 reicht dafür, 20 Minuten mit beiden Fassungen genügen.

## Test 1: Einen Prozess verstehen

Öffne eine der beiden Fassungen mit Doppelklick im Browser. Schau dabei möglichst nicht in die Lösungen und nimm das übliche Hilfsmittel, also Screenreader oder Vergrößerung.

Versuche, diese Fragen nur mit dem Dokument zu beantworten. Danach mit der anderen Fassung vergleichen: Was ging leichter, was schwerer?

1. Wer prüft, ob die Unterlagen vollständig sind?
2. Was passiert, wenn Unterlagen fehlen?
3. Was passiert, wenn 14 Tage lang keine Antwort kommt?
4. Welche Prüfungen laufen gleichzeitig, und wann geht es danach weiter?
5. Wer zeichnet den Bescheid? Ändert sich das, wenn der Antrag abgelehnt wird?
6. Welche Stelle außerhalb des Bauamts ist beteiligt, und wofür?
7. Wie erfährt die antragstellende Person vom Ergebnis?

Das Modell ist ein erfundenes Beispiel, seine Quelle ist [bauantrag.bpmn](bauantrag.bpmn).

<details>
<summary>Lösungen</summary>

1. Die Eingangsstelle.
2. Sie werden nachgefordert, danach werden die Unterlagen erneut geprüft.
3. Die Nachforderung läuft weiter, zusätzlich wird eine Erinnerung gesendet. Dieser Nebenweg endet danach.
4. Bauordnungsrecht und Brandschutz. Weiter geht es erst, wenn beide fertig sind.
5. Die Amtsleitung. Genehmigung und Ablehnung führen beide dorthin, es ändert sich also nichts.
6. Die Feuerwehr. Sie liefert die Stellungnahme zum Brandschutz.
7. Die Eingangsstelle versendet den Bescheid, die antragstellende Person erhält ihn.

</details>

## Test 2: Mit dem Screenreader

NVDA gibt es kostenlos unter [nvaccess.org](https://www.nvaccess.org/). Diese Tasten gelten im Lesemodus:

| Taste | Wirkung |
| --- | --- |
| `H` | Nächste Überschrift |
| `3` | Fassung A: nächster Schritt. Fassung B: nächste Entscheidung oder nächster Wechsel |
| `4` | Fassung B: nächster Fall einer Entscheidung |
| `I` | Fassung B: nächster Schritt in einer Liste |
| `K` | Nächster Link |
| `NVDA` + `F7` | Liste aller Überschriften und Links |
| `Eingabe` | Link folgen |
| `Alt` + `Pfeil links` | Zurück zur vorigen Stelle |

Prüfe dabei:

- Bekommt man schnell eine Vorstellung vom ganzen Prozess?
- Findet man sich bei Entscheidungen zurecht: Welcher Fall läuft gerade, wo geht es danach weiter?
- Sind Wechsel und Schnittstellen zwischen den Beteiligten klar?
- Findet man nach einem Sprung zurück?
- Stören oder helfen die Ansagen zu Listen, Links und „Zuständig“?
- Spricht der Screenreader Schrittnummern und Namen richtig aus?

## Test 3: Mit Vergrößerung und hohem Kontrast

- **Zoom:** Im Browser mit `Strg` + `Plus` auf 400 % gehen. Der Text soll umbrechen, ohne dass man seitlich scrollen muss.
- **Bildschirmlupe:** Mit `Windows` + `Plus` starten und einem Link folgen. Das Ziel ist umrandet. Findest du es im Ausschnitt wieder?
- **Kontrast:** Unter Einstellungen, Barrierefreiheit, Kontrastdesigns ein Design wählen. Bleibt alles lesbar, auch die Links?
- **Dunkelmodus:** Windows auf dunkel stellen und das Dokument neu laden.

## Test 4: Eigene Modelle

Das ist der wichtigste Test, denn bisher lief das Programm nur mit nachgestellten Exporten.

1. Exportiere ein Modell als BPMN 2.0 XML, am besten je eines aus bpmnDESK, Picture und Adonis.
2. Ziehe die Datei im Explorer auf `bpmn-testen.cmd` im Projektordner `C:\dev\bpmnbarrierefrei`.
3. Fassung B öffnet sich im Browser, das schwarze Fenster zeigt den Prüfbericht.

Neben dem Modell entstehen zwei HTML-Dateien: `modell.html` (Fassung A) und `modell-fassung-b.html`. Vorhandene Dateien gleichen Namens werden überschrieben.

Prüfe dabei:

- Läuft die Datei durch, oder kommt eine Fehlermeldung?
- Fehlt etwas, das im Diagramm steht?
- Passt die Reihenfolge der Schritte zu deiner Vorstellung vom Prozess?
- Sind die Meldungen im Prüfbericht zutreffend?

## Test 5: Der Prüfbericht

Ziehe [mit-absichtlichen-fehlern.bpmn](mit-absichtlichen-fehlern.bpmn) auf `bpmn-testen.cmd`. Das Modell enthält bewusst Fehler, das Fenster soll 11 Befunde zeigen:

- Elemente ohne Namen und Entscheidungen mit unbeschrifteten Ausgängen.
- Eine Aufgabe ohne Fortsetzung und eine ohne jede Verbindung.
- Einen Teilprozess und ein inklusives Gateway, die noch nicht vollständig beschrieben werden.

Danach kannst du das erzeugte Dokument ansehen: Keines der Elemente darf fehlen. Der Lauf erzeugt beide Fassungen neben dem Modell, Fassung A überschreibt [mit-absichtlichen-fehlern.html](mit-absichtlichen-fehlern.html) mit identischem Inhalt.

## Was noch nicht geht

- Der Inhalt von Teilprozessen und aufgerufenen Prozessen fehlt im Dokument, der Prüfbericht meldet das.
- Inklusive und ereignisbasierte Gateways werden nur allgemein beschrieben.
- Verbindungsereignisse (Link) werden noch nicht mit ihrem Gegenstück verknüpft.
- Der Prüfbericht nennt technische Typen wie `bpmn:StartEvent` und steht nur im Fenster, nicht im Dokument.
- Die zeitliche Reihenfolge in Fassung B ergibt sich aus Sequenz- und Nachrichtenflüssen. Pools ohne Nachrichtenfluss zu einzelnen Schritten lassen sich nicht einordnen, das Dokument sagt das dann ausdrücklich. Laufen Wege gleichzeitig, muss eine Reihenfolge gewählt werden, auch wenn sie im Modell nicht festgelegt ist.
- Nach einer Entscheidung läuft der Zweig mit den meisten Schritten ohne Einrückung weiter. Das muss nicht der fachliche Normalfall sein.
- Unsauber modellierte Prozesse lassen sich nicht immer verschachteln, dort bleiben in Fassung B einzelne Sprünge.
- Es gibt noch kein DOCX und kein PDF.

## Rückmeldung

Für mich sind diese Punkte am wichtigsten, Stichworte reichen:

1. Welche Fassung war leichter, und warum?
2. Welche Fragen aus Test 1 waren schwer oder nicht lösbar?
3. Was hat beim Hören oder Vergrößern gestört?
4. Welche Formulierungen klingen falsch?
5. Welche eigenen Modelle liefen, welche nicht? Bei Fehlern hilft die Meldung aus dem Fenster und, falls möglich, die Datei.
