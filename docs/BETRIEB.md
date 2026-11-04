# Betrieb

## Testversion auf GitHub Pages

Jeder Push auf `main` führt alle Prüfungen aus und veröffentlicht danach die Seite auf dem Branch `gh-pages`. Sie ist erreichbar unter <https://therealhuzur.github.io/bpmnbarrierefrei/>.

Die Umwandlung läuft auch dort nur im Browser, das Modell wird nicht übertragen. GitHub als Anbieter sieht aber den Seitenabruf, etwa die IP-Adresse, und sitzt in den USA. Für den Testbetrieb mit erfundenen oder unkritischen Modellen ist das vertretbar, für den Dauerbetrieb ist der eigene Server vorgesehen.

Die Seite ist per `noindex` von Suchmaschinen ausgenommen. Das ist kein Zugriffsschutz: Das Repo und die Seite sind öffentlich, wer den Link kennt, kann sie öffnen.

GitHub Pages schaltet sich für den Branch `gh-pages` beim ersten Push eines Nutzers ein, nicht bei einem Push aus der Action. Bei einem neuen Repo muss das also einmal von Hand geschehen, entweder durch so einen Push oder unter Settings, Pages.

## Eigener Server mit Docker

Dieser Schritt ist vorbereitet, aber noch nicht ausgerollt.

```bash
docker build -t bpmnbarrierefrei .
```

```bash
docker run -d --name bpmnbarrierefrei --restart unless-stopped -p 127.0.0.1:8080:8080 bpmnbarrierefrei
```

Der Container liefert nur statische Dateien aus und läuft ohne Root-Rechte auf Port 8080. HTTPS übernimmt der vorhandene Reverse Proxy.

Die CI baut das Image bei jedem Push, startet es und prüft die Sicherheits-Header. Ein Einsatz neben der DESK-Suite ist damit noch nicht getestet. Offen sind Domain und Einbindung in den Reverse Proxy.

## Datenschutz

Was die Technik leistet:

- Das Modell wird nur im Browser verarbeitet und nirgends gespeichert.
- Die Seite verbietet Netzwerkzugriffe aus dem Skript per Content-Security-Policy.
- Keine Cookies, keine fremden Schriften, kein CDN, keine Analyse.
- Der Docker-Webserver protokolliert IP-Adressen nur gekürzt und ohne Abfrageparameter oder Browserkennung.

Was organisatorisch noch zu tun ist, bevor die Anwendung produktiv läuft:

- Bewertung durch die oder den Datenschutzbeauftragten. Das ist besonders wichtig, wenn Modelle Personennamen enthalten.
- Impressum und Datenschutzerklärung ergänzen, sobald die Seite öffentlich und nicht mehr nur zum Test läuft. Für die Testversion auf GitHub Pages sollte das ebenfalls geklärt werden, falls sie geschäftlich genutzt oder breit geteilt wird.
- Aufbewahrungsdauer der Protokolle am Server festlegen und die Log-Rotation einrichten.
- Vertrag zur Auftragsverarbeitung mit dem Hoster, sofern der Server nicht selbst betrieben wird.

Die Hinweise ersetzen keine Rechtsberatung.
