import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const model = (name: string): string => fileURLToPath(new URL(`../docs/test/${name}.bpmn`, import.meta.url));

const chooseFile = (page: Page, name: string) => page.locator('#file').setInputFiles(model(name));

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  (page as Page & { problems?: string[] }).problems = problems;
  await page.goto('./');
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { problems?: string[] }).problems).toEqual([]);
});

test.describe('Umwandlung', () => {
  test('wandelt eine Datei um, setzt den Fokus auf das Ergebnis und zeigt die Vorschau', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    const heading = page.getByRole('heading', { name: 'Ergebnis: Bauantrag' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('#summary')).toHaveText('Die Umwandlung ist abgeschlossen. Der Prüfbericht hat nichts zu beanstanden.');
    const preview = page.locator('#preview');
    await expect(preview.getByRole('heading', { name: 'Wechsel zu Bauamt' })).toBeVisible();
    await expect(preview).toContainText('Schritt 1: Bauantrag einreichen.');
    await expect(preview).toContainText('Falls Nein');
  });

  test('wandelt das Beispiel per Knopf um', async ({ page }) => {
    await page.getByRole('button', { name: 'Beispiel „Bauantrag“ umwandeln' }).click();
    await expect(page.getByRole('heading', { name: 'Ergebnis: Bauantrag' })).toBeFocused();
  });

  test('zeigt im Ablauf der Vorschau keine Aufzählung', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#preview')).toContainText('Schritt 1');
    const html = await page.locator('#preview').innerHTML();
    expect(html.slice(html.indexOf('>Ablauf<'))).not.toMatch(/<(ol|ul|li)\b/);
  });

  test('hält die Überschriftenfolge der ganzen Seite ein', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#preview')).toContainText('Schritt 1');
    const levels = await page.locator('main :is(h1,h2,h3,h4,h5,h6):visible').evaluateAll((headings) => headings.map((heading) => Number(heading.tagName[1])));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    levels.forEach((level, index) => {
      if (index > 0) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1);
    });
  });

  test('springt über einen Link in der Vorschau zum Ziel und kann zurück', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    const link = page.locator('#preview').getByRole('link', { name: 'Schritt 3: Unterlagen auf Vollständigkeit prüfen' });
    await link.click();
    await expect(page.locator(':target')).toContainText('Schritt 3: Unterlagen auf Vollständigkeit prüfen.');
    await page.goBack();
    await expect(page.locator('#preview')).toContainText('Schritt 1');
  });

  test('ersetzt das Ergebnis bei einer zweiten Datei vollständig', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    await expect(page.getByRole('heading', { name: 'Ergebnis: Bauantrag' })).toBeVisible();
    await chooseFile(page, 'mit-absichtlichen-fehlern');
    await expect(page.getByRole('heading', { name: 'Ergebnis: Modell mit absichtlichen Fehlern' })).toBeFocused();
    await expect(page.locator('#preview')).not.toContainText('Bauantrag einreichen');
  });
});

test.describe('Prüfbericht', () => {
  test('nennt Warnungen und Hinweise getrennt und in verständlichen Worten', async ({ page }) => {
    await chooseFile(page, 'mit-absichtlichen-fehlern');
    await expect(page.locator('#summary')).toHaveText('Die Umwandlung ist abgeschlossen. Der Prüfbericht nennt 6 Warnungen und 4 Hinweise.');
    await expect(page.getByRole('heading', { name: 'Warnungen (6)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hinweise (4)' })).toBeVisible();
    await expect(page.locator('#report')).toContainText('Eine Aufgabe (ID T_Ohne) hat keinen Namen.');
    await expect(page.locator('#report')).not.toContainText('bpmn:');
  });
});

