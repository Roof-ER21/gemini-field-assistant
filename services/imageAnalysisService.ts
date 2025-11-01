/**
 * Image Analysis Service
 * Uses Gemini Vision API to analyze roof damage photos
 */

import { env } from '../src/config/env';

export interface DamageAssessment {
  id: string;
  timestamp: Date;
  imageUrl: string;
  imageName: string;
  analysis: {
    damageDetected: boolean;
    damageType: string[];
    severity: 'minor' | 'moderate' | 'severe' | 'critical';
    affectedArea: string;
    estimatedSize: string;
    recommendations: string[];
    urgency: 'low' | 'medium' | 'high' | 'urgent';
  };
  rawResponse: string;
  confidence: number;
}

export interface SafetyHazard {
  type: string;
  location: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Analyze roof damage from an image
 */
export async function analyzeRoofImage(
  imageFile: File
): Promise<DamageAssessment> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('Gemini API key not configured');
  }

  // Convert image to base64
  const imageData = await fileToBase64(imageFile);

  // Dynamic import to avoid build issues
  const { GoogleGenerativeAI } = await import('@google/genai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp' // Vision-capable model
  });

  const prompt = `You are a professional roofing inspector analyzing this roof photo for damage assessment.

ANALYSIS REQUIREMENTS:
1. **Damage Detection**: Identify any visible damage (missing shingles, cracks, holes, wear, storm damage, hail damage, wind damage)
2. **Damage Type**: Classify damage type (wind, hail, age-related, storm, structural, cosmetic)
3. **Severity**: Rate severity (minor, moderate, severe, critical)
4. **Affected Area**: Describe location and extent (ridge, valley, slope, flashing, edges)
5. **Estimated Size**: Approximate damaged area in square feet or percentage
6. **Safety Hazards**: Note any immediate safety concerns (exposed decking, structural weakness, water infiltration risk)
7. **Recommendations**: Provide actionable next steps (repair, replace, emergency tarping, etc.)
8. **Urgency**: Rate urgency (low, medium, high, urgent)

FORMAT YOUR RESPONSE AS JSON:
{
  "damageDetected": true/false,
  "damageType": ["hail", "wind", etc.],
  "severity": "minor|moderate|severe|critical",
  "affectedArea": "description of location",
  "estimatedSize": "X sq ft or X%",
  "safetyHazards": [
    {
      "type": "string",
      "location": "string",
      "severity": "low|medium|high",
      "description": "string"
    }
  ],
  "recommendations": ["action 1", "action 2"],
  "urgency": "low|medium|high|urgent",
  "confidence": 0-100,
  "detailedAnalysis": "Full paragraph analysis for insurance documentation"
}

Be specific, professional, and focus on details that would support an insurance claim.`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: imageFile.type,
        data: imageData.split(',')[1], // Remove data:image/xxx;base64, prefix
      },
    },
  ]);

  const response = await result.response;
  const text = response.text();

  // Parse JSON response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response');
  }

  const analysisData = JSON.parse(jsonMatch[0]);

  // Create image URL for display
  const imageUrl = await fileToDataURL(imageFile);

  const assessment: DamageAssessment = {
    id: generateId(),
    timestamp: new Date(),
    imageUrl,
    imageName: imageFile.name,
    analysis: {
      damageDetected: analysisData.damageDetected || false,
      damageType: analysisData.damageType || [],
      severity: analysisData.severity || 'minor',
      affectedArea: analysisData.affectedArea || 'Unknown',
      estimatedSize: analysisData.estimatedSize || 'Unknown',
      recommendations: analysisData.recommendations || [],
      urgency: analysisData.urgency || 'low',
    },
    rawResponse: analysisData.detailedAnalysis || text,
    confidence: analysisData.confidence || 85,
  };

  // Store in localStorage
  saveAssessment(assessment);

  return assessment;
}

/**
 * Analyze multiple images in batch
 */
export async function analyzeBatchImages(
  imageFiles: File[]
): Promise<DamageAssessment[]> {
  const results: DamageAssessment[] = [];

  for (const file of imageFiles) {
    try {
      const assessment = await analyzeRoofImage(file);
      results.push(assessment);
    } catch (error) {
      console.error(`Failed to analyze ${file.name}:`, error);
    }
  }

  return results;
}

/**
 * Generate inspection report from assessments
 */
