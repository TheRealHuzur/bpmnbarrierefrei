# Konzept und Plan: BPMN barrierefrei

Stand: 4. November 2026. Status: Phasen 1 bis 4 umgesetzt, Testversion auf GitHub Pages. Offen sind der eigene Server und der Test mit Betroffenen.

## Ziel

Aus einem BPMN-2.0-Modell entsteht ein Dokument, das Menschen mit Sehbehinderung gut nutzen können: blinde Menschen mit dem Screenreader, andere mit Vergrößerung oder hohem Kontrast. Die Anwendung läuft als Web-Frontend und lässt sich auf dem eigenen Server betreiben, damit der Betrieb DSGVO-konform gestaltet werden kann.

## Rahmenbedingungen

- **Wer nutzt es?** Menschen mit Sehbehinderung. Sie selbst oder ihre Kolleginnen und Kollegen laden die Modelle hoch. Das Frontend muss also für beide Gruppen barrierefrei sein.
- **Woher kommen die Modelle?** Aus beliebigen Werkzeugen, die BPMN 2.0 exportieren, unter anderem bpmnDESK, Picture und Adonis. Grundlage ist allein der Standard, Sonderwege einzelner Werkzeuge dürfen nicht nötig sein.
- **Wo läuft es?** Auf dem eigenen Webserver mit Docker, neben der DESK-Suite.

## Die Lösung in Kürze

Die Umwandlung läuft vollständig im Browser. Der eigene Server liefert nur statische Dateien aus, das Modell verlässt den Rechner der Nutzenden nicht. Das ist technisch die einfachste und datenschutzrechtlich die stärkste Variante.

Das Ergebnis ist ein Dokument, das chronologisch durch den ganzen Prozess führt. Der Text entsteht regelbasiert und ohne KI, damit gleiche Modelle immer gleiche Dokumente ergeben und nichts dazuerfunden wird.

## Kernentscheidungen

| Frage | Empfehlung | Begründung |
| --- | --- | --- |
| Wo wird umgewandelt? | Im Browser, ohne Backend | Keine Modelle auf dem Server, kaum Angriffsfläche, einfacher Betrieb |
| Hauptformat | Einzelne HTML-Datei ohne JavaScript | Screenreader unterstützen Überschriften, Listen und Links dort am besten; offline nutzbar |
| Zweites Format | DOCX mit echten Formatvorlagen | Im Arbeitsalltag verbreitet und gut bearbeitbar |
| PDF | Vorerst über „Als PDF speichern“ aus Browser oder Word | Getaggtes PDF direkt im Browser zu erzeugen ist aufwendig; siehe Ausbaustufen |
| Textquelle | Regeln und Vorlagen, keine KI | Reproduzierbar, prüfbar, keine Datenweitergabe, keine erfundenen Inhalte |
| BPMN-Parser | `bpmn-moddle` (MIT) | Etablierter Parser aus dem bpmn.io-Umfeld, im Spike erfolgreich getestet |
| DOCX-Erzeugung | `docx` (MIT) | Läuft im Browser und in Node |
| Frontend | Vite und TypeScript ohne UI-Framework | Eine schlanke Seite braucht kein Framework; weniger Abhängigkeiten |
| Tests | Vitest, Playwright, axe-core, manuell mit NVDA | Automatik findet nur einen Teil der Barrieren; siehe Qualitätssicherung |

`bpmn-js` wird für den Text nicht gebraucht. Es hat eine eigene Lizenz, die nach meinem Kenntnisstand das sichtbare bpmn.io-Logo verlangt. Das wäre vor einem Einsatz als optionale Vorschau für sehende Autorinnen und Autoren zu prüfen.

## Architektur

Ein einziges npm-Paket mit drei klar getrennten Teilen:

- `src/core`: reine Logik ohne Abhängigkeit vom Browser. Läuft dadurch auch in Tests und in der Kommandozeile.
- `src/web`: die Oberfläche.
- `src/cli`: Kommandozeile für Tests und Stapelverarbeitung.

Der Weg durch `src/core` hat vier Stufen:

1. **Einlesen:** BPMN-XML wird mit `bpmn-moddle` geparst.
2. **Analysieren:** Aus dem Modell entstehen Graph, Rollen und Prüfbefunde.
3. **Linearisieren:** Der Graph wird zu einem formatunabhängigen Dokumentmodell mit nummerierten Schritten.
4. **Ausgeben:** Eigene Renderer erzeugen daraus HTML und DOCX.

