import { getBreadcrumbLabel } from '../util/get-breadcrumb-label';

const SEARCH_RESULTS_LAYOUT_SELECTOR = '#search-results-layout';
const SEARCH_RESULTS_FILTERS_SELECTOR = '#search-results-filters';
const SEARCH_RESULTS_TOOLBAR_SELECTOR = '#search-results-toolbar';
const RESULT_SELECTOR = '.pf-result, .pagefind-ui__result';
const LINK_SELECTOR = '.pf-result-link, .pagefind-ui__result-link';
const SEARCH_NO_RESULTS_HELPER_SELECTOR = '#search-no-results-suggestions';
const SEARCH_MESSAGE_SELECTOR = '.pagefind-ui__message';
const SEARCH_SECTION_PARAM = 'section';
const SEARCH_SORT_PARAM = 'sort';

type SortOption = 'relevance' | 'title-asc' | 'title-desc' | 'section-asc';

type SearchResultMeta = {
  element: HTMLElement;
  title: string;
  breadcrumb: string;
  section: string;
  originalIndex: number;
};

const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Best match',
  'title-asc': 'Title (A-Z)',
  'title-desc': 'Title (Z-A)',
  'section-asc': 'Section (A-Z)',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getFiltersElement(): HTMLElement | null {
  const filters = document.querySelector(SEARCH_RESULTS_FILTERS_SELECTOR);
  return filters instanceof HTMLElement ? filters : null;
}

function getToolbarElement(): HTMLElement | null {
  const toolbar = document.querySelector(SEARCH_RESULTS_TOOLBAR_SELECTOR);
  return toolbar instanceof HTMLElement ? toolbar : null;
}

function getLayoutElement(): HTMLElement | null {
  const layout = document.querySelector(SEARCH_RESULTS_LAYOUT_SELECTOR);
  return layout instanceof HTMLElement ? layout : null;
}

function getResultElements(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll(RESULT_SELECTOR)).filter(
    (result): result is HTMLElement => result instanceof HTMLElement,
  );
}

function getResultTitle(result: Element): string {
  const link = result.querySelector(LINK_SELECTOR);
  return link?.textContent?.trim() ?? '';
}

function getResultBreadcrumb(result: Element): string {
  const breadcrumb = result.querySelector(
    '[data-search-result-breadcrumb-slot]',
  );
  return breadcrumb?.textContent?.trim() ?? '';
}

function getResultSection(result: Element): string {
  const breadcrumb = getResultBreadcrumb(result);
  return breadcrumb.split(' > ')[0]?.trim() ?? '';
}

function parseSortOption(value: string | null): SortOption {
  if (
    value === 'relevance' ||
    value === 'title-asc' ||
    value === 'title-desc' ||
    value === 'section-asc'
  ) {
    return value;
  }

  return 'relevance';
}

function getSearchStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    selectedSections: new Set(
      params
        .getAll(SEARCH_SECTION_PARAM)
        .map((section) => section.trim())
        .filter(Boolean),
    ),
    sort: parseSortOption(params.get(SEARCH_SORT_PARAM)),
  };
}

function updateSearchStateInUrl(
  selectedSections: Set<string>,
  sort: SortOption,
): void {
  const url = new URL(window.location.href);

  url.searchParams.delete(SEARCH_SECTION_PARAM);
  selectedSections.forEach((section) => {
    url.searchParams.append(SEARCH_SECTION_PARAM, section);
  });

  if (sort === 'relevance') {
    url.searchParams.delete(SEARCH_SORT_PARAM);
  } else {
    url.searchParams.set(SEARCH_SORT_PARAM, sort);
  }

  window.history.replaceState({}, '', url);
}

function getSearchResultsMeta(container: Element): SearchResultMeta[] {
  return getResultElements(container).map((result, index) => {
    if (!result.dataset.searchOriginalIndex) {
      result.dataset.searchOriginalIndex = String(index);
    }

    return {
      element: result,
      title: getResultTitle(result),
      breadcrumb: getResultBreadcrumb(result),
      section: getResultSection(result),
      originalIndex: Number(result.dataset.searchOriginalIndex),
    };
  });
}

