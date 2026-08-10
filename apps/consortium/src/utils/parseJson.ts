export interface NestedDocTab {
  name: string;
  slug: string;
  content: string; // Markdown of this specific tab
  order?: number;
  children: NestedDocTab[];
}

/** Minimal Docs API shapes used by the markdown parser. */
interface DocsTextStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: { url?: string };
  fontSize?: { magnitude?: number };
}

interface DocsTextRun {
  content?: string;
  textStyle?: DocsTextStyle;
}

interface DocsParagraphElement {
  textRun?: DocsTextRun;
}

interface DocsBullet {
  listId?: string;
  nestingLevel?: number;
}

interface DocsParagraph {
  elements?: DocsParagraphElement[];
  paragraphStyle?: { namedStyleType?: string };
  bullet?: DocsBullet;
}

interface DocsStructuralElement {
  paragraph?: DocsParagraph;
}

interface DocsNestingLevel {
  glyphType?: string;
}

interface DocsList {
  listProperties?: { nestingLevels?: DocsNestingLevel[] };
}

type DocsLists = Record<string, DocsList>;

interface DocsBody {
  content?: DocsStructuralElement[];
}

interface DocsTab {
  tabProperties?: { title?: string };
  documentTab?: {
    body?: DocsBody;
    lists?: DocsLists;
  };
  childTabs?: DocsTab[];
}

export interface DocsDocument {
  title?: string;
  body?: DocsBody;
  lists?: DocsLists;
  tabs?: DocsTab[];
}
function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeMarkdownLinkLabel(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[');
}

function escapeMarkdownLinkUrl(url: string): string {
  return url.replace(/\)/g, '%29');
}

const GOOGLE_DOCS_SOFT_BREAK = '\u000b';

/** Strip C0 controls (except tab/LF/VT/CR) and DEL. Soft breaks are handled separately. */
function stripControlChars(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      continue;
    }
    result += char;
  }
  return result;
}

function countTrailingSoftBreaks(text: string): number {
  let count = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] !== GOOGLE_DOCS_SOFT_BREAK) break;
    count++;
  }
  return count;
}

function normalizeGoogleDocsText(raw: string): {
  text: string;
  trailingSoftBreaks: number;
} {
  const normalized = (raw || '').replace(/\r\n?/g, '\n');
  const trailingSoftBreaks = countTrailingSoftBreaks(normalized);

  // Google Docs paragraphs end with a trailing newline in the API payload.
  const withoutParagraphTerminator = normalized.replace(/\n$/, '');
  const withSoftBreaks = withoutParagraphTerminator.replaceAll(
    GOOGLE_DOCS_SOFT_BREAK,
    '\n',
  );

  return {
    text: stripControlChars(withSoftBreaks),
    trailingSoftBreaks,
  };
}

/** Move leading/trailing spaces outside emphasis markers so marked can parse them. */
function wrapMarkdownInlineStyle(text: string, marker: string): string {
  const leading = text.match(/^\s*/)?.[0] ?? '';
  const trailing = text.match(/\s*$/)?.[0] ?? '';
  const core = text.slice(leading.length, text.length - trailing.length);
  if (!core) return text;
  return `${leading}${marker}${core}${marker}${trailing}`;
}

function parseMarkdownTextRun(textRun: DocsTextRun): string {
  const { text: normalizedText, trailingSoftBreaks } = normalizeGoogleDocsText(
    textRun.content || '',
  );
  let text = normalizedText.replace(/\n+$/, '');
  if (!text && trailingSoftBreaks === 0) return '';

  const style = textRun.textStyle || {};
  const url = style.link?.url;

  if (style.code) text = `\`${text}\``;
  if (style.bold) text = wrapMarkdownInlineStyle(text, '**');
  if (style.italic) text = wrapMarkdownInlineStyle(text, '*');
  if (style.strikethrough) text = wrapMarkdownInlineStyle(text, '~~');

  if (url && text) {
    text = `[${escapeMarkdownLinkLabel(text)}](${escapeMarkdownLinkUrl(url)})`;
  }

  if (trailingSoftBreaks > 0) {
    return `${text}${'  \n'.repeat(trailingSoftBreaks)}`;
  }

  return text;
}

