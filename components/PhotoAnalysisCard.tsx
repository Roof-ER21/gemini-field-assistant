/**
 * PhotoAnalysisCard - Displays analyzed inspection photo
 * Shows damage details, severity, recommendations, and insurance info
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Shield,
  DollarSign,
  MapPin,
  Wrench,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { PhotoAnalysis } from './InspectionUploader';

interface PhotoAnalysisCardProps {
  photo: string;
  analysis: PhotoAnalysis;
  photoNumber: number;
  onEdit?: (analysis: PhotoAnalysis) => void;
}

export const PhotoAnalysisCard: React.FC<PhotoAnalysisCardProps> = ({
  photo,
  analysis,
  photoNumber,
  onEdit
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Severity color mapping
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'severe': return 'bg-orange-500';
      case 'moderate': return 'bg-yellow-500';
      case 'minor': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityTextColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500';
      case 'severe': return 'text-orange-500';
      case 'moderate': return 'text-yellow-500';
      case 'minor': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  // Urgency icon and color
  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'critical': return <Clock className="w-4 h-4 text-red-500" />;
      case 'high': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'medium': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'low': return <Clock className="w-4 h-4 text-green-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-sm">Photo #{photoNumber}</span>
            <div className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getSeverityColor(analysis.severity)}`}>
              {analysis.severity.toUpperCase()}
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-white" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white" />
            )}
          </button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Photo Preview */}
        <div className="relative aspect-video rounded-lg overflow-hidden border border-white/10">
          <img
            src={photo}
            alt={`Inspection ${photoNumber}`}
            className="w-full h-full object-cover"
          />
          {/* Insurance Badge */}
          {analysis.insuranceRelevant && (
            <div className="absolute top-3 right-3 px-3 py-1.5 bg-[#e94560] rounded-full flex items-center gap-2">
              <Shield className="w-4 h-4 text-white" />
              <span className="text-xs font-bold text-white">INSURANCE</span>
            </div>
          )}
        </div>

        {/* Damage Type */}
        <div>
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${getSeverityTextColor(analysis.severity)}`} />
            {analysis.damageType}
          </h3>
          <div className="flex items-center gap-4 text-sm text-white/60">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {analysis.location}
            </div>
            <div className="flex items-center gap-1">
              {getUrgencyIcon(analysis.urgency)}
              {analysis.urgency} urgency
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-white/80 text-sm leading-relaxed">
            {analysis.description}
          </p>
        </div>

        {/* Expandable Section */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t border-white/10">
            {/* Estimated Cost */}
            {analysis.estimatedRepairCost && (
              <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                <DollarSign className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-white mb-1">
                    Estimated Repair Cost
                  </h4>
                  <p className="text-lg font-bold text-green-400">
                    {analysis.estimatedRepairCost}
                  </p>
                </div>
              </div>
            )}

            {/* Recommendations */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#e94560]" />
                Recommendations
              </h4>
              <ul className="space-y-2">
                {analysis.recommendations.map((rec, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-white/80 p-2 bg-white/5 rounded border border-white/10"
                  >
                    <span className="text-[#e94560] font-bold flex-shrink-0 mt-0.5">
                      {idx + 1}.
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Insurance Relevance */}
            {analysis.insuranceRelevant && (
              <div className="p-3 bg-gradient-to-r from-[#e94560]/20 to-transparent rounded-lg border border-[#e94560]/30">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-[#e94560] mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">
                      Insurance Documentation
                    </h4>
                    <p className="text-xs text-white/80">
                      This damage is insurance-relevant. Include in claim documentation.
                      Photos and analysis will be automatically formatted for insurance submission.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
          <div className="text-center p-2 bg-white/5 rounded">
            <div className={`text-xs font-semibold ${getSeverityTextColor(analysis.severity)}`}>
              Severity
            </div>
            <div className="text-lg font-bold text-white capitalize">
              {analysis.severity}
            </div>
          </div>
          <div className="text-center p-2 bg-white/5 rounded">
            <div className="text-xs font-semibold text-white/60">
              Urgency
            </div>
            <div className="text-lg font-bold text-white capitalize">
              {analysis.urgency}
            </div>
          </div>
          <div className="text-center p-2 bg-white/5 rounded">
            <div className="text-xs font-semibold text-white/60">
              Insurance
            </div>
            <div className="text-lg font-bold text-white">
              {analysis.insuranceRelevant ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PhotoAnalysisCard;