Das formatunabhängige Dokumentmodell ist die wichtigste Nahtstelle. Es sorgt dafür, dass alle Formate denselben Inhalt haben, und macht spätere Formate wie PDF oder Klartext billig.

## Das Dokument

Der Kern des Problems: BPMN ist ein Graph, den Sehende mit einem Blick überfliegen. Ein Screenreader liest nacheinander. Das Dokument muss deshalb Orientierung und Sprungziele ersetzen, was das Auge sonst leistet.

### Aufbau

1. **Überblick:** Zahl der Schritte, mögliche Ergebnisse, kurze Lesehilfe.
2. **Beteiligte:** Nur die Namen aus Pools und Lanes, dazu externe Stellen. Was sie tun, steht im Ablauf.
3. **Ablauf:** Ein einziger Abschnitt, der chronologisch durch den ganzen Prozess führt.

### Beispiel

Auszug aus dem Bauantrag:

> **Wechsel zu Bauamt**
>
> **Schritt 2, Start: Bauantrag eingegangen.** Empfängt „Bauantrag“ von Antragstellende Person.
>
> **Schritt 3: Unterlagen auf Vollständigkeit prüfen.** Zuständig: Eingangsstelle.
>
> **Schritt 11, Entscheidung: Genehmigungsfähig?**
>
> **Falls Ja**
>
> **Schritt 12: Genehmigung erstellen.**
>
> **Falls Nein**
>
> **Schritt 13: Ablehnung mit Begründung erstellen.**
>
> **Danach gemeinsam weiter**

Das vollständige Dokument liegt unter [test/bauantrag.html](test/bauantrag.html), ein kürzeres Beispiel unter [beispiel/urlaubsantrag.html](beispiel/urlaubsantrag.html).

### Wie die Form entstand

Der erste eigene Test einer flachen Schrittliste zeigte: Die Umwandlung funktioniert, aber der Prozess wird schwer zu verfolgen, sobald er komplexer ist, und NVDA kündigt jeden Sprung innerhalb der Seite an. Das Bauantrag-Dokument hatte 36 Links bei 20 Schritten.

Der zweite Test zeigte: Zweige unter ihrer Entscheidung sind deutlich angenehmer, aber Abschnitte je Pool geben keinen Überblick über den Prozess. Man muss chronologisch durch den Prozess gehen können und dabei Wechsel, Schnittstellen und Zuständigkeiten mitbekommen. Auch ein gesonderter Hauptweg entfiel deshalb, und die flache Liste wurde entfernt.

Der dritte Test zeigte: Aufgaben bei den Beteiligten verwirren nur, und eine Listennummerierung neben „Schritt 5“ wirkt uneinheitlich und liest sich schlecht vor. Beteiligte sind seither nur Namen, jeder Arbeitsschritt heißt ausgeschrieben „Schritt N“, und Listen entfallen im Ablauf.

Alle Tests stammen von einem sehenden Nutzer. Das endgültige Urteil steht noch aus, siehe Phase 0 und 6. Das formatunabhängige Dokumentmodell lässt bei Bedarf schnelle Änderungen zu.

### Regeln für den Ablauf

- **Ausgeschriebene Schritte statt Listen:** Jeder Arbeitsschritt beginnt mit „Schritt N“ und ist ein eigener Absatz. Listen erscheinen im Ablauf nur, wenn eine Beschreibung im Modell selbst eine Liste enthält. Start und Ende tragen keine Nummer, weil sie keine Arbeitsschritte sind. Ein Start, den eine Nachricht aus einem anderen Pool auslöst, zählt dagegen als Schritt, denn dort geschieht eine Übergabe.
- **Chronologisch über alle Pools:** Nachrichtenflüsse legen fest, was zeitlich zuerst kommt. Wer eine Nachricht empfängt, steht hinter dem, der sie sendet.
- **Schnittstellen als Überschriften:** „Beginn bei …“ und „Wechsel zu …“ markieren den Übergang zwischen Beteiligten, an der Stelle steht auch, was gesendet und empfangen wird.
- **Zweige am Ort:** Jede Entscheidung ist eine Überschrift, ihre Fälle sind Überschriften eine Ebene tiefer, die Schritte stehen direkt darunter.
- **Flach, wo es geht:** Läuft nach einer Entscheidung nichts zusammen, bleibt der größte Zweig auf der Ebene der Entscheidung. Lange Prozesse werden so nicht immer tiefer eingerückt.
- **Links nur für echte Sprünge:** Das sind vor allem Rücksprünge. Verweise auf Nachrichten oder wartende Wege stehen als Text da.
- **Weniger Ansagen:** Die Zuständigkeit erscheint beim Wechsel und nach Überschriften. Steht nichts anderes da, folgt der nächste Schritt.
- **Zusammenführende XOR-Gateways entfallen,** wenn sie keinen Namen haben. Sie enthalten keine Information für die Lesenden.
- **Parallele Zusammenführungen bleiben** als eigener Warteschritt, weil dort eine echte Bedingung gilt.
- **Grenzereignisse** erscheinen als Sonderfall direkt beim Schritt, an dem sie hängen.
- **Reihenfolge von Zweigen:** Die Position im Diagramm entscheidet, ohne Diagrammdaten die Reihenfolge der Datei.
- **Linktexte tragen immer Kontext**, weil Screenreader Links auch als reine Liste anbieten.