function getResultsParent(container: Element): HTMLElement | null {
  const firstResult = container.querySelector(RESULT_SELECTOR);
  return firstResult?.parentElement instanceof HTMLElement
    ? firstResult.parentElement
    : null;
}

function syncResultOrder(
  resultsParent: HTMLElement,
  sortedResults: SearchResultMeta[],
): void {
  const currentOrder = Array.from(resultsParent.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const expectedOrder = sortedResults.map((result) => result.element);

  const orderAlreadyMatches =
    currentOrder.length === expectedOrder.length &&
    currentOrder.every((child, index) => child === expectedOrder[index]);

  if (orderAlreadyMatches) return;

  expectedOrder.forEach((result) => {
    resultsParent.appendChild(result);
  });
}

function sortSearchResults(
  results: SearchResultMeta[],
  sort: SortOption,
): SearchResultMeta[] {
  const sorted = [...results];

  const compareText = (a: string, b: string) => a.localeCompare(b, undefined);

  sorted.sort((left, right) => {
    switch (sort) {
      case 'title-asc':
        return (
          compareText(left.title, right.title) ||
          left.originalIndex - right.originalIndex
        );
      case 'title-desc':
        return (
          compareText(right.title, left.title) ||
          left.originalIndex - right.originalIndex
        );
      case 'section-asc':
        return (
          compareText(left.section || 'Other', right.section || 'Other') ||
          compareText(left.title, right.title) ||
          left.originalIndex - right.originalIndex
        );
      default:
        return left.originalIndex - right.originalIndex;
    }
  });

  return sorted;
}

function matchesSectionFilter(
  result: SearchResultMeta,
  selectedSections: Set<string>,
): boolean {
  if (selectedSections.size === 0) return true;
  return selectedSections.has(result.section);
}

function updateResultVisibility(
  results: SearchResultMeta[],
  selectedSections: Set<string>,
): number {
  let visibleCount = 0;

  results.forEach((result) => {
    const isVisible = matchesSectionFilter(result, selectedSections);
    result.element.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });

  return visibleCount;
}

function renderSearchFilters(
  filters: HTMLElement,
  results: SearchResultMeta[],
  selectedSections: Set<string>,
): void {
  const counts = new Map<string, number>();
  results.forEach((result) => {
    if (!result.section) return;
    counts.set(result.section, (counts.get(result.section) ?? 0) + 1);
  });

  const sectionOptions = Array.from(counts.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  const sectionMarkup =
    sectionOptions.length > 0
      ? sectionOptions
          .map(([section, count]) => {
            const id = `search-filter-${section
              .toLowerCase()
              .replaceAll(/[^a-z0-9]+/g, '-')}`;

            return `
              <div class="usa-checkbox margin-x-3">
                <input
                  class="usa-checkbox__input"
                  id="${id}"
                  name="search-filter-section"
                  type="checkbox"
                  value="${escapeHtml(section)}"
                  ${selectedSections.has(section) ? 'checked' : ''}
                />
                <label class="usa-checkbox__label font-ui-xs" for="${id}">
                  ${escapeHtml(section)}
                  <span class="text-base-light"> (${count})</span>
                </label>
              </div>
            `;
          })
          .join('')
      : '<p class="usa-hint font-body-xs margin-x-3 margin-y-0">Filters will appear when results are available.</p>';

  const clearAllMarkup =
    selectedSections.size > 0
      ? `
          <button
            type="button"
            class="usa-button usa-button--unstyled font-body-xs"
            data-clear-search-filters
          >
            Clear all
          </button>
        `
      : '';

  filters.innerHTML = `
    <div class="search-results-filters__panel border border-base-lighter radius-sm bg-white overflow-hidden">
      <div class="bg-base-lightest padding-x-3 padding-y-1 border-bottom border-base-lighter padding-top-2">
        <div class="display-flex flex-justify flex-align-center">
          <h2 class="search-results-filters__title margin-0 text-bold">Filters</h2>
          ${clearAllMarkup}
        </div>
      </div>
      <section class="padding-y-2" aria-labelledby="search-filter-section-heading">
        <h3 id="search-filter-section-heading" class="usa-legend text-bold margin-y-0 margin-x-3">
          Section
        </h3>
        <div class="margin-top-2">
          ${sectionMarkup}
        </div>
      </section>
    </div>
  `;

  filters.hidden = false;
}

function renderSearchToolbar(
  toolbar: HTMLElement,
  results: SearchResultMeta[],
  visibleCount: number,
  sort: SortOption,
): void {
  const countText =
    results.length === 0
      ? '0 matching pages'
      : visibleCount < results.length
        ? `Showing ${visibleCount} of ${results.length} matching pages`
        : `${results.length} matching pages`;

  toolbar.innerHTML = `
    <div class="search-results-toolbar__bar display-block tablet:display-flex tablet:flex-justify flex-align-center padding-x-3 padding-y-2 bg-base-lightest border border-base-lighter radius-sm margin-bottom-3">
      <span class="text-base margin-bottom-1 tablet:margin-bottom-0">
        ${countText}
      </span>
      <div class="display-flex flex-justify-center flex-align-end text-no-wrap">
        <label
          class="usa-label display-inline margin-right-1 margin-top-0"
          for="search-results-sort"
        >
          Sort by
        </label>
        <select
          class="usa-select display-inline width-full tablet:width-auto margin-top-0"
          id="search-results-sort"
        >
          ${Object.entries(SORT_LABELS)
            .map(
              ([value, label]) => `
                <option value="${value}" ${sort === value ? 'selected' : ''}>
                  ${label}
                </option>
              `,
            )
            .join('')}
        </select>
      </div>
    </div>
  `;

  toolbar.hidden = false;
}

function attachSearchControlsEvents(
  container: HTMLElement,
  layout: HTMLElement,
): void {
  if (layout.dataset.searchControlsBound) return;

  layout.dataset.searchControlsBound = 'true';

  layout.addEventListener('change', (event) => {
    const target = event.target;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return;
    }

    if (target.id === 'search-results-sort') {
      container.dataset.searchSort = parseSortOption(target.value);
      syncSearchResultsUi(container);
      return;
    }

    if (target.matches('.usa-checkbox__input')) {
      const selectedSections = new Set(
        Array.from(
          layout.querySelectorAll<HTMLInputElement>(
            '.usa-checkbox__input:checked',
          ),
        ).map((input) => input.value),
      );
      container.dataset.searchSections = JSON.stringify(
        Array.from(selectedSections),
      );
      syncSearchResultsUi(container);
    }
  });

  layout.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('[data-clear-search-filters]')) return;

    container.dataset.searchSections = '[]';
    syncSearchResultsUi(container);
  });
}

