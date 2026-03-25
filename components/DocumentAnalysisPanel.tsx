import React, { useState, useRef, useEffect, DragEvent } from 'react';
import { Upload, FileText, X, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';
import { databaseService } from '../services/databaseService';
import { buildSusanContext } from '../services/susanContextService';
import { useToast } from './Toast';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

interface AnalysisResult {
  success: boolean;
  timestamp: string;
  documentsProcessed: number;
  successfulProcessing: number;
  totalSize: number;
  documents: Array<{
    fileName: string;
    fileType: string;
    fileSize: number;
    preview?: string;
    success: boolean;
    error?: string;
    metadata: any;
    processingTime: number;
  }>;
  insuranceData: {
    claimNumber?: string;
    policyNumber?: string;
    insuranceCompany?: string;
    adjusterName?: string;
    adjusterPhone?: string;
    adjusterEmail?: string;
    dateOfLoss?: string;
    propertyAddress?: string;
    rcv?: string; // Replacement Cost Value
    acv?: string; // Actual Cash Value
    recoverableDepreciation?: string;
    nonRecoverableDepreciation?: string;
    deductible?: string;
    claimStatus?: string;
  };
  analysis: {
    summary: string;
    keyFindings: string[];
    damageDescriptions: string[];
    claimRelevantInfo: string[];
    recommendations: string[];
    approvalStatus?: 'full' | 'partial' | 'denial' | 'unknown';
    nextSteps: string[];
  };
  combinedText: string;
  error?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DocumentAnalysisPanel: React.FC = () => {
  const toast = useToast();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<string>('');
  const [analysisElapsed, setAnalysisElapsed] = useState<number>(0);
  const [propertyAddress, setPropertyAddress] = useState('');
  const [claimDate, setClaimDate] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'general' | 'supplement'>('general');
  const [showChatWithSusan, setShowChatWithSusan] = useState(false);
  const [susanContext, setSusanContext] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<null | (() => void)>(null);
  const cancelFlagRef = useRef(false);

  const MAX_FILES = 20;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_PDF_PAGES = 12;
  const MAX_TEXT_CHARS = 30000;
  const AI_TIMEOUT_MS = 120000;
  const apiBaseUrl = getApiBaseUrl();

  // Clear any existing user uploads from localStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem('user_uploads');
      console.log('[DocumentAnalysisPanel] Cleared user_uploads from localStorage');
    } catch (error) {
      console.warn('Could not clear user_uploads:', error);
    }
  }, []);

  useEffect(() => {
    buildSusanContext(30)
      .then(context => setSusanContext(context))
      .catch(() => setSusanContext(''));
  }, []);

  useEffect(() => {
    if (!isAnalyzing) {
      setAnalysisElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setAnalysisElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error('File Too Large', `File ${file.name} exceeds 10MB limit`);
        continue;
      }

      // Check total files
      if (files.length + newFiles.length >= MAX_FILES) {
        toast.warning('Maximum Files', `Maximum ${MAX_FILES} files allowed`);
        break;
      }

      const uploadedFile: UploadedFile = {
        id: `${Date.now()}-${i}`,
        file,
        status: 'pending'
      };

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          uploadedFile.preview = e.target?.result as string;
          setFiles(prevFiles => [...prevFiles]);
        };
        reader.readAsDataURL(file);
      }

      newFiles.push(uploadedFile);
    }

    setFiles(prevFiles => [...prevFiles, ...newFiles]);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setAnalysisResult(null);
    setPropertyAddress('');
    setClaimDate('');
    setAdditionalNotes('');
  };

  // ============================================================================
  // ANALYSIS
  // ============================================================================

  /**
   * Helper function to determine analysis type based on file name/content
   */
  const determineAnalysisType = (file: File): string => {
    const name = file.name.toLowerCase();
    if (name.includes('roof') || name.includes('damage')) return 'roof_damage';
    if (name.includes('insurance') || name.includes('claim') || name.includes('denial') || name.includes('estimate')) return 'insurance_doc';
    return 'general';
  };

  const analyzeDocuments = async () => {
    if (files.length === 0) {
      toast.warning('No Files', 'Please upload at least one file');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisPhase('Preparing files...');
    setAnalysisResult(null);
    cancelFlagRef.current = false;

    try {
      // Update all files to processing
      setFiles(files.map(f => ({ ...f, status: 'processing' as const })));

      // Extract text from all files
      const extractedTexts: string[] = [];
      const processedDocs: any[] = [];

      for (let idx = 0; idx < files.length; idx += 1) {
        const uploadedFile = files[idx];
        if (cancelFlagRef.current) throw new Error('Analysis cancelled.');
        setAnalysisPhase(`Extracting text (${idx + 1}/${files.length})...`);
        try {
          let text = '';
          const file = uploadedFile.file;

          if (/\.(md|txt)$/i.test(file.name)) {
            text = await file.text();
          } else if (/\.pdf$/i.test(file.name)) {
            try {
              const pdfjsLib: any = await import('pdfjs-dist');
              // @ts-ignore - Worker URL import
              const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
              pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

              const arrayBuffer = await file.arrayBuffer();
              const loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(arrayBuffer),
                useSystemFonts: true,
              });

              const pdf = await loadingTask.promise;
              const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
              for (let i = 1; i <= pageLimit; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
                text += `\n--- Page ${i} ---\n${pageText}\n`;
              }
              if (pdf.numPages > MAX_PDF_PAGES) {
                text += `\n--- NOTE: Truncated to first ${MAX_PDF_PAGES} pages for performance ---\n`;
              }
            } catch (pdfError) {
              throw new Error(`PDF extraction failed: ${(pdfError as Error).message}`);
            }
          } else if (/\.(docx)$/i.test(file.name)) {
            try {
              const mammoth: any = await import('mammoth/mammoth.browser');
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer });
              text = result.value || '';

              if (!text.trim()) {
                const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
                const html = htmlResult.value as string;
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                text = tmp.textContent || tmp.innerText || '';
              }
            } catch (docxError) {
              throw new Error(`DOCX extraction failed: ${(docxError as Error).message}`);
            }
          }

          extractedTexts.push(`\n\n--- ${file.name} ---\n${text}\n--- END OF ${file.name} ---\n`);
          processedDocs.push({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            success: true,
            metadata: { wordCount: text.split(/\s+/).length },
            processingTime: 0
          });
        } catch (err) {
          console.error(`Error processing ${uploadedFile.file.name}:`, err);
          processedDocs.push({
            fileName: uploadedFile.file.name,
            fileType: uploadedFile.file.type,
            fileSize: uploadedFile.file.size,
            success: false,
            error: (err as Error).message,
            metadata: {},
            processingTime: 0
          });
        }
      }

      // Build analysis prompt
      let combinedText = extractedTexts.join('\n');
      if (combinedText.length > MAX_TEXT_CHARS) {
        combinedText = combinedText.slice(0, MAX_TEXT_CHARS) + '\n\n--- NOTE: Content truncated for performance ---\n';
      }
      const contextInfo = [
        propertyAddress ? `Property Address: ${propertyAddress}` : '',
        claimDate ? `Claim/Loss Date: ${claimDate}` : '',
        additionalNotes ? `Additional Notes: ${additionalNotes}` : ''
      ].filter(Boolean).join('\n');

      const susanContextBlock = susanContext ? `\n${susanContext}\n` : '';

      const supplementPrompt = `You are Susan, S21's expert insurance supplement specialist. A sales rep has uploaded documents for supplement review. When BOTH an adjuster's estimate AND a Hover measurement report are provided, you MUST cross-reference every measurement.

${contextInfo ? `Context:\n${contextInfo}\n\n` : ''}Documents:
${combinedText}

**CRITICAL — HOVER REPORT CROSS-REFERENCE:**
If a Hover measurement report is included, compare EVERY measurement against the estimate:
- Roof total area (Hover SF vs estimate SQ — convert: 1 SQ = 100 SF)
- Ridge/hip lengths (Hover vs estimate ridge cap line item)
- Valley lengths (Hover vs estimate valley lining)
- Rake lengths (Hover vs estimate drip edge at rakes)
- Eave lengths (Hover vs estimate drip edge at eaves / starter strip)
- Step flashing counts and lengths (Hover vs estimate)
- Flashing counts (Hover vs estimate pipe jacks/flashing)
- Drip edge perimeter (Hover vs estimate drip edge LF)
- Roof pitch breakdown (Hover shows exact pitches — check if steep slope charges are correct)
- Number of stories (Hover shows — verify high roof charges)
- Waste factor (Hover provides waste calculations — compare to estimate waste %)

For EACH discrepancy found, calculate the DOLLAR DIFFERENCE:
- Show the Hover measurement vs the estimate measurement
- Calculate the additional square footage or linear footage missed
- Apply the per-unit price from the estimate to get the supplement dollar amount
- Total all supplement items at the end

${susanContextBlock}

YOUR MISSION: Find EVERY item the adjuster missed, undervalued, or incorrectly calculated. For EACH item you MUST provide:
1. The EXACT quantity from the estimate (or "missing/not included")
2. The CORRECT quantity from Hover (if available)
3. The DIFFERENCE in units (SF, LF, SQ, EA)
4. The DOLLAR AMOUNT to supplement (using the estimate's own unit prices when available, or market rates when not)
5. The CODE REFERENCE or REASON it's required

DO NOT give vague recommendations like "add drip edge." Instead: "Add 91.74 LF drip edge: estimate has 310.09 LF, Hover perimeter is 401'10\" (401.83 LF). At $3.33/LF = $305.49. Required per IRC R905.2.8.5."

ALWAYS end with a TOTAL SUPPLEMENT DOLLAR AMOUNT summing all items.

**SUPPLEMENT ANALYSIS CHECKLIST — review the estimate for ALL of these:**

1. **Missing Line Items** (things adjusters commonly leave out):
   - Drip edge replacement (required by IRC R905.2.8.5 when re-roofing)
   - Ice & water shield (required in ice dam areas per IRC R905.1.2)
   - Starter strip shingles
   - Ridge cap / hip cap shingles (often under-counted)
   - Pipe boot/jack replacements
   - Step flashing at walls and chimneys
   - Counter flashing
   - Valley metal or valley lining
   - Roof-to-wall flashing
   - Chimney cricket/saddle (required for chimneys >30" wide per IRC R903.2.2)
   - Satellite dish / antenna removal and reset
   - Gutter apron / drip edge at eaves
   - Re-felt / synthetic underlayment (full deck vs partial)
   - Plywood/OSB decking replacement (check for soft/rotted areas)
   - Ridge vent or exhaust vent replacement
   - Skylight flashing kit
   - Paint touch-up at flashings
   - Detach & reset gutters during roof replacement
   - Code upgrade: ventilation requirements (1:150 or 1:300 ratio per IRC R806)
   - Permit fees
   - Waste factor (typically 10-15% for regular, 15-20% for hip roofs)

2. **Undervalued Items**:
   - Square footage measurement discrepancy (compare to actual roof measurement)
   - Labor rates below market for your region
   - Material pricing below current costs
   - Overhead & Profit (O&P) not included or incorrectly calculated (standard is 10% + 10%)
   - Steep slope charge missing (7/12 pitch and above)
   - High roof charge (2+ stories)
   - Limited access charge
   - Tear-off of multiple layers

3. **Code Compliance Issues**:
   - Does the estimate meet current IRC/IBC requirements?
   - Ventilation calculations (IRC R806)
   - Underlayment requirements (IRC R905.1.1)
   - Flashing requirements (IRC R903.2)
   - If local codes are stricter than IRC, note that

4. **Depreciation Review**:
   - Is depreciation calculated correctly?
   - Are non-depreciable items being depreciated (labor, O&P, code upgrades)?
   - Is recoverable vs non-recoverable properly categorized?

5. **Manufacturer Requirements**:
   - Does the scope meet GAF/CertainTeed/Owens Corning warranty installation requirements?
   - Are required accessories included for warranty compliance?

Respond in JSON:
{
  "approvalStatus": "partial",
  "insuranceData": {
    "claimNumber": "string or null",
    "policyNumber": "string or null",
    "insuranceCompany": "string or null",
    "adjusterName": "string or null",
    "adjusterPhone": "string or null",
    "adjusterEmail": "string or null",
    "dateOfLoss": "string or null",
    "propertyAddress": "string or null",
    "rcv": "string or null",
    "acv": "string or null",
    "recoverableDepreciation": "string or null",
    "nonRecoverableDepreciation": "string or null",
    "deductible": "string or null",
    "claimStatus": "string or null"
  },
  "summary": "1-2 sentence overview of estimate completeness and total supplement potential",
  "keyFindings": [
    "EACH finding MUST follow this EXACT format: '[ITEM NAME]: Estimate has [X amount/LF/SQ]. Hover shows [Y amount/LF/SQ]. Difference: [Z]. At $[unit price]/[unit] = $[supplement amount]. Code: [IRC reference]. Reason: [why this is required].'",
    "Example: 'ROOF AREA DISCREPANCY: Estimate has 25.04 SQ (2,503.59 SF). Hover measures 31.67 SQ (3,167 SF). Difference: 6.63 SQ. At $291.36/SQ (shingle line item rate) = $1,931.72 supplement. The adjuster undermeasured the roof by 26%.'",
    "Example: 'STARTER STRIP MISSING: Estimate has 0 LF of starter strip. Hover shows 217'2\" eaves + rake edges needing starter. 217 LF at ~$1.50/LF = $325.50 supplement. Required per manufacturer warranty installation specs.'",
    "Example: 'DRIP EDGE SHORT: Estimate has 310.09 LF. Hover perimeter is 401'10\" (401.83 LF). Difference: 91.74 LF at $3.33/LF = $305.49 supplement. IRC R905.2.8.5 requires drip edge at all eaves and rakes.'",
    "Example: 'WASTE FACTOR: Estimate auto-calculated 15.6% waste on 25.04 SQ. With correct Hover area of 31.67 SQ, waste should be recalculated. Pre-waste area in estimate (2,503.59 SF) vs Hover zero-waste (3,167 SF) shows estimate is using wrong base measurement.'"
  ],
  "damageDescriptions": ["List every line item from the estimate with its quantity, unit price, and RCV"],
  "recommendations": [
    "EACH recommendation MUST be a specific supplement line item in this format: 'Add [ITEM]: [quantity] [unit] × $[price]/[unit] = $[total]. Reason: [code ref or measurement source]'",
    "At the END, include: 'TOTAL SUPPLEMENT VALUE: $[sum of all items]'"
  ],
  "nextSteps": ["Step 1: Prepare supplement document with above line items", "Step 2: Attach Hover report as measurement evidence", "Step 3: Reference specific IRC codes for each item", "Step 4: Submit to adjuster at claimdocuments@afics.com with claim number in subject"]
}`;

      const analysisPrompt = analysisMode === 'supplement' ? supplementPrompt : `You are Susan, S21's expert insurance claim analyst. A sales rep has uploaded ${files.length} document(s) for analysis.

${contextInfo ? `Context:\n${contextInfo}\n\n` : ''}Documents:
${combinedText}

${susanContextBlock}

IMPORTANT INSTRUCTIONS FOR INSURANCE ESTIMATES:

**Financial Values Parsing Rules:**
1. Look for "RCV" or "Replacement Cost Value" - this is the TOTAL cost to replace/repair
2. Look for "ACV" or "Actual Cash Value" - this is RCV minus depreciation
3. Look for "Depreciation" amounts:
   - If it says "Recoverable Depreciation" → use that value
   - If it says "Non-Recoverable Depreciation" → use that value
   - If it ONLY says "Depreciation" (without specifying type) → assume it's ALL recoverable, set non-recoverable to $0
4. Look for "Deductible" - the homeowner's out-of-pocket cost

**Sales Rep Guidance Rules:**
- You are speaking TO THE SALES REP, not the homeowner
- Do NOT say "you should hire a contractor" - the rep IS the contractor/roofer
- Focus on how the rep can maximize the claim and get FULL APPROVAL from insurance

**ROOF-ER REP'S MISSION & WORKFLOW:**
The rep's PRIMARY GOAL is to get FULL APPROVAL from insurance for roof replacement/repairs. The typical workflow is:
1. Document storm damage with photos and inspection report
2. Submit estimate to insurance adjuster
3. If partial approval, provide additional evidence (building codes, manufacturer guidelines, repair attempt videos)
4. Request adjuster review the supplemental documentation
5. Respectfully request full approval based on evidence
6. Follow up with adjuster on timeline for decision

**WHAT REPS DO:**
- Advocate for homeowners to get full insurance coverage
- Provide technical documentation (photos, reports, code references)
- Follow up professionally with adjusters
- Reference state building codes and manufacturer requirements
- Document repair attempts when relevant
- Submit supplements with additional evidence

**WHAT REPS DO NOT DO:**
- Negotiate prices or offer discounts (insurance determines coverage amount)
- Act as salespeople pushing upgrades
- Offer supplemental services unrelated to the claim
- Suggest scheduling meetings unless adjuster requested it
- Make generic "next steps" that don't align with getting full approval

Analyze these documents and provide:

1. **Claim Status**: FULL APPROVAL, PARTIAL APPROVAL, DENIAL, or UNKNOWN
2. **Extracted Insurance Data**: Extract all claim details with correct terminology (RCV, ACV, depreciation breakdown, deductible)
3. **Summary**: Brief overview of the estimate/claim documents
4. **Key Findings**: Critical points the sales rep needs to know
5. **Damage Descriptions**: All damage items mentioned
6. **Recommendations**: Strategic advice for the rep focused ONLY on getting full approval (what documentation to provide, which codes to reference, what evidence is needed)
7. **Next Steps**: Specific action items aligned with the rep's workflow above (documenting damage, submitting supplements, requesting review, following up for full approval)

Format your response as JSON with this structure:
{
  "approvalStatus": "full" | "partial" | "denial" | "unknown",
  "insuranceData": {
    "claimNumber": "string or null",
    "policyNumber": "string or null",
    "insuranceCompany": "string or null",
    "adjusterName": "string or null",
    "adjusterPhone": "string or null",
    "adjusterEmail": "string or null",
    "dateOfLoss": "string or null",
    "propertyAddress": "string or null",
    "rcv": "string (e.g., '$25,000.00') or null",
    "acv": "string (e.g., '$20,000.00') or null",
    "recoverableDepreciation": "string (e.g., '$5,000.00') or null",
    "nonRecoverableDepreciation": "string (e.g., '$0.00') or null - ALWAYS $0 if not explicitly stated",
    "deductible": "string (e.g., '$1,000.00') or null",
    "claimStatus": "string or null"
  },
  "summary": "string",
  "keyFindings": ["array of strings - what the sales rep must know"],
  "damageDescriptions": ["array of damage items found"],
  "recommendations": ["array of strategic recommendations for the sales rep using S21's proven techniques"],
  "nextSteps": ["array of specific action items for the rep to execute"]
}`;

      // Call multiAI service
      console.log('Sending request to Susan server...');
      setAnalysisPhase('Analyzing with Susan...');
      const cancelPromise = new Promise<never>((_, reject) => {
        cancelRef.current = () => reject(new Error('Analysis cancelled.'));
      });
      const aiResponse = await Promise.race([
        fetch(`${apiBaseUrl}/documents/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authService.getCurrentUser()?.email
              ? { 'x-user-email': authService.getCurrentUser()?.email as string }
              : {})
          },
          body: JSON.stringify({
            prompt: analysisPrompt
          })
        }).then(async (res) => {
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || `Analysis failed: ${res.status}`);
          }
          return payload;
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('AI analysis timed out. Please try again with fewer pages or smaller files.')), AI_TIMEOUT_MS);
        }),
        cancelPromise
      ]);

      console.log('AI Response received:', aiResponse);
      setAnalysisPhase('Parsing results...');

      // Parse AI response with improved error handling
      let analysis: any;
      try {
        const content = (aiResponse?.content || '').trim();

        // Try direct JSON parse first
        try {
          analysis = JSON.parse(content);
        } catch (directParseError) {
          // Look for JSON in markdown code blocks
          const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlockMatch) {
            analysis = JSON.parse(codeBlockMatch[1]);
          } else {
            // Look for any JSON object in the text
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in AI response');
            }
          }
        }

        // Validate and provide defaults
        if (!analysis || typeof analysis !== 'object') {
          throw new Error('Invalid JSON structure');
        }

        analysis = {
          approvalStatus: analysis.approvalStatus || 'unknown',
          insuranceData: analysis.insuranceData || {},
          summary: analysis.summary || 'No summary provided',
          keyFindings: Array.isArray(analysis.keyFindings) ? analysis.keyFindings : [],
          damageDescriptions: Array.isArray(analysis.damageDescriptions) ? analysis.damageDescriptions : [],
          recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
          nextSteps: Array.isArray(analysis.nextSteps) ? analysis.nextSteps : [],
        };

      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        console.error('Raw AI response:', aiResponse?.content);

        // Create fallback analysis with raw response
        analysis = {
          approvalStatus: 'unknown',
          insuranceData: {},
          summary: 'AI response could not be parsed. Raw response:\n\n' + (aiResponse?.content || ''),
          keyFindings: ['Unable to extract structured data - review raw response above'],
          damageDescriptions: [],
          recommendations: ['Review raw AI response', 'Consider re-analyzing documents'],
          nextSteps: ['Manual review required'],
        };
      }

      // Build result
      const result: AnalysisResult = {
        success: true,
        timestamp: new Date().toISOString(),
        documentsProcessed: files.length,
        successfulProcessing: processedDocs.filter(d => d.success).length,
        totalSize: files.reduce((sum, f) => sum + f.file.size, 0),
        documents: processedDocs,
        insuranceData: analysis.insuranceData || {},
        analysis: {
          summary: analysis.summary || '',
          keyFindings: analysis.keyFindings || [],
          damageDescriptions: analysis.damageDescriptions || [],
          claimRelevantInfo: [],
          recommendations: analysis.recommendations || [],
          approvalStatus: analysis.approvalStatus,
          nextSteps: analysis.nextSteps || []
        },
        combinedText
      };

      // Update file statuses
      setFiles(files.map(f => ({ ...f, status: 'success' as const })));
      setAnalysisResult(result);

      // Track document uploads
      for (const uploadedFile of files) {
        try {
          await databaseService.logDocumentUpload({
            fileName: uploadedFile.file.name,
            fileType: uploadedFile.file.type || uploadedFile.file.name.split('.').pop() || 'unknown',
            fileSizeBytes: uploadedFile.file.size,
            analysisType: determineAnalysisType(uploadedFile.file),
            analysisResult: analysis.summary || 'Analysis completed successfully'
          });
        } catch (error) {
          console.warn('Failed to track document upload:', error);
          // Continue - don't disrupt user experience
        }
      }

    } catch (error: any) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(
        'Analysis Failed',
        `${errorMessage}. Check API keys, file validity, internet, and AI provider.`
      );
      setFiles(files.map(f => ({
        ...f,
        status: f.status === 'success' ? 'success' : 'error' as const,
        error: f.error || errorMessage
      })));
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('');
      cancelRef.current = null;
    }
  };

  const handleDownloadReport = () => {
    if (!analysisResult) return;
    try {
      const payload = {
        generated_at: analysisResult.timestamp,
        insuranceData: analysisResult.insuranceData,
        analysis: analysisResult.analysis,
        documents: analysisResult.documents
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `susan-document-analysis-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (error) {
      toast.error('Download failed', (error as Error).message);
    }
  };

  const handleCopySummary = async () => {
    if (!analysisResult?.analysis?.summary) return;
    try {
      await navigator.clipboard.writeText(analysisResult.analysis.summary);
      toast.success('Summary copied');
    } catch (error) {
      toast.error('Copy failed', (error as Error).message);
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getFileIcon = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return '📄';
      case 'doc':
      case 'docx': return '📝';
      case 'xls':
      case 'xlsx': return '📊';
      case 'txt': return '📃';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'heic':
      case 'webp': return '🖼️';
      default: return '📎';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getApprovalStatusBadge = (status?: string) => {
    switch (status) {
      case 'full':
        return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">✓ Full Approval</span>;
      case 'partial':
        return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">◐ Partial Approval</span>;
      case 'denial':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">✗ Denial</span>;
      default:
        return null;
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="roof-er-content-area">
      <div
        className="roof-er-content-scroll"
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '2rem',
          justifyContent: 'flex-start',
          alignItems: 'stretch'
        }}
      >

        {/* Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            📄 Document Analyzer
          </h1>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)' }}>
            AI-Powered Multi-Format Document Analysis for Insurance Claims
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
            Powered by <span style={{ fontWeight: 600, color: 'var(--roof-red)' }}>Susan AI</span>
          </p>
        </div>

        {/* Analysis Mode Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setAnalysisMode('general')}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: analysisMode === 'general' ? '2px solid var(--roof-red)' : '2px solid var(--border-default)',
              background: analysisMode === 'general' ? 'var(--roof-red)' : 'var(--bg-elevated)',
              color: analysisMode === 'general' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <FileText className="w-4 h-4" />
            General Analysis
          </button>
          <button
            onClick={() => setAnalysisMode('supplement')}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: analysisMode === 'supplement' ? '2px solid #f97316' : '2px solid var(--border-default)',
              background: analysisMode === 'supplement' ? '#f97316' : 'var(--bg-elevated)',
              color: analysisMode === 'supplement' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <AlertCircle className="w-4 h-4" />
            Supplement Finder
          </button>
        </div>

        {analysisMode === 'supplement' && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            background: 'rgba(249, 115, 22, 0.08)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5
          }}>
            <strong style={{ color: '#f97316' }}>Supplement Mode:</strong> Upload the adjuster's estimate and Susan will identify missed line items, undervalued repairs, code-required upgrades, and items that should be supplemented. She'll reference IRC/IBC building codes and manufacturer specs.
          </div>
        )}

        {isAnalyzing && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              border: '1px solid rgba(220,38,38,0.4)',
              background: 'rgba(220,38,38,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}
          >
            <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              {analysisPhase || 'Analyzing documents...'} <span style={{ color: 'var(--text-secondary)' }}>({analysisElapsed}s)</span>
            </div>
            <button
              onClick={() => {
                cancelFlagRef.current = true;
                cancelRef.current?.();
                setIsAnalyzing(false);
                setAnalysisPhase('');
              }}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '999px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Supported Formats */}
        <div style={{ marginBottom: '1.5rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              <span style={{ fontWeight: 600 }}>Supported:</span>
            </div>
            <span style={{ padding: '0.25rem 0.75rem', background: 'var(--bg-hover)', color: 'var(--text-primary)', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', border: '1px solid var(--border-default)' }}>📄 PDF</span>
            <span style={{ padding: '0.25rem 0.75rem', background: 'var(--bg-hover)', color: 'var(--text-primary)', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', border: '1px solid var(--border-default)' }}>📝 Word</span>
            <span style={{ padding: '0.25rem 0.75rem', background: 'var(--bg-hover)', color: 'var(--text-primary)', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', border: '1px solid var(--border-default)' }}>📊 Excel</span>
            <span style={{ padding: '0.25rem 0.75rem', background: 'var(--bg-hover)', color: 'var(--text-primary)', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', border: '1px solid var(--border-default)' }}>📃 Text</span>
            <span style={{ padding: '0.25rem 0.75rem', background: 'var(--bg-hover)', color: 'var(--text-primary)', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', border: '1px solid var(--border-default)' }}>🖼️ Images</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: '1.5rem'
          }}
        >

          {/* Left Column - Upload & Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

            {/* Drag & Drop Upload Zone */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>Upload Documents</h2>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging ? '2px dashed var(--roof-red)' : '2px dashed var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: isDragging ? 'var(--bg-hover)' : 'var(--bg-secondary)'
                }}
              >
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📁</div>
                <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Drag & drop files here
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  or click to browse
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Max {MAX_FILES} files, 10MB each
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.jpg,.jpeg,.png,.heic,.heif,.webp"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  style={{ display: 'none' }}
                />
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      Uploaded Files ({files.length})
                    </h3>
                    <button
                      onClick={clearAll}
                      style={{ fontSize: '0.875rem', color: 'var(--roof-red)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Clear All
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '24rem', overflowY: 'auto' }}>
                    {files.map(uploadedFile => (
                      <div
                        key={uploadedFile.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: 'var(--bg-secondary)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          transition: 'background 0.2s'
                        }}
                      >
                        {/* Preview/Icon */}
                        {uploadedFile.preview ? (
                          <img
                            src={uploadedFile.preview}
                            alt={uploadedFile.file.name}
                            style={{ width: '3rem', height: '3rem', objectFit: 'cover', borderRadius: '0.25rem' }}
                          />
                        ) : (
                          <div style={{ fontSize: '2rem' }}>
                            {getFileIcon(uploadedFile.file.name)}
                          </div>
                        )}

                        {/* File Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {uploadedFile.file.name}
                          </p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {formatFileSize(uploadedFile.file.size)}
                          </p>
                        </div>

                        {/* Status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {uploadedFile.status === 'processing' && (
                            <span style={{ color: 'var(--info)', fontSize: '0.875rem' }}>Processing...</span>
                          )}
                          {uploadedFile.status === 'success' && (
                            <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />
                          )}
                          {uploadedFile.status === 'error' && (
                            <AlertCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />
                          )}
                          <button
                            onClick={() => removeFile(uploadedFile.id)}
                            style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem' }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Optional Context */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>Additional Context (Optional)</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Property Address
                  </label>
                  <input
                    type="text"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="123 Main St, City, State ZIP"
                    className="roof-er-input-field"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Claim/Loss Date
                  </label>
                  <input
                    type="date"
                    value={claimDate}
                    onChange={(e) => setClaimDate(e.target.value)}
                    className="roof-er-input-field"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Additional Notes
                  </label>
                  <textarea
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="Any additional context for the AI analysis..."
                    rows={3}
                    className="roof-er-input-field"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Analyze Button */}
            <button
              onClick={analyzeDocuments}
              disabled={files.length === 0 || isAnalyzing}
              className="roof-er-send-btn"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.125rem',
                background: files.length === 0 || isAnalyzing ? 'var(--bg-hover)' : 'var(--roof-red)',
                cursor: files.length === 0 || isAnalyzing ? 'not-allowed' : 'pointer',
                opacity: files.length === 0 || isAnalyzing ? 0.5 : 1
              }}
            >
              {isAnalyzing ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span className="animate-spin">⚙️</span>
                  {analysisPhase ? analysisPhase : 'Analyzing Documents...'}
                </span>
              ) : (
                `Analyze ${files.length} Document${files.length !== 1 ? 's' : ''} with Susan`
              )}
            </button>
          </div>

          {/* Right Column - Results */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              minWidth: 0
            }}
          >

            {analysisResult ? (
              <>
                {/* Success Header */}
                <div style={{ background: 'var(--success-dark)', border: '1px solid var(--success)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '2rem' }}>✓</span>
                      <div>
                        <h3 style={{ fontWeight: 'bold', color: 'var(--success)' }}>Analysis Complete</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--success)' }}>
                          {analysisResult.successfulProcessing}/{analysisResult.documentsProcessed} documents processed
                        </p>
                      </div>
                    </div>
                    {getApprovalStatusBadge(analysisResult.analysis.approvalStatus)}
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <button
                      onClick={handleCopySummary}
                      style={{
                        padding: '0.6rem 0.9rem',
                        borderRadius: '999px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Copy Summary
                    </button>
                    <button
                      onClick={handleDownloadReport}
                      style={{
                        padding: '0.6rem 0.9rem',
                        borderRadius: '999px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Download Report
                    </button>
                  </div>
                </div>

                {/* Insurance Data */}
                {Object.keys(analysisResult.insuranceData).length > 0 && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>📋 Extracted Claim Information</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                      {Object.entries(analysisResult.insuranceData).map(([key, value]) => {
                        if (!value) return null;

                        // Custom label mapping for insurance terminology
                        const labelMap: Record<string, string> = {
                          rcv: 'RCV (Replacement Cost Value)',
                          acv: 'ACV (Actual Cash Value)',
                          recoverableDepreciation: 'Recoverable Depreciation',
                          nonRecoverableDepreciation: 'Non-Recoverable Depreciation',
                          claimNumber: 'Claim Number',
                          policyNumber: 'Policy Number',
                          insuranceCompany: 'Insurance Company',
                          adjusterName: 'Adjuster Name',
                          adjusterPhone: 'Adjuster Phone',
                          adjusterEmail: 'Adjuster Email',
                          dateOfLoss: 'Date of Loss',
                          propertyAddress: 'Property Address',
                          deductible: 'Deductible',
                          claimStatus: 'Claim Status'
                        };

                        const label = labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

                        return (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', padding: '0.5rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{label}:</span>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Analysis Summary */}
                {analysisResult.analysis.summary && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>💡 Analysis Summary</h2>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{analysisResult.analysis.summary}</p>
                  </div>
                )}

                {/* Key Findings */}
                {analysisResult.analysis.keyFindings.length > 0 && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>🔍 Key Findings</h2>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                      {analysisResult.analysis.keyFindings.map((finding, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                          <span style={{ color: 'var(--roof-red)', fontWeight: 'bold' }}>•</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {analysisResult.analysis.recommendations.length > 0 && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>✅ Recommendations</h2>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                      {analysisResult.analysis.recommendations.map((rec, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                          <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>→</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Steps */}
                {analysisResult.analysis.nextSteps.length > 0 && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem' }}>📝 Next Steps</h2>
                    <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
                      {analysisResult.analysis.nextSteps.map((step, idx) => (
                        <li key={idx} style={{ color: 'var(--text-secondary)' }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

              </>
            ) : (
              /* Empty State */
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.3 }}>📊</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  No Analysis Yet
                </h3>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  Upload documents and click "Analyze" to see results here
                </p>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};

export default DocumentAnalysisPanel;