Technisch beruht der Ablauf auf dem Dominatorbaum des Gesamtgraphen aus Sequenz- und Nachrichtenflüssen: Ein Schritt wird dort eingeordnet, wo alle Wege zu ihm vorbeiführen. Was nicht in Blöcke passt, wird zum Sprung. Das hält das Dokument auch bei unstrukturierten Modellen vollständig, geprüft mit zufällig erzeugten Graphen mit einem und mit zwei Pools. HTML kennt nur sechs Überschriftenelemente. Tiefere Zweige bleiben über `aria-level` echte Überschriften, Word nutzt seine neun Ebenen.

Die Prüfung mit fünf echten Modellen aus ProzessPilot mit zusammen 133 Elementen und 143 Flüssen ergab keinen falschen Übergang. Sie führte zu mehreren Verbesserungen: Zuständigkeit an Sprungzielen, Absätze und Listen aus mehrzeiligen Beschreibungen, Überschriften jenseits von H6, Ziele bei leeren Fällen, Formulierungen ohne technische Platzhalter und „Schreibt in“ bei Datenspeichern.

Die Grenzen:

- Sind Pools nur als Ganzes oder gar nicht über Nachrichten verbunden, lässt sich die Reihenfolge nicht vollständig ableiten. Das Dokument und der Prüfbericht sagen das dann ausdrücklich. Eine Nachricht an den Rand eines Pools führt zu dessen Start.
- Gleichzeitige Wege müssen im Text trotzdem nacheinander stehen. Was parallel läuft, nennt das Dokument nur innerhalb eines Pools ausdrücklich, nach einer Nachricht laufen Sender und Empfänger im Text nacheinander.
- Welcher Zweig ohne Einrückung weiterläuft, ist eine Schätzung: Das Programm nimmt den mit den meisten Schritten.
- Ein sehr großer Prozess bleibt auch so anstrengend zu hören.

### BPMN-Abdeckung

| Element | Darstellung | Phase |
| --- | --- | --- |
| Aufgaben, Start und Ende | Eigener Schritt | 1 |
| XOR- und parallele Gateways | Entscheidung, gleichzeitige Wege, Warten | 1 |
| Pools und Lanes | Zuständigkeit, Liste der Beteiligten | 1 |
| Dokumentation, Anmerkungen | Text beim Schritt | 1 |
| Mehrere Prozesse in einem Modell | Ein gemeinsamer Ablauf mit Wechseln als Überschriften | 1 |
| Grenzereignisse | Mit Art: Frist, Fehler, Nachricht; unterbrechend oder nicht | 1 |
| Nachrichtenflüsse, Datenobjekte | Satz beim Schritt | 1 |
| Zwischenereignisse | „Wartet auf“ oder „Löst aus“ mit Art des Ereignisses | 2 |
| Inklusive Gateways | „Mehrere dieser Wege können zutreffen“, beim Zusammenlaufen „Warten auf alle begonnenen Wege“ | 2 |
| Ereignisbasierte Gateways | Das erste Ereignis entscheidet, die Ereignisse bilden die Fälle | 2 |
| Komplexe Gateways | Allgemein als Verzweigung, mit Warnung, weil die Regel im Modell nicht lesbar ist | 2 |
| Teilprozesse | Inhalt am Ort als eigener Abschnitt mit durchgehenden Nummern und klarem Abschluss, auch verschachtelt | 2 |
| Ereignis-Teilprozesse, Ausgleichsaufgaben | Eigener Abschnitt „Sonderabläufe“ | 2 |
| Prozessaufrufe (Call Activity) | Satz beim Schritt, Hinweis im Prüfbericht, wenn der Prozess nicht in der Datei steht | 2 |
| Verbindungsereignisse (Link) | Über ihren Namen verbunden, Warnung, wenn das Gegenstück fehlt | 2 |
| Wiederholungen (Schleifen, Mehrfachausführung) | Satz beim Schritt | 2 |

