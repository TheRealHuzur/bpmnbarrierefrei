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

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

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

function heading(level: number, text: string, anchor?: number): Paragraph {
  const run = new TextRun(text);
  const children = anchor === undefined ? [run] : [new Bookmark({ id: `s${anchor}`, children: [run] })];
  const style = HEADINGS[level - 1];
  if (style) return new Paragraph({ heading: style, children });
  // Word kennt neun Überschriftenebenen. Nur was noch tiefer liegt, wird ein hervorgehobener Absatz.
  if (level <= 9) return new Paragraph({ style: `Heading${level}`, children });
  const strong = new TextRun({ text, bold: true });
  return new Paragraph({ children: anchor === undefined ? [strong] : [new Bookmark({ id: `s${anchor}`, children: [strong] })] });
}

const bulletList = (items: string[]): Paragraph[] =>
  items.map((item) => new Paragraph({ text: item, numbering: { reference: BULLETS, level: 0 } }));

function renderBlock(block: Block): Paragraph[] {
  switch (block.type) {
    case 'paragraph':
      return [new Paragraph({ children: block.content.map(renderInline) })];
    case 'list':
      return bulletList(block.items);
    case 'heading':
      return [heading(block.level, block.text, block.anchor)];
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

/** Erzeugt eine Word-Datei mit echten Überschriften und Sprungmarken, im Browser wie in Node. */
export async function renderDocx(document: ProcessDocument): Promise<Uint8Array> {
  const body: Paragraph[] = [
    heading(1, document.title),
    heading(2, document.overviewHeading),
    ...document.overview.flatMap(renderBlock),
  ];
  if (document.roles.length) {
    body.push(heading(2, document.rolesHeading));
    if (document.rolesIntro) body.push(new Paragraph(document.rolesIntro));
    body.push(...bulletList(document.roles));
  }
  if (document.messages.length) body.push(heading(2, document.messagesHeading), ...bulletList(document.messages));
  body.push(heading(2, document.flowHeading), ...document.flow.flatMap(renderBlock));

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
        headingStyle('Heading3', 3, 28),
        headingStyle('Heading4', 4, 26),
        headingStyle('Heading5', 5, 24),
        headingStyle('Heading6', 6, 24),
        headingStyle('Heading7', 7, 24),
        headingStyle('Heading8', 8, 24),
        headingStyle('Heading9', 9, 24),
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
