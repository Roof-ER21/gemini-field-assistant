/**
 * The ZIP of a geocoder's label (the hail map's Track property, 2026-10-07):
 * the last comma part, after the first, that ends in five digits. The
 * server's /hail/geocode answers with the Census label ("12001 FAIRFAX LN,
 * FAIRFAX, VA, 22030") or, when Census has no match, with Nominatim's
 * ("12001, Fairfax Lane, Fairfax County, Virginia, 22030, United States").
 * The ZIP was read from the last part only, so every Nominatim label (a ZIP
 * or city search among them) saved the property with no ZIP. The first part
 * is the street or a bare house number, never the ZIP; a label that is only
 * a ZIP is its own.
 */
export function labelZip(label: unknown): string {
  const parts = String(label ?? '').split(',').map((part) => part.trim());
  for (let i = parts.length - 1; i >= 1; i--) {
    const zip = parts[i].match(/(?:^|\s)(\d{5})(?:-\d{4})?$/)?.[1];
    if (zip) return zip;
  }
  return parts.length === 1 ? parts[0].match(/^(\d{5})(?:-\d{4})?$/)?.[1] || '' : '';
}
