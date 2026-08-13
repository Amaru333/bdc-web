import { getBreadcrumbLabel } from '../util/get-breadcrumb-label';

declare const PagefindUI:
  | undefined
  | (new (options: {
      element: string;
      showSubResults: boolean;
      showImages: boolean;
      translations: { placeholder: string };
    }) => { triggerSearch: (query: string) => void });

const BREADCRUMB_CLASSNAME =
  'pagefind-ui__result-breadcrumb text-base-dark font-body-xs text-bold margin-top-05 margin-bottom-1';

function upsertResultBreadcrumb(link: Element): void {
  if (!(link instanceof HTMLAnchorElement)) return;

  const breadcrumbLabel = getBreadcrumbLabel(link.href, window.location.origin);
  if (!breadcrumbLabel) return;

  const result = link.closest('.pagefind-ui__result');
  if (!result) return;

  let breadcrumb = result.querySelector('.pagefind-ui__result-breadcrumb');
  if (!breadcrumb) {
    breadcrumb = document.createElement('p');
    breadcrumb.className = BREADCRUMB_CLASSNAME;

    const title = link.closest('.pagefind-ui__result-title');
    if (title?.parentNode) {
      title.parentNode.insertBefore(breadcrumb, title.nextSibling);
    } else {
      const firstExcerpt = result.querySelector('.pagefind-ui__result-excerpt');
      if (firstExcerpt?.parentNode) {
        firstExcerpt.parentNode.insertBefore(breadcrumb, firstExcerpt);
      } else {
        result.appendChild(breadcrumb);
      }
    }
  }

  if (breadcrumb.textContent !== breadcrumbLabel) {
    breadcrumb.textContent = breadcrumbLabel;
  }
}

function updateSearchBreadcrumbs(container: HTMLElement): void {
  container.querySelectorAll('.pagefind-ui__result-link').forEach((link) => {
    upsertResultBreadcrumb(link);
  });
}

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
    translations: {
      placeholder: 'Search site...',
    },
  });

  if (query) {
    pagefind.triggerSearch(query);
  }

  if (!container.dataset.breadcrumbObserverReady) {
    container.dataset.breadcrumbObserverReady = 'true';
    const observer = new MutationObserver(() => {
      updateSearchBreadcrumbs(container);
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  updateSearchBreadcrumbs(container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearchResults);
} else {
  initSearchResults();
}

document.addEventListener('astro:page-load', initSearchResults);
