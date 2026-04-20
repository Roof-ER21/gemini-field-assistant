/**
 * Narrative Service
 *
 * Template-based paragraph builder for storm impact narratives.
 * Generates professional, insurance-grade text without AI API costs.
 * Used in PDF reports to describe hail + wind impact events.
 *
 * Narrative modes:
 *   - hail-only    : hail ≥ ¼", no significant wind events
 *   - wind-only    : no meaningful hail, but documented wind events
 *   - combined     : both hail ≥ ¼" and documented wind
 *   - minimal      : effectively no documented damage (rare, honest fallback)
 *
 * Prior version always opened with "a severe weather system impacted ...
 * producing pea-sized hail measuring up to 0.00 inches in diameter" even
 * when the primary event was wind. That paragraph got claims denied —
 * adjusters dismiss anything framed around "0.00 inch pea-sized hail".
 */

interface NarrativeParams {
  address: string;
  city?: string;
  state?: string;
  stormDate: string; // ISO date string of the primary/most significant storm
  maxHailSize: number; // inches
  totalEvents: number;
  severeCount: number; // hail events >= 1.5"
  windEvents?: number;
  /** Max wind speed documented (in mph). If not provided, narrative uses count only. */
  maxWindMph?: number;
  nearbyReports?: number; // reports within 1 mile
  stormDirection?: string; // e.g. "SW to NE"
  stormSpeed?: string; // e.g. "35 mph"
  radiusMiles: number;
}

// ─── Formatting helpers ─────────────────────────────────────────────────

function formatNarrativeDate(dateStr: string): string {
  try {
    const dateOnlyMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})$/);
    const date = dateOnlyMatch
      ? new Date(`${dateOnlyMatch[1]}T12:00:00Z`)
      : new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return dateStr;
    }

    const etFull = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
    const tzSuffix = etFull.includes('EDT') ? 'EDT' : 'EST';

    const formatted = date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    return `${formatted} ${tzSuffix}`;
  } catch {
    return dateStr;
  }
}

/**
 * Human-friendly hail size label. Returns null for negligible hail so the
 * caller can pivot to a wind-first narrative instead of emitting
 * "pea-sized hail measuring 0.00 inches".
 */
function getHailSizeDesc(inches: number): string | null {
  if (inches >= 4.5) return 'softball-sized';
  if (inches >= 4.0) return 'grapefruit-sized';
  if (inches >= 3.0) return 'baseball-sized';
  if (inches >= 2.75) return 'tennis ball-sized';
  if (inches >= 2.5) return 'hen egg-sized';
  if (inches >= 2.0) return 'lime-sized';
  if (inches >= 1.75) return 'golf ball-sized';
  if (inches >= 1.5) return 'walnut-sized';
  if (inches >= 1.25) return 'half dollar-sized';
  if (inches >= 1.0) return 'quarter-sized';
  if (inches >= 0.75) return 'penny-sized';
  if (inches >= 0.5) return 'marble-sized';
  if (inches >= 0.25) return 'pea-sized';
  return null; // anything below ¼" is not reportable
}

/**
 * Hail size for display — applies the ¼" floor so we never publish
 * "0.00 inches" or sub-pea sizes in narrative text. Returns null when
 * the value is effectively zero so callers omit the sentence entirely.
 */
function formatHailSizeInches(inches: number): string | null {
  if (inches < 0.25) return null;
  return `${inches.toFixed(2)}"`;
}

function getHailDamagePotential(inches: number): string {
  if (inches >= 2.0) return 'significant damage to roofing materials, siding, gutters, and outdoor equipment';
  if (inches >= 1.5) return 'notable damage to asphalt shingles, window screens, and exposed surfaces';
  if (inches >= 1.0) return 'potential damage to roof surfaces, especially aged or compromised roofing materials';
  if (inches >= 0.75) return 'surface damage to roofing granules and cosmetic damage to exterior finishes';
  return 'cosmetic impact to painted surfaces and roofing granules';
}

/**
 * Wind damage language keyed to EF-adjacent mph bands that NOAA
 * SED reports document. These bands map to what adjusters expect
 * to see cited on a wind claim.
 */
