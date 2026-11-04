const HTML_TAG = /<\/?(?:p|br|div|span|ul|ol|li|b|i|u|strong|em|a|font|h[1-6]|table|tr|td)\b[^>]*>/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Bereinigt Text aus dem Modell. Werkzeuge brechen Namen für das Diagramm um,
 * teils mit Trennstrich ("Urlaubs-\nantrag"). Vorgelesen stört beides.
 */
export function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/(\p{L})-[ \t]*\r?\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Manche Werkzeuge legen HTML in der Dokumentation ab. Vorgelesene Tags wären unbrauchbar. */
export function plainText(value: unknown, textFormat?: unknown): string {
  if (typeof value !== 'string') return '';
  const isHtml = (typeof textFormat === 'string' && /html/i.test(textFormat)) || HTML_TAG.test(value);
  if (!isHtml) return clean(value);
  const withoutTags = value.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '');
  return clean(decodeEntities(withoutTags));
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}
