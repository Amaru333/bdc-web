import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { expect, it } from 'vitest';
import { addSource, exportMarkdown } from './export-markdown.mjs';

it('preserves frontmatter and body while adding the GitBook source', () => {
  const input = '---\ntitle: Guide\n---\n\n:::note\nContent\n:::\n';
  const result = addSource(input, 'guide/index.md');
  expect(result.startsWith('---\ntitle: Guide\n---\n')).toBe(true);
  expect(result).toContain(
    'Source: https://bdcatalyst.gitbook.io/biodata-catalyst-documentation/guide/',
  );
  expect(result.endsWith('\n:::note\nContent\n:::\n')).toBe(true);
  expect(load(result.split('---')[1])).toEqual({ title: 'Guide' });
});

it('uses canonical external URLs from source_url rather than inventing GitBook routes', () => {
  for (const url of [
    'https://support.terra.bio/hc/en-us/articles/123',
    'https://sb-biodatacatalyst.readme.io/docs/start',
  ]) {
    const input = `---\ntitle: Start\nsource_url: "${url}"\n---\n\nBody`;
    expect(addSource(input, 'external/start.md')).toContain(`Source: ${url}\n`);
  }
});

it('handles the homepage, plain Markdown, CRLF and a frontmatter-only file', () => {
  expect(addSource('# Home', 'index.md')).toContain(
    'Source: https://bdcatalyst.gitbook.io/biodata-catalyst-documentation/\n',
  );
  expect(addSource('---\r\ntitle: Test\r\n---\r\nBody', 'a.md')).toContain(
    'Source: https://bdcatalyst.gitbook.io/biodata-catalyst-documentation/a\r\n',
  );
  expect(addSource('---\ntitle: Test\n---', 'a.md')).toContain(
    '---\n\nSource:',
  );
});

it('rejects invalid source URLs', () => {
  expect(() =>
    addSource('---\nsource_url: javascript:alert(1)\n---\n', 'a.md'),
  ).toThrow('Invalid source');
});

it('leaves originals unchanged, removes obsolete output and is repeatable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docs-source-test-'));
  const source = join(root, 'source');
  const output = join(root, 'output');
  try {
    await mkdir(source);
    await mkdir(output);
    await writeFile(join(source, 'index.md'), '# Home');
    await writeFile(join(output, 'stale.md'), 'obsolete');
    expect(await exportMarkdown(source, output)).toBe(1);
    const first = await readFile(join(output, 'index.md'), 'utf8');
    expect(await readFile(join(source, 'index.md'), 'utf8')).toBe('# Home');
    await expect(readFile(join(output, 'stale.md'))).rejects.toHaveProperty(
      'code',
      'ENOENT',
    );
    await exportMarkdown(source, output);
    expect(await readFile(join(output, 'index.md'), 'utf8')).toBe(first);
    await rm(join(source, 'index.md'));
    await expect(exportMarkdown(source, output)).rejects.toThrow();
    expect(await readFile(join(output, 'index.md'), 'utf8')).toBe(first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
