/**
 * Resultater skal aktivt "udgives" af en admin, før de vises offentligt.
 * Ældre afdelinger har ikke flaget sat — de betragtes som udgivne, hvis de
 * allerede har gemte resultater (bagudkompatibilitet).
 */
export function isResultsPublished(settings: any): boolean {
  if (!settings) return false;
  if (typeof settings.results_published === "boolean") return settings.results_published;
  return Array.isArray(settings.results) && settings.results.length > 0;
}
