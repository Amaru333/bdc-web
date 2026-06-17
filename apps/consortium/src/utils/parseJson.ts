/**
 * parseGoogleDoc.ts
 * Converts Google Docs API JSON response to clean HTML.
 */

// ─── Main entry ────────────────────────────────────────────────────────────────

export interface ParsedDocTab {
  slug: string;
  title: string;
  tabId: string;
  html: string;
}

export interface NestedDocTab {
  name: string;
  slug: string;
  content: string; // Markdown of this specific tab
  order?: number;
  children: NestedDocTab[];
}

/**
 * Parse a full Google Docs API response into an array of blog posts,
 * one per tab.
 *
 * @param doc - Full Docs API response
 */
/**
 * Parse a full Google Docs API response into an array of blog posts,
 * one per tab (including all nested child tabs).
 *
 * @param doc - Full Docs API response
 */
export function parseDocTabs(doc: any): ParsedDocTab[] {
  // No tabs → treat the whole doc body as a single post
  if (!doc.tabs || doc.tabs.length === 0) {
    return [
      {
        slug: slugify(doc.title || "untitled"),
        title: doc.title || "Untitled",
        tabId: "root",
        html: parseBodyContent(doc.body?.content || []),
      },
    ];
  }

  const parsedTabs: ParsedDocTab[] = [];

  // Recursive helper to process a tab and its children
  function processTab(tab: any) {
    const { tabId, title } = tab.tabProperties;
    const content = tab.documentTab?.body?.content || [];

    parsedTabs.push({
      slug: slugify(title),
      title: title,
      tabId: tabId,
      html: parseBodyContent(content),
    });

    // If this tab has sub-tabs, parse them too
    if (tab.childTabs && tab.childTabs.length > 0) {
      tab.childTabs.forEach(processTab);
    }
  }

  // Kick off the extraction on top-level tabs
  doc.tabs.forEach(processTab);

  return parsedTabs;
}

// ─── Body content parser ───────────────────────────────────────────────────────

export function parseBodyContent(content: any[]): string {
  if (!content || content.length === 0) return "";

  const listState: { listStack: { tag: string }[] } = { listStack: [] };
  const parts: string[] = [];

  for (const element of content) {
    if (element.paragraph) {
      parts.push(parseParagraph(element.paragraph, listState));
    } else if (element.table) {
      parts.push(closeAllLists(listState));
      parts.push(parseTable(element.table));
    } else if (element.sectionBreak) {
      // sectionBreak is purely structural — just close any open lists
      parts.push(closeAllLists(listState));
    }
  }

  // Close any lists still open at end of content
  parts.push(closeAllLists(listState));

  return parts.filter(Boolean).join("\n");
}

// ─── Paragraph parser ──────────────────────────────────────────────────────────

const HEADING_MAP: Record<string, string> = {
  HEADING_1: "h1",
  HEADING_2: "h2",
  HEADING_3: "h3",
  HEADING_4: "h4",
  HEADING_5: "h5",
  HEADING_6: "h6",
};

function parseParagraph(paragraph: any, listState: { listStack: { tag: string }[] }): string {
  const elements = paragraph.elements || [];
  const styleType = paragraph.paragraphStyle?.namedStyleType || "NORMAL_TEXT";
  const bulletProps = paragraph.bullet;

  // Raw text used for: emptiness check + heading anchor ID
  const rawText = elements
    .map((el: any) => el.textRun?.content || "")
    .join("")
    .trim();

  // Inline HTML (bold, italic, links, etc.)
  const inlineHtml = parseInlineElements(elements);

  // ── Horizontal rule ──
  if (elements.some((el: any) => el.horizontalRule !== undefined)) {
    return closeAllLists(listState) + "<hr />";
  }

  // ── List item ──
  if (bulletProps) {
    return parseListItem(bulletProps, inlineHtml, listState);
  }

  // Not a list → close any open lists first
  const closeTags = closeAllLists(listState);

  // Empty paragraph (just a newline) → skip
  if (!rawText && !inlineHtml.includes("<img")) {
    return closeTags || "";
  }

  // ── Headings ──
  const headingTag = HEADING_MAP[styleType];
  if (headingTag) {
    const anchorId = slugify(rawText);
    return `${closeTags}<${headingTag} id="${anchorId}">${inlineHtml}</${headingTag}>`;
  }

  // ── TITLE / SUBTITLE named styles (sometimes used in docs) ──
  if (styleType === "TITLE") return `${closeTags}<h1 class="doc-title">${inlineHtml}</h1>`;
  if (styleType === "SUBTITLE") return `${closeTags}<p class="doc-subtitle">${inlineHtml}</p>`;

  // ── Normal paragraph ──
  return `${closeTags}<p>${inlineHtml}</p>`;
}

// ─── Inline element parser ─────────────────────────────────────────────────────

function parseInlineElements(elements: any[]): string {
  return elements
    .map((el) => {
      if (el.textRun) return parseTextRun(el.textRun);
      if (el.inlineObjectElement) return parseInlineImage(el.inlineObjectElement);
      return "";
    })
    .join("");
}

