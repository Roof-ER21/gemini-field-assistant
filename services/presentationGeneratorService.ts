/**
 * Presentation Generator Service
 * Automatically converts inspection photos and damage assessments into professional presentations
 */

import { DamageAssessment } from './imageAnalysisService';
import { generateEmail, getComplexAnswer } from './geminiService';

// Slide types for structured presentation
export type SlideType =
  | 'INTRO'
  | 'DAMAGE'
  | 'COMPARISON'
  | 'SUMMARY'
  | 'INSURANCE'
  | 'RECOMMENDATIONS'
  | 'CONTACT'
  | 'NEXT_STEPS';

// Individual slide structure
export interface PresentationSlide {
  id: string;
  type: SlideType;
  order: number;
  title: string;
  subtitle?: string;
  content: string[];
  imageUrl?: string;
  imageName?: string;
  talkingPoints: string[];
  insuranceNotes?: string[];
  metadata?: {
    damageType?: string[];
    severity?: string;
    claimViability?: string;
    urgency?: string;
  };
}

// Complete presentation structure
export interface Presentation {
  id: string;
  title: string;
  propertyAddress: string;
  inspectionDate: Date;
  repName: string;
  repContact: string;
  slides: PresentationSlide[];
  summary: {
    totalPhotos: number;
    damageDetected: number;
    severityScore: number; // 0-100
    claimViability: 'strong' | 'moderate' | 'weak' | 'none';
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    estimatedScope: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Presentation generation options
export interface PresentationOptions {
  propertyAddress: string;
  repName: string;
  repContact: string;
  inspectionDate?: Date;
  includeComparison?: boolean;
  includeTalkingPoints?: boolean;
  focusInsurance?: boolean;
}

/**
 * Generate a complete presentation from damage assessments
 */
export async function generatePresentation(
  assessments: DamageAssessment[],
  options: PresentationOptions
): Promise<Presentation> {
  if (assessments.length === 0) {
    throw new Error('No damage assessments provided');
  }

  const presentationId = generatePresentationId();
  const inspectionDate = options.inspectionDate || new Date();
  const slides: PresentationSlide[] = [];
  let slideOrder = 1;

  // 1. INTRO SLIDE
  const introSlide = await generateIntroSlide(
    slideOrder++,
    options.propertyAddress,
    inspectionDate,
    options.repName,
    options.repContact
  );
  slides.push(introSlide);

  // 2. DAMAGE SLIDES (one per significant damage area)
  const damageSlides = await generateDamageSlides(
    assessments,
    slideOrder,
    options.focusInsurance || false
  );
  slides.push(...damageSlides);
  slideOrder += damageSlides.length;

  // 3. COMPARISON SLIDE (if multiple images)
  if (options.includeComparison && assessments.length > 1) {
    const comparisonSlide = await generateComparisonSlide(
      slideOrder++,
      assessments
    );
    slides.push(comparisonSlide);
  }

  // 4. SUMMARY SLIDE
  const summarySlide = await generateSummarySlide(slideOrder++, assessments);
  slides.push(summarySlide);

  // 5. INSURANCE SLIDE
  const insuranceSlide = await generateInsuranceSlide(
    slideOrder++,
    assessments
  );
  slides.push(insuranceSlide);

  // 6. RECOMMENDATIONS SLIDE
  const recommendationsSlide = await generateRecommendationsSlide(
    slideOrder++,
    assessments
  );
  slides.push(recommendationsSlide);

  // 7. CONTACT/NEXT STEPS SLIDE
  const contactSlide = generateContactSlide(
    slideOrder++,
    options.repName,
    options.repContact
  );
  slides.push(contactSlide);

  // Calculate summary metrics
  const summary = calculatePresentationSummary(assessments);

  const presentation: Presentation = {
    id: presentationId,
    title: `Roof Inspection - ${options.propertyAddress}`,
    propertyAddress: options.propertyAddress,
    inspectionDate,
    repName: options.repName,
    repContact: options.repContact,
    slides,
    summary,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to localStorage
  savePresentation(presentation);

  return presentation;
}

/**
 * Generate intro slide
 */
async function generateIntroSlide(
  order: number,
  address: string,
  date: Date,
  repName: string,
  repContact: string
): Promise<PresentationSlide> {
  return {
    id: generateSlideId(),
    type: 'INTRO',
    order,
    title: 'Roof Inspection Report',
    subtitle: address,
    content: [
      `Property: ${address}`,
      `Inspection Date: ${date.toLocaleDateString()}`,
      `Inspector: ${repName}`,
      `Contact: ${repContact}`,
      'Powered by S21 Field AI',
    ],
    talkingPoints: [
      'Thank you for allowing us to inspect your property today',
      'I\'ve documented the condition of your roof with detailed photographs',
      'This AI-assisted analysis helps ensure we don\'t miss any damage',
      'Let\'s review what I found during the inspection',
    ],
    insuranceNotes: [
      'This is an AI-assisted preliminary assessment',
      'Photos and findings are suitable for insurance documentation',
      'Final determination requires professional verification',
    ],
  };
}

/**
 * Generate damage slides (one per significant damage area)
 */
async function generateDamageSlides(
  assessments: DamageAssessment[],
  startOrder: number,
  focusInsurance: boolean
): Promise<PresentationSlide[]> {
  const slides: PresentationSlide[] = [];

  // Filter to only include damage-detected assessments
  const damageAssessments = assessments.filter(a => a.analysis.damageDetected);

  for (let i = 0; i < damageAssessments.length; i++) {
    const assessment = damageAssessments[i];
    const slide: PresentationSlide = {
      id: generateSlideId(),
      type: 'DAMAGE',
      order: startOrder + i,
      title: await generateDamageTitle(assessment),
      subtitle: assessment.analysis.affectedArea,
      content: [
        `Damage Type: ${assessment.analysis.damageType.join(', ')}`,
        `Severity: ${capitalizeFirst(assessment.analysis.severity)}`,
        `Affected Area: ${assessment.analysis.affectedArea}`,
        `Estimated Size: ${assessment.analysis.estimatedSize}`,
        `Urgency: ${capitalizeFirst(assessment.analysis.urgency)}`,
        `Claim Viability: ${capitalizeFirst(assessment.analysis.claimViability)}`,
      ],
      imageUrl: assessment.imageUrl,
      imageName: assessment.imageName,
      talkingPoints: focusInsurance
        ? assessment.analysis.insuranceArguments
        : await generateTalkingPoints(assessment),
      insuranceNotes: assessment.analysis.insuranceArguments,
      metadata: {
        damageType: assessment.analysis.damageType,
        severity: assessment.analysis.severity,
        claimViability: assessment.analysis.claimViability,
        urgency: assessment.analysis.urgency,
      },
    };
    slides.push(slide);
  }

  return slides;
}

/**
 * Generate comparison slide
 */
async function generateComparisonSlide(
  order: number,
  assessments: DamageAssessment[]
): Promise<PresentationSlide> {
  const damageAreas = assessments
    .filter(a => a.analysis.damageDetected)
    .map(a => a.analysis.affectedArea);

  const goodAreas = assessments
    .filter(a => !a.analysis.damageDetected)
    .map(a => a.analysis.affectedArea);

  return {
    id: generateSlideId(),
    type: 'COMPARISON',
    order,
    title: 'Damage Overview - Area Comparison',
    content: [
      `Total Areas Inspected: ${assessments.length}`,
      `Areas with Damage: ${damageAreas.length}`,
      `Areas in Good Condition: ${goodAreas.length}`,
      '',
      'Damaged Areas:',
      ...damageAreas.map(area => `  • ${area}`),
      '',
      'Good Condition Areas:',
      ...goodAreas.map(area => `  • ${area}`),
    ],
    talkingPoints: [
      'I inspected multiple areas of your roof for a complete assessment',
      `Found damage in ${damageAreas.length} of ${assessments.length} areas examined`,
      'This helps establish the scope of work for insurance purposes',
      'Comparing damaged vs undamaged areas supports the claim documentation',
    ],
  };
}

/**
 * Generate summary slide
 */
async function generateSummarySlide(
  order: number,
  assessments: DamageAssessment[]
): Promise<PresentationSlide> {
  const summary = calculatePresentationSummary(assessments);
  const damageTypes = Array.from(
    new Set(
      assessments
        .filter(a => a.analysis.damageDetected)
        .flatMap(a => a.analysis.damageType)
    )
  );

  return {
    id: generateSlideId(),
    type: 'SUMMARY',
    order,
    title: 'Overall Damage Assessment',
    subtitle: `Severity Score: ${summary.severityScore}/100`,
    content: [
      `Total Photos Analyzed: ${summary.totalPhotos}`,
      `Areas with Damage: ${summary.damageDetected}`,
      `Primary Damage Types: ${damageTypes.join(', ')}`,
      `Overall Severity: ${getSeverityLabel(summary.severityScore)}`,
      `Claim Viability: ${capitalizeFirst(summary.claimViability)}`,
      `Recommended Urgency: ${capitalizeFirst(summary.urgency)}`,
      `Estimated Scope: ${summary.estimatedScope}`,
    ],
    talkingPoints: [
      `Based on my inspection, I found ${summary.damageDetected} areas with ${damageTypes.join(' and ')} damage`,
      `The severity score of ${summary.severityScore}/100 indicates ${getSeverityDescription(summary.severityScore)}`,
      `This level of damage ${getClaimViabilityDescription(summary.claimViability)}`,
      'The documentation I\'ve gathered supports moving forward with the claim process',
    ],
    metadata: {
      severity: getSeverityLabel(summary.severityScore),
      claimViability: summary.claimViability,
      urgency: summary.urgency,
    },
  };
}

/**
 * Generate insurance slide
 */
async function generateInsuranceSlide(
  order: number,
  assessments: DamageAssessment[]
): Promise<PresentationSlide> {
  const damageAssessments = assessments.filter(a => a.analysis.damageDetected);
  const allInsuranceArgs = damageAssessments.flatMap(
    a => a.analysis.insuranceArguments
  );

  // Get unique, most important arguments (limit to top 5)
  const topArguments = Array.from(new Set(allInsuranceArgs)).slice(0, 5);

  const strongClaims = damageAssessments.filter(
    a => a.analysis.claimViability === 'strong'
  ).length;

  return {
    id: generateSlideId(),
    type: 'INSURANCE',
    order,
    title: 'Insurance Claim Documentation',
    subtitle: 'Key Points for Adjuster Meeting',
    content: [
      'Claim Strengths:',
      ...topArguments.map(arg => `  • ${arg}`),
      '',
      `Strong Claims: ${strongClaims} of ${damageAssessments.length} damaged areas`,
      '',
      'Documentation Checklist:',
      '  ✓ Detailed photos of all damage',
      '  ✓ AI-assisted damage analysis',
      '  ✓ Severity and urgency assessment',
      '  ✓ Policy language recommendations',
      '  ✓ Scope of loss determination',
    ],
    talkingPoints: [
      'I\'ve documented everything the insurance adjuster will need to see',
      'Here are the key arguments that support your claim',
      'Each photo has been analyzed for insurance-specific talking points',
      'When the adjuster arrives, you\'ll be fully prepared with this documentation',
    ],
    insuranceNotes: topArguments,
  };
}

/**
 * Generate recommendations slide
 */
async function generateRecommendationsSlide(
  order: number,
  assessments: DamageAssessment[]
): Promise<PresentationSlide> {
  const allRecommendations = assessments
    .filter(a => a.analysis.damageDetected)
    .flatMap(a => a.analysis.recommendations);

  // Get unique recommendations
  const uniqueRecommendations = Array.from(new Set(allRecommendations));

  const urgentItems = assessments.filter(
    a => a.analysis.urgency === 'urgent' || a.analysis.urgency === 'high'
  );

  return {
    id: generateSlideId(),
    type: 'RECOMMENDATIONS',
    order,
    title: 'Next Steps & Recommendations',
    subtitle: urgentItems.length > 0 ? 'Immediate Action Required' : 'Recommended Actions',
    content: [
      'Immediate Actions:',
      ...uniqueRecommendations.slice(0, 5).map(rec => `  • ${rec}`),
      '',
      urgentItems.length > 0
        ? `⚠️ ${urgentItems.length} area(s) require urgent attention`
        : '',
      '',
      'Next Steps:',
      '  1. File insurance claim immediately',
      '  2. Schedule adjuster meeting',
      '  3. Gather supporting documentation',
      '  4. Keep this property safe until repairs begin',
    ],
    talkingPoints: [
      'Based on what I found, here\'s what you should do next',
      urgentItems.length > 0
        ? 'Some areas need immediate attention to prevent further damage'
        : 'We can move forward with the claim process in an orderly manner',
      'I recommend filing your insurance claim as soon as possible',
      'I\'ll help you through every step of the process',
    ],
  };
}

/**
 * Generate contact/next steps slide
 */
function generateContactSlide(
  order: number,
  repName: string,
  repContact: string
): PresentationSlide {
  return {
    id: generateSlideId(),
    type: 'CONTACT',
    order,
    title: 'Thank You',
    subtitle: 'Your Next Steps',
    content: [
      'What Happens Next:',
      '  1. Review this report with your family',
      '  2. Contact your insurance company to file a claim',
      '  3. Schedule the adjuster meeting',
      '  4. Call me with any questions',
      '',
      'Your Roof-ER Representative:',
      `  ${repName}`,
      `  ${repContact}`,
      '',
      'We\'re here to help you through the entire process',
    ],
    talkingPoints: [
      'Thank you for trusting Roof-ER with your inspection',
      'I\'m here to answer any questions you have',
      'Don\'t hesitate to reach out - I\'ll help you with the insurance process',
      'Let\'s schedule a follow-up call after you file the claim',
    ],
  };
}

/**
 * Calculate overall presentation summary
 */
function calculatePresentationSummary(
  assessments: DamageAssessment[]
): Presentation['summary'] {
  const damageAssessments = assessments.filter(a => a.analysis.damageDetected);

  // Calculate severity score (0-100)
  const severityScores = damageAssessments.map(a => {
    switch (a.analysis.severity) {
      case 'critical': return 100;
      case 'severe': return 75;
      case 'moderate': return 50;
      case 'minor': return 25;
      default: return 0;
    }
  });
  const avgSeverity = severityScores.length > 0
    ? Math.round(severityScores.reduce((a, b) => a + b, 0) / severityScores.length)
    : 0;

  // Determine overall claim viability
  const viabilityCounts = {
    strong: damageAssessments.filter(a => a.analysis.claimViability === 'strong').length,
    moderate: damageAssessments.filter(a => a.analysis.claimViability === 'moderate').length,
    weak: damageAssessments.filter(a => a.analysis.claimViability === 'weak').length,
    none: damageAssessments.filter(a => a.analysis.claimViability === 'none').length,
  };

  let overallViability: 'strong' | 'moderate' | 'weak' | 'none' = 'none';
  if (viabilityCounts.strong >= damageAssessments.length * 0.5) {
    overallViability = 'strong';
  } else if (viabilityCounts.strong + viabilityCounts.moderate >= damageAssessments.length * 0.5) {
    overallViability = 'moderate';
  } else if (damageAssessments.length > 0) {
    overallViability = 'weak';
  }

  // Determine overall urgency
  const urgencies = damageAssessments.map(a => a.analysis.urgency);
  let overallUrgency: 'low' | 'medium' | 'high' | 'urgent' = 'low';
  if (urgencies.includes('urgent')) {
    overallUrgency = 'urgent';
  } else if (urgencies.includes('high')) {
    overallUrgency = 'high';
  } else if (urgencies.includes('medium')) {
    overallUrgency = 'medium';
  }

  // Estimate scope
  const estimatedScope = avgSeverity >= 75
    ? 'Full roof replacement recommended'
    : avgSeverity >= 50
    ? 'Significant repair or partial replacement'
    : avgSeverity >= 25
    ? 'Targeted repairs required'
    : 'Minor repairs sufficient';

  return {
    totalPhotos: assessments.length,
    damageDetected: damageAssessments.length,
    severityScore: avgSeverity,
    claimViability: overallViability,
    urgency: overallUrgency,
    estimatedScope,
  };
}

/**
 * Generate damage-specific title
 */
async function generateDamageTitle(
  assessment: DamageAssessment
): Promise<string> {
  const type = assessment.analysis.damageType[0] || 'damage';
  const severity = assessment.analysis.severity;

  return `${capitalizeFirst(severity)} ${capitalizeFirst(type)} Damage`;
}

/**
 * Generate talking points for a damage assessment
 */
async function generateTalkingPoints(
  assessment: DamageAssessment
): Promise<string[]> {
  const basePoints = [
    `This area shows ${assessment.analysis.severity} ${assessment.analysis.damageType.join(' and ')} damage`,
    `The affected area is approximately ${assessment.analysis.estimatedSize}`,
  ];

  if (assessment.analysis.urgency === 'urgent' || assessment.analysis.urgency === 'high') {
    basePoints.push('This requires immediate attention to prevent further damage');
  }

  if (assessment.analysis.claimViability === 'strong') {
    basePoints.push('This damage has strong insurance claim viability');
  }

  basePoints.push(assessment.analysis.policyLanguage || 'Document this carefully for the insurance adjuster');

  return basePoints;
}

/**
 * Get severity label from score
 */
function getSeverityLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'Severe';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Minor';
  return 'Minimal';
}

/**
 * Get severity description
 */
function getSeverityDescription(score: number): string {
  if (score >= 80) return 'critical damage requiring immediate full replacement';
  if (score >= 60) return 'severe damage with likely full replacement needed';
  if (score >= 40) return 'moderate damage requiring significant repairs';
  if (score >= 20) return 'minor damage that should be addressed promptly';
  return 'minimal damage that can be monitored';
}

/**
 * Get claim viability description
 */
function getClaimViabilityDescription(viability: string): string {
  switch (viability) {
    case 'strong':
      return 'strongly supports a successful insurance claim';
    case 'moderate':
      return 'should qualify for insurance coverage with proper documentation';
    case 'weak':
      return 'may be challenging for insurance coverage';
    case 'none':
      return 'is unlikely to qualify for insurance coverage';
    default:
      return 'requires professional evaluation for claim viability';
  }
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate unique presentation ID
 */
function generatePresentationId(): string {
  return `pres_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique slide ID
 */
function generateSlideId(): string {
  return `slide_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save presentation to localStorage
 */
function savePresentation(presentation: Presentation): void {
  const presentations = getSavedPresentations();
  presentations.unshift(presentation);

  // Keep only last 20 presentations
  const trimmed = presentations.slice(0, 20);

  localStorage.setItem('roof_presentations', JSON.stringify(trimmed));
}

/**
 * Get all saved presentations
 */
export function getSavedPresentations(): Presentation[] {
  const saved = localStorage.getItem('roof_presentations');
  if (!saved) return [];

  try {
    const presentations = JSON.parse(saved);
    return presentations.map((p: any) => ({
      ...p,
      inspectionDate: new Date(p.inspectionDate),
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));
  } catch {
    return [];
  }
}

/**
 * Get presentation by ID
 */
export function getPresentationById(id: string): Presentation | null {
  const presentations = getSavedPresentations();
  return presentations.find(p => p.id === id) || null;
}

/**
 * Delete presentation
 */
export function deletePresentation(id: string): void {
  const presentations = getSavedPresentations().filter(p => p.id !== id);
  localStorage.setItem('roof_presentations', JSON.stringify(presentations));
}

/**
 * Update existing presentation
 */
export function updatePresentation(updatedPresentation: Presentation): void {
  const presentations = getSavedPresentations();
  const index = presentations.findIndex(p => p.id === updatedPresentation.id);

  if (index !== -1) {
    updatedPresentation.updatedAt = new Date();
    presentations[index] = updatedPresentation;
    localStorage.setItem('roof_presentations', JSON.stringify(presentations));
  }
}

/**
 * Export presentation as markdown
 */
export function exportPresentationAsMarkdown(presentation: Presentation): string {
  let markdown = `# ${presentation.title}\n\n`;
  markdown += `**Property:** ${presentation.propertyAddress}\n`;
  markdown += `**Inspection Date:** ${presentation.inspectionDate.toLocaleDateString()}\n`;
  markdown += `**Inspector:** ${presentation.repName}\n`;
  markdown += `**Contact:** ${presentation.repContact}\n\n`;

  markdown += `## Executive Summary\n\n`;
  markdown += `- **Total Photos:** ${presentation.summary.totalPhotos}\n`;
  markdown += `- **Areas with Damage:** ${presentation.summary.damageDetected}\n`;
  markdown += `- **Severity Score:** ${presentation.summary.severityScore}/100 (${getSeverityLabel(presentation.summary.severityScore)})\n`;
  markdown += `- **Claim Viability:** ${capitalizeFirst(presentation.summary.claimViability)}\n`;
  markdown += `- **Urgency:** ${capitalizeFirst(presentation.summary.urgency)}\n`;
  markdown += `- **Estimated Scope:** ${presentation.summary.estimatedScope}\n\n`;

  markdown += `---\n\n`;

  presentation.slides.forEach((slide, index) => {
    markdown += `## Slide ${index + 1}: ${slide.title}\n\n`;
    if (slide.subtitle) {
      markdown += `**${slide.subtitle}**\n\n`;
    }

    if (slide.content.length > 0) {
      markdown += `### Details\n\n`;
      slide.content.forEach(line => {
        markdown += `${line}\n`;
      });
      markdown += `\n`;
    }

    if (slide.talkingPoints.length > 0) {
      markdown += `### Talking Points\n\n`;
      slide.talkingPoints.forEach(point => {
        markdown += `- ${point}\n`;
      });
      markdown += `\n`;
    }

    if (slide.insuranceNotes && slide.insuranceNotes.length > 0) {
      markdown += `### Insurance Notes\n\n`;
      slide.insuranceNotes.forEach(note => {
        markdown += `- ${note}\n`;
      });
      markdown += `\n`;
    }

    if (slide.imageName) {
      markdown += `**Image:** ${slide.imageName}\n\n`;
    }

    markdown += `---\n\n`;
  });

  markdown += `*Generated by S21 Field AI - Roof-ER*\n`;
  markdown += `*Created: ${presentation.createdAt.toLocaleString()}*\n`;

  return markdown;
}

/**
 * Generate presentation from saved assessments
 */
export async function generatePresentationFromIds(
  assessmentIds: string[],
  options: PresentationOptions
): Promise<Presentation> {
  // This would fetch assessments from localStorage by ID
  // For now, throw an error as we need the full assessment objects
  throw new Error('Use generatePresentation() with full DamageAssessment objects');
}