Herstellerfelder wie `extensionElements` stören nicht, werden aber bewusst nicht ausgewertet: Grundlage ist allein der Standard.

### Werkzeugunabhängigkeit

Der Kern verträgt typische Unterschiede zwischen Exporten. Das ist bisher nur mit nachgestellten Dateien getestet, echte Exporte aus bpmnDESK, Picture und Adonis stehen noch aus:

- Beliebige Namensraum-Präfixe (`bpmn:`, `bpmn2:`, `semantic:`, keins) und unbekannte Herstellerfelder.
- Fehlende Diagrammdaten: Dann gilt die Reihenfolge der Datei, sonst die Position im Diagramm.
- UTF-8 mit und ohne Byte-Order-Mark, UTF-16, die im XML angegebene Kodierung wie ISO-8859-1.
- Für das Diagramm umbrochene Namen („Urlaubs-“ und „antrag“ werden wieder ein Wort) und HTML in der Dokumentation.
- Anmerkungen mit Verbindung in beide Richtungen, Bedingungen statt Beschriftungen, Modelle ohne Startereignis, Aufgaben mit mehreren Ausgängen.

### Lesbarkeit mit Vergrößerung und hohem Kontrast

- Keine festen Farben: Hell- und Dunkelmodus sowie der Hochkontrast des Systems greifen von selbst.
- Größen in `rem`: Die eingestellte Schriftgröße gilt, der Text bricht beim Vergrößern um.
- Das Sprungziel wird sichtbar umrandet, damit man es im kleinen vergrößerten Ausschnitt wiederfindet.
- Links sind immer unterstrichen und nie nur an der Farbe erkennbar.

## Prüfbericht für die Modellierung

Ein Dokument kann nur so gut sein wie die Beschriftung im Modell. Sehende erschließen sich eine unbeschriftete Raute oft aus dem Bild, im Text bleibt dort eine Lücke. Deshalb zeigt die Anwendung vor dem Herunterladen einen Prüfbericht:

- Fehler, die eine Umwandlung verhindern: nicht lesbare Datei, kein Prozess im Modell, zu große Datei.
- Warnungen: Elemente ohne Namen, unbeschriftete Ausgänge, kein Startereignis, nicht erreichbare Schritte, nicht verbundene Pools.
- Hinweise: tote Enden, mehrere Ausgänge ohne Gateway, Prozessaufrufe außerhalb der Datei.

Der Prüfbericht ist ein eigener Mehrwert des Werkzeugs: Er macht Modelle für alle besser.

## Web-Frontend

Eine Seite mit vier Schritten: Datei wählen, Prüfbericht lesen, Dokument ansehen, herunterladen.

Das Werkzeug muss selbst barrierefrei sein, denn Menschen mit Sehbehinderung laden die Modelle auch selbst hoch:

- Dateiauswahl über ein normales Formularfeld. Ziehen und Ablegen ist höchstens eine Zusatzfunktion.
- Statusmeldungen über eine ARIA-Live-Region.
- Vollständig per Tastatur bedienbar, sichtbarer Fokus, Fokus springt nach der Verarbeitung zum Ergebnis.
- Orientierung an WCAG 2.1 AA und EN 301 549.

## DSGVO und Betrieb

Die Architektur vermeidet die Verarbeitung von Modellen auf dem Server, ersetzt aber keine rechtliche Prüfung. Konform wird erst der Betrieb insgesamt. Vor dem Produktivstart sollte das die oder der Datenschutzbeauftragte bewerten. Das gilt besonders, wenn Modelle Personennamen enthalten.

**Technisch vorgesehen:**

