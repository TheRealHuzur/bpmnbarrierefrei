import type { Block, Inline, ProcessDocument } from './document.ts';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Keine festen Farben: So greifen Hell- und Dunkelmodus, hoher Kontrast und eigene Einstellungen.
// Größen in rem: Die eingestellte Schriftgröße gilt, und der Text bricht beim Vergrößern um.
const STYLE = `:root{color-scheme:light dark}
body{font:1.125rem/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;overflow-wrap:break-word}
h1,h2,h3,h4,h5,h6{line-height:1.25}
h3{margin-top:2.5rem}
h4,h5,h6{margin-top:1.75rem}
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
    case 'heading': {
      const id = block.anchor === undefined ? '' : ` id="s${block.anchor}"`;
      // HTML kennt nur sechs Überschriftenebenen. Tiefer verschachtelte Zweige werden hervorgehobene Absätze.
      if (block.level > 6) return `<p${id}><strong>${escapeHtml(block.text)}</strong></p>`;
      return `<h${block.level}${id}>${escapeHtml(block.text)}</h${block.level}>`;
    }
    case 'step':
      return `<p id="s${block.anchor}">${renderInlines(block.content)}</p>`;
  }
}

function renderList(items: string[]): string {
  return `<ul>\n${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}\n</ul>`;
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
  parts.push(`<h2>${escapeHtml(document.flowHeading)}</h2>`, ...document.flow.map(renderBlock));

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