function parseTextRun(textRun: any): string {
  // Strip the trailing structural newline Google appends to every paragraph
  let text = (textRun.content || "").replace(/\n$/, "");
  if (!text) return "";

  text = escapeHtml(text);

  const style = textRun.textStyle || {};
  const url = style.link?.url;

  // Apply styles inside-out (innermost first)
  if (style.code) text = `<code>${text}</code>`;
  if (style.bold) text = `<strong>${text}</strong>`;
  if (style.italic) text = `<em>${text}</em>`;
  if (style.strikethrough) text = `<s>${text}</s>`;
  if (style.underline && !url) text = `<u>${text}</u>`; // skip underline on links

  if (url) {
    text = `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  return text;
}

function parseInlineImage(inlineObjectElement: any): string {
  // Actual image URL lives in doc.inlineObjects — resolved separately via resolveInlineImages()
  const objId = inlineObjectElement.inlineObjectId;
  return `<img data-inline-object-id="${objId}" alt="" loading="lazy" />`;
}

// ─── List parser ───────────────────────────────────────────────────────────────

function parseListItem(bulletProps: any, inlineHtml: string, listState: { listStack: { tag: string }[] }): string {
  const nestingLevel = bulletProps.nestingLevel || 0;
  // Default to <ul>; pass doc.lists for accurate <ol> detection (see note below)
  const tag = "ul";
  const { listStack } = listState;
  const parts: string[] = [];

  const currentDepth = listStack.length - 1;

  if (listStack.length === 0 || nestingLevel > currentDepth) {
    // Open one new list per nesting level gained
    const levels = listStack.length === 0 ? nestingLevel + 1 : nestingLevel - currentDepth;
    for (let i = 0; i < levels; i++) {
      parts.push(`<${tag}>`);
      listStack.push({ tag });
    }
  } else if (nestingLevel < currentDepth) {
    // Close deeper levels
    const toClose = currentDepth - nestingLevel;
    for (let i = 0; i < toClose; i++) {
      const closed = listStack.pop();
      if (closed) parts.push(`</${closed.tag}>`);
    }
  }

  parts.push(`<li>${inlineHtml}</li>`);
  return parts.join("\n");
}

function closeAllLists(listState: { listStack: { tag: string }[] }): string {
  const { listStack } = listState;
  if (listStack.length === 0) return "";
  const closing: string[] = [];
  while (listStack.length > 0) {
    const closed = listStack.pop();
    if (closed) closing.push(`</${closed.tag}>`);
  }
  return closing.join("\n");
}

// ─── Table parser ──────────────────────────────────────────────────────────────

function parseTable(table: any): string {
  const rows = table.tableRows || [];
  const htmlRows = rows.map((row: any, rowIndex: number) => {
    const cellTag = rowIndex === 0 ? "th" : "td";
    const cells = (row.tableCells || []).map((cell: any) => `<${cellTag}>${parseBodyContent(cell.content || [])}</${cellTag}>`).join("");
    return `<tr>${cells}</tr>`;
  });

  const thead = rows.length > 1 ? `<thead>${htmlRows[0]}</thead>` : "";
  const tbodyRows = rows.length > 1 ? htmlRows.slice(1) : htmlRows;
  return `<table>${thead}<tbody>${tbodyRows.join("")}</tbody></table>`;
}

// ─── Inline image URL resolver ─────────────────────────────────────────────────

export function resolveInlineImages(html: string, inlineObjects: any): string {
  if (!inlineObjects) return html;
  return html.replace(/data-inline-object-id="([^"]+)"/g, (match, objId) => {
    const uri = inlineObjects[objId]?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri;
    return uri ? `src="${escapeAttr(uri)}"` : match;
  });
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

// ─── Markdown output parser ────────────────────────────────────────────────────

/**
 * Retrieves the Markdown string from a Google Doc API response,
 * preserving Tab hierarchy and shifting document headings.
 *
 * @param doc - Full Docs API response
 * @return The text in Markdown format
 */
export function getFormattedMarkdown(doc: any): string {
  let markdownOutput = "";

  // Recursive function to handle tabs and child tabs
  function processTab(tab: any, depth: number) {
    const title = tab.tabProperties?.title || "Untitled";

    // Create the Tab header (e.g., # [TAB] 2025 or ## [TAB] May)
    const tabHashes = "#".repeat(depth);
    markdownOutput += `${tabHashes} [TAB] ${title}\n\n`;

    const content = tab.documentTab?.body?.content || [];
    const lists = tab.documentTab?.lists || {};

    markdownOutput += `${bodyContentToMarkdown(content, lists)}\n\n`;

    // Recursively process child tabs, increasing the depth
    if (tab.childTabs && tab.childTabs.length > 0) {
      markdownOutput += "---\n\n"; // Optional visual separator before child tabs
      tab.childTabs.forEach((child: any) => processTab(child, depth + 1));
    }

    markdownOutput += "---\n\n"; // Visual separator between main sections
  }

  // Kick off the parsing
  if (doc.tabs) {
    doc.tabs.forEach((tab: any) => processTab(tab, 1));
  } else {
    // Fallback if the doc doesn't use tabs
    processTab({ tabProperties: { title: doc.title }, documentTab: { body: doc.body } }, 1);
  }

  // Clean up extra trailing separators/newlines
  markdownOutput = markdownOutput.replace(/(^|\n)(---\n\n)+$/g, "").trim();

  return markdownOutput;
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
