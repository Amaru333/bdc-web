import { getBreadcrumbLabel } from '../util/get-breadcrumb-label';

const RESULT_SELECTOR = '.pf-result, .pagefind-ui__result';
const LINK_SELECTOR = '.pf-result-link, .pagefind-ui__result-link';
const SEARCH_NO_RESULTS_HELPER_SELECTOR = '#search-no-results-suggestions';
const SEARCH_MESSAGE_SELECTOR = '.pagefind-ui__message';

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
  const observer = new MutationObserver(() => enhanceSearchResults(container));
  observer.observe(container, { childList: true, subtree: true });
  enhanceSearchResults(container);
}
