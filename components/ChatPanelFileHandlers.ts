/**
 * File upload handlers for ChatPanel
 * Handles both images (with AI analysis) and documents
 */

import { analyzeRoofImage } from '../services/imageAnalysisService';

export interface UploadedFile {
  name: string;
  content: string;
  type: string;
  preview?: string;
  file?: File;
}

/**
 * Convert file to data URL for preview
 */
export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Handle image file uploads with AI analysis
 */
export async function handleImageFiles(
  files: File[],
  toast: any,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
  setUserInput: React.Dispatch<React.SetStateAction<string>>,
  setIsAnalyzingImage: React.Dispatch<React.SetStateAction<boolean>>
): Promise<void> {
  setIsAnalyzingImage(true);

  for (const file of files) {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      toast.warning('Invalid file type', `${file.name} is not an image file.`);
      continue;
    }

    try {
      // Convert HEIC to JPEG if needed
      let processedFile = file;
      if (/\.(heic|heif)$/i.test(file.name)) {
        try {
          const heic2any = (await import('heic2any')).default as any;
          const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
          processedFile = new File(
            [blob as BlobPart],
            file.name.replace(/\.(heic|heif)$/i, '.jpg'),
            { type: 'image/jpeg' }
          );
        } catch (err) {
          console.warn('HEIC conversion failed:', err);
          toast.error('HEIC conversion failed', 'Please convert to JPG/PNG first.');
          continue;
        }
      }

      // Generate preview
      const preview = await fileToDataURL(processedFile);

      // Analyze image with Susan
      toast.info('Analyzing image', 'Susan is analyzing the roof damage...');
      const assessment = await analyzeRoofImage(processedFile);

      // Create analysis summary for chat
      const analysisText = `
**Image Analysis: ${file.name}**

${assessment.analysis.damageDetected ? '🔴 **DAMAGE DETECTED**' : '✅ **NO DAMAGE DETECTED**'}

**Severity:** ${assessment.analysis.severity.toUpperCase()}
**Urgency:** ${assessment.analysis.urgency.toUpperCase()}
**Claim Viability:** ${assessment.analysis.claimViability.toUpperCase()}

**Affected Area:** ${assessment.analysis.affectedArea}
**Estimated Size:** ${assessment.analysis.estimatedSize}

${assessment.analysis.damageType.length > 0 ? `**Damage Types:** ${assessment.analysis.damageType.join(', ')}` : ''}

**For Adjuster:**
${assessment.analysis.policyLanguage}

**Key Insurance Arguments:**
${assessment.analysis.insuranceArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}

**Recommendations:**
${assessment.analysis.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

${assessment.followUpQuestions.length > 0 ? `\n**Follow-up Questions:**\n${assessment.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}
      `.trim();

      // Add to uploaded files with preview
      setUploadedFiles(prev => [...prev, {
        name: file.name,
        content: analysisText,
        type: 'image',
        preview,
        file: processedFile
      }]);

      // Update user input to reference the image
      setUserInput((prev) =>
        prev ? `${prev}\n\n[Image: ${file.name}]` : `[Image: ${file.name}]\n\n${analysisText}`
      );

      toast.success('Image analyzed', `Susan has analyzed ${file.name}`);
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast.error('Image analysis failed', (error as Error).message);
    }
  }

  setIsAnalyzingImage(false);
}

/**
 * Handle document file uploads (PDF, DOCX, etc.)
 */
export async function handleDocumentFiles(
  files: File[],
  toast: any,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
  setUserInput: React.Dispatch<React.SetStateAction<string>>
): Promise<void> {
  for (const file of files) {
    let content = '';

    try {
      if (/\.(md|txt)$/i.test(file.name)) {
        content = await file.text();
      } else if (/\.pdf$/i.test(file.name)) {
        const pdfjsLib: any = await import('pdfjs-dist');
        const array = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: array }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const contentObj = await page.getTextContent();
          text += contentObj.items.map((it: any) => it.str).join(' ') + '\n\n';
        }
        content = text.trim();
      } else if (/\.(docx)$/i.test(file.name)) {
        const mammoth: any = await import('mammoth/mammoth.browser');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const html = result.value as string;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        content = tmp.textContent || tmp.innerText || '';
      } else {
        toast.warning('Unsupported file type', 'Please upload PDF, DOCX, MD, or TXT files.');
        continue;
      }

      setUploadedFiles(prev => [...prev, { name: file.name, content, type: file.type }]);
      setUserInput((prev) =>
        prev ? `${prev}\n\n[Attached: ${file.name}]` : `[Attached: ${file.name}]\n\nPlease analyze this document and provide guidance.`
      );
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file', 'Please try again.');
    }
  }
}
