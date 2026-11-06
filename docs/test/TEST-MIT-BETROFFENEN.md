# Leitfaden: Test mit Betroffenen

Dieser Test ist der eigentliche Abnahmetest. Er zeigt, ob man einen Prozess mit dem Dokument wirklich versteht und ob die Seite selbst bedienbar ist. Automatische Prüfungen können das nicht beantworten.

## Vorbereitung

- **Wen:** Ein bis zwei blinde Menschen, die täglich mit Screenreader arbeiten, und ein bis zwei Menschen, die mit Vergrößerung oder hohem Kontrast arbeiten. Mögliche Ansprechpartner sind der Deutsche Blinden- und Sehbehindertenverband und seine Landesvereine sowie die Schwerbehindertenvertretung im eigenen Umfeld.
- **Womit:** Immer mit den eigenen Hilfsmitteln und Einstellungen der Person, am eigenen Rechner. Das Sprechtempo der Screenreader ist oft sehr hoch, das ist in Ordnung.
- **Dauer:** Etwa 30 Minuten je Person, gern per Telefon oder Videokonferenz mit geteiltem Ton.
- **Material:** Die [Testversion](https://therealhuzur.github.io/bpmnbarrierefrei/) und die Datei [bauantrag.bpmn](bauantrag.bpmn), die Sie der Person vorab schicken. Das Beispiel ist erfunden, es werden also keine echten Daten gebraucht.
- **Aufwandsentschädigung:** Sollte angeboten werden, denn Testen ist Arbeit.

## Ablauf

Sagen Sie zu Beginn: Getestet wird das Werkzeug, nicht die Person. Jede Schwierigkeit ist ein Fehler des Werkzeugs. Bitten Sie darum, laut mitzudenken. Helfen Sie möglichst nicht, notieren Sie stattdessen, wo es hakt.

### Teil 1: Die Seite bedienen (10 Minuten)

1. Öffnen Sie die Seite. Was ist das hier, und was kann man damit tun?
2. Wandeln Sie die Datei „bauantrag.bpmn“ um.
3. Wo steht jetzt das Ergebnis? Ist etwas zu beanstanden?
4. Laden Sie das Dokument herunter und öffnen Sie es.

**Beobachten:** Wird die Umwandlung bemerkt? Landet der Fokus sinnvoll? Sind Prüfbericht und Vorschau auffindbar?

### Teil 2: Den Prozess verstehen (15 Minuten)

Mit dem Dokument, in dem Format, das die Person bevorzugt, und bevorzugt in eigenen Worten beantworten:

1. Wer ist an diesem Prozess beteiligt?
2. Erzählen Sie den Prozess in drei Sätzen.
3. Wer prüft, ob die Unterlagen vollständig sind?
4. Was passiert, wenn Unterlagen fehlen?
5. Was passiert, wenn 14 Tage lang keine Antwort kommt?
6. Welche Prüfungen laufen gleichzeitig, und wann geht es danach weiter?
7. Wer zeichnet den Bescheid, und ändert sich das bei einer Ablehnung?
8. Wie erfährt die antragstellende Person vom Ergebnis?

Die Lösungen stehen in der [Testanleitung](TESTANLEITUNG.md).

**Beobachten:** Wie wird navigiert, über Absätze, Pfeiltasten oder die Suche? Wo muss zurückgesprungen werden? Welche Frage dauert am längsten?

### Teil 3: Nachgespräch (5 Minuten)

1. Was war am hilfreichsten, was hat am meisten gestört?
2. Welche Formulierungen waren unklar, welche Ansagen überflüssig?
3. Unter „Ablauf“ gibt es bewusst keine Überschriften, damit keine Ebenen angesagt werden. Fehlen Ihnen dort Sprungmöglichkeiten, oder ist es so angenehmer?
4. Sollten Wechsel der Zuständigkeit innerhalb einer Organisation stärker hervorgehoben werden?
5. Welches Format würden Sie im Alltag nutzen: Web, HTML-Datei oder Word?
6. Würden Sie sich so durch einen echten Prozess Ihrer Arbeit lesen wollen?

## Auswertung

| Frage | Bestanden, wenn |
| --- | --- |
| Verständnis | Mindestens sechs von acht Fragen sind ohne Hilfe richtig beantwortet |
| Überblick | Die Person kann den Prozess in eigenen Worten grob wiedergeben |
| Bedienung | Teil 1 gelingt ohne Hilfe |
| Hindernisse | Keine Stelle, an der die Person stecken bleibt |

Tragen Sie die Befunde nach Häufigkeit und Schwere geordnet zusammen. Was bei mehreren Personen auftritt, wird zuerst behoben. Danach folgt die Version 1.0.