function parseMarkdownInlineElements(elements: DocsParagraphElement[]): string {
  return elements
    .map((el) => {
      if (el.textRun) return parseMarkdownTextRun(el.textRun);
      return '';
    })
    .join('');
}

const ORDERED_GLYPH_TYPES = new Set([
  'DECIMAL',
  'ZERO_DECIMAL',
  'UPPER_ALPHA',
  'ALPHA',
  'UPPER_ROMAN',
  'ROMAN',
  'ALPHA_OR_DECIMAL',
  'ALPHA_OR_ROMAN',
  'ROMAN_OR_DECIMAL',
]);

function isOrderedListLevel(
  lists: DocsLists,
  listId: string,
  nestingLevel: number,
): boolean {
  const level = lists[listId]?.listProperties?.nestingLevels?.[nestingLevel];
  if (!level?.glyphType || level.glyphType === 'GLYPH_TYPE_UNSPECIFIED')
    return false;
  return ORDERED_GLYPH_TYPES.has(level.glyphType);
}

function getParagraphPlainText(paragraph: DocsParagraph): string | null {
  const text = (paragraph.elements || [])
    .map((el) => normalizeGoogleDocsText(el.textRun?.content || '').text)
    .join('');
  return text.trim() ? text.trim() : null;
}

function getParagraphTextMarkdown(paragraph: DocsParagraph): string | null {
  const text = parseMarkdownInlineElements(paragraph.elements || []).replace(
    /\n$/,
    '',
  );
  return text.trim() ? text : null;
}

/** Google Docs section titles use bold + enlarged font on NORMAL_TEXT instead of heading styles. */
function isVisualHeadingParagraph(paragraph: DocsParagraph): boolean {
  const namedStyle = paragraph.paragraphStyle?.namedStyleType;
  if (namedStyle && namedStyle !== 'NORMAL_TEXT') return false;

  const runs = (paragraph.elements || []).filter((el) =>
    normalizeGoogleDocsText(el.textRun?.content || '').text.trim(),
  );
  if (runs.length === 0) return false;

  let combined = '';
  for (const el of runs) {
    const run = el.textRun;
    if (!run) continue;
    const content = normalizeGoogleDocsText(run.content || '').text;
    if (!content.trim()) continue;

    const textStyle = run.textStyle || {};
    if (!textStyle.bold) return false;

    const fontSize = textStyle.fontSize?.magnitude;
    // Default body bold often has no fontSize in the API; only treat explicit large text as a heading.
    if (fontSize == null || fontSize < 16) return false;

    combined += content;
  }

  const trimmed = combined.trim();
  return trimmed.length > 0 && trimmed.length <= 120;
}

function applyMarkdownHeadingPrefix(
  text: string,
  style: string | undefined,
  isVisualHeading: boolean,
): string {
  if (isVisualHeading || style === 'TITLE' || style === 'HEADING_1') {
    return `## ${text}`;
  }
  if (style === 'HEADING_2') {
    return `### ${text}`;
  }
  if (style === 'HEADING_3') {
    return `#### ${text}`;
  }
  if (style === 'HEADING_4' || style === 'HEADING_5' || style === 'HEADING_6') {
    return `##### ${text}`;
  }
  return text;
}

function paragraphToMarkdown(
  paragraph: DocsParagraph,
  options?: { excludeTabTitle?: string },
): string | null {
  const style = paragraph.paragraphStyle?.namedStyleType;
  const visualHeading = isVisualHeadingParagraph(paragraph);
  let text = visualHeading
    ? getParagraphPlainText(paragraph)
    : getParagraphTextMarkdown(paragraph);
  if (!text) return null;

  if (
    (style === 'TITLE' || visualHeading) &&
    options?.excludeTabTitle &&
    text.trim().toLowerCase() === options.excludeTabTitle.trim().toLowerCase()
  ) {
    return null;
  }

  text = applyMarkdownHeadingPrefix(text, style, visualHeading);

  return text;
}

