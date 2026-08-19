import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enhanceSearchResult,
  initSearchResultsControls,
  observeSearchNoResultsSuggestions,
  renderSearchResultsView,
  type SearchResultRecord,
  setSearchResultsState,
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
        <div id="search-results">
          <p id="search-results-message" class="search-results-message"></p>
          <ol id="search-results-list" class="search-results-list"></ol>
        </div>
        <nav id="search-results-pagination" hidden></nav>
      </div>
    </div>
  `;
}

function getSearchContainer() {
  const container = document.querySelector('#search-results');
  if (!(container instanceof HTMLElement)) {
    throw new Error('Search results container is missing from the test DOM');
  }
  return container;
}

function mountSearchResults(records: SearchResultRecord[]) {
  const container = getSearchContainer();
  initSearchResultsControls(container);
  setSearchResultsState(container, records, 'example');
  renderSearchResultsView(container);
  return container;
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

function createRecord(
  title: string,
  href: string,
  originalIndex: number,
): SearchResultRecord {
  return {
    title,
    url: href,
    excerpt: '',
    originalIndex,
  };
}

describe('search result enhancements', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/search');
    renderTemplates();
  });

  it('uses shared templates for the page badge and breadcrumb', () => {
    const result = createResult();
    document.body.appendChild(result);

    enhanceSearchResult(result);

    expect(result.querySelector('.shared-badge')).toHaveTextContent('Page');
    expect(
      result.querySelector('[data-search-result-breadcrumb]'),
    ).toHaveTextContent('News > Latest Updates > Example');
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

  it('shows the search-page suggestions when there are no results', () => {
    const helper = renderNoResultsHelper();
    const container = getSearchContainer();

    syncSearchNoResultsSuggestions(container, 'orchid', 0);

    expect(helper).not.toHaveAttribute('hidden');
  });

  it('hides the search-page suggestions when results are available', () => {
    const helper = renderNoResultsHelper();
    const container = getSearchContainer();

    syncSearchNoResultsSuggestions(container, 'orchid', 3);

    expect(helper).toHaveAttribute('hidden');
  });

  it('updates the search-page suggestions as the search results change', async () => {
    const helper = renderNoResultsHelper();
    const container = getSearchContainer();
    observeSearchNoResultsSuggestions(container);

    syncSearchNoResultsSuggestions(container, 'orchid', 0);

    await vi.waitFor(() => {
      expect(helper).not.toHaveAttribute('hidden');
    });
  });

  it('renders section filters from all search results', async () => {
    mountSearchResults([
      createRecord('Alpha update', '/news/latest-updates/alpha', 0),
      createRecord('Explore data', '/data/explore', 1),
    ]);

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

  it('filters all loaded results before paginating', async () => {
    const records = [
      createRecord('Explore data', '/data/explore', 0),
      ...Array.from({ length: 11 }, (_, index) =>
        createRecord(
          `News item ${index + 1}`,
          `/news/latest-updates/item-${index + 1}`,
          index + 1,
        ),
      ),
    ];

    mountSearchResults(records);

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
      expect(document.body).toHaveTextContent(
        'Showing 11 of 12 matching pages',
      );
      expect(
        document.querySelectorAll('#search-results-list .pagefind-ui__result-link'),
      ).toHaveLength(10);
      expect(document.body).toHaveTextContent('Page 1 of 2');
    });

    const nextPage = document.querySelector<HTMLButtonElement>(
      '[data-search-page="next"]',
    );
    expect(nextPage).toBeInTheDocument();
    nextPage?.click();

    await vi.waitFor(() => {
      expect(
        document.querySelectorAll('#search-results-list .pagefind-ui__result-link'),
      ).toHaveLength(1);
      expect(document.body).toHaveTextContent('Page 2 of 2');
    });

    expect(window.location.search).toContain('section=News');
  });

  it('sorts all loaded results before paginating', async () => {
    mountSearchResults([
      createRecord('Zebra guide', '/help/zebra-guide', 0),
      createRecord('Alpha update', '/news/alpha-update', 1),
      createRecord('Beta update', '/news/beta-update', 2),
    ]);

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
        document.querySelectorAll('#search-results-list .pagefind-ui__result-link'),
      ).map((link) => link.textContent);
      expect(titles).toEqual(['Alpha update', 'Beta update', 'Zebra guide']);
    });

    expect(window.location.search).toContain('sort=title-asc');
  });
});
