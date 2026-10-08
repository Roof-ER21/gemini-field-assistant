import assert from 'node:assert/strict';
import { addressStateZip, leadAddressZip, streetTailStateZip } from '../server/lib/addressZip.js';
import { labelZip } from '../utils/labelZip.js';

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
  ['', ''],
];
for (const [label, zip] of labels) assert.equal(labelZip(label), zip, label);
assert.equal(labelZip(undefined), '');

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
console.log(`PASS: ${cases.length} one-line addresses, 7 separate-field cases, ${labels.length + 1} map labels, ${tails.length} bot tails`);
