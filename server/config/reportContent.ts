/**
 * SA21 Storm Damage Report Content
 * Professional copy, legal disclaimers, and content templates
 *
 * @module reportContent
 * @version 1.0.0
 */

export const REPORT_CONTENT = {
  // Main report headers
  title: "Storm Damage History Report",
  subtitle: "Comprehensive Weather Event Analysis & Risk Assessment",

  // Section headers
  sections: {
    propertyInfo: "Property Information",
    damageScore: "Roof Damage Risk Assessment",
    summary: "Executive Summary",
    timeline: "Storm Event Timeline",
    evidence: "Evidence Documentation",
    methodology: "Report Methodology",
    dataSourceCitation: "Data Source Citation"
  },

  // Damage score level descriptions
  damageScoreDescriptions: {
    critical: {
      title: "CRITICAL RISK",
      level: "Critical",
      color: "#DC2626",
      icon: "⚠️",
      description: "This property has experienced multiple severe weather events with significant hail activity. Historical data indicates a high probability of roof system damage requiring immediate attention.",
      recommendation: "URGENT: Immediate professional inspection is strongly recommended. Multiple severe storm events have impacted this property. Contact a licensed roofing contractor and your insurance provider to document potential storm damage. Failure to address storm damage may result in secondary water intrusion and void manufacturer warranties.",
      insuranceNote: "This property's storm history suggests a strong basis for an insurance claim. Document all visible damage and contact your insurance carrier immediately.",
      nextSteps: [
        "Schedule emergency roof inspection within 48 hours",
        "Contact insurance carrier to file storm damage claim",
        "Document all visible damage with photographs",
        "Request detailed structural assessment from licensed contractor",
        "Obtain written estimates for necessary repairs"
      ]
    },
    high: {
      title: "HIGH RISK",
      level: "High",
      color: "#EA580C",
      icon: "⚠",
      description: "This property has been exposed to significant severe weather activity with documented hail events exceeding 1.5 inches in diameter. The probability of roof damage is substantial.",
      recommendation: "Professional inspection strongly advised. The property's storm exposure history indicates potential damage to roofing materials, including granule loss, cracked shingles, compromised flashing, and possible underlayment damage. Early detection prevents costly secondary damage.",
      insuranceNote: "Storm events documented in this report may support an insurance claim for roof damage. Professional inspection recommended to document claim-eligible damage.",
      nextSteps: [
        "Schedule professional roof inspection within 7 days",
        "Review homeowner's insurance policy for storm damage coverage",
        "Obtain multiple estimates from licensed contractors",
        "Document current roof condition with photographs",
        "Consider filing insurance claim if damage is confirmed"
      ]
    },
    moderate: {
      title: "MODERATE RISK",
      level: "Moderate",
      color: "#F59E0B",
      icon: "⚡",
      description: "This property has experienced moderate storm activity with hail events ranging from 1.0 to 1.5 inches. While major structural damage is less likely, inspection is recommended to identify potential hidden damage.",
      recommendation: "Preventative inspection recommended. Moderate hail events can cause granule loss, bruising of shingles, and minor seal damage that may not be immediately visible but can compromise roof longevity. Early identification extends roof life.",
      insuranceNote: "While damage may not be immediately visible, documented storm events may support claims for hidden damage discovered during professional inspection.",
      nextSteps: [
        "Schedule routine roof inspection within 30 days",
        "Review manufacturer warranty for storm damage coverage",
        "Check for visible signs of damage (granules in gutters, cracked shingles)",
        "Maintain photographic records for future reference",
        "Monitor for leaks or interior water damage"
      ]
    },
    low: {
      title: "LOW RISK",
      level: "Low",
      color: "#10B981",
      icon: "✓",
      description: "This property has experienced minimal severe weather exposure. Storm events recorded were small or occurred at considerable distance from the property. The probability of storm-related damage is low.",
      recommendation: "Continue regular maintenance. While storm risk is low, routine inspections every 3-5 years are recommended to maintain roof system integrity and manufacturer warranty compliance.",
      insuranceNote: "Limited storm history. Any damage claims should be supported by professional inspection and documentation of specific damage.",
      nextSteps: [
        "Maintain regular inspection schedule (every 3-5 years)",
        "Document current roof condition for future reference",
        "Keep gutters and downspouts clear of debris",
        "Monitor for any unexpected leaks or damage",
        "Maintain compliance with manufacturer warranty requirements"
      ]
    },
    minimal: {
      title: "MINIMAL RISK",
      level: "Minimal",
      color: "#059669",
      icon: "✓",
      description: "No significant storm events were recorded within the search parameters. This property shows minimal storm exposure history based on available meteorological data.",
      recommendation: "Standard maintenance recommended. Continue routine inspections according to manufacturer warranty requirements and industry best practices. Document property condition for future insurance purposes.",
      insuranceNote: "No documented storm events. Any damage claims should be thoroughly documented and professionally assessed.",
      nextSteps: [
        "Maintain regular roof inspection schedule",
        "Follow manufacturer maintenance guidelines",
        "Document roof condition annually with photographs",
        "Keep records of all maintenance and repairs",
        "Review insurance coverage periodically"
      ]
    }
  },

  // Evidence and legal section
  evidence: {
    title: "Evidence for Insurance Claims",
    intro: "This report documents verified storm events that may have impacted the subject property. The data contained herein is derived from authoritative meteorological sources and may be used to support insurance claims, property damage assessments, and contractor evaluations.",

    purposeStatement: "This Storm Damage History Report is designed to provide homeowners, insurance professionals, and contractors with objective, third-party meteorological data to assess potential storm damage. The report does not constitute a property inspection or damage assessment, but rather presents verified weather events that may correlate with property damage.",

    noaaStatement: {
      title: "National Oceanic and Atmospheric Administration (NOAA) Storm Events Database",
      content: "This report includes data from NOAA's official Storm Events Database, maintained by the National Weather Service (NWS) and the National Centers for Environmental Information (NCEI). The NOAA Storm Events Database contains official records of significant weather events, including hail, tornadoes, high winds, and severe thunderstorms, as reported and verified by National Weather Service forecast offices, trained spotters, law enforcement, and emergency management officials. NOAA data represents the authoritative government record of documented weather phenomena and is widely accepted by insurance carriers, courts, and regulatory agencies.",
      citation: "National Oceanic and Atmospheric Administration (NOAA), National Centers for Environmental Information (NCEI). Storm Events Database. Available at: https://www.ncdc.noaa.gov/stormevents/"
    },

    ihmStatement: {
      title: "Interactive Hail Maps (IHM) Commercial Weather Data",
      content: "Additional storm data is sourced from Interactive Hail Maps' proprietary hail tracking and verification system. IHM combines NEXRAD radar analysis, Multi-Radar Multi-Sensor (MRMS) data, ground truth reports, spotter networks, and advanced meteorological algorithms to identify and verify hail events with precision location data. IHM's commercial database provides enhanced spatial resolution and hail size estimation beyond publicly available datasets and is utilized by insurance carriers, roofing contractors, and public adjusters nationwide.",
      citation: "Interactive Hail Maps, LLC. Proprietary Hail Event Database and Verification System. Commercial weather intelligence platform."
    },

    methodologyStatement: {
      title: "Report Methodology",
      content: "This report analyzes historical storm data within a specified radius of the subject property (typically 1.5 to 3 miles) and date range. Storm events are scored based on proximity to the property, hail size, event intensity, and frequency of occurrence. The Damage Risk Score is calculated using a proprietary algorithm that weights multiple meteorological factors to estimate the probability of roof damage. This methodology is designed to provide objective risk assessment based on documented weather phenomena rather than subjective visual inspection."
    },

    disclaimer: {
      title: "Important Disclaimers",
      content: [
        "INFORMATIONAL PURPOSES ONLY: This report is provided for informational purposes only and should not be considered a substitute for professional property inspection. Storm event data represents meteorological phenomena and does not constitute a determination that damage has occurred to any specific property.",

        "NO WARRANTY OF ACCURACY: While SA21 utilizes authoritative meteorological data sources, weather data may contain errors, omissions, or inaccuracies. Storm locations are approximate and derived from radar analysis, ground reports, and meteorological modeling. Actual hail size and impact area may vary from recorded data.",

        "NOT A PROPERTY INSPECTION: This report does NOT assess actual property damage. Property damage assessments must be performed by licensed contractors, certified inspectors, or insurance adjusters through physical inspection of the property.",

        "INSURANCE DECISIONS: SA21 makes no representations regarding insurance coverage, claim eligibility, or claim outcomes. Insurance coverage decisions are made solely by insurance carriers based on policy terms and actual property damage assessment.",

        "NO PROFESSIONAL RELATIONSHIP: This report does not create a professional relationship between SA21 and the property owner, insurance carrier, or any third party. SA21 is not engaged as a consultant, expert witness, or advisor unless explicitly retained under separate written agreement.",

        "LIMITATION OF LIABILITY: SA21's liability is limited to the fee paid for this report. SA21 shall not be liable for any indirect, consequential, special, or punitive damages arising from use of this report or reliance on data contained herein.",

        "DATA CURRENCY: Weather data is accurate as of the report generation date. Subsequent storm events will not be reflected in this report. Users should verify current conditions and obtain updated reports as needed."
      ]
    },

    certification: {
      title: "Data Certification",
      content: "The storm events documented in this report have been verified through official NOAA Storm Events Database records and/or commercial weather data providers. This report was generated electronically by the SA21 Storm Intelligence Platform and is certified accurate as of the generation date. Electronic reports carry the same evidentiary value as printed reports."
    },

    admissibilityStatement: {
      title: "Legal Admissibility",
      content: "NOAA Storm Events Database records are official government records maintained under the authority of the National Weather Service and are generally admissible as public records in legal proceedings under Federal Rules of Evidence 803(8). Commercial weather data from verified providers such as Interactive Hail Maps may be admissible as business records or expert evidence subject to proper foundation and authentication. Property owners should consult with legal counsel regarding use of this report in litigation or insurance disputes."
    }
  },

  // Footer content
  footer: {
    generated: "Generated by SA21 Storm Intelligence Platform",
    confidential: "CONFIDENTIAL - Prepared exclusively for the intended recipient",
    copyright: "© 2026 SA21. All rights reserved.",
    contact: "Questions? Contact your SA21 representative or visit www.sa21.com",
    reportId: "Report ID: {reportId}",
    generatedDate: "Generated: {date}",
    version: "Report Version 1.0"
  },

  // Summary templates (dynamic text based on data)
  summaryTemplates: {
    noEvents: {
      title: "Minimal Storm Exposure Detected",
      content: "Based on analysis of authoritative meteorological data sources, no significant storm events were recorded within the specified search parameters for this property. This indicates minimal storm exposure history. However, absence of recorded events does not guarantee absence of damage, as minor weather events may not be captured in meteorological databases. Standard roof maintenance and periodic inspection remain recommended."
    },

    lowRisk: {
      title: "Low Storm Exposure Risk",
      content: "This property has experienced {count} recorded storm event(s) during the analysis period, with a maximum documented hail size of {maxSize} inches. Based on storm proximity, intensity, and frequency, the overall Damage Risk Score is classified as LOW. While significant damage is unlikely, minor impact damage may have occurred. Routine inspection is recommended to verify roof condition and maintain manufacturer warranty compliance."
    },

    moderateRisk: {
      title: "Moderate Storm Exposure Detected",
      content: "This property has been exposed to {count} documented storm event(s) during the analysis period, including {severeCount} event(s) classified as moderate severity based on hail size and proximity. Maximum recorded hail size was {maxSize} inches. Moderate hail events can cause granule loss, shingle bruising, and accelerated aging of roofing materials. Professional inspection is advisable to identify potential damage before it leads to water intrusion or secondary issues. Documentation of any discovered damage may support insurance claims."
    },

    highRisk: {
      title: "Significant Storm Exposure - Inspection Recommended",
      content: "ATTENTION: This property has significant documented storm exposure with {count} recorded storm event(s) during the analysis period, including {severeCount} severe weather event(s) featuring hail exceeding 1.5 inches in diameter. Maximum recorded hail size was {maxSize} inches. Hail of this magnitude has a high probability of causing damage to asphalt shingles, including cracked or broken shingles, granule loss, seal damage, and compromised waterproofing. Professional inspection is strongly recommended to document damage and preserve insurance claim rights. Many insurance policies have time limits for reporting storm damage."
    },

    criticalRisk: {
      title: "CRITICAL Storm Exposure - Immediate Action Required",
      content: "URGENT: This property has experienced {count} severe storm event(s) during the analysis period, with maximum recorded hail measuring {maxSize} inches in diameter. {severeCount} event(s) are classified as severe based on hail size exceeding 1.75 inches and close proximity to the property. Hail of this magnitude causes significant damage to roofing systems, including structural damage to shingles, flashing, vents, and underlayment. Multiple damaging events have been detected, substantially increasing the probability of compromised roof integrity. IMMEDIATE professional inspection is strongly recommended. Contact your insurance carrier without delay, as policies typically require timely notification of storm damage. Failure to address severe storm damage can result in water intrusion, interior damage, mold growth, and denial of insurance claims."
    }
  },

  // Call-to-action messaging
  callToAction: {
    inspectionCTA: "Schedule Your Professional Roof Inspection",
    insuranceCTA: "Understand Your Insurance Coverage",
    documentationCTA: "Protect Your Investment - Document Damage Now",

    urgencyMessages: {
      critical: "Time-sensitive: Most insurance policies require storm damage claims within 1-2 years of the event.",
      high: "Act now: Early detection of storm damage prevents costly secondary damage.",
      moderate: "Don't wait: Hidden damage can worsen over time and may not be covered later.",
      low: "Stay protected: Regular inspections maintain your roof warranty and insurance coverage."
    }
  },

  // Property information labels
  propertyLabels: {
    address: "Property Address",
    coordinates: "Geographic Coordinates",
    searchRadius: "Storm Search Radius",
    dateRange: "Analysis Period",
    reportDate: "Report Generation Date",
    totalEvents: "Total Storm Events Detected",
    severeEvents: "Severe Events (>1.5\" hail)",
    maxHailSize: "Maximum Recorded Hail Size",
    damageScore: "Damage Risk Score"
  }
} as const;

