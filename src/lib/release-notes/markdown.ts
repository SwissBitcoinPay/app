/**
 * The Markdown of the release notes (src/features/release-notes/), a small subset, read without
 * HTML nor any library: a heading (`## ` or `### `), a list item (`- `), a paragraph (lines
 * that follow one another, joined), parted by a blank line or another block; inside them, `**bold**`.
 * Anything else is shown as written: `unsupportedMarkdown` names it, and a test keeps every note
 * of every language within the subset.
 */

/** A run of text, bold or not. */
export type Span = { text: string; bold: boolean };

export type Block =
  | { kind: "heading"; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; items: Span[][] };

const HEADING = /^#{2,3} +(.*)$/;
const ITEM = /^- +(.*)$/;

/** `text` cut into its runs of bold (`**…**`) and plain text. An unclosed `**` stays as written. */
export function parseSpans(text: string): Span[] {
  const spans: Span[] = [];
  let rest = text;
  while (rest.length > 0) {
    const open = rest.indexOf("**");
    const close = open === -1 ? -1 : rest.indexOf("**", open + 2);
    if (open === -1 || close === -1) {
      spans.push({ text: rest, bold: false });
      break;
    }
    if (open > 0) spans.push({ text: rest.slice(0, open), bold: false });
    const bold = rest.slice(open + 2, close);
    if (bold.length > 0) spans.push({ text: bold, bold: true });
    rest = rest.slice(close + 2);
  }
  return spans;
}

/** The blocks of `markdown`, in order. */
export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", spans: parseSpans(paragraph.join(" ")) });
      paragraph = [];
    }
    if (items.length > 0) {
      blocks.push({ kind: "list", items: items.map(parseSpans) });
      items = [];
    }
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const item = ITEM.exec(line);
    if (line.length === 0) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: "heading", spans: parseSpans(heading[1]!.trim()) });
    } else if (item) {
      if (paragraph.length > 0) flush();
      items.push(item[1]!.trim());
    } else {
      if (items.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/**
 * What `markdown` writes outside the subset, one entry per line at fault: shown as written in the
 * app, so a note must not use it. Empty for a note within the subset.
 */
export function unsupportedMarkdown(markdown: string): string[] {
  const faults: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const heading = HEADING.exec(line);
    const item = ITEM.exec(line);
    const inline = heading?.[1] ?? item?.[1] ?? line;
    const block =
      (line.startsWith("#") && !heading) ||
      /^([*+]|\d+[.)])\s/.test(line) ||
      line.startsWith(">") ||
      line.startsWith("|") ||
      line.startsWith("```") ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(line);
    // Inline: what is left once the bold runs are taken out must hold no Markdown mark.
    const plain = parseSpans(inline)
      .filter((span) => !span.bold)
      .map((span) => span.text)
      .join("");
    const marks = /[*`_[\]<>\\]/.test(plain);
    if (block || marks) faults.push(line);
  }
  return faults;
}