export function generateInspectionReport(
  assessments: DamageAssessment[],
  propertyAddress: string = 'Address Not Provided'
): string {
  const reportDate = new Date().toLocaleDateString();
  const damageCount = assessments.filter(a => a.analysis.damageDetected).length;
  const severeDamage = assessments.filter(
    a => a.analysis.severity === 'severe' || a.analysis.severity === 'critical'
  );

  let report = `ROOF INSPECTION REPORT
Generated: ${reportDate}
Property: ${propertyAddress}
Images Analyzed: ${assessments.length}

SUMMARY:
- Damage Detected: ${damageCount} of ${assessments.length} images
- Severe/Critical Issues: ${severeDamage.length}
- Overall Urgency: ${getOverallUrgency(assessments)}

DETAILED FINDINGS:
`;

  assessments.forEach((assessment, idx) => {
    report += `\n${idx + 1}. ${assessment.imageName}
   Damage: ${assessment.analysis.damageDetected ? 'YES' : 'NO'}
   Type: ${assessment.analysis.damageType.join(', ') || 'None'}
   Severity: ${assessment.analysis.severity.toUpperCase()}
   Location: ${assessment.analysis.affectedArea}
   Size: ${assessment.analysis.estimatedSize}
   Urgency: ${assessment.analysis.urgency.toUpperCase()}

   Analysis: ${assessment.rawResponse}

   Recommendations:
   ${assessment.analysis.recommendations.map(r => `   - ${r}`).join('\n')}

`;
  });

  report += `\nINSPECTOR NOTES:
This AI-generated report should be verified by a licensed roofing professional before submitting to insurance.

Report generated by S21 Field AI - Roof-ER`;

  return report;
}

/**
 * Get all saved assessments from localStorage
 */
export function getSavedAssessments(): DamageAssessment[] {
  const saved = localStorage.getItem('roof_damage_assessments');
  if (!saved) return [];

  try {
    const assessments = JSON.parse(saved);
    // Convert timestamp strings back to Date objects
    return assessments.map((a: any) => ({
      ...a,
      timestamp: new Date(a.timestamp),
    }));
  } catch {
    return [];
  }
}

/**
 * Save assessment to localStorage
 */
function saveAssessment(assessment: DamageAssessment): void {
  const assessments = getSavedAssessments();
  assessments.unshift(assessment); // Add to beginning

  // Keep only last 50 assessments
  const trimmed = assessments.slice(0, 50);

  localStorage.setItem('roof_damage_assessments', JSON.stringify(trimmed));
}

/**
 * Delete assessment
 */
export function deleteAssessment(id: string): void {
  const assessments = getSavedAssessments().filter(a => a.id !== id);
  localStorage.setItem('roof_damage_assessments', JSON.stringify(assessments));
}

/**
 * Get overall urgency from multiple assessments
 */
function getOverallUrgency(assessments: DamageAssessment[]): string {
  const urgencies = assessments.map(a => a.analysis.urgency);

  if (urgencies.includes('urgent')) return 'URGENT';
  if (urgencies.includes('high')) return 'HIGH';
  if (urgencies.includes('medium')) return 'MEDIUM';
  return 'LOW';
}

/**
 * Convert File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert File to data URL for display
 */
async function fileToDataURL(file: File): Promise<string> {
  return fileToBase64(file);
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `assess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Export assessment as PDF (requires jsPDF library)
 * For now, returns markdown that can be downloaded
 */
export function exportAssessmentAsMarkdown(assessment: DamageAssessment): string {
  return `# Roof Damage Assessment Report

**Date:** ${assessment.timestamp.toLocaleString()}
**Image:** ${assessment.imageName}
**Confidence:** ${assessment.confidence}%

## Damage Detection
- **Detected:** ${assessment.analysis.damageDetected ? 'Yes' : 'No'}
- **Type:** ${assessment.analysis.damageType.join(', ') || 'None'}
- **Severity:** ${assessment.analysis.severity.toUpperCase()}
- **Urgency:** ${assessment.analysis.urgency.toUpperCase()}

## Location & Extent
- **Affected Area:** ${assessment.analysis.affectedArea}
- **Estimated Size:** ${assessment.analysis.estimatedSize}

## Detailed Analysis
${assessment.rawResponse}

## Recommendations
${assessment.analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

*Generated by S21 Field AI - Roof-ER*
*This AI-generated assessment should be verified by a licensed roofing professional.*
`;
}
