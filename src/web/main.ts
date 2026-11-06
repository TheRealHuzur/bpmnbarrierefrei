import { ConvertError, convertBpmn, renderFragment, renderHtml, type ConvertResult, type Finding } from '../core/index.ts';
import { MAX_INPUT_CHARS } from '../core/parse.ts';
import { de } from '../core/texts.de.ts';

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Element ${id} fehlt`);
  return found as T;
};

const fileInput = element<HTMLInputElement>('file');
const status = element('status');
const error = element('error');
const result = element('result');
const resultHeading = element('result-heading');
const summary = element('summary');
const report = element('report');
const htmlLink = element<HTMLAnchorElement>('download-html');
const docxLink = element<HTMLAnchorElement>('download-docx');
const previewSection = element('preview-section');
const previewHeading = element('preview-heading');
const preview = element('preview');

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const summaryText = (findings: Finding[]): string => {
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const hints = findings.length - warnings;
  if (!findings.length) return 'Die Umwandlung ist abgeschlossen. Der Prüfbericht hat nichts zu beanstanden.';
  return `Die Umwandlung ist abgeschlossen. Der Prüfbericht nennt ${plural(warnings, 'Warnung', 'Warnungen')} und ${plural(hints, 'Hinweis', 'Hinweise')}.`;
};

function renderFindings(findings: Finding[]): void {
  report.replaceChildren();
  if (!findings.length) {
    const none = document.createElement('p');
    none.textContent = 'Keine Befunde. Das Modell enthält alles, was für das Dokument nötig ist.';
    report.append(none);
    return;
  }
  const group = (title: string, items: Finding[]): void => {
    if (!items.length) return;
    const heading = document.createElement('h4');
    heading.textContent = `${title} (${items.length})`;
    const list = document.createElement('ul');
    for (const finding of items) {
      const item = document.createElement('li');
      item.textContent = finding.message;
      list.append(item);
    }
    report.append(heading, list);
  };
  group('Warnungen', findings.filter((finding) => finding.severity === 'warning'));
  group('Hinweise', findings.filter((finding) => finding.severity === 'info'));
}

let objectUrls: string[] = [];

function offerDownload(link: HTMLAnchorElement, content: BlobPart, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  objectUrls.push(url);
  link.href = url;
  link.download = fileName;
  link.hidden = false;
}

function clearResult(): void {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  result.hidden = true;
  previewSection.hidden = true;
  preview.replaceChildren();
  docxLink.hidden = true;
  error.textContent = '';
}

async function showResult({ document: model, findings }: ConvertResult, baseName: string, runId: number): Promise<void> {
  resultHeading.textContent = `Ergebnis: ${model.title}`;
  summary.textContent = summaryText(findings);
  renderFindings(findings);
  offerDownload(htmlLink, renderHtml(model), 'text/html;charset=utf-8', `${baseName}.html`);

  previewHeading.textContent = `Vorschau: ${model.title}`;
  // renderFragment maskiert alle Texte aus dem Modell, die Sicherheitsregel der Seite verbietet zusätzlich jedes Skript.
  preview.innerHTML = renderFragment(model, 1);

  result.hidden = false;
  previewSection.hidden = false;
  status.textContent = '';
  resultHeading.focus();

  // Word wird erst bei Bedarf geladen. Scheitert es, bleibt das HTML-Dokument nutzbar.
  try {
    const { renderDocx } = await import('../core/render-docx.ts');
    const bytes = await renderDocx(model);
    if (runId !== currentRun) return;
    offerDownload(docxLink, bytes as BlobPart, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${baseName}.docx`);
  } catch {
    if (runId === currentRun) status.textContent = 'Das Word-Dokument ließ sich nicht erzeugen. Die HTML-Datei steht trotzdem bereit.';
  }
}

let currentRun = 0;

async function convert(input: string | Uint8Array, baseName: string): Promise<void> {
  const runId = ++currentRun;
  clearResult();
  status.textContent = 'Das Modell wird umgewandelt.';
  try {
    const converted = await convertBpmn(input, { fallbackTitle: baseName });
    if (runId === currentRun) await showResult(converted, baseName, runId);
  } catch (caught) {
    if (runId !== currentRun) return;
    status.textContent = '';
    error.textContent = caught instanceof ConvertError ? caught.message : 'Bei der Umwandlung ist ein unerwarteter Fehler aufgetreten.';
  }
}

fileInput.addEventListener('click', () => {
  // Sonst löst dieselbe Datei nach einem erneuten Export keine Umwandlung aus.
  fileInput.value = '';
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > MAX_INPUT_CHARS) {
    clearResult();
    error.textContent = de.errors.tooLarge;
    return;
  }
  const baseName = file.name.replace(/\.[^.]*$/, '') || 'prozess';
  file.arrayBuffer().then(
    (buffer) => convert(new Uint8Array(buffer), baseName),
    () => {
      clearResult();
      error.textContent = 'Die Datei ließ sich nicht lesen.';
    },
  );
});