/**
 * Get damage score description object based on numeric score
 */
export function getDamageScoreDescription(score: number): typeof REPORT_CONTENT.damageScoreDescriptions[keyof typeof REPORT_CONTENT.damageScoreDescriptions] {
  if (score >= 80) return REPORT_CONTENT.damageScoreDescriptions.critical;
  if (score >= 60) return REPORT_CONTENT.damageScoreDescriptions.high;
  if (score >= 40) return REPORT_CONTENT.damageScoreDescriptions.moderate;
  if (score >= 20) return REPORT_CONTENT.damageScoreDescriptions.low;
  return REPORT_CONTENT.damageScoreDescriptions.minimal;
}

/**
 * Get summary text based on damage score and event data
 */
export function getSummaryText(
  score: number,
  eventCount: number,
  maxSize: number,
  severeCount: number
): string {
  const templates = REPORT_CONTENT.summaryTemplates;

  if (eventCount === 0) {
    return templates.noEvents.content;
  }

  let template: string;
  if (score >= 80) {
    template = templates.criticalRisk.content;
  } else if (score >= 60) {
    template = templates.highRisk.content;
  } else if (score >= 40) {
    template = templates.moderateRisk.content;
  } else {
    template = templates.lowRisk.content;
  }

  return template
    .replace('{count}', eventCount.toString())
    .replace('{maxSize}', maxSize.toFixed(2))
    .replace('{severeCount}', severeCount.toString());
}