function getWindDamagePotential(mph: number): string {
  if (mph >= 90)  return 'severe structural damage including roof decking failure, lifted or torn shingles, siding separation, and downed trees';
  if (mph >= 75)  return 'significant damage to roofing materials including shingle tear-off, flashing displacement, ridge vent separation, and siding damage';
  if (mph >= 60)  return 'notable damage to roof surfaces — especially aged or compromised shingles — along with gutter detachment, fascia damage, and fence/outbuilding impacts';
  if (mph >= 50)  return 'damage to older or already-compromised roof surfaces, loose shingles, and exposed soft exterior components';
  return 'progressive wear to exterior components over the course of the event';
}

function getStateCodeClause(state: string | undefined): string {
  if (!state) return '';
  const s = state.toUpperCase().trim();
  if (s === 'MD' || s === 'MARYLAND') {
    return 'Per the Maryland Residential Code (IRC 2021, R908.3), roof replacement shall include the removal of existing layers of roof coverings down to the roof deck. ';
  }
  if (s === 'VA' || s === 'VIRGINIA') {
    return 'Per the Virginia USBC (IRC 2021, R908.3), re-roofing over more than one existing layer is prohibited, and all new installations must meet current code requirements. ';
  }
  if (s === 'PA' || s === 'PENNSYLVANIA') {
    return 'Per the Pennsylvania UCC (IRC 2018, R908.3), a maximum of two layers of asphalt shingles is permitted; existing non-asphalt materials require complete tear-off. ';
  }
  return '';
}

/**
 * Generate a professional storm impact narrative for the PDF report.
 * Picks the right lede (hail / wind / combined / minimal) based on what
 * the data actually supports — never fabricates "0.00 inch pea-sized hail".
 */
