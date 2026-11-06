import {
  AlignmentType,
  Bookmark,
  Document,
  HeadingLevel,
  InternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from 'docx';
import type { Block, Inline, ProcessDocument } from './document.ts';
import { de } from './texts.de.ts';

const FONT = 'Arial';
const BULLETS = 'aufzaehlung';

const headingStyle = (id: string, level: number, size: number) => ({
  id,
  name: `Heading ${level}`,
  basedOn: 'Normal',
  next: 'Normal',
  quickFormat: true,
  // Keine festen Farben: Word zeigt den Text in Automatik-Farbe und damit auch im Hochkontrast richtig.
  run: { font: FONT, size, bold: true },
  paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: level - 1 },
});

function renderInline(inline: Inline): ParagraphChild {
  if (typeof inline === 'string') return new TextRun(inline);
  if ('strong' in inline) return new TextRun({ text: inline.strong, bold: true });
  return new InternalHyperlink({
    anchor: `s${inline.step}`,
    children: [new TextRun({ text: inline.text, style: 'Hyperlink' })],
  });
}

const heading = (level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2, text: string): Paragraph =>
  new Paragraph({ heading: level, children: [new TextRun(text)] });

/** Fette Zeile im Ablauf, bewusst keine Überschrift. Sie bleibt beim Seitenumbruch bei ihren Schritten. */
function label(text: string, anchor?: number): Paragraph {
  const run = new TextRun({ text, bold: true });
  return new Paragraph({
    keepNext: true,
    spacing: { before: 280 },
    children: anchor === undefined ? [run] : [new Bookmark({ id: `s${anchor}`, children: [run] })],
  });
}

const bulletList = (items: string[]): Paragraph[] =>
  items.map((item) => new Paragraph({ text: item, numbering: { reference: BULLETS, level: 0 } }));

function renderBlock(block: Block): Paragraph[] {
  switch (block.type) {
    case 'paragraph':
      return [new Paragraph({ children: block.content.map(renderInline) })];
    case 'list':
      return bulletList(block.items);
    case 'label':
      return [label(block.text, block.anchor)];
    case 'step': {
      const [first, ...rest] = block.content.map(renderInline);
      return [
        new Paragraph({
          children: [new Bookmark({ id: `s${block.anchor}`, children: first ? [first] : [] }), ...rest],
        }),
      ];
    }
  }
}

/** Erzeugt eine Word-Datei mit echten Überschriften bis zum Ablauf und Sprungmarken, im Browser wie in Node. */
export async function renderDocx(document: ProcessDocument): Promise<Uint8Array> {
  const section = (text: string): Paragraph => heading(HeadingLevel.HEADING_2, text);
  const body: Paragraph[] = [
    heading(HeadingLevel.HEADING_1, document.title),
    section(document.overviewHeading),
    ...document.overview.flatMap(renderBlock),
  ];
  if (document.roles.length) {
    body.push(section(document.rolesHeading));
    if (document.rolesIntro) body.push(new Paragraph(document.rolesIntro));
    body.push(...bulletList(document.roles));
  }
  if (document.messages.length) body.push(section(document.messagesHeading), ...bulletList(document.messages));
  body.push(section(document.flowHeading), ...document.flow.flatMap(renderBlock));

  const file = new Document({
    title: document.documentTitle,
    description: de.docx.description,
    creator: de.docx.creator,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24, language: { value: de.docx.language } },
          paragraph: { spacing: { after: 160, line: 320 } },
        },
      },
      paragraphStyles: [
        headingStyle('Heading1', 1, 40),
        headingStyle('Heading2', 2, 32),
      ],
      characterStyles: [{ id: 'Hyperlink', name: 'Hyperlink', run: { underline: {} } }],
    },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }],
        },
      ],
    },
    sections: [{ children: body }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(file));
}
