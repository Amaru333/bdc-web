# Site Card Components

App-local card components for `@bdc/site`.

## Reuse Guidance

- Use `PersonIdentityRow.astro` for any card/UI that shows a person avatar next to name/title text.
- Avoid duplicating avatar + initials fallback + image optimization logic in individual cards.
- Current implementations using this pattern:
  - `ProfileCard.astro`
  - `TestonomialCard.astro`