export function generateHailNarrative(params: NarrativeParams): string {
  const {
    address,
    city,
    state,
    stormDate,
    maxHailSize,
    totalEvents,
    severeCount,
    windEvents = 0,
    maxWindMph = 0,
    nearbyReports,
    stormDirection,
    stormSpeed,
    radiusMiles
  } = params;

  const formattedDate = formatNarrativeDate(stormDate);
  const location = city && state ? `${city}, ${state}` : address;
  const hailDesc = getHailSizeDesc(maxHailSize);
  const hailSizeText = formatHailSizeInches(maxHailSize);
  const hasMeaningfulHail = hailDesc !== null && hailSizeText !== null;
  const hasMeaningfulWind = windEvents > 0;

  let narrative = '';

  // ─── Opening lede — picks hail / wind / both based on what's real ───
  if (hasMeaningfulHail && hasMeaningfulWind) {
    // Combined — both deserve top billing
    narrative += `On ${formattedDate}, a severe weather system impacted the ${location} area, producing `;
    narrative += `${hailDesc} hail measuring up to ${hailSizeText} in diameter`;
    if (maxWindMph >= 50) {
      narrative += ` alongside damaging straight-line winds measured up to ${Math.round(maxWindMph)} mph. `;
    } else {
      narrative += ` alongside documented damaging wind. `;
    }
  } else if (hasMeaningfulWind) {
    // Wind-only — LEAD with wind, not with 0.00" hail
    if (maxWindMph >= 50) {
      narrative += `On ${formattedDate}, a severe weather system impacted the ${location} area, producing `;
      narrative += `damaging straight-line winds measured up to ${Math.round(maxWindMph)} mph. `;
    } else {
      narrative += `On ${formattedDate}, a severe weather system impacted the ${location} area, producing `;
      narrative += `${windEvents} documented damaging wind event${windEvents !== 1 ? 's' : ''}. `;
    }
  } else if (hasMeaningfulHail) {
    // Hail-only — classic path
    narrative += `On ${formattedDate}, a severe weather system impacted the ${location} area, producing `;
    narrative += `${hailDesc} hail measuring up to ${hailSizeText} in diameter. `;
  } else {
    // Minimal — honest fallback. Don't fabricate severity.
    narrative += `On ${formattedDate}, weather activity was documented in the ${location} area. `;
    narrative += `${totalEvents} storm event${totalEvents !== 1 ? 's' : ''} `;
    narrative += `${totalEvents !== 1 ? 'were' : 'was'} recorded within ${radiusMiles} miles of the subject property. `;
    narrative += `A thorough property inspection is recommended to identify any exterior impacts `;
    narrative += `that may have occurred during the event. `;
    return narrative.trim();
  }

  // ─── Storm movement (if available) ───
  if (stormDirection && stormSpeed) {
    narrative += `The storm cell moved ${stormDirection} at approximately ${stormSpeed}, `;
    narrative += `passing directly through the subject property area. `;
  } else if (stormDirection) {
    narrative += `The storm cell tracked ${stormDirection} through the area. `;
  }

  // ─── Event totals / coverage ───
  narrative += `A total of ${totalEvents} verified storm event${totalEvents !== 1 ? 's were' : ' was'} documented `;
  narrative += `within a ${radiusMiles}-mile radius of the subject property at ${address}. `;

  // ─── Severity counts ───
  if (severeCount > 0) {
    narrative += `Of these, ${severeCount} hail event${severeCount !== 1 ? 's' : ''} `;
    narrative += `${severeCount !== 1 ? 'were' : 'was'} classified as severe (hail 1.5 inches or larger). `;
  }

  // Wind events (only if we didn't already lead with wind)
  if (hasMeaningfulWind && hasMeaningfulHail) {
    narrative += `Additionally, ${windEvents} damaging wind event${windEvents !== 1 ? 's were' : ' was'} recorded in the area`;
    if (maxWindMph >= 50) narrative += ` with peak gusts of ${Math.round(maxWindMph)} mph`;
    narrative += `. `;
  } else if (hasMeaningfulWind && !hasMeaningfulHail && windEvents > 1) {
    // Wind-only mode — reinforce count if >1 (we already named peak mph above)
    narrative += `${windEvents} damaging wind event${windEvents !== 1 ? 's were' : ' was'} documented in total across the area. `;
  }

  // ─── Nearby observation cluster ───
  if (nearbyReports && nearbyReports > 0) {
    narrative += `${nearbyReports} storm report${nearbyReports !== 1 ? 's were' : ' was'} `;
    narrative += `documented within 1 mile of the property. `;
  }

  // ─── Damage assessment — matched to whichever hazard dominates ───
  if (hasMeaningfulHail && hasMeaningfulWind) {
    narrative += `Hail and wind of this combined magnitude are capable of causing ${getHailDamagePotential(maxHailSize)} `;
    narrative += `and ${getWindDamagePotential(maxWindMph)}. `;
  } else if (hasMeaningfulHail) {
    narrative += `Hail of this magnitude is capable of causing ${getHailDamagePotential(maxHailSize)}. `;
  } else if (hasMeaningfulWind) {
    narrative += `Wind of this magnitude is capable of causing ${getWindDamagePotential(maxWindMph)}. `;
  }

  // ─── State code reference ───
  narrative += getStateCodeClause(state);

  // ─── Recommendation ───
  narrative += `Based on the documented storm activity, a thorough property inspection `;
  narrative += `is recommended to assess potential damage to roofing, siding, gutters, windows, `;
  narrative += `and other exterior components.`;

  return narrative;
}

/**
 * Generate a shorter summary paragraph for the executive summary section.
 */
export function generateExecutiveSummary(params: NarrativeParams): string {
  const { address, stormDate, maxHailSize, totalEvents, severeCount, windEvents = 0, maxWindMph = 0 } = params;
  const formattedDate = formatNarrativeDate(stormDate);
  const hailDesc = getHailSizeDesc(maxHailSize);
  const hailSizeText = formatHailSizeInches(maxHailSize);

  let summary = `The property at ${address} was in the direct path of verified severe weather activity on ${formattedDate}. `;
  summary += `Storm data confirms ${totalEvents} documented event${totalEvents !== 1 ? 's' : ''} in the area`;

  const bits: string[] = [];
  if (hailDesc && hailSizeText) bits.push(`hail measuring up to ${hailSizeText} (${hailDesc})`);
  if (windEvents > 0 && maxWindMph >= 50) bits.push(`peak wind gusts up to ${Math.round(maxWindMph)} mph`);
  else if (windEvents > 0) bits.push(`${windEvents} damaging wind event${windEvents !== 1 ? 's' : ''}`);

  if (bits.length > 0) summary += `, with ${bits.join(' and ')}`;
  summary += `. `;

  if (severeCount > 0) {
    summary += `${severeCount} severe hail event${severeCount !== 1 ? 's' : ''} recorded. `;
  }
  summary += `Professional inspection is recommended.`;
  return summary;
}
