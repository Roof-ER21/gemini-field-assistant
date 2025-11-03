import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Camera, Image as ImageIcon, Download, Trash2, AlertCircle,
  CheckCircle, Clock, MessageCircle, Send, X, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, History, Mail, FileText, Maximize2,
  Eye, EyeOff, RefreshCw, Pin
} from 'lucide-react';
import {
  analyzeRoofImage,
  analyzeBatchImages,
  getSavedAssessments,
  deleteAssessment,
  generateInspectionReport,
  exportAssessmentAsMarkdown,
  answerFollowUpQuestion,
  DamageAssessment
} from '../services/imageAnalysisService';
import { authService } from '../services/authService';
import { databaseService } from '../services/databaseService';

interface ImageUpload {
  file: File;
  preview: string;
  id: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  assessment?: DamageAssessment;
}

interface ImageAnalysisPanelProps { onOpenChat?: () => void }

const ImageAnalysisPanel: React.FC<ImageAnalysisPanelProps> = ({ onOpenChat }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [assessments, setAssessments] = useState<DamageAssessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<DamageAssessment | null>(null);
  const [error, setError] = useState<string>('');
  const [answeringQuestion, setAnsweringQuestion] = useState<number | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState<string>('');
  const [imageUploads, setImageUploads] = useState<ImageUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'split'>('grid');
  const [imageZoom, setImageZoom] = useState(1);
  const [historyView, setHistoryView] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonImages, setComparisonImages] = useState<DamageAssessment[]>([]);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [viewPinned, setViewPinned] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('image_go_to') || '[]')); } catch { return new Set(); }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Load saved assessments on mount
  useEffect(() => {
    const saved = getSavedAssessments();
    setAssessments(saved);

    // Track document view
    const user = authService.getCurrentUser();
    if (user) {
      databaseService.trackDocumentView(
        '/image-analysis',
        'Image Analysis Panel',
        'tool'
      );
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      await handleFilesSelected(files);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await handleFilesSelected(Array.from(files));

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    if (files.length > 5) {
      setError('Maximum 5 images can be uploaded at once');
      return;
    }

    setError('');

    // Create upload objects
    const uploads: ImageUpload[] = await Promise.all(
      files.map(async (file) => ({
        file,
        preview: await fileToDataURL(file),
        id: generateId(),
        status: 'pending' as const
      }))
    );

    setImageUploads(uploads);

    // Analyze images
    await analyzeUploadedImages(uploads);
  };

  const analyzeUploadedImages = async (uploads: ImageUpload[]) => {
    setIsAnalyzing(true);

    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];

      // Update status to analyzing
      setImageUploads(prev =>
        prev.map(u => u.id === upload.id ? { ...u, status: 'analyzing' } : u)
      );

      try {
        const assessment = await analyzeRoofImage(upload.file);

        // Update status to completed
        setImageUploads(prev =>
          prev.map(u =>
            u.id === upload.id
              ? { ...u, status: 'completed', assessment }
              : u
          )
        );

        // Add to assessments list
        setAssessments(prev => [assessment, ...prev]);

        // Select first completed assessment
        if (i === 0) {
          setSelectedAssessment(assessment);
        }
      } catch (err) {
        setImageUploads(prev =>
          prev.map(u => u.id === upload.id ? { ...u, status: 'error' } : u)
        );
        console.error(`Failed to analyze ${upload.file.name}:`, err);
      }
    }

    setIsAnalyzing(false);

    // Clear uploads after a delay
    setTimeout(() => {
      setImageUploads([]);
    }, 3000);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this assessment?')) {
      deleteAssessment(id);
      setAssessments(getSavedAssessments());
      if (selectedAssessment?.id === id) {
        setSelectedAssessment(null);
      }
    }
  };

  const handleDownloadReport = () => {
    if (!selectedAssessment) return;

    const markdown = exportAssessmentAsMarkdown(selectedAssessment);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `damage-assessment-${selectedAssessment.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    if (!selectedAssessment) return;

    try {
      // Dynamic import to avoid bundling issues
      const jsPDF = (await import('jspdf')).default;
      const html2canvas = (await import('html2canvas')).default;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 20;

      // Header
      pdf.setFillColor(196, 30, 58);
      pdf.rect(0, 0, pageWidth, 15, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.text('ROOF-ER Insurance Claim Assessment', 15, 10);

      yPosition = 25;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      pdf.text(`Date: ${selectedAssessment.timestamp.toLocaleDateString()}`, 15, yPosition);
      yPosition += 5;
      pdf.text(`Image: ${selectedAssessment.imageName}`, 15, yPosition);
      yPosition += 5;
      pdf.text(`Confidence: ${selectedAssessment.confidence}%`, 15, yPosition);
      yPosition += 10;

      // Add image
      if (selectedAssessment.imageUrl) {
        const imgWidth = pageWidth - 30;
        const imgHeight = 80;
        pdf.addImage(selectedAssessment.imageUrl, 'JPEG', 15, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;
      }

      // Damage Status
      pdf.setFontSize(14);
      pdf.setTextColor(196, 30, 58);
      pdf.text('Damage Assessment', 15, yPosition);
      yPosition += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Damage Detected: ${selectedAssessment.analysis.damageDetected ? 'YES' : 'NO'}`, 15, yPosition);
      yPosition += 5;
      pdf.text(`Severity: ${selectedAssessment.analysis.severity.toUpperCase()}`, 15, yPosition);
      yPosition += 5;
      pdf.text(`Urgency: ${selectedAssessment.analysis.urgency.toUpperCase()}`, 15, yPosition);
      yPosition += 5;
      pdf.text(`Claim Viability: ${selectedAssessment.analysis.claimViability.toUpperCase()}`, 15, yPosition);
      yPosition += 10;

      // Location & Extent
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = 20;
      }

      pdf.setFontSize(12);
      pdf.setTextColor(196, 30, 58);
      pdf.text('Location & Extent', 15, yPosition);
      yPosition += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Affected Area: ${selectedAssessment.analysis.affectedArea}`, 15, yPosition);
      yPosition += 5;
      pdf.text(`Estimated Size: ${selectedAssessment.analysis.estimatedSize}`, 15, yPosition);
      yPosition += 10;

      // Insurance Arguments
      if (selectedAssessment.analysis.insuranceArguments.length > 0) {
        if (yPosition > pageHeight - 60) {
          pdf.addPage();
          yPosition = 20;
        }

        pdf.setFontSize(12);
        pdf.setTextColor(196, 30, 58);
        pdf.text('Key Insurance Arguments', 15, yPosition);
        yPosition += 7;

        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        selectedAssessment.analysis.insuranceArguments.forEach((arg, idx) => {
          const lines = pdf.splitTextToSize(`${idx + 1}. ${arg}`, pageWidth - 30);
          lines.forEach((line: string) => {
            if (yPosition > pageHeight - 20) {
              pdf.addPage();
              yPosition = 20;
            }
            pdf.text(line, 15, yPosition);
            yPosition += 5;
          });
          yPosition += 2;
        });
      }

      // Recommendations
      if (selectedAssessment.analysis.recommendations.length > 0) {
        yPosition += 5;
        if (yPosition > pageHeight - 60) {
          pdf.addPage();
          yPosition = 20;
        }

        pdf.setFontSize(12);
        pdf.setTextColor(196, 30, 58);
        pdf.text('Recommendations', 15, yPosition);
        yPosition += 7;

        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        selectedAssessment.analysis.recommendations.forEach((rec, idx) => {
          const lines = pdf.splitTextToSize(`${idx + 1}. ${rec}`, pageWidth - 30);
          lines.forEach((line: string) => {
            if (yPosition > pageHeight - 20) {
              pdf.addPage();
              yPosition = 20;
            }
            pdf.text(line, 15, yPosition);
            yPosition += 5;
          });
        });
      }

      // Footer
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text(
          'Generated by S21 Field AI - Roof-ER',
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      pdf.save(`roof-assessment-${selectedAssessment.id}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      setError('Failed to generate PDF. Please try markdown export instead.');
    }
  };

  const handleDownloadFullReport = () => {
    const report = generateInspectionReport(assessments);
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roof-inspection-report-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePinned = (id: string) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('image_go_to', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const openAssessmentInChat = (a: DamageAssessment) => {
    const summary = `Image: ${a.imageName}\nDamage: ${a.analysis.damageDetected ? 'YES' : 'NO'}\nSeverity: ${a.analysis.severity}\nUrgency: ${a.analysis.urgency}\nClaim Viability: ${a.analysis.claimViability}${a.analysis.insuranceArguments?.length ? `\nArguments: ${a.analysis.insuranceArguments.join('; ')}` : ''}`;
    try { localStorage.setItem('chat_quick_assessment', JSON.stringify({ summary })); } catch {}
    onOpenChat?.();
  };

  const handleAnswerQuestion = async (questionIndex: number) => {
    if (!selectedAssessment || !questionAnswer.trim()) return;

    try {
      setIsAnalyzing(true);
      setError('');

      const updated = await answerFollowUpQuestion(selectedAssessment, questionIndex, questionAnswer);

      setAssessments(prev => prev.map(a => a.id === updated.id ? updated : a));
      setSelectedAssessment(updated);
      setAnsweringQuestion(null);
      setQuestionAnswer('');
    } catch (err) {
      setError((err as Error).message || 'Failed to process answer');
      console.error('Follow-up answer error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEmailReport = async () => {
    if (!selectedAssessment) return;

    const user = authService.getCurrentUser();
    const emailBody = `
Roof Damage Assessment Report

Date: ${selectedAssessment.timestamp.toLocaleDateString()}
Image: ${selectedAssessment.imageName}

DAMAGE DETECTED: ${selectedAssessment.analysis.damageDetected ? 'YES' : 'NO'}
Severity: ${selectedAssessment.analysis.severity.toUpperCase()}
Urgency: ${selectedAssessment.analysis.urgency.toUpperCase()}
Claim Viability: ${selectedAssessment.analysis.claimViability.toUpperCase()}

Location: ${selectedAssessment.analysis.affectedArea}
Estimated Size: ${selectedAssessment.analysis.estimatedSize}

${selectedAssessment.analysis.policyLanguage ? `\nPolicy Language:\n${selectedAssessment.analysis.policyLanguage}\n` : ''}

${selectedAssessment.analysis.insuranceArguments.length > 0 ? `\nKey Insurance Arguments:\n${selectedAssessment.analysis.insuranceArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}\n` : ''}

${selectedAssessment.analysis.recommendations.length > 0 ? `\nRecommendations:\n${selectedAssessment.analysis.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}` : ''}

---
Generated by S21 Field AI - Roof-ER
`.trim();

    // Log email generation
    await databaseService.logEmailGeneration({
      emailType: 'assessment_report',
      subject: `Roof Damage Assessment - ${selectedAssessment.imageName}`,
      body: emailBody,
      context: 'image_analysis',
      state: user?.state || undefined
    });

    // Open email client
    const subject = encodeURIComponent(`Roof Damage Assessment - ${selectedAssessment.imageName}`);
    const body = encodeURIComponent(emailBody);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const toggleComparisonMode = () => {
    if (!comparisonMode && assessments.length >= 2) {
      setComparisonImages([assessments[0], assessments[1]]);
    }
    setComparisonMode(!comparisonMode);
  };

  const getClaimViabilityColor = (viability: string) => {
    switch (viability) {
      case 'strong': return '#10b981';
      case 'moderate': return '#f59e0b';
      case 'weak': return '#ea580c';
      case 'none': return '#dc2626';
      default: return 'var(--text-secondary)';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'severe': return '#ea580c';
      case 'moderate': return '#f59e0b';
      case 'minor': return '#10b981';
      default: return 'var(--text-secondary)';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    const colors = {
      urgent: '#dc2626',
      high: '#ea580c',
      medium: '#f59e0b',
      low: '#10b981'
    };
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        background: colors[urgency as keyof typeof colors] + '20',
        color: colors[urgency as keyof typeof colors],
        textTransform: 'uppercase'
      }}>
        {urgency}
      </span>
    );
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <ImageIcon className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Image Analysis
          <div style={{ float: 'right', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => setHistoryView(!historyView)}
              style={{
                padding: '8px 16px',
                background: historyView ? 'var(--roof-red)' : 'var(--bg-hover)',
                color: historyView ? 'white' : 'var(--text-primary)',
                border: `2px solid ${historyView ? 'var(--roof-red)' : 'var(--border-default)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <History className="w-4 h-4" />
              {historyView ? 'Hide' : 'Show'} History
            </button>
            {assessments.length >= 2 && (
              <button
                onClick={toggleComparisonMode}
                style={{
                  padding: '8px 16px',
                  background: comparisonMode ? 'var(--roof-red)' : 'var(--bg-hover)',
                  color: comparisonMode ? 'white' : 'var(--text-primary)',
                  border: `2px solid ${comparisonMode ? 'var(--roof-red)' : 'var(--border-default)'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Maximize2 className="w-4 h-4" />
                Compare
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: '#dc262620',
            border: '2px solid #dc2626',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Upload Zone */}
        <div
          className="roof-er-upload-zone"
          onClick={handleUploadClick}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            opacity: isAnalyzing ? 0.5 : 1,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
            borderColor: isDragging ? 'var(--roof-red)' : 'var(--border-default)',
            background: isDragging ? 'var(--bg-hover)' : 'var(--bg-elevated)',
            minHeight: '60px',
            padding: '20px'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isAnalyzing}
          />
          <div className="roof-er-upload-icon">
            {isAnalyzing ? (
              <Clock className="w-16 h-16 animate-spin" style={{ color: 'var(--roof-red)' }} />
            ) : (
              <Camera className="w-16 h-16" style={{ color: 'var(--roof-red)' }} />
            )}
          </div>
          <div className="roof-er-upload-text">
            {isAnalyzing ? 'Analyzing damage...' : isDragging ? 'Drop images here' : 'Drop photos here or click to upload'}
          </div>
          <div className="roof-er-upload-subtext">
            {isAnalyzing ? 'AI is inspecting your images' : 'Up to 5 images • Roof damage • Storm assessment • Safety hazards'}
          </div>
        </div>

        {/* Image Upload Grid */}
        {imageUploads.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            marginBottom: '20px'
          }}>
            {imageUploads.map((upload) => (
              <div key={upload.id} style={{
                position: 'relative',
                background: 'var(--bg-elevated)',
                borderRadius: '8px',
                padding: '8px',
                border: '2px solid var(--border-default)'
              }}>
                <img
                  src={upload.preview}
                  alt={upload.file.name}
                  style={{
                    width: '100%',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    marginBottom: '8px'
                  }}
                />
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {upload.file.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {upload.status === 'analyzing' && (
                    <>
                      <Clock className="w-4 h-4 animate-spin" style={{ color: 'var(--roof-red)' }} />
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Analyzing...</span>
                    </>
                  )}
                  {upload.status === 'completed' && (
                    <>
                      <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
                      <span style={{ fontSize: '11px', color: '#10b981' }}>Complete</span>
                    </>
                  )}
                  {upload.status === 'error' && (
                    <>
                      <AlertCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                      <span style={{ fontSize: '11px', color: '#dc2626' }}>Error</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comparison Mode */}
        {comparisonMode && comparisonImages.length === 2 && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '2px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            marginTop: '20px',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Before / After Comparison
              </div>
              <button
                onClick={() => setComparisonMode(false)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)'
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Side-by-side comparison */}
            <div style={{ display: 'flex', gap: '16px' }}>
              {/* Desktop: side by side */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '8px'
                }}>
                  Image 1: {comparisonImages[0].imageName}
                </div>
                <img
                  src={comparisonImages[0].imageUrl}
                  alt="Comparison 1"
                  style={{
                    width: '100%',
                    height: '300px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    background: '#00000010',
                    marginBottom: '8px'
                  }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Severity: {comparisonImages[0].analysis.severity} |
                  Urgency: {comparisonImages[0].analysis.urgency}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '8px'
                }}>
                  Image 2: {comparisonImages[1].imageName}
                </div>
                <img
                  src={comparisonImages[1].imageUrl}
                  alt="Comparison 2"
                  style={{
                    width: '100%',
                    height: '300px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    background: '#00000010',
                    marginBottom: '8px'
                  }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Severity: {comparisonImages[1].analysis.severity} |
                  Urgency: {comparisonImages[1].analysis.urgency}
                </div>
              </div>
            </div>

            {/* Comparison summary */}
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: 'var(--bg-primary)',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Comparison Analysis
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {comparisonImages[0].analysis.severity === comparisonImages[1].analysis.severity
                  ? `Both images show ${comparisonImages[0].analysis.severity} damage severity.`
                  : `Severity changed from ${comparisonImages[0].analysis.severity} to ${comparisonImages[1].analysis.severity}.`}
              </div>
            </div>
          </div>
        )}

        {/* Selected Assessment Detail - Split View */}
        {selectedAssessment && !comparisonMode && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '2px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            marginTop: '20px',
            display: 'flex',
            flexDirection: window.innerWidth > 768 ? 'row' : 'column',
            gap: '20px'
          }}>
            {/* Left: Image */}
            <div style={{ flex: window.innerWidth > 768 ? '0 0 50%' : '1' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedAssessment.imageName}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setImageZoom(prev => Math.min(prev + 0.25, 3))}
                    disabled={imageZoom >= 3}
                    style={{
                      padding: '6px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '4px',
                      cursor: imageZoom >= 3 ? 'not-allowed' : 'pointer',
                      opacity: imageZoom >= 3 ? 0.5 : 1
                    }}
                  >
                    <ZoomIn className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                  </button>
                  <button
                    onClick={() => setImageZoom(prev => Math.max(prev - 0.25, 1))}
                    disabled={imageZoom <= 1}
                    style={{
                      padding: '6px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '4px',
                      cursor: imageZoom <= 1 ? 'not-allowed' : 'pointer',
                      opacity: imageZoom <= 1 ? 0.5 : 1
                    }}
                  >
                    <ZoomOut className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                  </button>
                  <button
                    onClick={() => setImageZoom(1)}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--text-primary)'
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div
                ref={imageContainerRef}
                style={{
                  width: '100%',
                  height: '400px',
                  overflow: 'auto',
                  borderRadius: '8px',
                  background: '#00000010',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img
                  src={selectedAssessment.imageUrl}
                  alt="Roof assessment"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transform: `scale(${imageZoom})`,
                    transformOrigin: 'center',
                    transition: 'transform 0.2s'
                  }}
                />
              </div>

              <div style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                marginTop: '8px',
                textAlign: 'center'
              }}>
                {selectedAssessment.timestamp.toLocaleString()} • Confidence: {selectedAssessment.confidence}%
              </div>
            </div>

            {/* Right: Analysis */}
            <div style={{ flex: 1, overflow: 'auto', maxHeight: '600px' }}>
              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={handleDownloadPDF}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--roof-red)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FileText className="w-4 h-4" />
                  PDF Report
                </button>
                <button
                  onClick={handleDownloadReport}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download className="w-4 h-4" />
                  Markdown
                </button>
                <button
                  onClick={handleEmailReport}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Mail className="w-4 h-4" />
                  Email
                </button>
                <button
                  onClick={() => handleDelete(selectedAssessment.id)}
                  style={{
                    padding: '8px 12px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    marginLeft: 'auto'
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Damage Status */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '12px',
                  background: selectedAssessment.analysis.damageDetected ? '#dc262610' : '#10b98110',
                  borderRadius: '8px',
                  border: `2px solid ${selectedAssessment.analysis.damageDetected ? '#dc2626' : '#10b981'}`
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    DAMAGE DETECTED
                  </div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: selectedAssessment.analysis.damageDetected ? '#dc2626' : '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {selectedAssessment.analysis.damageDetected ? (
                      <><AlertCircle className="w-5 h-5" /> YES</>
                    ) : (
                      <><CheckCircle className="w-5 h-5" /> NO</>
                    )}
                  </div>
                </div>

                <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    SEVERITY
                  </div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: getSeverityColor(selectedAssessment.analysis.severity),
                    textTransform: 'uppercase'
                  }}>
                    {selectedAssessment.analysis.severity}
                  </div>
                </div>

                <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    URGENCY
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>
                    {getUrgencyBadge(selectedAssessment.analysis.urgency)}
                  </div>
                </div>
              </div>

              {/* Damage Details */}
              {selectedAssessment.analysis.damageDetected && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Damage Type
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {selectedAssessment.analysis.damageType.map((type, idx) => (
                        <span key={idx} style={{
                          padding: '4px 10px',
                          background: 'var(--roof-red)20',
                          color: 'var(--roof-red)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Affected Area
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {selectedAssessment.analysis.affectedArea}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Estimated Size
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {selectedAssessment.analysis.estimatedSize}
                    </div>
                  </div>
                </>
              )}

              {/* Insurance Claim Viability */}
              {selectedAssessment.analysis.claimViability && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    padding: '14px',
                    background: getClaimViabilityColor(selectedAssessment.analysis.claimViability) + '15',
                    border: `2px solid ${getClaimViabilityColor(selectedAssessment.analysis.claimViability)}`,
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      INSURANCE CLAIM VIABILITY
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: getClaimViabilityColor(selectedAssessment.analysis.claimViability),
                      textTransform: 'uppercase',
                      marginBottom: '8px'
                    }}>
                      {selectedAssessment.analysis.claimViability}
                    </div>
                    {selectedAssessment.analysis.policyLanguage && (
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        fontStyle: 'italic',
                        padding: '8px',
                        background: 'var(--bg-primary)',
                        borderRadius: '4px',
                        marginTop: '8px'
                      }}>
                        <strong>For Adjuster:</strong> {selectedAssessment.analysis.policyLanguage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Insurance Arguments */}
              {selectedAssessment.analysis.insuranceArguments && selectedAssessment.analysis.insuranceArguments.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageCircle className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                    Key Insurance Arguments
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedAssessment.analysis.insuranceArguments.map((arg, idx) => (
                      <div key={idx} style={{
                        padding: '10px 12px',
                        background: 'var(--roof-red)10',
                        borderLeft: '4px solid var(--roof-red)',
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        lineHeight: '1.6'
                      }}>
                        <strong>#{idx + 1}:</strong> {arg}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-Up Questions */}
              {selectedAssessment.followUpQuestions && selectedAssessment.followUpQuestions.length > 0 && (
                <div style={{
                  marginBottom: '16px',
                  padding: '16px',
                  background: '#f59e0b15',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle className="w-5 h-5" style={{ color: '#f59e0b' }} />
                    Susan needs more information to strengthen this claim:
                  </div>
                  {selectedAssessment.followUpQuestions.map((question, idx) => (
                    <div key={idx} style={{
                      marginBottom: '10px',
                      padding: '10px',
                      background: 'var(--bg-elevated)',
                      borderRadius: '6px'
                    }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px', fontWeight: 500 }}>
                        {idx + 1}. {question}
                      </div>
                      {answeringQuestion === idx ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            value={questionAnswer}
                            onChange={(e) => setQuestionAnswer(e.target.value)}
                            placeholder="Type your answer..."
                            autoFocus
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              fontSize: '13px',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)'
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && handleAnswerQuestion(idx)}
                          />
                          <button
                            onClick={() => handleAnswerQuestion(idx)}
                            disabled={!questionAnswer.trim() || isAnalyzing}
                            style={{
                              padding: '6px 12px',
                              background: 'var(--roof-red)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: questionAnswer.trim() && !isAnalyzing ? 'pointer' : 'not-allowed',
                              opacity: questionAnswer.trim() && !isAnalyzing ? 1 : 0.5,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Send className="w-4 h-4" />
                            {isAnalyzing ? 'Updating...' : 'Send'}
                          </button>
                          <button
                            onClick={() => {
                              setAnsweringQuestion(null);
                              setQuestionAnswer('');
                            }}
                            style={{
                              padding: '6px 12px',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAnsweringQuestion(idx)}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--roof-red)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Answer Question
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Conversation History */}
              {selectedAssessment.conversationHistory && selectedAssessment.conversationHistory.length > 0 && (
                <details style={{ marginBottom: '16px' }}>
                  <summary style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '8px',
                    background: 'var(--bg-primary)',
                    borderRadius: '6px'
                  }}>
                    Information Provided ({selectedAssessment.conversationHistory.length})
                  </summary>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedAssessment.conversationHistory.map((item, idx) => (
                      <div key={idx} style={{
                        padding: '10px',
                        background: 'var(--bg-primary)',
                        borderRadius: '6px'
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <strong>Q:</strong> {item.question}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                          <strong>A:</strong> {item.answer}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Detailed Analysis */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Insurance-Focused Analysis
                </div>
                <div style={{
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  borderRadius: '6px'
                }}>
                  {selectedAssessment.rawResponse}
                </div>
              </div>

              {/* Recommendations */}
              {selectedAssessment.analysis.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Recommendations
                  </div>
                  <ul style={{
                    margin: 0,
                    paddingLeft: '20px',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.8'
                  }}>
                    {selectedAssessment.analysis.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Analyses / History View */}
        {(historyView || !selectedAssessment) && (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '30px',
              marginBottom: '12px'
            }}>
              <div className="roof-er-page-title" style={{ fontSize: '18px', margin: 0 }}>
                Recent Analyses ({assessments.length})
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setViewPinned(false)}
                  style={{ padding: '6px 10px', background: !viewPinned ? 'var(--roof-red)' : 'var(--bg-hover)', border: `1px solid ${!viewPinned ? 'var(--roof-red)' : 'var(--border-default)'}`, borderRadius: '9999px', color: 'var(--text-primary)', fontSize: '12px' }}
                >All</button>
                <button
                  onClick={() => setViewPinned(true)}
                  style={{ padding: '6px 10px', background: viewPinned ? 'var(--roof-red)' : 'var(--bg-hover)', border: `1px solid ${viewPinned ? 'var(--roof-red)' : 'var(--border-default)'}`, borderRadius: '9999px', color: 'var(--text-primary)', fontSize: '12px' }}
                >Go‑To</button>
                {assessments.length > 0 && (
                  <button
                    onClick={handleDownloadFullReport}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--roof-red)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Full Report
                  </button>
                )}
              </div>
            </div>

            {assessments.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '14px'
              }}>
                No assessments yet. Upload an image to get started.
              </div>
            ) : (
              <div className="roof-er-doc-grid">
                {(viewPinned ? assessments.filter(a => pinned.has(a.id)) : assessments).map((assessment) => (
                  <div
                    key={assessment.id}
                    className="roof-er-doc-card"
                    onClick={() => {
                      setSelectedAssessment(assessment);
                      setHistoryView(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{
                      cursor: 'pointer',
                      border: selectedAssessment?.id === assessment.id ? '2px solid var(--roof-red)' : undefined,
                      position: 'relative'
                    }}
                  >
                    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: '6px', zIndex: 2 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePinned(assessment.id); }}
                        title={pinned.has(assessment.id) ? 'Unpin from Go‑To' : 'Pin to Go‑To'}
                        style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--bg-hover)', border: '1px solid var(--border-default)', borderRadius: '9999px', color: 'var(--text-primary)' }}
                      >
                        <Pin className="w-3 h-3" style={{ marginRight: 4 }} />
                        {pinned.has(assessment.id) ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openAssessmentInChat(assessment); }}
                        title="Open in Chat"
                        style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--roof-red)', border: 'none', borderRadius: '9999px', color: '#fff' }}
                      >
                        <MessageCircle className="w-3 h-3" style={{ marginRight: 4 }} />
                        Chat
                      </button>
                    </div>
                    <img
                      src={assessment.imageUrl}
                      alt={assessment.imageName}
                      style={{
                        width: '100%',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        marginBottom: '8px'
                      }}
                    />
                    <div className="roof-er-doc-title">{assessment.imageName}</div>
                    <div className="roof-er-doc-desc">
                      {assessment.analysis.damageDetected ? (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                          Damage: {assessment.analysis.severity}
                        </span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 600 }}>
                          No damage detected
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {getUrgencyBadge(assessment.analysis.urgency)}
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {assessment.timestamp.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Helper functions
async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function generateId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default ImageAnalysisPanel;