/**
 * Format event date for display
 */
export function formatEventDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York'
  });
}

/**
 * Format hail size with proper units
 */
export function formatHailSize(size: number): string {
  if (size === 0) return 'Unknown';
  if (size < 0.5) return `${size.toFixed(2)}" (pea-sized)`;
  if (size < 0.75) return `${size.toFixed(2)}" (penny-sized)`;
  if (size < 1.0) return `${size.toFixed(2)}" (quarter-sized)`;
  if (size < 1.5) return `${size.toFixed(2)}" (half-dollar)`;
  if (size < 1.75) return `${size.toFixed(2)}" (golf ball)`;
  if (size < 2.0) return `${size.toFixed(2)}" (lime-sized)`;
  if (size < 2.75) return `${size.toFixed(2)}" (baseball-sized)`;
  if (size < 3.0) return `${size.toFixed(2)}" (tea cup)`;
  if (size < 4.0) return `${size.toFixed(2)}" (softball)`;
  return `${size.toFixed(2)}" (EXTREME)`;
}

/**
 * Get severity classification based on hail size
 */
export function getHailSeverity(size: number): 'minimal' | 'minor' | 'moderate' | 'severe' | 'extreme' {
  if (size < 0.75) return 'minimal';
  if (size < 1.0) return 'minor';
  if (size < 1.75) return 'moderate';
  if (size < 2.75) return 'severe';
  return 'extreme';
}

