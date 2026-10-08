import assert from 'node:assert/strict';
import { addressStateZip, leadAddressZip, streetTailStateZip } from '../server/lib/addressZip.js';
import { labelZip } from '../utils/labelZip.js';
import { nominatimParts } from '../server/lib/geocodeParts.js';
import { trackedPropertyAddress } from '../utils/trackedPropertyAddress.js';

const cases = [
  ['123 Main St Vienna VA 22182', 'VA', '22182'],
  ['8100 Boone Blvd, Suite 400, Vienna, VA 22182', 'VA', '22182'],
  ['4521 Oak Ln Fairfax VA', 'VA', ''],
  ['12345 Elm Rd, Reston, VA 20190', 'VA', '20190'],
  ['14425 Rich Branch Drive, North Potomac, MD 20878', 'MD', '20878'],
  ['12345 Elm Rd, Reston, VA', 'VA', ''],
  ['12345 Elm Rd', '', ''],
  ['123 Main St, Vienna, va, 22182-1234', 'VA', '22182'],
  ['123 Main St, Vienna, VA22182', 'VA', '22182'],
  ['123 Main St, Vienna, VA 221820', '', ''],
  ['500 Penn Ave Pittsburgh PA 15222, USA', 'PA', '15222'],
  ['12345 Elm Rd, Reston, VA 20190 United States', 'VA', '20190'],
];
for (const [address, state, zip] of cases) {
  assert.deepEqual(addressStateZip(address), { state, zip }, address);
  assert.equal(leadAddressZip(address), zip, address);
}
assert.equal(leadAddressZip(cases[4][0], '14425'), '20878');
assert.equal(leadAddressZip('12345 Elm Rd, Reston, VA', '12345'), '');
assert.equal(leadAddressZip('123 Main St', '22182-1234'), '22182');
assert.equal(leadAddressZip('123 Main St', 'invalid'), '');
assert.equal(leadAddressZip('123 Main St', 22182 as unknown), '22182');
assert.equal(leadAddressZip(undefined, undefined), '');
assert.equal(leadAddressZip(null, 20190 as unknown), '20190');

// The hail map's Track property: the ZIP of the geocoder's label (Census or Nominatim), never the house number.
const labels: Array<[string, string]> = [
  ['12001 FAIRFAX LN, FAIRFAX, VA, 22030', '22030'],
  ['12001, Fairfax Lane, Fair Lakes, Fairfax County, Virginia, 22030, United States', '22030'],
  ['Fairfax, Fairfax County, Virginia, 22030, United States', '22030'],
  ['123 Main St, Vienna, VA 22182, USA', '22182'],
  ['123 Main St, Vienna, VA 22182-1234', '22182'],
  ['22030', '22030'],
  ['12345 Elm Rd', ''],
  ['12345, Elm Road, Reston, Fairfax County, Virginia, United States', ''],
  ['Herndon, Fairfax County, Virginia, United States', ''],
  ['NewEra Medical Aesthetics & Lasers, 8100, Boone Boulevard, Vienna, Fairfax County, Virginia, 22182, United States', '22182'],
  ['22030, Fairfax County, Virginia, United States', ''],
  ['', ''],
];
for (const [label, zip] of labels) assert.equal(labelZip(label), zip, label);
assert.equal(labelZip(undefined), '');
// A ZIP search: Nominatim's label starts with the ZIP searched (read 10/7 10:19 PM ET from nominatim.openstreetmap.org).
assert.equal(labelZip('22030, Fairfax County, Virginia, United States', true), '22030');
assert.equal(labelZip('Fairfax, Fairfax County, Virginia, 22030, United States', true), '22030');
assert.equal(labelZip('12001, Fairfax Lane, Fairfax County, Virginia, 22030, United States', false), '22030');

