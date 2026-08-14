import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enhanceSearchResult,
  observeSearchResults,
} from './enhance-search-results';

function renderTemplates() {
  document.body.innerHTML = `
    <template id="search-result-badge-template">
      <span class="shared-badge">Page</span>
    </template>
    <template id="search-result-breadcrumb-template">
      <p data-search-result-breadcrumb></p>
    </template>
  `;
}

function createResult() {
  const result = document.createElement('li');
  result.className = 'pf-result';
  result.innerHTML = `
    <a class="pf-result-link" href="/news/latest-updates/example">Example</a>
    <div data-search-result-breadcrumb-slot></div>
    <p data-search-result-badge-slot></p>
  `;
  return result;
}

function createDefaultUiResult() {
  const result = document.createElement('li');
  result.className = 'pagefind-ui__result';
  result.innerHTML = `
    <div class="pagefind-ui__result-inner">
      <p class="pagefind-ui__result-title">
        <a class="pagefind-ui__result-link" href="/data/explore">Explore data</a>
      </p>
      <p class="pagefind-ui__result-excerpt">Result excerpt</p>
    </div>
  `;
  return result;
}

describe('search result enhancements', () => {
  beforeEach(renderTemplates);

  it('uses shared templates for the page badge and breadcrumb', () => {
    const result = createResult();
    document.body.appendChild(result);

    enhanceSearchResult(result);

    expect(result.querySelector('.shared-badge')).toHaveTextContent('Page');
    expect(
      result.querySelector('[data-search-result-breadcrumb]'),
    ).toHaveTextContent('News > Latest Updates > Example');
  });

  it('enhances results added after observation begins', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    observeSearchResults(container);

    const result = createResult();
    container.appendChild(result);
    await vi.waitFor(() => {
      expect(result.querySelector('.shared-badge')).toHaveTextContent('Page');
    });
  });

  it('uses the shared breadcrumb and standard link style for Default UI results', () => {
    const result = createDefaultUiResult();
    document.body.appendChild(result);

    enhanceSearchResult(result);

    expect(
      result.querySelector('[data-search-result-breadcrumb]'),
    ).toHaveTextContent('Data > Explore');
    expect(result.querySelector('.pagefind-ui__result-link')).toHaveClass(
      'usa-link',
      'text-primary',
    );
    expect(result.querySelector('.shared-badge')).not.toBeInTheDocument();
  });
});