/**
 * Get urgency message based on damage score
 */
export function getUrgencyMessage(score: number): string {
  if (score >= 80) return REPORT_CONTENT.callToAction.urgencyMessages.critical;
  if (score >= 60) return REPORT_CONTENT.callToAction.urgencyMessages.high;
  if (score >= 40) return REPORT_CONTENT.callToAction.urgencyMessages.moderate;
  return REPORT_CONTENT.callToAction.urgencyMessages.low;
}

/**
 * Generate report title with property address
 */
export function generateReportTitle(address: string): string {
  return `${REPORT_CONTENT.title}\n${address}`;
}

/**
 * Format distance for display
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'Direct impact';
  if (miles < 1) return `${(miles * 5280).toFixed(0)} feet`;
  return `${miles.toFixed(2)} miles`;
}

/**
 * Get color for damage score visualization
 */
export function getDamageScoreColor(score: number): string {
  return getDamageScoreDescription(score).color;
}

/**
 * Get icon for damage score
 */
export function getDamageScoreIcon(score: number): string {
  return getDamageScoreDescription(score).icon;
}

export type DamageScoreLevel = keyof typeof REPORT_CONTENT.damageScoreDescriptions;
export type SummaryTemplate = keyof typeof REPORT_CONTENT.summaryTemplates;