test.describe('Fehler', () => {
  test('meldet eine ungeeignete Datei verständlich und zeigt kein altes Ergebnis', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    await expect(page.getByRole('heading', { name: 'Ergebnis: Bauantrag' })).toBeVisible();
    await page.locator('#file').setInputFiles({ name: 'kaputt.bpmn', mimeType: 'text/xml', buffer: Buffer.from('kein Modell') });
    await expect(page.getByRole('alert')).toContainText('kein lesbares BPMN-2.0-Modell');
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#preview-section')).toBeHidden();
  });

  test('macht aus einem präparierten Modell keinen ausführbaren Inhalt', async ({ page }) => {
    let dialog = false;
    page.on('dialog', (opened) => {
      dialog = true;
      void opened.dismiss();
    });
    const hostile = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
      <bpmn:process id="P" name="&lt;img src=x onerror=alert(1)&gt;">
        <bpmn:startEvent id="S" name="&lt;script&gt;alert(2)&lt;/script&gt;" />
        <bpmn:task id="A" name="&lt;img src=x onerror=alert(3)&gt;" />
        <bpmn:sequenceFlow id="f" sourceRef="S" targetRef="A" />
      </bpmn:process>
    </bpmn:definitions>`;
    await page.locator('#file').setInputFiles({ name: 'boese.bpmn', mimeType: 'text/xml', buffer: Buffer.from(hostile) });
    await expect(page.locator('#preview')).toContainText('<script>alert(2)</script>');
    expect(await page.locator('#preview img, #preview script, #result img').count()).toBe(0);
    await expect(page.locator('#result-heading')).toContainText('<img src=x');
    expect(dialog).toBe(false);
  });
});

test.describe('Herunterladen', () => {
  test('liefert eine eigenständige HTML-Datei', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-html').click()]);
    expect(download.suggestedFilename()).toBe('bauantrag.html');
    const html = await readFile(await download.path(), 'utf8');
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<h1>Bauantrag</h1>');
    expect(html).toContain('Schritt 1: Bauantrag einreichen.');
    expect(html).not.toMatch(/<script/i);
  });

  test('liefert ein Word-Dokument mit echten Überschriften', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    const link = page.locator('#download-docx');
    await expect(link).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    expect(download.suggestedFilename()).toBe('bauantrag.docx');
    const zip = await JSZip.loadAsync(await readFile(await download.path()));
    const body = await zip.file('word/document.xml')!.async('string');
    expect(body).toContain('w:pStyle w:val="Heading1"');
    expect(body).toContain('Schritt 1: Bauantrag einreichen.');
  });
});

test.describe('Datenschutz', () => {
  test('überträgt das Modell nicht und lädt nichts von fremden Servern', async ({ page, baseURL }) => {
    const requests: { url: string; method: string; body: string | null }[] = [];
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
    await page.reload();
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#download-docx')).toBeVisible();

    const origin = new URL(baseURL!).origin;
    const remote = requests.filter((request) => !request.url.startsWith('blob:') && !request.url.startsWith('data:'));
    expect(remote.length).toBeGreaterThan(0);
    for (const request of remote) {
      expect(new URL(request.url).origin).toBe(origin);
      expect(request.method).toBe('GET');
      expect(request.body).toBeNull();
    }
    // Nach dem Laden von Seite und Word-Baustein gibt es nur Skripte und Stile, keine Daten.
    for (const request of remote) expect(new URL(request.url).pathname).toMatch(/\/$|\.(js|css)$/);
  });

  test('verbietet dem Skript per Sicherheitsregel jeden Netzwerkzugriff', async ({ page }) => {
    const failed = await page.evaluate(async () => {
      try {
        await fetch(location.href);
        return false;
      } catch {
        return true;
      }
    });
    expect(failed).toBe(true);
    // Der Browser meldet den Verstoß gegen die Regel selbst als Fehler, das ist hier gewollt.
    (page as Page & { problems?: string[] }).problems = [];
  });

  test('setzt keine Cookies und speichert nichts im Browser', async ({ page, context }) => {
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#download-docx')).toBeVisible();
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  });
});

test.describe('Barrierefreiheit', () => {
  test('hat im Ausgangszustand keine Verstöße', async ({ page }) => {
    await expectNoViolations(page);
  });

  test('hat mit Ergebnis keine Verstöße', async ({ page }) => {
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#download-docx')).toBeVisible();
    await expectNoViolations(page);
  });

  test('hat mit Prüfbericht und Fehlermeldung keine Verstöße', async ({ page }) => {
    await chooseFile(page, 'mit-absichtlichen-fehlern');
    await expect(page.locator('#preview')).toContainText('Schritt 1');
    await expectNoViolations(page);
    await page.locator('#file').setInputFiles({ name: 'kaputt.bpmn', mimeType: 'text/xml', buffer: Buffer.from('kein Modell') });
    await expect(page.getByRole('alert')).toContainText('kein lesbares');
    await expectNoViolations(page);
  });

  test('hat im Dunkelmodus keine Verstöße', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#download-docx')).toBeVisible();
    await expectNoViolations(page);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`das erzeugte Dokument hat im Modus ${colorScheme} keine Verstöße und genug Kontrast`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(new URL('../docs/test/bauantrag.html', import.meta.url).href);
      await expectNoViolations(page);
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      // Der Kontrast muss wirklich geprüft worden sein, nicht nur unentschieden bleiben.
      expect(results.incomplete).toEqual([]);
      expect(results.passes.map((rule) => rule.id)).toContain('color-contrast');
    });
  }

  test('ist vollständig mit der Tastatur bedienbar', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('#file')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#sample')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#result-heading')).toBeFocused();
    await expect(page.locator('#download-docx')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.locator('#download-docx')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#download-html')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#preview').getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(':target')).toContainText('Schritt 3');
  });

  test('bricht bei einer Breite von 320 Pixeln um, ohne seitliches Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await chooseFile(page, 'bauantrag');
    await expect(page.locator('#preview')).toContainText('Schritt 1');
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test('zeigt den Fokus sichtbar an', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.locator('#sample').evaluate((button) => getComputedStyle(button).outlineStyle);
    expect(outline).toBe('solid');
  });
});