// The GroupMe bot: the words after a street. The ZIP right after a named state (spelled out too, words after it
// allowed); with no state, the first five digits; never another address's number after the state.
const tails: Array<[string, { state?: string; zip?: string; cutoff: number } | null]> = [
  [' Vienna VA 22182', { state: 'VA', zip: '22182', cutoff: 8 }],
  [', Vienna, VA, 22182 got hit last week', { state: 'VA', zip: '22182', cutoff: 10 }],
  [' Fairfax Virginia 22030', { state: 'VA', zip: '22030', cutoff: 9 }],
  [' Silver Spring, Maryland 20901 hail?', { state: 'MD', zip: '20901', cutoff: 16 }],
  [' Fairfax VA got hit, 12345 Elm too', { state: 'VA', zip: undefined, cutoff: 9 }],
  [' Vienna 22182', { zip: '22182', cutoff: 8 }],
  [' Washington District  of  Columbia 20001', { state: 'DC', zip: '20001', cutoff: 12 }],
  [' got hit yesterday', null],
];
for (const [tail, want] of tails) assert.deepEqual(streetTailStateZip(tail), want, tail);

// The geocode route's Nominatim parts, and what Track property saves (the Nominatim answers as read from nominatim.openstreetmap.org on 10/7).
const business = { amenity: 'NewEra Medical Aesthetics & Lasers', house_number: '8100', road: 'Boone Boulevard', town: 'Vienna', county: 'Fairfax County', state: 'Virginia', 'ISO3166-2-lvl4': 'US-VA', postcode: '22182', country: 'United States', country_code: 'us' };
const zipOnly = { postcode: '22030', county: 'Fairfax County', state: 'Virginia', 'ISO3166-2-lvl4': 'US-VA', country: 'United States', country_code: 'us' };
const town = { town: 'Herndon', county: 'Fairfax County', state: 'Virginia', 'ISO3166-2-lvl4': 'US-VA', country: 'United States', country_code: 'us' };
assert.deepEqual(nominatimParts(business), { street: '8100 Boone Boulevard', city: 'Vienna', state: 'VA', zip: '22182' });
assert.deepEqual(nominatimParts(zipOnly), { street: '', city: '', state: 'VA', zip: '22030' });
assert.deepEqual(nominatimParts(town), { street: '', city: 'Herndon', state: 'VA', zip: '' });
assert.deepEqual(nominatimParts({ city: 'Baltimore', 'ISO3166-2-lvl4': 'US-MD', postcode: '21201-1234' }), { street: '', city: 'Baltimore', state: 'MD', zip: '21201' });
assert.deepEqual(nominatimParts(undefined), { street: '', city: '', state: '', zip: '' });
const businessLabel = 'NewEra Medical Aesthetics & Lasers, 8100, Boone Boulevard, Vienna, Fairfax County, Virginia, 22182, United States';
assert.deepEqual(trackedPropertyAddress(businessLabel, false, nominatimParts(business)), { address: '8100 Boone Boulevard', city: 'Vienna', state: 'VA', zipCode: '22182' });
assert.deepEqual(trackedPropertyAddress('22030, Fairfax County, Virginia, United States', true, nominatimParts(zipOnly)), { address: '22030', city: '', state: 'VA', zipCode: '22030' });
assert.deepEqual(trackedPropertyAddress('Herndon, Fairfax County, Virginia, United States', false, nominatimParts(town)), { address: 'Herndon', city: 'Herndon', state: 'VA', zipCode: '' });
// A Census label has no parts: split as before.
assert.deepEqual(trackedPropertyAddress('12001 FAIRFAX LN, FAIRFAX, VA, 22030', false, null), { address: '12001 FAIRFAX LN', city: 'FAIRFAX', state: 'VA', zipCode: '22030' });
assert.deepEqual(trackedPropertyAddress('22030', true), { address: '22030', city: '', state: '', zipCode: '22030' });
console.log(`PASS: ${cases.length} one-line addresses, 7 separate-field cases, ${labels.length + 4} map labels, ${tails.length} bot tails, 5 Nominatim answers, 5 tracked properties`);