- Keine externen Ressourcen: kein CDN, keine fremden Schriften, keine Analyse-Werkzeuge, keine Cookies.
- Eine Content-Security-Policy, die Netzwerkzugriffe des Skripts unterbindet, etwa `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`. So ist nicht nur versprochen, dass die Anwendung nichts per Skript hochlädt, der Browser verhindert es auch. Das Herunterladen über Blob-URLs funktioniert damit, die Browsertests prüfen beides. `frame-ancestors` wirkt nur als HTTP-Header und damit erst auf dem eigenen Server.
- Keine Speicherung im Browser, das Modell liegt nur im Arbeitsspeicher der Seite.
- HTTPS.
- Webserver-Protokolle ohne vollständige IP-Adressen und mit kurzer Aufbewahrung, denn der Seitenabruf selbst erzeugt weiterhin Daten.

**Organisatorisch zu klären:**

- Impressum und Datenschutzerklärung, sobald die Seite öffentlich erreichbar ist.
- Auftragsverarbeitungsvertrag mit dem Hoster, sofern der Server nicht selbst betrieben wird.

**Auslieferung:**

- Testversion über GitHub Pages, Dauerbetrieb über ein Docker-Image neben der DESK-Suite. Einzelheiten stehen in [BETRIEB.md](BETRIEB.md).

## Sicherheit

Hochgeladene Modelle sind nicht vertrauenswürdige Eingaben. Das heruntergeladene HTML öffnet jemand anderes später womöglich auf einem anderen Rechner.

- Alle Texte aus dem Modell werden maskiert. Das HTML enthält kein Skript und eine eigene strenge CSP.
- Dateigröße und Elementzahl werden begrenzt, damit riesige Dateien den Browser-Tab nicht lahmlegen.
- Testfälle mit präparierten Modellen gehören zur Testsuite.

## Qualitätssicherung

- **Automatisch:** Snapshot-Tests für Beispielmodelle, Prüfung aller internen Links und der Überschriftenfolge, axe-core für Frontend und erzeugtes Dokument.
- **Manuell:** NVDA unter Windows als kostenlose Basis, zusätzlich JAWS und VoiceOver, sobald verfügbar. Außerdem 400 % Zoom, Bildschirmlupe und Hochkontrast.
- **In der CI:** Jeder Push führt Typprüfung, Unit-Tests, Browsertests und einen Testlauf des Docker-Images aus. Nur wenn alles besteht, wird die Seite veröffentlicht.
- **Mit Betroffenen:** Tests mit Menschen mit Sehbehinderung sind der eigentliche Abnahmetest, siehe [Leitfaden](test/TEST-MIT-BETROFFENEN.md). Automatische Prüfungen sagen, ob ein Dokument technisch korrekt ist, nicht, ob man damit einen Prozess versteht.

## Machbarkeits-Spike

Dieser Abschnitt beschreibt den Stand vor Phase 1. Das erste Beispieldokument stammte aus einem Wegwerf-Skript, das nicht Teil des Repos ist.

**Geprüft:**

- `bpmn-moddle` 10.3.1 liest ein Modell mit 16 Flussknoten, daraus entstehen 14 Schritte, alle erreichbar.
- Lanes, XOR, Parallelität, Schleife, Timer-Grenzereignis, Nachricht, Datenobjekt und Anmerkung erscheinen im Text.
- Im Browser: Überschriften ohne Sprünge, 25 von 25 internen Links gültig, keine Konsolenfehler.
- Präpariertes Modell: Eine externe XML-Entity wird nicht aufgelöst und führt zu einer Parser-Warnung, HTML in Namen wird maskiert.
- Der Accessibility-Baum deckte Schwächen auf, die behoben wurden: Links ohne Kontext, unnötige Ansagen von Zuständigkeit, überflüssige Regionen.

**Nicht geprüft:**

- Ein echter Durchlauf mit NVDA, JAWS oder VoiceOver und ein Test mit blinden Menschen.
- Echte Modelle aus Modellierungswerkzeugen, auch große und unstrukturierte.
- Mehrere Prozesse, Teilprozesse, inklusive Gateways, nicht unterbrechende Grenzereignisse.
- Ausführung im Browser, DOCX, PDF, die CSP im Frontend, Docker. Auf dem aktuellen Entwicklungsrechner ist Docker nicht installiert.

**Bekannte Schwächen der Hörprobe:**

- Sprachlich holprig: „Schritt 8: bis alle gleichzeitigen Wege abgeschlossen sind“, und nach Fragezeichen folgt ein Punkt („genehmigt?.“).
- Die Lesehilfe und die Häufigkeit von „Zuständig“ und „Erreichbar von“ sollten nach dem Hörtest neu bewertet werden.

## Plan

Jede Phase endet mit etwas Nutzbarem.

### Phase 0: Hörprobe

