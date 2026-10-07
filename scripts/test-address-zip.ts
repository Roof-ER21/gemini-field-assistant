import assert from 'node:assert/strict';
import { addressStateZip, leadAddressZip } from '../server/lib/addressZip.js';

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
console.log(`PASS: ${cases.length} one-line addresses and 4 separate-field cases`);
