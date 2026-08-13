import { getBreadcrumbLabel } from '../util/get-breadcrumb-label';

type SearchModalElement = HTMLElement & {
  open?: () => void;
};

type WindowWithSearchModalFlag = Window & {
  bdcSearchModalReady?: boolean;
};

const BREADCRUMB_CLASSNAME =
  'pf-result-breadcrumb text-base-dark font-body-xs text-bold margin-top-05 margin-bottom-1';

function getSearchModal(): SearchModalElement | null {
  return document.querySelector('pagefind-modal[instance="site-modal"]');
}

function upsertModalResultBreadcrumb(link: Element): void {
  if (!(link instanceof HTMLAnchorElement)) return;

  const breadcrumbLabel = getBreadcrumbLabel(link.href, window.location.origin);
  if (!breadcrumbLabel) return;

  const resultContent = link.closest('.pf-result-content');
  if (!resultContent) return;

  let breadcrumb = resultContent.querySelector('.pf-result-breadcrumb');
  if (!breadcrumb) {
    breadcrumb = document.createElement('p');
    breadcrumb.className = BREADCRUMB_CLASSNAME;

    const title = link.closest('.pf-result-title');
    if (title?.parentNode) {
      title.parentNode.insertBefore(breadcrumb, title.nextSibling);
    } else {
      resultContent.appendChild(breadcrumb);
    }
  }

  if (breadcrumb.textContent !== breadcrumbLabel) {
    breadcrumb.textContent = breadcrumbLabel;
  }
}

function updateModalBreadcrumbs(modal: SearchModalElement): void {
  modal.querySelectorAll('.pf-result-link').forEach((link) => {
    upsertModalResultBreadcrumb(link);
  });
}

function initModalBreadcrumbObserver(modal: SearchModalElement): void {
  if (modal.dataset.breadcrumbObserverReady) return;

  modal.dataset.breadcrumbObserverReady = 'true';
  const observer = new MutationObserver(() => {
    updateModalBreadcrumbs(modal);
  });
  observer.observe(modal, { childList: true, subtree: true });
}

function openSearchModal(): void {
  const modal = getSearchModal();
  if (!modal || typeof modal.open !== 'function') return;
  modal.open();
}

function handleSearchModalEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  const modal = getSearchModal();
  if (!modal?.contains(target)) return;

  const query = target.value.trim();
  if (!query) return;

  event.preventDefault();
  window.location.href = `/search?q=${encodeURIComponent(query)}`;
}

function initSearchModal(): void {
  const globalWindow = window as WindowWithSearchModalFlag;
  if (globalWindow.bdcSearchModalReady) return;
  globalWindow.bdcSearchModalReady = true;

  window.addEventListener('bdc:open-search-modal', openSearchModal);
  document.addEventListener('keydown', handleSearchModalEnter);

  const modal = getSearchModal();
  if (!modal) return;

  initModalBreadcrumbObserver(modal);
  updateModalBreadcrumbs(modal);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearchModal);
} else {
  initSearchModal();
}

document.addEventListener('astro:page-load', initSearchModal);
