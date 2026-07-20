export interface NestedDocTab {
  name: string;
  slug: string;
  content: string; // Markdown of this specific tab
  order?: number;
  children: NestedDocTab[];
}
function slugify(text: string): string {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeMarkdownLinkLabel(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[");
}

function escapeMarkdownLinkUrl(url: string): string {
  return url.replace(/\)/g, "%29");
}

/** Move leading/trailing spaces outside emphasis markers so marked can parse them. */
function wrapMarkdownInlineStyle(text: string, marker: string): string {
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core = text.slice(leading.length, text.length - trailing.length);
  if (!core) return text;
  return `${leading}${marker}${core}${marker}${trailing}`;
}

function parseMarkdownTextRun(textRun: any): string {
  let text = (textRun.content || "").replace(/\n$/, "");
  if (!text) return "";

  const style = textRun.textStyle || {};
  const url = style.link?.url;

  if (style.code) text = `\`${text}\``;
  if (style.bold) text = wrapMarkdownInlineStyle(text, "**");
  if (style.italic) text = wrapMarkdownInlineStyle(text, "*");
  if (style.strikethrough) text = wrapMarkdownInlineStyle(text, "~~");

  if (url) {
    text = `[${escapeMarkdownLinkLabel(text)}](${escapeMarkdownLinkUrl(url)})`;
  }

  return text;
}

function parseMarkdownInlineElements(elements: any[]): string {
  return elements
    .map((el) => {
      if (el.textRun) return parseMarkdownTextRun(el.textRun);
      return "";
    })
    .join("");
}

const ORDERED_GLYPH_TYPES = new Set(["DECIMAL", "ZERO_DECIMAL", "UPPER_ALPHA", "ALPHA", "UPPER_ROMAN", "ROMAN", "ALPHA_OR_DECIMAL", "ALPHA_OR_ROMAN", "ROMAN_OR_DECIMAL"]);

function isOrderedListLevel(lists: Record<string, any>, listId: string, nestingLevel: number): boolean {
  const level = lists[listId]?.listProperties?.nestingLevels?.[nestingLevel];
  if (!level?.glyphType || level.glyphType === "GLYPH_TYPE_UNSPECIFIED") return false;
  return ORDERED_GLYPH_TYPES.has(level.glyphType);
}

function getParagraphPlainText(paragraph: any): string | null {
  const text = (paragraph.elements || []).map((el: any) => (el.textRun?.content || "").replace(/\n$/, "")).join("");
  return text.trim() ? text.trim() : null;
}

function getParagraphTextMarkdown(paragraph: any): string | null {
  const text = parseMarkdownInlineElements(paragraph.elements || []).replace(/\n$/, "");
  return text.trim() ? text : null;
}

/** Google Docs section titles use bold + enlarged font on NORMAL_TEXT instead of heading styles. */
function isVisualHeadingParagraph(paragraph: any): boolean {
  const namedStyle = paragraph.paragraphStyle?.namedStyleType;
  if (namedStyle && namedStyle !== "NORMAL_TEXT") return false;

  const runs = (paragraph.elements || []).filter((el: any) => (el.textRun?.content || "").replace(/\n$/, "").trim());
  if (runs.length === 0) return false;

  let combined = "";
  for (const el of runs) {
    const run = el.textRun;
    const content = (run.content || "").replace(/\n$/, "");
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

function applyMarkdownHeadingPrefix(text: string, style: string | undefined, isVisualHeading: boolean): string {
  if (isVisualHeading || style === "TITLE" || style === "HEADING_1") {
    return `## ${text}`;
  }
  if (style === "HEADING_2") {
    return `### ${text}`;
  }
  if (style === "HEADING_3") {
    return `#### ${text}`;
  }
  if (style === "HEADING_4" || style === "HEADING_5" || style === "HEADING_6") {
    return `##### ${text}`;
  }
  return text;
}

function paragraphToMarkdown(paragraph: any, options?: { excludeTabTitle?: string }): string | null {
  const style = paragraph.paragraphStyle?.namedStyleType;
  const visualHeading = isVisualHeadingParagraph(paragraph);
  let text = visualHeading ? getParagraphPlainText(paragraph) : getParagraphTextMarkdown(paragraph);
  if (!text) return null;

  if ((style === "TITLE" || visualHeading) && options?.excludeTabTitle && text.trim().toLowerCase() === options.excludeTabTitle.trim().toLowerCase()) {
    return null;
  }

  text = applyMarkdownHeadingPrefix(text, style, visualHeading);

  return text;
}

type MarkdownListLevel = { ordered: boolean; listId: string; itemNumber: number };

function markdownListItemLine(paragraph: any, bulletProps: any, lists: Record<string, any>, listStack: MarkdownListLevel[]): string | null {
  const text = getParagraphTextMarkdown(paragraph);
  if (!text) return null;

  const nestingLevel = bulletProps.nestingLevel || 0;
  const listId = bulletProps.listId as string;

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

  const indent = "  ".repeat(nestingLevel);
  const marker = ordered ? `${itemNumber}. ` : "- ";
  return `${indent}${marker}${text}`;
}

function bodyContentToMarkdown(content: any[], lists: Record<string, any> = {}, options?: { excludeTabTitle?: string }): string {
  const blocks: string[] = [];
  const listLines: string[] = [];
  const listStack: MarkdownListLevel[] = [];

  const flushList = () => {
    if (listLines.length > 0) {
      blocks.push(listLines.join("\n"));
      listLines.length = 0;
    }
    listStack.length = 0;
  };

  for (const element of content) {
    if (!element.paragraph) continue;

    const { paragraph } = element;
    const bulletProps = paragraph.bullet;

    if (bulletProps) {
      const line = markdownListItemLine(paragraph, bulletProps, lists, listStack);
      if (line) listLines.push(line);
      continue;
    }

    flushList();

    const block = paragraphToMarkdown(paragraph, options);
    if (block) blocks.push(block);
  }

  flushList();

  return blocks.join("\n\n").trim();
}

/**
 * Parses a Google Doc API response into a nested JSON structure
 * containing the markdown content for each tab and its children.
 *
 * @param doc - Full Docs API response
 * @return Array of nested tab objects
 */
export function parseNestedMarkdownTabs(doc: any): NestedDocTab[] {
  // Helper to extract markdown for a single tab's content
  function getTabMarkdown(content: any[], lists: Record<string, any>, tabTitle: string): string {
    return bodyContentToMarkdown(content, lists, { excludeTabTitle: tabTitle });
  }

  // Fallback for docs without tabs
  if (!doc.tabs || doc.tabs.length === 0) {
    const title = doc.title || "Untitled";
    return [
      {
        name: title,
        slug: slugify(title),
        content: getTabMarkdown(doc.body?.content || [], doc.lists || {}, title),
        children: [],
      },
    ];
  }

  // Recursive function to build the tree
  function buildTabTree(tab: any): NestedDocTab {
    const title = tab.tabProperties?.title || "Untitled";
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
      node.children = tab.childTabs.map((child: any, childIndex: number) => ({
        ...buildTabTree(child),
        order: childIndex,
      }));
    }

    return node;
  }

  // Map over the top-level tabs and build the tree
  return doc.tabs.map((tab: any) => buildTabTree(tab));
}
