/** A tiny Markdown subset for the legal pages: #/##/### headings, paragraphs, lists, **bold**. */

export type Inline = { text: string; bold?: boolean; placeholder?: boolean };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

/** Text the owner still has to supply, shown highlighted so it cannot be missed. */
export const PLACEHOLDER_PATTERN = /\[TO BE PROVIDED BY AIAIA[^\]]*\]/;

const TOKEN = /(\*\*[^*]+\*\*|\[TO BE PROVIDED BY AIAIA[^\]]*\])/;

export function parseInline(text: string): Inline[] {
  return text
    .split(TOKEN)
    .filter((part) => part !== '')
    .map((part): Inline => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return { text: part.slice(2, -2), bold: true };
      }
      if (PLACEHOLDER_PATTERN.test(part) && part.startsWith('[')) {
        return { text: part, placeholder: true };
      }
      return { text: part };
    });
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ...list });
      list = null;
    }
  };

  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (line === '') {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        inline: parseInline(heading[2]),
      });
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Plain text of a block's first heading, e.g. for page titles. */
export function firstHeading(blocks: Block[]): string | undefined {
  const heading = blocks.find((b) => b.type === 'heading');
  return heading && heading.type === 'heading'
    ? heading.inline.map((i) => i.text).join('')
    : undefined;
}
