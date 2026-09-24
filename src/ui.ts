// Small, consistent interface symbols; game characters keep their pixel artwork.
const paths: Record<string, string> = {
  sword: '<path d="m4 20 5-5m-3-3 6 6M9 15 20 4l-1 6-7 7M4 17l3 3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  scroll: '<path d="M7 4h13v15H7a3 3 0 1 1 0-6V4Zm0 0H5a2 2 0 0 0-2 2v3h4m3-1h6m-6 4h6m-6 4h4"/>',
  camp: '<path d="m12 3 9 17H3L12 3Zm0 7-5 10m5-10 5 10"/>',
  star: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>',
  crown: '<path d="m3 6 5 4 4-6 4 6 5-4-2 12H5L3 6Zm2 15h14"/>',
  food: '<path d="M4 19V9c0-7 16-7 16 0v10H4ZM7 8l2 3m3-4 2 3m3-2 1 2"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  heart: '<path d="M12 20 3 11C-1 4 8 0 12 7c4-7 13-3 9 4l-9 9Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  eye: '<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  pack: '<path d="M7 7V5a5 3 0 0 1 10 0v2M5 7h14l2 14H3L5 7Zm3 6h8v5H8v-5Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
};
export function icon(name: string): string {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.star}</svg>`;
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
