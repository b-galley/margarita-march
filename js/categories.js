// Single source of truth for scoring categories. DEFAULT_SCORES is derived from this list
// rather than hand-maintained, so the two structures can never drift out of sync — that
// mismatch was a standing risk in the old app (see ARCHITECTURE.md there).
export const CATEGORIES = [
  { key: 'pour', label: 'The Pour', sublabel: 'Tequila quality & generosity of the pour' },
  { key: 'balance', label: 'The Balance', sublabel: 'Sweet/sour/salt balance — is it dialed in?' },
  { key: 'rim', label: 'The Rim', sublabel: 'Salt/sugar rim, garnish, presentation' },
  { key: 'value', label: 'The Value', sublabel: '1 = highway robbery, 10 = absolute steal' },
  { key: 'vibe', label: 'The Vibe', sublabel: 'Atmosphere & overall stop experience' },
  { key: 'wildcard', label: 'The Wildcard', sublabel: 'Food/snack option, or anything else worth noting' },
];

export const DEFAULT_SCORES = Object.fromEntries(CATEGORIES.map((c) => [c.key, 7]));
