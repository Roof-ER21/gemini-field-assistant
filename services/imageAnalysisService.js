/**
 * Image Analysis Service
 * Uses Gemini Vision API to analyze roof damage photos
 */
import { env } from '../src/config/env.js';
import { GoogleGenAI } from '@google/genai';
/**
 * Analyze roof damage from an image
 */
export async function analyzeRoofImage(imageFile, context) {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        throw new Error('Gemini API key not configured');
    }
    // Convert image to base64
    const imageData = await fileToBase64(imageFile);
    // Initialize Gemini AI
    const genAI = new GoogleGenAI({ apiKey });
    const contextBlock = context ? `\n${context}\n` : '';
    const prompt = `You are Susan, an insurance claims specialist for Roof-ER. Your role is to analyze roof damage photos and provide INSURANCE-FOCUSED guidance - NOT retail sales talk.

${contextBlock}

CRITICAL MINDSET:
- Think like an insurance adjuster, not a salesperson
- Focus on POLICY LANGUAGE and CLAIM VIABILITY
- Don't talk about "supplementing" or "upselling" - talk about COVERED PERILS and MATCHING REQUIREMENTS
- Use adjuster terminology: "covered peril", "scope of loss", "like kind and quality", "repairability", "matching"
- Your goal: Help the rep DOCUMENT and ARGUE the claim, not sell upgrades

ANALYSIS REQUIREMENTS:

1. **Damage Documentation** (For Insurance Adjuster):
   - What specific covered peril caused this? (wind, hail, storm, falling object, etc.)
   - Is this sudden and accidental (covered) or gradual wear (not covered)?
   - Can you see manufacturer defects vs. storm damage?
   - Are there code violations visible that would require upgrades?

2. **Scope of Loss Determination**:
   - Affected area size and location
   - Is damage repairable or does it require replacement?
   - If repairable: Document WHY it's not repairable (brittle shingles, won't seal, safety hazard)
   - If replacement needed: What percentage of roof is affected?

3. **Matching & Code Arguments**:
   - Are shingles discontinued? (Key for MD matching law IRC R908.3)
   - Can you match color/texture/style with available products?
   - Are there code upgrade triggers? (if >25% damaged in some jurisdictions)
   - Will partial replacement create aesthetic mismatch?

4. **Policy Language Translation**:
   - How should the rep phrase this damage to the adjuster?
   - What specific policy clauses apply? (matching, code upgrades, like kind and quality)
   - What's the strongest argument for full replacement vs repair?

5. **Follow-Up Questions**:
   - What additional info do you need to strengthen the claim?
   - What documents/photos would help? (shingle wrapper, other angles, age of roof, etc.)
   - What details are missing that adjusters will ask for?

FORMAT YOUR RESPONSE AS JSON:
{
  "damageDetected": true/false,
  "damageType": ["wind", "hail", "impact", etc.],
  "severity": "minor|moderate|severe|critical",
  "affectedArea": "Specific location with insurance terminology",
  "estimatedSize": "X sq ft or X% of total roof area",
  "claimViability": "strong|moderate|weak|none",
  "policyLanguage": "Exact phrase to use with adjuster: 'The covered peril of [X] has caused [Y] requiring [Z]'",
  "insuranceArguments": [
    "Key argument 1 for adjuster (e.g., 'Shingles are discontinued per manufacturer - IRC R908.3 requires matching')",
    "Key argument 2 for adjuster",
    "Key argument 3 for adjuster"
  ],
  "recommendations": [
    "Action items for rep (get shingle wrapper, photograph X, document Y)",
    "Next steps for claim process"
  ],
  "followUpQuestions": [
    "What year was the roof installed?",
    "Do you have the shingle wrapper or manufacturer info?",
    "When did the storm/damage occur?",
    "Other questions needed to complete documentation"
  ],
  "urgency": "low|medium|high|urgent",
  "confidence": 0-100,
  "detailedAnalysis": "Insurance adjuster-focused analysis explaining WHY this is covered and HOW to argue it"
}

REMEMBER: You're helping document a CLAIM, not make a SALE. Focus on coverage, not upgrades.`;
    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp', // Vision-capable model
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: imageFile.type,
                            data: imageData.split(',')[1], // Remove data:image/xxx;base64, prefix
                        },
                    },
                ],
            },
        ],
    });
    const text = response.text ?? '';
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
    }
    const analysisData = JSON.parse(jsonMatch[0]);
    // Create image URL for display
    const imageUrl = await fileToDataURL(imageFile);
    const assessment = {
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
            insuranceArguments: analysisData.insuranceArguments || [],
            claimViability: analysisData.claimViability || 'moderate',
            policyLanguage: analysisData.policyLanguage || '',
        },
        followUpQuestions: analysisData.followUpQuestions || [],
        rawResponse: analysisData.detailedAnalysis || text,
        confidence: analysisData.confidence || 85,
        conversationHistory: [],
    };
    // Store in localStorage
    saveAssessment(assessment);
    return assessment;
}
/**
 * Answer follow-up questions and refine the assessment
 */