function getSearchControlsState(container: HTMLElement) {
  if (!container.dataset.searchControlsStateReady) {
    const state = getSearchStateFromUrl();
    container.dataset.searchSections = JSON.stringify(
      Array.from(state.selectedSections),
    );
    container.dataset.searchSort = state.sort;
    container.dataset.searchControlsStateReady = 'true';
  }

  const selectedSections = new Set<string>(
    JSON.parse(container.dataset.searchSections ?? '[]') as string[],
  );

  return {
    selectedSections,
    sort: parseSortOption(container.dataset.searchSort ?? null),
  };
}

function syncSearchResultsUi(container: HTMLElement): void {
  if (container.dataset.searchControlsSyncing === 'true') return;

  container.dataset.searchControlsSyncing = 'true';

  try {
    enhanceSearchResults(container);

    const filters = getFiltersElement();
    const toolbar = getToolbarElement();
    const layout = getLayoutElement();
    if (!filters || !toolbar || !layout) return;

    attachSearchControlsEvents(container, layout);

    const results = getSearchResultsMeta(container);
    const { selectedSections, sort } = getSearchControlsState(container);

    const availableSections = new Set(
      results.map((result) => result.section).filter(Boolean),
    );
    const normalizedSections = new Set(
      Array.from(selectedSections).filter((section) =>
        availableSections.has(section),
      ),
    );

    if (normalizedSections.size !== selectedSections.size) {
      container.dataset.searchSections = JSON.stringify(
        Array.from(normalizedSections),
      );
    }

    const resultsParent = getResultsParent(container);
    if (resultsParent) {
      syncResultOrder(resultsParent, sortSearchResults(results, sort));
    }

    const visibleCount = updateResultVisibility(results, normalizedSections);

    if (results.length === 0) {
      filters.hidden = true;
      toolbar.hidden = true;
      updateSearchStateInUrl(normalizedSections, sort);
      return;
    }

    renderSearchFilters(filters, results, normalizedSections);
    renderSearchToolbar(toolbar, results, visibleCount, sort);
    updateSearchStateInUrl(normalizedSections, sort);
  } finally {
    container.dataset.searchControlsSyncing = 'false';
  }
}

