import type { Block, Inline, ProcessDocument } from './document.ts';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Nur Systemfarben: So greifen Hell- und Dunkelmodus, hoher Kontrast und eigene Einstellungen.
// Größen in rem: Die eingestellte Schriftgröße gilt, und der Text bricht beim Vergrößern um.
const STYLE = `:root{color-scheme:light dark}
body{background:Canvas;color:CanvasText;font:1.125rem/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;overflow-wrap:break-word}
h1,h2,h3,h4,h5,h6{line-height:1.25}
h3{margin-top:2.5rem}
h4,h5,h6,[role=heading]{margin-top:1.75rem}
[role=heading]{font-weight:bold}
[id]{scroll-margin-top:1rem}
:target{outline:.2rem solid currentColor;outline-offset:.4rem}
a{text-decoration:underline;text-underline-offset:.15em}
a:focus-visible{outline:.2rem solid currentColor;outline-offset:.15rem}
li{margin-block:.4rem}`;

// Das Dokument wird weitergegeben: Es darf nichts nachladen und nichts ausführen.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

function renderInline(inline: Inline): string {
  if (typeof inline === 'string') return escapeHtml(inline);
  if ('strong' in inline) return `<strong>${escapeHtml(inline.strong)}</strong>`;
  return `<a href="#s${inline.step}">${escapeHtml(inline.text)}</a>`;
}

const renderInlines = (content: Inline[]): string => content.map(renderInline).join('');

function renderHeading(level: number, text: string, anchor?: number): string {
  const id = anchor === undefined ? '' : ` id="s${anchor}"`;
  // HTML kennt nur sechs Überschriftenelemente. Tiefere Ebenen bleiben über ARIA echte Überschriften.
  if (level > 6) return `<div role="heading" aria-level="${level}"${id}>${escapeHtml(text)}</div>`;
  return `<h${level}${id}>${escapeHtml(text)}</h${level}>`;
}

function renderBlock(block: Block, headingOffset: number): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${renderInlines(block.content)}</p>`;
    case 'list':
      return renderList(block.items);
    case 'heading':
      return renderHeading(block.level + headingOffset, block.text, block.anchor);
    case 'step':
      return `<p id="s${block.anchor}">${renderInlines(block.content)}</p>`;
  }
}

function renderList(items: string[]): string {
  return `<ul>\n${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}\n</ul>`;
}

/** Der Inhalt ohne Titel, zum Einbetten in eine Seite. Mit dem Versatz passen die Überschriften in die umgebende Gliederung. */
export function renderFragment(document: ProcessDocument, headingOffset = 0): string {
  const section = (text: string): string => renderHeading(2 + headingOffset, text);
  const block = (item: Block): string => renderBlock(item, headingOffset);
  const parts: string[] = [section(document.overviewHeading), ...document.overview.map(block)];
  if (document.roles.length) {
    parts.push(section(document.rolesHeading));
    if (document.rolesIntro) parts.push(`<p>${escapeHtml(document.rolesIntro)}</p>`);
    parts.push(renderList(document.roles));
  }
  if (document.messages.length) parts.push(section(document.messagesHeading), renderList(document.messages));
  parts.push(section(document.flowHeading), ...document.flow.map(block));
  return parts.join('\n');
}

export function renderHtml(document: ProcessDocument): string {
  return `<!doctype html>
<html lang="${escapeHtml(document.lang)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(document.documentTitle)}</title>
<style>
${STYLE}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(document.title)}</h1>
${renderFragment(document)}
</main>
</body>
</html>
`;
}
