export function SearchInput() {
  const openSearchModal = () => {
    window.dispatchEvent(new CustomEvent("bdc:open-search-modal"));
  };

  return (
    <div className="padding-y-2">
      <button type="button" className="usa-button usa-button--outline width-full text-no-wrap margin-0 display-flex flex-align-center flex-justify-center" aria-label="Open search" onClick={openSearchModal}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "0.5rem" }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Search Site
      </button>
    </div>
  );
}
