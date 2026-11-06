import type { Block, Inline, ProcessDocument } from './document.ts';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Nur Systemfarben: So greifen Hell- und Dunkelmodus, hoher Kontrast und eigene Einstellungen.
// Größen in rem: Die eingestellte Schriftgröße gilt, und der Text bricht beim Vergrößern um.
const STYLE = `:root{color-scheme:light dark}
body{background:Canvas;color:CanvasText;font:1.125rem/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;overflow-wrap:break-word}
h1,h2{line-height:1.25}
.abschnitt{font-weight:bold;margin-top:1.75rem}
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

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${renderInlines(block.content)}</p>`;
    case 'list':
      return renderList(block.items);
    case 'label': {
      const id = block.anchor === undefined ? '' : ` id="s${block.anchor}"`;
      return `<p class="abschnitt"${id}>${escapeHtml(block.text)}</p>`;
    }
    case 'step':
      return `<p id="s${block.anchor}">${renderInlines(block.content)}</p>`;
  }
}

function renderList(items: string[]): string {
  return `<ul>\n${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}\n</ul>`;
}

/** Der Inhalt ohne Titel, zum Einbetten in eine Seite. Mit dem Versatz passen die Überschriften in die umgebende Gliederung. */
export function renderFragment(document: ProcessDocument, headingOffset = 0): string {
  const level = 2 + headingOffset;
  const section = (text: string): string => `<h${level}>${escapeHtml(text)}</h${level}>`;
  const parts: string[] = [section(document.overviewHeading), ...document.overview.map(renderBlock)];
  if (document.roles.length) {
    parts.push(section(document.rolesHeading));
    if (document.rolesIntro) parts.push(`<p>${escapeHtml(document.rolesIntro)}</p>`);
    parts.push(renderList(document.roles));
  }
  if (document.messages.length) parts.push(section(document.messagesHeading), renderList(document.messages));
  parts.push(section(document.flowHeading), ...document.flow.map(renderBlock));
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
