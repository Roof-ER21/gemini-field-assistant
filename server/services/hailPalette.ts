/**
 * Server-side mirror of components/hailPalette.ts.
 *
 * ⚠ MUST stay in sync with components/hailPalette.ts.
 * If you edit one, edit the other — they can't share a module because server
 * tsconfig only includes `server/**` and the client tsconfig doesn't include
 * `server/**`. A small duplication beats a build-system refactor.
 *
 * See components/hailPalette.ts for full context and the reason this palette exists.
 */

export interface HailLevel {
  minInches: number;
  maxInches: number;
  label: string;
  reference: string;
  longLabel: string;
  color: string;
  rgba: [number, number, number, number];
  severity: 'trace' | 'minor' | 'moderate' | 'severe' | 'very_severe' | 'extreme';
}

export const HAIL_LEVELS: HailLevel[] = [
  { minInches: 0.25, maxInches: 0.5,  label: '1/4"',   reference: 'pea',         longLabel: 'Pea (1/4")',            color: '#90EE90', rgba: [144, 238, 144, 180], severity: 'trace' },
  { minInches: 0.5,  maxInches: 0.75, label: '1/2"',   reference: 'marble',      longLabel: 'Marble (1/2")',         color: '#00FF00', rgba: [0,   255, 0,   200], severity: 'trace' },
  { minInches: 0.75, maxInches: 1.0,  label: '3/4"',   reference: 'penny',       longLabel: 'Penny (3/4")',          color: '#FFFF00', rgba: [255, 255, 0,   210], severity: 'minor' },
  { minInches: 1.0,  maxInches: 1.25, label: '1"',     reference: 'quarter',     longLabel: 'Quarter (1")',          color: '#FFA500', rgba: [255, 165, 0,   220], severity: 'moderate' },
  { minInches: 1.25, maxInches: 1.5,  label: '1 1/4"', reference: 'half-dollar', longLabel: 'Half-Dollar (1 1/4")',  color: '#FF8C00', rgba: [255, 140, 0,   225], severity: 'moderate' },
  { minInches: 1.5,  maxInches: 1.75, label: '1 1/2"', reference: 'ping-pong',   longLabel: 'Ping-Pong (1 1/2")',    color: '#FF6600', rgba: [255, 102, 0,   230], severity: 'severe' },
  { minInches: 1.75, maxInches: 2.0,  label: '1 3/4"', reference: 'golf-ball',   longLabel: 'Golf Ball (1 3/4")',    color: '#FF0000', rgba: [255, 0,   0,   235], severity: 'severe' },
  { minInches: 2.0,  maxInches: 2.5,  label: '2"',     reference: 'lime',        longLabel: 'Lime (2")',             color: '#CC0000', rgba: [204, 0,   0,   240], severity: 'very_severe' },
  { minInches: 2.5,  maxInches: 3.0,  label: '2 1/2"', reference: 'tennis-ball', longLabel: 'Tennis Ball (2 1/2")',  color: '#8B0000', rgba: [139, 0,   0,   245], severity: 'very_severe' },
  { minInches: 3.0,  maxInches: Infinity, label: '3"+', reference: 'softball',  longLabel: 'Softball (3"+)',        color: '#800080', rgba: [128, 0,   128, 250], severity: 'extreme' },
];

export function getHailLevel(inches: number): HailLevel {
  if (!Number.isFinite(inches) || inches < 0.25) return HAIL_LEVELS[0];
  for (const l of HAIL_LEVELS) {
    if (inches >= l.minInches && inches < l.maxInches) return l;
  }
  return HAIL_LEVELS[HAIL_LEVELS.length - 1];
}

export function getHailColor(inches: number): string {
  return getHailLevel(inches).color;
}

export function getHailRgba(inches: number): [number, number, number, number] {
  return getHailLevel(inches).rgba;
}

export function getHailSeverity(inches: number): HailLevel['severity'] {
  return getHailLevel(inches).severity;
}