export async function answerFollowUpQuestion(assessment, questionIndex, answer, context) {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        throw new Error('Gemini API key not configured');
    }
    const question = assessment.followUpQuestions[questionIndex];
    const conversationHistory = assessment.conversationHistory || [];
    // Build conversation context
    const historyText = conversationHistory
        .map(h => `Q: ${h.question}\nA: ${h.answer}`)
        .join('\n\n');
    // Initialize Gemini AI
    const genAI = new GoogleGenAI({ apiKey });
    const contextBlock = context ? `\n${context}\n` : '';
    const prompt = `You are Susan, an insurance claims specialist for Roof-ER. You previously analyzed a roof damage photo and asked follow-up questions.

${contextBlock}

PREVIOUS ANALYSIS:
${assessment.rawResponse}

PREVIOUS QUESTIONS ANSWERED:
${historyText || 'None yet'}

NEW INFORMATION PROVIDED:
Question: ${question}
Answer: ${answer}

TASK: Update your insurance claim assessment based on this new information. Provide a REVISED analysis that:
1. Incorporates the new information into your claim strategy
2. Updates insurance arguments if needed
3. Updates policy language if needed
4. Removes this question from follow-up list
5. Adds any NEW follow-up questions that this answer triggers
6. Maintains INSURANCE ADJUSTER focus (not retail sales)

FORMAT YOUR RESPONSE AS JSON:
{
  "revisedAnalysis": "Updated detailed analysis incorporating new info",
  "updatedInsuranceArguments": ["Revised argument 1", "Revised argument 2"],
  "updatedPolicyLanguage": "Revised phrase for adjuster",
  "claimViability": "strong|moderate|weak|none",
  "additionalFollowUpQuestions": ["New question 1 if needed", "New question 2 if needed"],
  "impactAssessment": "How does this new information change the claim approach?"
}`;
    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
    });
    const text = response.text ?? '';
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
    }
    const data = JSON.parse(jsonMatch[0]);
    // Update assessment
    const updatedAssessment = {
        ...assessment,
        analysis: {
            ...assessment.analysis,
            insuranceArguments: data.updatedInsuranceArguments || assessment.analysis.insuranceArguments,
            policyLanguage: data.updatedPolicyLanguage || assessment.analysis.policyLanguage,
            claimViability: data.claimViability || assessment.analysis.claimViability,
        },
        followUpQuestions: [
            ...assessment.followUpQuestions.filter((_, idx) => idx !== questionIndex),
            ...(data.additionalFollowUpQuestions || []),
        ],
        rawResponse: data.revisedAnalysis || assessment.rawResponse,
        conversationHistory: [
            ...conversationHistory,
            { question, answer },
        ],
    };
    // Update in localStorage
    updateAssessment(updatedAssessment);
    return updatedAssessment;
}
/**
 * Analyze multiple images in batch
 */
export async function analyzeBatchImages(imageFiles, context) {
    const results = [];
    for (const file of imageFiles) {
        try {
            const assessment = await analyzeRoofImage(file, context);
            results.push(assessment);
        }
        catch (error) {
            console.error(`Failed to analyze ${file.name}:`, error);
        }
    }
    return results;
}
/**
 * Generate inspection report from assessments
 */
