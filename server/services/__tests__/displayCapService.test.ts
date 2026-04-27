/**
 * displayCapService — adjuster-credibility cap algorithm tests
 *
 * Locks the algorithm rules from the 2026-04-27 storm-app meeting + same-day
 * afternoon addendum (strict bucketing, primary-source filter, polygon
 * render quality). The cap function itself is the safety net; bucketing
 * and source filtering are the actual fixes upstream of this — but the
 * cap still has to round-trip every adjuster-facing magnitude correctly.
 *
 * Run: npx vitest run server/services/__tests__/displayCapService.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  displayHailInches,
  computeConsensusSize,
  isSterlingClassStorm,
  buildBandVerification,
  type VerificationContext,
  type BandReport,
} from '../displayCapService.js';

const verified: VerificationContext = {
  isVerified: true,
  isAtLocation: true,
  isSterlingClass: false,
};
const unverified: VerificationContext = {
  isVerified: false,
  isAtLocation: false,
  isSterlingClass: false,
};
const sterling: VerificationContext = {
  isVerified: true,
  isAtLocation: true,
  isSterlingClass: true,
};

describe('displayHailInches — algorithm rules', () => {
  it('< 0.25 raw → null (suppress radar noise)', () => {
    expect(displayHailInches(0.001, verified)).toBeNull();
    expect(displayHailInches(0.2, verified)).toBeNull();
    expect(displayHailInches(0.249, verified)).toBeNull();
  });

  it('0.25 – 0.74 raw → 0.75 floor', () => {
    expect(displayHailInches(0.25, verified)).toBe(0.75);
    expect(displayHailInches(0.4, verified)).toBe(0.75);
    expect(displayHailInches(0.5, unverified)).toBe(0.75);
    expect(displayHailInches(0.74, verified)).toBe(0.75);
  });

  it('0.75 – 2.00 raw → quarter-snapped pass-through', () => {
    expect(displayHailInches(0.75, verified)).toBe(0.75);
    expect(displayHailInches(1.25, unverified)).toBe(1.25);
    expect(displayHailInches(1.5, unverified)).toBe(1.5);
    expect(displayHailInches(1.78, verified)).toBe(1.75);
    expect(displayHailInches(2.0, unverified)).toBe(2.0);
  });

  it('2.01 – 2.50 raw → 2.0 unless verified+at-location', () => {
    expect(displayHailInches(2.3, verified)).toBe(2.25);
    expect(displayHailInches(2.3, unverified)).toBe(2.0);
    expect(displayHailInches(2.5, unverified)).toBe(2.0);
  });

  it('> 2.50 raw → 2.0 / 2.5 / 3.0 ceiling per Sterling-class', () => {
    // Silver Charm Place 2025-07-16 case — 4" verified non-Sterling → 2.5
    expect(displayHailInches(4.0, verified)).toBe(2.5);
    // Same address unverified → 2.0
    expect(displayHailInches(4.0, unverified)).toBe(2.0);
    // Sterling-class 2024-08-29 outbreak — verified → snapped, hard cap 3.0
    expect(displayHailInches(2.75, sterling)).toBe(2.75);
    expect(displayHailInches(3.5, sterling)).toBe(3.0);
    // Non-Sterling 2.7 verified → 2.5
    expect(displayHailInches(2.7, verified)).toBe(2.5);
  });

  it('consensus override beats raw-based cap in [0.75, 2.6)', () => {
    const v: VerificationContext = { ...unverified, consensusSize: 1.5 };
    // Raw 4" but two primary sources agreed on 1.5 → display 1.5
    expect(displayHailInches(4.0, v)).toBe(1.5);
    // Raw 1.0 unverified, consensus 1.25 → display 1.25
    expect(displayHailInches(1.0, { ...unverified, consensusSize: 1.25 })).toBe(1.25);
  });

  it('consensus does NOT override floor (sub-0.25 still suppressed)', () => {
    const v: VerificationContext = { ...unverified, consensusSize: 1.5 };
    expect(displayHailInches(0.1, v)).toBeNull();
  });

  it('consensus outside [0.75, 2.6) is ignored', () => {
    const v: VerificationContext = { ...unverified, consensusSize: 3.0 };
    expect(displayHailInches(4.0, v)).toBe(2.0); // falls through to cap
  });
});

describe('computeConsensusSize', () => {
  it('returns null with single source', () => {
    expect(
      computeConsensusSize([{ source: 'NOAA', sizeInches: 1.5 }]),
    ).toBeNull();
  });

  it('returns null when sources agree on size outside [0.75, 2.6)', () => {
    expect(
      computeConsensusSize([
        { source: 'NOAA', sizeInches: 0.5 },
        { source: 'NWS', sizeInches: 0.5 },
      ]),
    ).toBeNull();
    expect(
      computeConsensusSize([
        { source: 'NOAA', sizeInches: 3.0 },
        { source: 'NWS', sizeInches: 3.0 },
      ]),
    ).toBeNull();
  });

  it('returns size when ≥2 distinct sources agree', () => {
    expect(
      computeConsensusSize([
        { source: 'NOAA', sizeInches: 1.5 },
        { source: 'NWS', sizeInches: 1.5 },
        { source: 'NEXRAD', sizeInches: 4.0 },
      ]),
    ).toBe(1.5);
  });

  it('picks the highest size with ≥2 source agreement', () => {
    expect(
      computeConsensusSize([
        { source: 'NOAA', sizeInches: 1.0 },
        { source: 'NWS', sizeInches: 1.0 },
        { source: 'NEXRAD', sizeInches: 1.5 },
        { source: 'NCEI', sizeInches: 1.5 },
      ]),
    ).toBe(1.5);
  });

  it('two events from the same source do NOT count as consensus', () => {
    expect(
      computeConsensusSize([
        { source: 'NOAA', sizeInches: 1.5 },
        { source: 'NOAA', sizeInches: 1.5 },
      ]),
    ).toBeNull();
  });
});

describe('isSterlingClassStorm', () => {
  // 17032 Silver Charm Place coordinates approx — Leesburg, VA
  const silverCharmLat = 39.0918;
  const silverCharmLng = -77.5919;

  it('2024-08-29 at Silver Charm Place is Sterling-class', () => {
    expect(
      isSterlingClassStorm('2024-08-29', silverCharmLat, silverCharmLng),
    ).toBe(true);
  });

  it('2025-07-16 at Silver Charm Place is NOT Sterling-class', () => {
    expect(
      isSterlingClassStorm('2025-07-16', silverCharmLat, silverCharmLng),
    ).toBe(false);
  });

  it('2024-08-29 at Frederick MD is NOT Sterling-class (outside 20mi)', () => {
    expect(
      isSterlingClassStorm('2024-08-29', 39.4143, -77.4105),
    ).toBe(false);
  });
});

describe('buildBandVerification — strict-bucketing + primary-source aware', () => {
  const stormDate = '2025-07-16';
  const lat = 38.85;
  const lng = -77.30;

  it('at-property band with 0 primary reports → not verified, not at-location', () => {
    const reports: BandReport[] = [];
    const v = buildBandVerification(reports, true, stormDate, lat, lng);
    expect(v.isVerified).toBe(false);
    expect(v.isAtLocation).toBe(false);
  });

  it('at-property band with 1 primary report → at-location, not verified', () => {
    const reports: BandReport[] = [
      { source: 'NOAA', sizeInches: 1.5, distanceMiles: 0.3 },
    ];
    const v = buildBandVerification(reports, true, stormDate, lat, lng);
    expect(v.isAtLocation).toBe(true);
    expect(v.isVerified).toBe(false);
  });

  it('at-property band with 3 primary + 1 govt → verified+at-location', () => {
    const reports: BandReport[] = [
      { source: 'NOAA', sizeInches: 1.5, distanceMiles: 0.1 },
      { source: 'NWS', sizeInches: 1.5, distanceMiles: 0.2 },
      { source: 'NEXRAD', sizeInches: 4.0, distanceMiles: 0.3 },
    ];
    const v = buildBandVerification(reports, true, stormDate, lat, lng);
    expect(v.isVerified).toBe(true);
    expect(v.isAtLocation).toBe(true);
    expect(v.consensusSize).toBe(1.5);
  });

  it('non-at-property band can never be at-location', () => {
    const reports: BandReport[] = [
      { source: 'NOAA', sizeInches: 1.5, distanceMiles: 1.5 },
    ];
    const v = buildBandVerification(reports, false, stormDate, lat, lng);
    expect(v.isAtLocation).toBe(false);
  });

  it('supplemental sources (Hailtrace, mPING) do not count as primary', () => {
    const reports: BandReport[] = [
      { source: 'HailTrace', sizeInches: 4.0, distanceMiles: 0.3 },
      { source: 'mPING', sizeInches: 4.0, distanceMiles: 0.4 },
    ];
    const v = buildBandVerification(reports, true, stormDate, lat, lng);
    expect(v.isVerified).toBe(false);
    expect(v.isAtLocation).toBe(false);
    expect(v.consensusSize).toBeNull();
  });
});

describe('integration — Silver Charm Place 2025-07-16 cap behavior', () => {
  it('4" reading at 0.6mi (1-3 band, single source) → 2.0 in 1-3 column', () => {
    // The exact case Ahmed flagged in the meeting: a 4" report at 0.6mi
    // was bleeding into At Property column. After strict bucketing it
    // belongs in the 1-3mi column. Single-source unverified → cap to 2.0.
    const v = buildBandVerification(
      [{ source: 'HailTrace', sizeInches: 4.0, distanceMiles: 0.6 }],
      false, // 1-3mi band
      '2025-07-16',
      38.85, -77.30,
    );
    expect(displayHailInches(4.0, v)).toBe(2.0);
  });

  it('4" reading at 0.3mi w/ 3 primary + govt → 2.5 (not Sterling)', () => {
    const reports: BandReport[] = [
      { source: 'NOAA', sizeInches: 4.0, distanceMiles: 0.1 },
      { source: 'NWS', sizeInches: 4.0, distanceMiles: 0.2 },
      { source: 'NEXRAD', sizeInches: 4.0, distanceMiles: 0.3 },
    ];
    const v = buildBandVerification(
      reports, true, '2025-07-16', 38.85, -77.30,
    );
    expect(displayHailInches(4.0, v)).toBe(2.5); // verified non-Sterling
  });

  it('Sterling 2024-08-29 at Silver Charm w/ 3 primary + govt + 2.75 raw → 2.75', () => {
    const reports: BandReport[] = [
      { source: 'NOAA', sizeInches: 2.75, distanceMiles: 0.1 },
      { source: 'NWS', sizeInches: 2.75, distanceMiles: 0.2 },
      { source: 'NEXRAD', sizeInches: 2.75, distanceMiles: 0.3 },
    ];
    const v = buildBandVerification(
      reports, true, '2024-08-29', 39.0918, -77.5919,
    );
    expect(v.isSterlingClass).toBe(true);
    expect(displayHailInches(2.75, v)).toBe(2.75);
  });
});