type MarkdownListLevel = {
  ordered: boolean;
  listId: string;
  itemNumber: number;
};

function markdownListItemLine(
  paragraph: DocsParagraph,
  bulletProps: DocsBullet,
  lists: DocsLists,
  listStack: MarkdownListLevel[],
): string | null {
  const text = getParagraphTextMarkdown(paragraph);
  if (!text) return null;

  const nestingLevel = bulletProps.nestingLevel || 0;
  const listId = bulletProps.listId || '';

  while (listStack.length > nestingLevel + 1) {
    listStack.pop();
  }

  const ordered = isOrderedListLevel(lists, listId, nestingLevel);

  while (listStack.length <= nestingLevel) {
    const level = listStack.length;
    listStack.push({
      ordered: isOrderedListLevel(lists, listId, level),
      listId,
      itemNumber: 0,
    });
  }

  const current = listStack[nestingLevel];
  if (current.listId !== listId) {
    listStack[nestingLevel] = { ordered, listId, itemNumber: 0 };
  } else {
    current.ordered = ordered;
  }

  listStack[nestingLevel].itemNumber += 1;
  const itemNumber = listStack[nestingLevel].itemNumber;

  const indent = '  '.repeat(nestingLevel);
  const marker = ordered ? `${itemNumber}. ` : '- ';
  return `${indent}${marker}${text}`;
}

function bodyContentToMarkdown(
  content: DocsStructuralElement[],
  lists: DocsLists = {},
  options?: { excludeTabTitle?: string },
): string {
  const blocks: string[] = [];
  const listLines: string[] = [];
  const listStack: MarkdownListLevel[] = [];

  const flushList = () => {
    if (listLines.length > 0) {
      blocks.push(listLines.join('\n'));
      listLines.length = 0;
    }
    listStack.length = 0;
  };

  for (const element of content) {
    if (!element.paragraph) continue;

    const { paragraph } = element;
    const bulletProps = paragraph.bullet;

    if (bulletProps) {
      const line = markdownListItemLine(
        paragraph,
        bulletProps,
        lists,
        listStack,
      );
      if (line) listLines.push(line);
      continue;
    }

    flushList();

    const block = paragraphToMarkdown(paragraph, options);
    if (block) blocks.push(block);
  }

  flushList();

  return blocks.join('\n\n').trim();
}

/**
 * Parses a Google Doc API response into a nested JSON structure
 * containing the markdown content for each tab and its children.
 *
 * @param doc - Full Docs API response
 * @return Array of nested tab objects
 */
export function parseNestedMarkdownTabs(doc: DocsDocument): NestedDocTab[] {
  // Helper to extract markdown for a single tab's content
  function getTabMarkdown(
    content: DocsStructuralElement[],
    lists: DocsLists,
    tabTitle: string,
  ): string {
    return bodyContentToMarkdown(content, lists, { excludeTabTitle: tabTitle });
  }

  // Fallback for docs without tabs
  if (!doc.tabs || doc.tabs.length === 0) {
    const title = doc.title || 'Untitled';
    return [
      {
        name: title,
        slug: slugify(title),
        content: getTabMarkdown(
          doc.body?.content || [],
          doc.lists || {},
          title,
        ),
        children: [],
      },
    ];
  }

  // Recursive function to build the tree
  function buildTabTree(tab: DocsTab): NestedDocTab {
    const title = tab.tabProperties?.title || 'Untitled';
    const content = tab.documentTab?.body?.content || [];
    const lists = tab.documentTab?.lists || {};

    const node: NestedDocTab = {
      name: title,
      slug: slugify(title),
      content: getTabMarkdown(content, lists, title),
      children: [],
    };

    // If there are sub-tabs, recursively process them
    if (tab.childTabs && tab.childTabs.length > 0) {
      node.children = tab.childTabs.map((child, childIndex) => ({
        ...buildTabTree(child),
        order: childIndex,
      }));
    }

    return node;
  }

  // Map over the top-level tabs and build the tree
  return doc.tabs.map((tab) => buildTabTree(tab));
}
