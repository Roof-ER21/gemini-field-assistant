import React, { useState, useEffect, useRef } from 'react';
import { Upload, Camera, Image as ImageIcon, Download, Trash2, AlertCircle, CheckCircle, Clock, MessageCircle, Send } from 'lucide-react';
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

const ImageAnalysisPanel: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [assessments, setAssessments] = useState<DamageAssessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<DamageAssessment | null>(null);
  const [error, setError] = useState<string>('');
  const [answeringQuestion, setAnsweringQuestion] = useState<number | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved assessments on mount
  useEffect(() => {
    setAssessments(getSavedAssessments());
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    setError('');

    try {
      const fileArray = Array.from(files);

      if (fileArray.length === 1) {
        // Single image analysis
        const assessment = await analyzeRoofImage(fileArray[0]);
        setAssessments(prev => [assessment, ...prev]);
        setSelectedAssessment(assessment);
      } else {
        // Batch analysis
        const results = await analyzeBatchImages(fileArray);
        setAssessments(prev => [...results, ...prev]);
        setSelectedAssessment(results[0]);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to analyze image');
      console.error('Image analysis error:', err);
    } finally {
      setIsAnalyzing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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

  const handleAnswerQuestion = async (questionIndex: number) => {
    if (!selectedAssessment || !questionAnswer.trim()) return;

    try {
      setIsAnalyzing(true);
      setError('');

      const updated = await answerFollowUpQuestion(selectedAssessment, questionIndex, questionAnswer);

      // Update in state
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
          style={{
            opacity: isAnalyzing ? 0.5 : 1,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer'
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
            {isAnalyzing ? 'Analyzing damage...' : 'Drop photos here or click to upload'}
          </div>
          <div className="roof-er-upload-subtext">
            {isAnalyzing ? 'AI is inspecting your images' : 'Roof damage • Storm assessment • Safety hazards'}
          </div>
        </div>

        {/* Selected Assessment Detail */}
        {selectedAssessment && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '2px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            marginTop: '20px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '16px'
            }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {selectedAssessment.imageName}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {selectedAssessment.timestamp.toLocaleString()} • Confidence: {selectedAssessment.confidence}%
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDownloadReport}
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
                  Download
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
                    fontSize: '13px'
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image Preview */}
            <img
              src={selectedAssessment.imageUrl}
              alt="Roof assessment"
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain',
                borderRadius: '8px',
                marginBottom: '16px',
                background: '#00000010'
              }}
            />

            {/* Damage Status */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
        )}

        {/* Recent Analyses */}
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
            {assessments.map((assessment) => (
              <div
                key={assessment.id}
                className="roof-er-doc-card"
                onClick={() => setSelectedAssessment(assessment)}
                style={{
                  cursor: 'pointer',
                  border: selectedAssessment?.id === assessment.id ? '2px solid var(--roof-red)' : undefined
                }}
              >
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
                <div style={{ marginTop: '6px' }}>
                  {getUrgencyBadge(assessment.analysis.urgency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageAnalysisPanel;
