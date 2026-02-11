/**
 * Narrative Service
 *
 * Template-based paragraph builder for storm impact narratives.
 * Generates professional, insurance-grade text without AI API costs.
 * Used in PDF reports to describe hail impact events.
 */
/**
 * Format a date in Eastern timezone for narrative text
 */
function formatNarrativeDate(dateStr) {
    try {
        const date = new Date(dateStr);
        // Check if DST
        const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
        const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
        const isDST = date.getTimezoneOffset() < Math.max(jan, jul);
        const tzSuffix = isDST ? 'EDT' : 'EST';
        const formatted = date.toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        return `${formatted} ${tzSuffix}`;
    }
    catch {
        return dateStr;
    }
}
/**
 * Get hail size description for insurance narratives
 */
function getHailSizeDesc(inches) {
    if (inches >= 4.5)
        return 'softball-sized';
    if (inches >= 4.0)
        return 'grapefruit-sized';
    if (inches >= 3.0)
        return 'baseball-sized';
    if (inches >= 2.75)
        return 'tennis ball-sized';
    if (inches >= 2.5)
        return 'hen egg-sized';
    if (inches >= 2.0)
        return 'lime-sized';
    if (inches >= 1.75)
        return 'golf ball-sized';
    if (inches >= 1.5)
        return 'walnut-sized';
    if (inches >= 1.25)
        return 'half dollar-sized';
    if (inches >= 1.0)
        return 'quarter-sized';
    if (inches >= 0.75)
        return 'penny-sized';
    if (inches >= 0.5)
        return 'marble-sized';
    return 'pea-sized';
}
/**
 * Get damage potential description
 */
function getDamagePotential(maxSize) {
    if (maxSize >= 2.0)
        return 'significant damage to roofing materials, siding, gutters, and outdoor equipment';
    if (maxSize >= 1.5)
        return 'notable damage to asphalt shingles, window screens, and exposed surfaces';
    if (maxSize >= 1.0)
        return 'potential damage to roof surfaces, especially aged or compromised roofing materials';
    if (maxSize >= 0.75)
        return 'surface damage to roofing granules and cosmetic damage to exterior finishes';
    return 'minor cosmetic impact to exterior surfaces';
}
/**
 * Generate a professional hail impact narrative for the PDF report.
 * Returns a paragraph suitable for insurance documentation.
 */
export function generateHailNarrative(params) {
    const { address, city, state, stormDate, maxHailSize, totalEvents, severeCount, windEvents = 0, nearbyReports, stormDirection, stormSpeed, radiusMiles } = params;
    const formattedDate = formatNarrativeDate(stormDate);
    const sizeDesc = getHailSizeDesc(maxHailSize);
    const damagePotential = getDamagePotential(maxHailSize);
    const location = city && state ? `${city}, ${state}` : address;
    let narrative = '';
    // Opening sentence - primary storm event
    narrative += `On ${formattedDate}, a severe weather system impacted the ${location} area, producing `;
    narrative += `${sizeDesc} hail measuring up to ${maxHailSize.toFixed(2)} inches in diameter. `;
    // Storm movement info (if available)
    if (stormDirection && stormSpeed) {
        narrative += `The storm cell moved ${stormDirection} at approximately ${stormSpeed}, `;
        narrative += `passing directly through the subject property area. `;
    }
    else if (stormDirection) {
        narrative += `The storm cell tracked ${stormDirection} through the area. `;
    }
    // Event count and coverage
    narrative += `A total of ${totalEvents} verified storm event${totalEvents !== 1 ? 's were' : ' was'} documented `;
    narrative += `within a ${radiusMiles}-mile radius of the subject property at ${address}. `;
    // Severity breakdown
    if (severeCount > 0) {
        narrative += `Of these, ${severeCount} event${severeCount !== 1 ? 's' : ''} `;
        narrative += `${severeCount !== 1 ? 'were' : 'was'} classified as severe (hail 1.5 inches or larger). `;
    }
    // Wind events
    if (windEvents > 0) {
        narrative += `Additionally, ${windEvents} damaging wind event${windEvents !== 1 ? 's were' : ' was'} recorded in the area. `;
    }
    // Nearby reports
    if (nearbyReports && nearbyReports > 0) {
        narrative += `${nearbyReports} storm report${nearbyReports !== 1 ? 's were' : ' was'} `;
        narrative += `documented within 1 mile of the property. `;
    }
    // Damage assessment language
    narrative += `Hail of this magnitude is capable of causing ${damagePotential}. `;
    // Professional recommendation
    narrative += `Based on the documented storm activity and hail size, a thorough property inspection `;
    narrative += `is recommended to assess potential damage to roofing, siding, gutters, windows, `;
    narrative += `and other exterior components.`;
    return narrative;
}
/**
 * Generate a shorter summary paragraph for the executive summary section.
 */
export function generateExecutiveSummary(params) {
    const { address, stormDate, maxHailSize, totalEvents, severeCount } = params;
    const formattedDate = formatNarrativeDate(stormDate);
    const sizeDesc = getHailSizeDesc(maxHailSize);
    return `The property at ${address} was in the direct path of verified severe weather activity on ${formattedDate}. ` +
        `Storm data confirms ${totalEvents} documented events in the area, with hail measuring up to ` +
        `${maxHailSize.toFixed(2)}" (${sizeDesc}). ${severeCount > 0 ? `${severeCount} severe event${severeCount !== 1 ? 's' : ''} recorded. ` : ''}` +
        `Professional inspection is recommended.`;
}
