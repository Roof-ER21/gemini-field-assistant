/**
 * MRMS pixel sampler — verifies samplePixelInchesAtLatLng and
 * samplePixelInchesNeighborhood return correct values for a synthetic
 * grid with known geometry. No GRIB decoding involved (that's tested
 * elsewhere); these tests pin the math from (lat,lng) → cell index →
 * inches and the boundary handling.
 *
 * Run: npx vitest run server/services/__tests__/mrmsSampler.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  samplePixelInchesAtLatLng,
  samplePixelInchesNeighborhood,
} from '../historicalMrmsService.js';
import type { CompositeDecodedMrmsGrib } from '../historicalMrmsService.js';

/**
 * Build a tiny test grid. Geometry: a 5x5 grid covering 1 degree of lat
 * and 1 degree of lng in the DMV. North = 39.0, south = 38.0, west = -78.0,
 * east = -77.0. Cell size ≈ 0.25° (~17.4mi at this latitude — much larger
 * than real MRMS but lets us pin geometry without floating-point grief).
 *
 * Cell layout (row 0 = north, col 0 = west):
 *
 *   col       0     1     2     3     4
 *           ┌─────────────────────────────┐
 *   row 0   │  0     0    25.4   0     0  │  (north edge)
 *   row 1   │  0    50.8  50.8  50.8   0  │
 *   row 2   │  0    50.8 101.6  50.8   0  │  ← center cell = 4.00"
 *   row 3   │  0    50.8  50.8  50.8   0  │
 *   row 4   │  0     0    25.4   0     0  │  (south edge)
 *           └─────────────────────────────┘
 */
function buildTestGrid(): CompositeDecodedMrmsGrib {
  const width = 5;
  const height = 5;
  const mmGrid = new Float32Array(width * height);
  // Center cell: 101.6mm = 4.00 inches
  mmGrid[2 * width + 2] = 101.6;
  // Inner ring: 50.8mm = 2.00 inches
  mmGrid[1 * width + 1] = 50.8;
  mmGrid[1 * width + 2] = 50.8;
  mmGrid[1 * width + 3] = 50.8;
  mmGrid[2 * width + 1] = 50.8;
  mmGrid[2 * width + 3] = 50.8;
  mmGrid[3 * width + 1] = 50.8;
  mmGrid[3 * width + 2] = 50.8;
  mmGrid[3 * width + 3] = 50.8;
  // Outer-edge stubs: 25.4mm = 1.00 inch (the N/S edge cell columns 2)
  mmGrid[0 * width + 2] = 25.4;
  mmGrid[4 * width + 2] = 25.4;

  return {
    refTime: '2024-08-29T00:00:00Z',
    refValue: 0,
    binaryScale: 0,
    decimalScale: 1,
    width,
    height,
    north: 39.0,
    south: 38.0,
    east: -77.0,
    west: -78.0,
    mmGrid,
    sourceFiles: ['synthetic-test-grid'],
  };
}

describe('samplePixelInchesAtLatLng', () => {
  const grid = buildTestGrid();

  it('returns the center cell value at the grid centroid', () => {
    // Grid center = (38.5, -77.5) → row 2, col 2 → 4.00"
    expect(samplePixelInchesAtLatLng(grid, 38.5, -77.5)).toBe(4.0);
  });

  it('samples the inner ring at off-center cells', () => {
    // (38.75, -77.75) → row 1, col 1 → 2.00"
    expect(samplePixelInchesAtLatLng(grid, 38.75, -77.75)).toBe(2.0);
    // (38.5, -77.75) → row 2, col 1 → 2.00"
    expect(samplePixelInchesAtLatLng(grid, 38.5, -77.75)).toBe(2.0);
  });

  it('returns null when no hail at the cell', () => {
    // (39.0, -78.0) → row 0, col 0 → 0 → null
    expect(samplePixelInchesAtLatLng(grid, 39.0, -78.0)).toBeNull();
    // (38.0, -77.0) → row 4, col 4 → 0 → null
    expect(samplePixelInchesAtLatLng(grid, 38.0, -77.0)).toBeNull();
  });

  it('returns null for points outside the grid extent', () => {
    expect(samplePixelInchesAtLatLng(grid, 40.0, -77.5)).toBeNull(); // north of grid
    expect(samplePixelInchesAtLatLng(grid, 37.0, -77.5)).toBeNull(); // south of grid
    expect(samplePixelInchesAtLatLng(grid, 38.5, -76.0)).toBeNull(); // east of grid
    expect(samplePixelInchesAtLatLng(grid, 38.5, -79.0)).toBeNull(); // west of grid
  });

  it('returns null for invalid lat/lng', () => {
    expect(samplePixelInchesAtLatLng(grid, NaN, -77.5)).toBeNull();
    expect(samplePixelInchesAtLatLng(grid, 38.5, Infinity)).toBeNull();
  });

  it('suppresses sub-0.25" trace values', () => {
    // Add a 0.1" cell and sample it
    const tracedGrid = buildTestGrid();
    tracedGrid.mmGrid[0 * tracedGrid.width + 4] = 2.5; // 0.098 inches
    expect(samplePixelInchesAtLatLng(tracedGrid, 39.0, -77.0)).toBeNull();
  });

  it('rounds to 2 decimal places', () => {
    const oddGrid = buildTestGrid();
    oddGrid.mmGrid[2 * oddGrid.width + 2] = 32.0; // 32 / 25.4 = 1.2598...
    expect(samplePixelInchesAtLatLng(oddGrid, 38.5, -77.5)).toBe(1.26);
  });

  it('returns null on degenerate 1x1 grid', () => {
    const tinyGrid: CompositeDecodedMrmsGrib = {
      ...buildTestGrid(),
      width: 1,
      height: 1,
      mmGrid: new Float32Array([100]),
    };
    expect(samplePixelInchesAtLatLng(tinyGrid, 38.5, -77.5)).toBeNull();
  });
});

