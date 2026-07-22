export function SearchInput() {
  const openSearchModal = () => {
    window.dispatchEvent(new CustomEvent('bdc:open-search-modal'));
  };

  return (
    <div className="padding-y-2">
      <button
        type="button"
        className="usa-button usa-button--unstyled width-full text-no-wrap"
        aria-label="Open search"
        onClick={openSearchModal}
      >
        Search
      </button>
    </div>
  );
}
