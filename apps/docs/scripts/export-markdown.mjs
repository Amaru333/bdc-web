import { access, cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const gitbookUrl =
  'https://bdcatalyst.gitbook.io/biodata-catalyst-documentation/';

export function addSource(markdown, path) {
  const frontmatter = markdown.match(
    /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  );
  const metadata = frontmatter ? load(frontmatter[1]) : {};
  const route = path
    .split(sep)
    .join('/')
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '$1');
  const source = metadata?.source_url ?? new URL(route, gitbookUrl).href;
  const parsed = new URL(source);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error(`Invalid source URL in ${path}`);
  }
  const prefix = frontmatter?.[0] ?? '';
  const body = markdown.slice(prefix.length);
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  return `${prefix}${prefix && !prefix.endsWith('\n') ? newline : ''}${prefix ? newline : ''}Source: ${parsed.href}${newline}${newline}${body}`;
}

async function markdownFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.isFile() && /\.mdx?$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

export async function exportMarkdown(source, output) {
  await access(join(source, 'index.md'));
  const pages = await Promise.all(
    (await markdownFiles(source)).map(async (file) => {
      const path = relative(source, file);
      return { path, content: addSource(await readFile(file, 'utf8'), path) };
    }),
  );
  await rm(output, { recursive: true, force: true });
  await cp(source, output, { recursive: true });
  for (const page of pages)
    await writeFile(join(output, page.path), page.content);
  return pages.length;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const count = await exportMarkdown(
    join(root, 'src/content/docs'),
    join(root, 'dist/markdown'),
  );
  console.log(`Exported ${count} Markdown pages with source links.`);
}