function cloneTemplateElement(templateId: string): HTMLElement | null {
  const template = document.querySelector(`#${templateId}`);
  if (!(template instanceof HTMLTemplateElement)) return null;

  const element = template.content.firstElementChild?.cloneNode(true);
  return element instanceof HTMLElement ? element : null;
}

export function enhanceSearchResult(result: Element): void {
  const link = result.querySelector(LINK_SELECTOR);
  if (!(link instanceof HTMLAnchorElement)) return;

  if (link.classList.contains('pagefind-ui__result-link')) {
    link.classList.add('usa-link', 'text-primary');
  }

  let breadcrumbSlot = result.querySelector(
    '[data-search-result-breadcrumb-slot]',
  );
  if (!breadcrumbSlot && result.classList.contains('pagefind-ui__result')) {
    breadcrumbSlot = document.createElement('div');
    breadcrumbSlot.setAttribute('data-search-result-breadcrumb-slot', '');

    const title = link.closest('.pagefind-ui__result-title');
    if (title?.parentNode) {
      title.parentNode.insertBefore(breadcrumbSlot, title.nextSibling);
    } else {
      result.appendChild(breadcrumbSlot);
    }
  }

  if (breadcrumbSlot && !breadcrumbSlot.hasChildNodes()) {
    const breadcrumb = cloneTemplateElement(
      'search-result-breadcrumb-template',
    );
    const label = getBreadcrumbLabel(link.href, window.location.origin);
    if (breadcrumb && label) {
      breadcrumb.textContent = label;
      breadcrumbSlot.appendChild(breadcrumb);
    }
  }

  const badgeSlot = result.querySelector('[data-search-result-badge-slot]');
  if (badgeSlot && !badgeSlot.hasChildNodes()) {
    const badge = cloneTemplateElement('search-result-badge-template');
    if (badge) {
      badgeSlot.appendChild(badge);
    }
  }
}

export function enhanceSearchResults(container: Element): void {
  container.querySelectorAll(RESULT_SELECTOR).forEach(enhanceSearchResult);
}

export function syncSearchNoResultsSuggestions(container: Element): void {
  const helper = document.querySelector(SEARCH_NO_RESULTS_HELPER_SELECTOR);
  if (!(helper instanceof HTMLElement)) return;

  const message = container.querySelector(SEARCH_MESSAGE_SELECTOR);
  const messageText = message?.textContent?.toLowerCase() ?? '';
  const hasResults = container.querySelector(RESULT_SELECTOR) !== null;

  helper.hidden = !(messageText.includes('no results') && !hasResults);
}

export function observeSearchNoResultsSuggestions(
  container: HTMLElement,
): void {
  if (container.dataset.searchNoResultsReady) return;

  container.dataset.searchNoResultsReady = 'true';
  const observer = new MutationObserver(() => {
    syncSearchNoResultsSuggestions(container);
  });
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  syncSearchNoResultsSuggestions(container);
}

export function observeSearchResults(container: HTMLElement): void {
  if (container.dataset.searchEnhancementsReady) return;

  container.dataset.searchEnhancementsReady = 'true';
  const observer = new MutationObserver(() => syncSearchResultsUi(container));
  observer.observe(container, { childList: true, subtree: true });
  syncSearchResultsUi(container);
}
