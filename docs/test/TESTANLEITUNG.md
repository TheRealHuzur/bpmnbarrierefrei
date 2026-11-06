# Testanleitung

Dieser Test zeigt, ob man einen Prozess allein mit dem erzeugten Dokument versteht und ob eigene Modelle durchlaufen. Die Testversion läuft unter <https://therealhuzur.github.io/bpmnbarrierefrei/>. Die Umwandlung passiert im Browser, es wird nichts hochgeladen.

**Am aussagekräftigsten ist Test 1 mit jemandem, der täglich mit Screenreader oder Vergrößerung arbeitet.** Dafür gibt es einen eigenen [Leitfaden](TEST-MIT-BETROFFENEN.md).

## Test 1: Einen Prozess verstehen

Öffne die Testversion und wähle die Datei [bauantrag.bpmn](bauantrag.bpmn) aus. Schau dabei möglichst nicht in die Lösungen und nimm das übliche Hilfsmittel, also Screenreader oder Vergrößerung.

Versuche, diese Fragen nur mit dem Dokument zu beantworten:

1. Wer prüft, ob die Unterlagen vollständig sind?
2. Was passiert, wenn Unterlagen fehlen?
3. Was passiert, wenn 14 Tage lang keine Antwort kommt?
4. Welche Prüfungen laufen gleichzeitig, und wann geht es danach weiter?
5. Wer zeichnet den Bescheid? Ändert sich das, wenn der Antrag abgelehnt wird?
6. Welche Stelle außerhalb des Bauamts ist beteiligt, und wofür?
7. Wie erfährt die antragstellende Person vom Ergebnis?

Das Modell ist ein erfundenes Beispiel. Das fertige Dokument liegt auch als [bauantrag.html](bauantrag.html) bereit. Einen kürzeren Prozess zeigt [urlaubsantrag.html](../beispiel/urlaubsantrag.html).

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
| `H` | Nächste Überschrift, also Überblick, Beteiligte oder Ablauf |
| `P` oder `Pfeil runter` | Nächster Schritt |
| `K` | Nächster Link |
| `NVDA` + `F7` | Liste aller Überschriften und Links |
| `Eingabe` | Link folgen |
| `Alt` + `Pfeil links` | Zurück zur vorigen Stelle |

Prüfe dabei:

- Bekommt man schnell eine Vorstellung vom ganzen Prozess?
- Findet man sich bei Entscheidungen zurecht: Welcher Fall läuft gerade, wo geht es danach weiter?
- Sind Wechsel und Schnittstellen zwischen den Beteiligten klar?
- Findet man nach einem Sprung zurück?
- Stören oder helfen die Ansagen zu Links und „Zuständig“?
- Unter „Ablauf“ gibt es bewusst keine Überschriften. Findet man trotzdem schnell genug von Schritt zu Schritt und zur nächsten Entscheidung?
- Spricht der Screenreader Schrittnummern und Namen richtig aus?

## Test 3: Mit Vergrößerung und hohem Kontrast

- **Zoom:** Im Browser mit `Strg` + `Plus` auf 400 % gehen. Der Text soll umbrechen, ohne dass man seitlich scrollen muss.
- **Bildschirmlupe:** Mit `Windows` + `Plus` starten und einem Link folgen. Das Ziel ist umrandet. Findest du es im Ausschnitt wieder?
- **Kontrast:** Unter Einstellungen, Barrierefreiheit, Kontrastdesigns ein Design wählen. Bleibt alles lesbar, auch die Links?
- **Dunkelmodus:** Windows auf dunkel stellen und das Dokument neu laden.

## Test 4: Eigene Modelle

Das ist der wichtigste Test, denn jedes Werkzeug exportiert etwas anders.

1. Exportiere ein Modell als BPMN 2.0 XML, am besten je eines aus bpmnDESK, Picture und Adonis, auch ein komplexeres.
2. Wähle die Datei in der Testversion aus. Das Ergebnis erscheint darunter, mit Prüfbericht, Vorschau und Links zum Herunterladen.

Die Datei wird dabei nicht hochgeladen, die Umwandlung läuft nur in deinem Browser. Wer es ganz lokal möchte, zieht die Datei auf `bpmn-testen.cmd` im Projektordner.

Prüfe dabei:

- Läuft die Datei durch, oder kommt eine Fehlermeldung?
- Fehlt etwas, das im Diagramm steht?
- Passt die Reihenfolge der Schritte zu deiner Vorstellung vom Prozess?
- Sind die Meldungen im Prüfbericht zutreffend?

## Test 5: Der Prüfbericht

Wähle [mit-absichtlichen-fehlern.bpmn](mit-absichtlichen-fehlern.bpmn) aus. Das Modell enthält bewusst Fehler, der Prüfbericht soll 6 Warnungen und 4 Hinweise nennen:

- Elemente ohne Namen und Entscheidungen mit unbeschrifteten Ausgängen.
- Aufgaben ohne Fortsetzung und eine ohne jede Verbindung.

Im Dokument darf keines der Elemente fehlen, auch nicht der Inhalt des Teilprozesses.

## Test 6: Das Word-Dokument

Lade das Dokument als Word-Datei herunter und öffne es. Prüfe die Überschriften bis zum Ablauf im Navigationsbereich oder mit dem Screenreader und folge dem Link „Schritt 3“. Dieser Test wurde bisher nur automatisch am Aufbau der Datei gemacht, nicht in Word mit Screenreader.

## Was noch nicht geht

- Der Inhalt aufgerufener Prozesse fehlt im Dokument, wenn sie nicht in derselben Datei stehen. Der Prüfbericht meldet das.
- Bei komplexen Gateways ist die Regel im Modell nicht lesbar, sie werden nur allgemein beschrieben. Auch das meldet der Prüfbericht.
- Herstellerfelder, etwa die Arbeitshilfen aus ProzessPilot, erscheinen nicht im Dokument, weil nur der BPMN-Standard ausgewertet wird.
- Ein PDF gibt es nur über „Als PDF speichern“ aus Browser oder Word. Ob es dabei barrierefrei bleibt, ist nicht geprüft.
- Die zeitliche Reihenfolge ergibt sich aus Sequenz- und Nachrichtenflüssen. Pools ohne Nachrichtenfluss zu einzelnen Schritten lassen sich nicht einordnen, das Dokument sagt das dann ausdrücklich. Laufen Wege gleichzeitig, müssen sie im Text trotzdem nacheinander stehen.
- Nach einer Entscheidung läuft der Zweig mit den meisten Schritten ohne Einrückung weiter. Das muss nicht der fachliche Normalfall sein.
- Unsauber modellierte Prozesse lassen sich nicht immer verschachteln, dort bleiben einzelne Sprünge.

## Rückmeldung

Für mich sind diese Punkte am wichtigsten, Stichworte reichen:

1. Welche Fragen aus Test 1 waren schwer oder nicht lösbar?
2. Was hat beim Hören oder Vergrößern gestört?
3. Welche Formulierungen klingen falsch?
4. Welche eigenen Modelle liefen, welche nicht? Bei Fehlern hilft die angezeigte Meldung und, falls möglich, die Datei.
