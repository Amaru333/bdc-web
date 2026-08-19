import {
  observeSearchNoResultsSuggestions,
  observeSearchResults,
} from './enhance-search-results';

declare const PagefindUI:
  | undefined
  | (new (options: {
      element: string;
      showSubResults: boolean;
      showImages: boolean;
      pageSize: number;
      translations: { placeholder: string };
    }) => { triggerSearch: (query: string) => void });

function initSearchResults(): void {
  const container = document.querySelector('#search-results');
  if (!(container instanceof HTMLElement)) return;
  if (container.dataset.pagefindReady || typeof PagefindUI === 'undefined') {
    return;
  }
  container.dataset.pagefindReady = 'true';

  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');

  const pagefind = new PagefindUI({
    element: '#search-results',
    showSubResults: true,
    showImages: false,
    pageSize: 10,
    translations: {
      placeholder: 'Search site...',
    },
  });

  observeSearchResults(container);
  observeSearchNoResultsSuggestions(container);

  if (query) {
    pagefind.triggerSearch(query);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearchResults);
} else {
  initSearchResults();
}

document.addEventListener('astro:page-load', initSearchResults);
