import type { Block, Inline, ProcessDocument } from './document.ts';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Keine festen Farben: So greifen Hell- und Dunkelmodus, hoher Kontrast und eigene Einstellungen.
// Größen in rem: Die eingestellte Schriftgröße gilt, und der Text bricht beim Vergrößern um.
const STYLE = `:root{color-scheme:light dark}
body{font:1.125rem/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;overflow-wrap:break-word}
h1,h2,h3{line-height:1.25}
h3{margin-top:2.5rem;scroll-margin-top:1rem}
h3:target{outline:.2rem solid currentColor;outline-offset:.4rem}
a{text-decoration:underline;text-underline-offset:.15em}
a:focus-visible{outline:.2rem solid currentColor;outline-offset:.15rem}
li{margin-block:.4rem}`;

// Das Dokument wird weitergegeben: Es darf nichts nachladen und nichts ausführen.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

function renderInline(inline: Inline): string {
  return typeof inline === 'string' ? escapeHtml(inline) : `<a href="#s${inline.step}">${escapeHtml(inline.text)}</a>`;
}

const renderInlines = (content: Inline[]): string => content.map(renderInline).join('');

function renderBlock(block: Block): string {
  if (block.type === 'paragraph') return `<p>${renderInlines(block.content)}</p>`;
  return renderList(block.items);
}

function renderList(items: Inline[][]): string {
  return `<ul>\n${items.map((item) => `<li>${renderInlines(item)}</li>`).join('\n')}\n</ul>`;
}

export function renderHtml(document: ProcessDocument): string {
  const parts: string[] = [
    `<h1>${escapeHtml(document.title)}</h1>`,
    `<h2>${escapeHtml(document.overviewHeading)}</h2>`,
    ...document.overview.map(renderBlock),
  ];
  if (document.roles.length) {
    parts.push(`<h2>${escapeHtml(document.rolesHeading)}</h2>`, renderList(document.roles));
  }
  if (document.messages.length) {
    parts.push(`<h2>${escapeHtml(document.messagesHeading)}</h2>`, renderList(document.messages));
  }
  for (const section of document.sections) {
    parts.push(`<h2>${escapeHtml(section.heading)}</h2>`, ...section.blocks.map(renderBlock));
    for (const step of section.steps) {
      parts.push(`<h3 id="s${step.number}">${escapeHtml(step.heading)}</h3>`, ...step.blocks.map(renderBlock));
    }
  }

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
${parts.join('\n')}
</main>
</body>
</html>
`;
}
