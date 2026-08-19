import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enhanceSearchResult,
  observeSearchNoResultsSuggestions,
  observeSearchResults,
  syncSearchNoResultsSuggestions,
} from './enhance-search-results';

function renderTemplates() {
  document.body.innerHTML = `
    <template id="search-result-badge-template">
      <span class="shared-badge">Page</span>
    </template>
    <template id="search-result-breadcrumb-template">
      <p data-search-result-breadcrumb></p>
    </template>
    <div id="search-results-layout">
      <aside id="search-results-filters" hidden></aside>
      <div>
        <div id="search-results-toolbar" hidden></div>
        <div id="search-results"></div>
      </div>
    </div>
  `;
}

function createObservedResultsContainer() {
  const layout = document.querySelector('#search-results-layout');
  const container = document.querySelector('#search-results');
  const results = document.createElement('ol');

  if (!(layout instanceof HTMLElement) || !(container instanceof HTMLElement)) {
    throw new Error('Search results layout is missing from the test DOM');
  }

  container.appendChild(results);
  observeSearchResults(container);
  return { container, results };
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

function renderNoResultsHelper() {
  const helper = document.createElement('aside');
  helper.id = 'search-no-results-suggestions';
  helper.hidden = true;
  document.body.appendChild(helper);
  return helper;
}

function createNamedResult(title: string, href: string) {
  const result = document.createElement('li');
  result.className = 'pf-result';
  result.innerHTML = `
    <a class="pf-result-link" href="${href}">${title}</a>
    <div data-search-result-breadcrumb-slot></div>
    <p data-search-result-badge-slot></p>
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
    const { results } = createObservedResultsContainer();

    const result = createResult();
    results.appendChild(result);
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

  it('shows the search-page suggestions when Pagefind returns no results', () => {
    const helper = renderNoResultsHelper();
    const container = document.createElement('div');
    container.innerHTML = `
      <p class="pagefind-ui__message">No results found for "orchid"</p>
    `;

    syncSearchNoResultsSuggestions(container);

    expect(helper).not.toHaveAttribute('hidden');
  });

  it('hides the search-page suggestions when Pagefind returns results', () => {
    const helper = renderNoResultsHelper();
    const container = document.createElement('div');
    container.innerHTML = `
      <p class="pagefind-ui__message">No results found for "orchid"</p>
      <ol>
        <li class="pagefind-ui__result">Result</li>
      </ol>
    `;

    syncSearchNoResultsSuggestions(container);

    expect(helper).toHaveAttribute('hidden');
  });

  it('updates the search-page suggestions as the search results change', async () => {
    const helper = renderNoResultsHelper();
    const container = document.createElement('div');
    document.body.appendChild(container);
    observeSearchNoResultsSuggestions(container);

    container.innerHTML = `
      <p class="pagefind-ui__message">No results found for "orchid"</p>
    `;

    await vi.waitFor(() => {
      expect(helper).not.toHaveAttribute('hidden');
    });
  });

  it('renders section filters from the current search results', async () => {
    const { results } = createObservedResultsContainer();
    results.appendChild(
      createNamedResult('Alpha update', '/news/latest-updates/alpha'),
    );
    results.appendChild(createNamedResult('Explore data', '/data/explore'));

    await vi.waitFor(() => {
      expect(
        document.querySelector('#search-results-filters'),
      ).not.toHaveAttribute('hidden');
      expect(
        document.querySelector('#search-results-toolbar'),
      ).not.toHaveAttribute('hidden');
    });

    expect(document.body).toHaveTextContent('Section');
    expect(document.body).toHaveTextContent('Data');
    expect(document.body).toHaveTextContent('News');
  });

  it('filters visible results when a section checkbox is selected', async () => {
    const { results } = createObservedResultsContainer();
    const newsResult = createNamedResult(
      'Alpha update',
      '/news/latest-updates/alpha',
    );
    const dataResult = createNamedResult('Explore data', '/data/explore');
    results.appendChild(newsResult);
    results.appendChild(dataResult);

    const newsFilter = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(
        '#search-filter-news',
      );
      expect(input).toBeInTheDocument();
      if (!input) {
        throw new Error('Expected #search-filter-news to be in the document');
      }
      return input;
    });

    newsFilter.checked = true;
    newsFilter.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(newsResult.hidden).toBe(false);
      expect(dataResult.hidden).toBe(true);
    });

    expect(window.location.search).toContain('section=News');
  });

  it('sorts results alphabetically when title sort is selected', async () => {
    const { results } = createObservedResultsContainer();
    results.appendChild(createNamedResult('Zebra guide', '/help/zebra-guide'));
    results.appendChild(
      createNamedResult('Alpha update', '/news/alpha-update'),
    );

    const sortSelect = await vi.waitFor(() => {
      const select = document.querySelector<HTMLSelectElement>(
        '#search-results-sort',
      );
      expect(select).toBeInTheDocument();
      if (!select) {
        throw new Error('Expected #search-results-sort to be in the document');
      }
      return select;
    });

    sortSelect.value = 'title-asc';
    sortSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const titles = Array.from(
        document.querySelectorAll('.pf-result-link'),
      ).map((link) => link.textContent);
      expect(titles).toEqual(['Alpha update', 'Zebra guide']);
    });

    expect(window.location.search).toContain('sort=title-asc');
  });
});
