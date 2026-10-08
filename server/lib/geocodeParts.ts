/** An address in parts, as the hail map's Track property saves it. */
export interface GeocodeParts {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * The parts of a Nominatim answer (`addressdetails=1`), 2026-10-07. The
 * geocode route's fallback answered with the label only ("NewEra Medical
 * Aesthetics & Lasers, 8100, Boone Boulevard, Vienna, Fairfax County,
 * Virginia, 22182, United States"), and the hail map took its first three
 * comma parts for the street, city and state: a business name, 8100 and
 * Boone. The state is the two-letter code (ISO3166-2-lvl4 "US-VA"); the ZIP
 * is the postcode's first five digits. A part Nominatim does not give is ''.
 */
export function nominatimParts(address: unknown): GeocodeParts {
  const a = (address && typeof address === 'object' ? address : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return {
    street: [text(a.house_number), text(a.road)].filter(Boolean).join(' '),
    city: text(a.city) || text(a.town) || text(a.village) || text(a.hamlet) || text(a.suburb),
    state: text(a['ISO3166-2-lvl4']).match(/^US-([A-Z]{2})$/)?.[1] || '',
    zip: text(a.postcode).match(/^(\d{5})(?:-\d{4})?$/)?.[1] || '',
  };
}