- Die Dokumentform ist nach eigenen Tests gewählt. Die Bestätigung durch Betroffene folgt in Phase 6.
- Echte Exporte aus Picture und Adonis stehen noch aus. Modelle aus ProzessPilot wurden bereits geprüft.

### Phase 1: Kern (umgesetzt)

- Einlesen, Analysieren, Linearisieren, HTML-Ausgabe, Kommandozeile: `npm run convert -- modell.bpmn`.
- Abdeckung gemäß Tabelle, Sicherheitstests.

### Phase 2: Volle Abdeckung und Prüfbericht (umgesetzt)

- Alle BPMN-Elemente gemäß Tabelle, Prüfbericht in verständlichen Worten.
- **Stand:** Jedes Element erscheint im Dokument oder wird gemeldet, geprüft auch mit zufällig erzeugten, verschachtelten Modellen. Exporte aus Picture und Adonis fehlen noch.

### Phase 3: Web-Frontend (umgesetzt)

- Seite mit Dateiauswahl, Prüfbericht, Vorschau, Download, Sicherheitsregel und automatischen Barrierefreiheitstests.
- **Stand:** Browsertests decken die Bedienung nur mit der Tastatur, axe-core in Hell- und Dunkelmodus, die Darstellung bei 320 Pixeln Breite und das Ausbleiben von Datenübertragungen ab. Ein Durchgang mit NVDA steht noch aus.

### Phase 4: DOCX (umgesetzt)

- Zweiter Renderer auf demselben Dokumentmodell, mit echten Überschriften und internen Links.
- **Stand:** Der Aufbau der Datei ist automatisch geprüft. Die Prüfung in echtem Word mit NVDA steht noch aus.

### Phase 5: Auslieferung (Testversion veröffentlicht)

- Testversion auf GitHub Pages, siehe [BETRIEB.md](BETRIEB.md).
- Docker-Image und Webserver-Konfiguration sind vorbereitet und werden in der CI gestartet und geprüft.
- **Noch offen:** Einsatz auf dem eigenen Server neben der DESK-Suite, Impressum und Datenschutzerklärung, Datenschutz-Check.

### Phase 6: Test mit Betroffenen, Version 1.0 (vorbereitet)

- Mit blinden und mit sehbehinderten Menschen testen, die jeweils ihre eigenen Hilfsmittel nutzen, siehe [Leitfaden](test/TEST-MIT-BETROFFENEN.md).
- Befunde einarbeiten, danach Version 1.0.
- **Fertig, wenn:** Die Testpersonen können die Fragen ohne Hilfe beantworten.

### Mögliche Ausbaustufen

- **Getaggtes PDF:** Über einen kleinen optionalen Server mit Headless-Chromium und Prüfung mit veraPDF oder PAC. Modelle würden dann den Browser verlassen; das müsste man im Datenschutzkonzept abbilden.
- **Fehlende Namen direkt ergänzen**, statt zurück ins Modellierungswerkzeug zu müssen.
- **Sprachliche Glättung mit lokaler KI**, optional und standardmäßig aus, ohne Änderung der Fakten.
- **Weitere Sprachen.** Die Textvorlagen werden von Anfang an getrennt vom Code gehalten.

## Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Schlecht beschriftete Modelle ergeben schlechte Dokumente | Prüfbericht zeigt die Lücken vor dem Download |
| Große Modelle werden beim Hören unübersichtlich | Früh mit echten Modellen testen; Teilprozesse als Abschnitte |
| Die Dokumentform passt nicht zur Praxis der Nutzenden | Phase 0 und frühe Tests, das Dokumentmodell erlaubt schnelle Änderungen |
| Echte Exporte verhalten sich anders als die nachgestellten | Früh echte Dateien aus bpmnDESK, Picture und Adonis testen |
| Datenschutz wird nur technisch gedacht | Organisatorische Punkte in Phase 5, Bewertung durch Datenschutzbeauftragte |

## Offene Fragen

1. **Testmaterial:** Echte Exporte aus Picture und Adonis.
2. **Testpersonen:** Gibt es Menschen mit Sehbehinderung, die mittesten können?
3. **Zugang:** Soll die Anwendung dauerhaft öffentlich oder geschützt erreichbar sein?
4. **Lizenz des Repos:** Das Repo ist öffentlich, bisher ist aber keine Lizenz festgelegt.
5. **Rechtliches:** Braucht die öffentliche Testversion schon Impressum und Datenschutzerklärung?
