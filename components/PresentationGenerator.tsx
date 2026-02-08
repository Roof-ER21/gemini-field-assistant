/**
 * PresentationGenerator - Create and customize inspection presentations
 * Allows slide ordering, content editing, and presentation generation
 */

import React, { useState, useEffect } from 'react';
import {
  Presentation,
  ArrowUp,
  ArrowDown,
  Edit3,
  Trash2,
  Eye,
  Plus,
  Save,
  FileText,
  Download
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import type { PhotoAnalysis } from './InspectionUploader';

interface PresentationSlide {
  id: string;
  type: 'title' | 'photo' | 'summary' | 'recommendations';
  photo?: string;
  analysis?: PhotoAnalysis;
  title?: string;
  content?: string;
  order: number;
}

interface PresentationGeneratorProps {
  photos: Array<{ id: string; preview: string; analysis?: PhotoAnalysis }>;
  onGenerate?: (slides: PresentationSlide[]) => void;
  onPreview?: (slides: PresentationSlide[]) => void;
}

export const PresentationGenerator: React.FC<PresentationGeneratorProps> = ({
  photos,
  onGenerate,
  onPreview
}) => {
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [editingSlide, setEditingSlide] = useState<string | null>(null);
  const [presentationTitle, setPresentationTitle] = useState('Roof Inspection Report');
  const [inspectorName, setInspectorName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');

  // Generate initial slides from photos
  useEffect(() => {
    if (photos.length === 0) return;

    const newSlides: PresentationSlide[] = [];
    let order = 0;

    // Title slide
    newSlides.push({
      id: 'title-slide',
      type: 'title',
      title: presentationTitle,
      content: `Inspector: ${inspectorName || 'Not specified'}\nProperty: ${propertyAddress || 'Not specified'}\nDate: ${new Date().toLocaleDateString()}`,
      order: order++
    });

    // Photo slides
    photos.forEach((photo, idx) => {
      if (photo.analysis) {
        newSlides.push({
          id: `photo-${photo.id}`,
          type: 'photo',
          photo: photo.preview,
          analysis: photo.analysis,
          title: `Finding #${idx + 1}: ${photo.analysis.damageType}`,
          order: order++
        });
      }
    });

    // Summary slide
    const criticalCount = photos.filter(p => p.analysis?.severity === 'critical').length;
    const severeCount = photos.filter(p => p.analysis?.severity === 'severe').length;
    const moderateCount = photos.filter(p => p.analysis?.severity === 'moderate').length;
    const minorCount = photos.filter(p => p.analysis?.severity === 'minor').length;

    newSlides.push({
      id: 'summary-slide',
      type: 'summary',
      title: 'Inspection Summary',
      content: `Total Findings: ${photos.length}\n\nSeverity Breakdown:\n• Critical: ${criticalCount}\n• Severe: ${severeCount}\n• Moderate: ${moderateCount}\n• Minor: ${minorCount}`,
      order: order++
    });

    // Recommendations slide
    const allRecommendations = photos
      .filter(p => p.analysis?.recommendations)
      .flatMap(p => p.analysis!.recommendations)
      .filter((rec, idx, arr) => arr.indexOf(rec) === idx) // Unique only
      .slice(0, 8); // Top 8

    if (allRecommendations.length > 0) {
      newSlides.push({
        id: 'recommendations-slide',
        type: 'recommendations',
        title: 'Key Recommendations',
        content: allRecommendations.join('\n'),
        order: order++
      });
    }

    setSlides(newSlides);
  }, [photos, presentationTitle, inspectorName, propertyAddress]);

  // Move slide up
  const moveSlideUp = (id: string) => {
    const index = slides.findIndex(s => s.id === id);
    if (index <= 0) return;

    const newSlides = [...slides];
    [newSlides[index - 1], newSlides[index]] = [newSlides[index], newSlides[index - 1]];
    newSlides.forEach((slide, idx) => slide.order = idx);
    setSlides(newSlides);
  };

  // Move slide down
  const moveSlideDown = (id: string) => {
    const index = slides.findIndex(s => s.id === id);
    if (index >= slides.length - 1) return;

    const newSlides = [...slides];
    [newSlides[index], newSlides[index + 1]] = [newSlides[index + 1], newSlides[index]];
    newSlides.forEach((slide, idx) => slide.order = idx);
    setSlides(newSlides);
  };

  // Delete slide
  const deleteSlide = (id: string) => {
    const newSlides = slides.filter(s => s.id !== id);
    newSlides.forEach((slide, idx) => slide.order = idx);
    setSlides(newSlides);
  };

  // Update slide content
  const updateSlideContent = (id: string, updates: Partial<PresentationSlide>) => {
    setSlides(slides.map(s => s.id === id ? { ...s, ...updates } : s));
    setEditingSlide(null);
  };

  // Generate presentation
  const handleGenerate = () => {
    if (onGenerate) {
      onGenerate(slides);
    }
  };

  // Preview presentation
  const handlePreview = () => {
    if (onPreview) {
      onPreview(slides);
    }
  };

  // Get slide icon
  const getSlideIcon = (type: string) => {
    switch (type) {
      case 'title': return <FileText className="w-4 h-4" />;
      case 'photo': return <Edit3 className="w-4 h-4" />;
      case 'summary': return <FileText className="w-4 h-4" />;
      case 'recommendations': return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Presentation className="w-5 h-5 text-[#e94560]" />
          Presentation Builder
        </CardTitle>
        <CardDescription>
          Customize slide order and content. Drag to reorder, click to edit.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Presentation Metadata */}
        <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
          <h3 className="text-sm font-semibold text-white">Presentation Details</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/60 mb-1 block">Title</label>
              <input
                type="text"
                value={presentationTitle}
                onChange={(e) => setPresentationTitle(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-white text-sm focus:border-[#e94560] focus:outline-none"
                placeholder="Roof Inspection Report"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Inspector Name</label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-white text-sm focus:border-[#e94560] focus:outline-none"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Property Address</label>
              <input
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-white text-sm focus:border-[#e94560] focus:outline-none"
                placeholder="123 Main St, City, State ZIP"
              />
            </div>
          </div>
        </div>

        {/* Slide List */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white flex items-center justify-between">
            <span>Slides ({slides.length})</span>
            <Button variant="ghost" size="sm" className="text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add Custom Slide
            </Button>
          </h3>

          {slides.length === 0 ? (
            <div className="text-center py-8 text-white/60">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No slides yet. Upload photos to generate presentation.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  className="p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Slide Number */}
                    <div className="flex-shrink-0 w-8 h-8 rounded bg-[#e94560]/20 text-[#e94560] flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>

                    {/* Slide Preview */}
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getSlideIcon(slide.type)}
                        <h4 className="text-sm font-semibold text-white truncate">
                          {slide.title || `${slide.type} Slide`}
                        </h4>
                        <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60">
                          {slide.type}
                        </span>
                      </div>

                      {editingSlide === slide.id ? (
                        <div className="space-y-2 mt-2">
                          <input
                            type="text"
                            value={slide.title || ''}
                            onChange={(e) => updateSlideContent(slide.id, { title: e.target.value })}
                            className="w-full px-2 py-1 bg-black/40 border border-white/20 rounded text-white text-xs"
                            placeholder="Slide title"
                          />
                          <textarea
                            value={slide.content || ''}
                            onChange={(e) => updateSlideContent(slide.id, { content: e.target.value })}
                            className="w-full px-2 py-1 bg-black/40 border border-white/20 rounded text-white text-xs"
                            rows={3}
                            placeholder="Slide content"
                          />
                          <Button size="sm" onClick={() => setEditingSlide(null)}>
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-white/60 line-clamp-2">
                          {slide.content || slide.analysis?.description || 'No content'}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveSlideUp(slide.id)}
                        disabled={index === 0}
                        className="p-1 hover:bg-white/10 rounded disabled:opacity-30"
                      >
                        <ArrowUp className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => moveSlideDown(slide.id)}
                        disabled={index === slides.length - 1}
                        className="p-1 hover:bg-white/10 rounded disabled:opacity-30"
                      >
                        <ArrowDown className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setEditingSlide(slide.id)}
                        className="p-1 hover:bg-white/10 rounded"
                      >
                        <Edit3 className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => deleteSlide(slide.id)}
                        disabled={slide.type === 'title'}
                        className="p-1 hover:bg-red-500/20 rounded disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {slides.length > 0 && (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleGenerate}>
              <Presentation className="w-4 h-4 mr-2" />
              Generate Presentation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PresentationGenerator;