describe('samplePixelInchesNeighborhood', () => {
  const grid = buildTestGrid();

  it('returns center value when the center cell is the max', () => {
    expect(samplePixelInchesNeighborhood(grid, 38.5, -77.5)).toBe(4.0);
  });

  it('finds the max inside the 3x3 window when center is not the max', () => {
    // Sample at (38.75, -77.75) — center cell is 2.0", but 3x3 window
    // includes the 4.0" cell at (row 2, col 2)
    expect(samplePixelInchesNeighborhood(grid, 38.75, -77.75)).toBe(4.0);
  });

  it('respects radius parameter', () => {
    // Radius 0 = single cell, same as samplePixelInchesAtLatLng
    expect(samplePixelInchesNeighborhood(grid, 38.75, -77.75, 0)).toBe(2.0);
    // Radius 2 from (39.0, -78.0) = NW corner with 5x5 window covering
    // rows 0-2 and cols 0-2 — picks up center cell at (2,2) = 4.0"
    expect(samplePixelInchesNeighborhood(grid, 39.0, -78.0, 2)).toBe(4.0);
  });

  it('returns null outside grid bounds', () => {
    expect(samplePixelInchesNeighborhood(grid, 40.0, -77.5)).toBeNull();
  });

  it('handles partial windows at edges (north edge)', () => {
    // Top-left corner = (39.0, -78.0); 3x3 window goes off the top.
    // Should still find 1.00" at (row 0, col 2) which is in-window.
    expect(samplePixelInchesNeighborhood(grid, 39.0, -77.5, 1)).toBe(2.0);
  });

  it('returns null when the entire neighborhood is sub-trace', () => {
    const sparseGrid = buildTestGrid();
    sparseGrid.mmGrid.fill(0);
    sparseGrid.mmGrid[2 * sparseGrid.width + 2] = 2; // 0.078 inches
    expect(samplePixelInchesNeighborhood(sparseGrid, 38.5, -77.5)).toBeNull();
  });
});

describe('integration — Silver Charm Place 4-inch outlier scenario', () => {
  it('property-pixel sample of 0.5" beats polygon-max framing', () => {
    // Real-world scenario: a swath polygon contains the property AND a
    // distant cell with a 4.0" reading. Polygon-wide max says 4.0", but
    // sampling the actual property cell shows 0.5" (much more honest).
    //
    // Construct a tiny grid where:
    //   - center cell (where the property is) = 0.5" (12.7mm)
    //   - far edge cell = 4.0" (101.6mm)  ← what polygon-wide max picks
    const grid: CompositeDecodedMrmsGrib = {
      ...buildTestGrid(),
      mmGrid: (() => {
        const m = new Float32Array(25);
        m[2 * 5 + 2] = 12.7;  // 0.5" at property center
        m[0 * 5 + 0] = 101.6; // 4.0" at NW corner
        return m;
      })(),
    };

    // Property at center → 0.5", not 4.0"
    expect(samplePixelInchesAtLatLng(grid, 38.5, -77.5)).toBe(0.5);
    // Polygon-wide max would have shown 4.0; per-pixel sampling shows
    // the actual property impact. This is the bug the addendum + meeting
    // were trying to fix.
  });
});