export function generateInspectionReport(assessments, propertyAddress = 'Address Not Provided') {
    const reportDate = new Date().toLocaleDateString();
    const damageCount = assessments.filter(a => a.analysis.damageDetected).length;
    const severeDamage = assessments.filter(a => a.analysis.severity === 'severe' || a.analysis.severity === 'critical');
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
export function getSavedAssessments() {
    const saved = localStorage.getItem('roof_damage_assessments');
    if (!saved)
        return [];
    try {
        const assessments = JSON.parse(saved);
        // Convert timestamp strings back to Date objects
        return assessments.map((a) => ({
            ...a,
            timestamp: new Date(a.timestamp),
        }));
    }
    catch {
        return [];
    }
}
/**
 * Save assessment to localStorage
 */
function saveAssessment(assessment) {
    const assessments = getSavedAssessments();
    assessments.unshift(assessment); // Add to beginning
    // Keep only last 50 assessments
    const trimmed = assessments.slice(0, 50);
    localStorage.setItem('roof_damage_assessments', JSON.stringify(trimmed));
}
/**
 * Update existing assessment
 */
function updateAssessment(updatedAssessment) {
    const assessments = getSavedAssessments();
    const index = assessments.findIndex(a => a.id === updatedAssessment.id);
    if (index !== -1) {
        assessments[index] = updatedAssessment;
        localStorage.setItem('roof_damage_assessments', JSON.stringify(assessments));
    }
}
/**
 * Delete assessment
 */
export function deleteAssessment(id) {
    const assessments = getSavedAssessments().filter(a => a.id !== id);
    localStorage.setItem('roof_damage_assessments', JSON.stringify(assessments));
}
/**
 * Get overall urgency from multiple assessments
 */
function getOverallUrgency(assessments) {
    const urgencies = assessments.map(a => a.analysis.urgency);
    if (urgencies.includes('urgent'))
        return 'URGENT';
    if (urgencies.includes('high'))
        return 'HIGH';
    if (urgencies.includes('medium'))
        return 'MEDIUM';
    return 'LOW';
}
/**
 * Convert File to base64 string
 */
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
/**
 * Convert File to data URL for display
 */
async function fileToDataURL(file) {
    return fileToBase64(file);
}
/**
 * Generate unique ID
 */
function generateId() {
    return `assess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Export assessment as PDF (requires jsPDF library)
 * For now, returns markdown that can be downloaded
 */
export function exportAssessmentAsMarkdown(assessment) {
    const conversationSection = assessment.conversationHistory && assessment.conversationHistory.length > 0
        ? `## Additional Information Gathered\n${assessment.conversationHistory.map(h => `**Q:** ${h.question}\n**A:** ${h.answer}`).join('\n\n')}\n\n`
        : '';
    return `# Insurance Claim Assessment Report

**Date:** ${assessment.timestamp.toLocaleString()}
**Image:** ${assessment.imageName}
**Confidence:** ${assessment.confidence}%
**Claim Viability:** ${assessment.analysis.claimViability.toUpperCase()}

## Damage Detection
- **Detected:** ${assessment.analysis.damageDetected ? 'Yes' : 'No'}
- **Type:** ${assessment.analysis.damageType.join(', ') || 'None'}
- **Severity:** ${assessment.analysis.severity.toUpperCase()}
- **Urgency:** ${assessment.analysis.urgency.toUpperCase()}

## Location & Extent
- **Affected Area:** ${assessment.analysis.affectedArea}
- **Estimated Size:** ${assessment.analysis.estimatedSize}

## Insurance Adjuster Language
${assessment.analysis.policyLanguage}

## Key Insurance Arguments
${assessment.analysis.insuranceArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}

## Detailed Analysis
${assessment.rawResponse}

${conversationSection}## Recommendations for Rep
${assessment.analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${assessment.followUpQuestions.length > 0 ? `## Outstanding Questions\n${assessment.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n` : ''}---

*Generated by S21 Field AI - Susan (Insurance Claims Specialist)*
*This AI-generated assessment should be verified by a licensed roofing professional.*
*Focus: Insurance claim documentation, not retail sales*
`;
}
