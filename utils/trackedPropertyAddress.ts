import { labelZip } from './labelZip';

/** An address in parts, as /api/hail/geocode answers it for a Nominatim match (server/lib/geocodeParts.ts). */
export interface AddressParts {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * What the hail map's Track property saves for a searched place (2026-10-07).
 * A Nominatim match comes with its parts, and they are used; a Census label
 * ("12001 FAIRFAX LN, FAIRFAX, VA, 22030") has none, and its comma parts are
 * the street, city and state, as before. The ZIP falls back to the label's
 * (labelZip). Until now every label was split, so a Nominatim one gave a
 * business name for the street, a house number for the city and a road for
 * the state.
 */
export function trackedPropertyAddress(label: string, postalCode: boolean, parts?: AddressParts | null) {
  const split = label.split(',').map((part) => part.trim());
  return {
    address: parts?.street || split[0] || label,
    city: parts ? parts.city : split[1] || '',
    state: parts ? parts.state : postalCode ? '' : split[2]?.split(' ')[0] || '',
    zipCode: parts?.zip || labelZip(label, postalCode),
  };
}
