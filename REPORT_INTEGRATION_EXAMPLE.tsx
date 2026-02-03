/**
 * Example Frontend Integration for PDF Report Generation
 *
 * This file shows how to integrate the PDF report generation
 * into your storm damage search UI.
 */

import React, { useState } from 'react';
import { Download, FileText, AlertCircle, Filter } from 'lucide-react';

// Filter options for PDF report generation
export type ReportFilter = 'all' | 'hail-only' | 'hail-wind' | 'ihm-only' | 'noaa-only';

export const REPORT_FILTER_OPTIONS: { value: ReportFilter; label: string; description: string }[] = [
  { value: 'all', label: 'All Events', description: 'Include all hail, wind, and tornado events from all sources' },
  { value: 'hail-only', label: 'Hail Only', description: 'Only include hail events (best for roof damage claims)' },
  { value: 'hail-wind', label: 'Hail & Wind', description: 'Include hail and wind events (excludes tornado)' },
  { value: 'ihm-only', label: 'IHM Only', description: 'Only Interactive Hail Maps verified data' },
  { value: 'noaa-only', label: 'NOAA Only', description: 'Only official NOAA Storm Events data' },
];

interface StormSearchResults {
  address: string;
  lat: number;
  lng: number;
  radius: number;
  events: any[];
  noaaEvents: any[];
  damageScore: any;
}

interface ReportGeneratorProps {
  searchResults: StormSearchResults;
  repInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    company?: string;
  };
}

export function ReportGeneratorButton({ searchResults, repInfo }: ReportGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log(`📄 Generating PDF report (filter: ${filter})...`);

      const response = await fetch('/api/hail/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: searchResults.address,
          lat: searchResults.lat,
          lng: searchResults.lng,
          radius: searchResults.radius,
          events: searchResults.events,
          noaaEvents: searchResults.noaaEvents,
          damageScore: searchResults.damageScore,
          repName: repInfo?.name,
          repPhone: repInfo?.phone,
          repEmail: repInfo?.email,
          companyName: repInfo?.company || 'SA21 Storm Intelligence',
          filter: filter,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Storm_Report_${searchResults.address.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ Report downloaded successfully!');
    } catch (err) {
      console.error('❌ Report generation failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const selectedFilterOption = REPORT_FILTER_OPTIONS.find(o => o.value === filter);

  return (
    <div className="space-y-3">
      {/* Filter Selection */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <Filter size={14} className="inline mr-1" />
          Report Filter
        </label>
        <button
          type="button"
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-left text-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span>{selectedFilterOption?.label}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showFilterMenu && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            {REPORT_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setFilter(option.value);
                  setShowFilterMenu(false);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                  filter === option.value ? 'bg-blue-50 text-blue-700' : ''
                }`}
              >
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-gray-500">{option.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerateReport}
        disabled={loading || !searchResults.damageScore}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium w-full justify-center
          ${loading || !searchResults.damageScore
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
          }
          transition-colors duration-200
        `}
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            <span>Generating Report...</span>
          </>
        ) : (
          <>
            <Download size={16} />
            <span>Generate PDF Report</span>
          </>
        )}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!searchResults.damageScore && (
        <p className="text-xs text-gray-500">
          Complete a storm search first to generate a report
        </p>
      )}
    </div>
  );
}

// ============================================
// Example: Integrated into Storm Search Page
// ============================================

export function StormSearchPage() {
  const [searchResults, setSearchResults] = useState<StormSearchResults | null>(null);
  const [userInfo, setUserInfo] = useState({
    name: 'John Smith',
    phone: '(555) 123-4567',
    email: 'john@example.com',
    company: 'SA21 Roofing',
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Storm Damage Search</h1>

      {/* Search form goes here */}
      {/* ... */}

      {/* Results section */}
      {searchResults && (
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          {/* Damage Score Display */}
          <div className="border-l-4 border-blue-500 pl-4">
            <h2 className="text-xl font-semibold">Damage Risk Score</h2>
            <div className="mt-2 flex items-center gap-4">
              <div className="text-4xl font-bold" style={{ color: searchResults.damageScore.color }}>
                {searchResults.damageScore.score}
              </div>
              <div>
                <div className="text-lg font-medium">{searchResults.damageScore.riskLevel} Risk</div>
                <div className="text-sm text-gray-600">{searchResults.damageScore.summary}</div>
              </div>
            </div>
          </div>

          {/* Event Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Events</div>
              <div className="text-2xl font-semibold">
                {searchResults.events.length + searchResults.noaaEvents.length}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Max Hail Size</div>
              <div className="text-2xl font-semibold">
                {searchResults.damageScore.factors.maxHailSize.toFixed(1)}"
              </div>
            </div>
          </div>

          {/* Generate Report Button */}
          <div className="pt-4 border-t">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FileText size={20} />
              Professional Report
            </h3>
            <ReportGeneratorButton
              searchResults={searchResults}
              repInfo={userInfo}
            />
            <div className="mt-2 text-xs text-gray-500">
              Generate a comprehensive PDF report suitable for insurance claims
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Alternative: Inline Report Generator
// ============================================

export function InlineReportGenerator({ searchResults, repInfo }: ReportGeneratorProps) {
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/hail/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: searchResults.address,
          lat: searchResults.lat,
          lng: searchResults.lng,
          radius: searchResults.radius,
          events: searchResults.events,
          noaaEvents: searchResults.noaaEvents,
          damageScore: searchResults.damageScore,
          repName: repInfo?.name,
          repPhone: repInfo?.phone,
          repEmail: repInfo?.email,
          companyName: repInfo?.company,
        }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_${Date.now()}.pdf`;
      a.click();
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={generateReport}
      disabled={loading}
      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
    >
      <Download size={16} />
      {loading ? 'Generating...' : 'Download Report'}
    </button>
  );
}

// ============================================
// Utility: Fetch and Auto-Download Report
// ============================================

export async function downloadStormReport(
  searchResults: StormSearchResults,
  repInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    company?: string;
  },
  filter: ReportFilter = 'all'
): Promise<boolean> {
  try {
    const response = await fetch('/api/hail/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: searchResults.address,
        lat: searchResults.lat,
        lng: searchResults.lng,
        radius: searchResults.radius,
        events: searchResults.events,
        noaaEvents: searchResults.noaaEvents,
        damageScore: searchResults.damageScore,
        repName: repInfo?.name,
        repPhone: repInfo?.phone,
        repEmail: repInfo?.email,
        companyName: repInfo?.company || 'SA21 Storm Intelligence',
        filter: filter,
      }),
    });

    if (!response.ok) {
      throw new Error('Report generation failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Storm_Report_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return true;
  } catch (error) {
    console.error('Failed to download report:', error);
    return false;
  }
}

// Usage examples:
// const success = await downloadStormReport(results, { name: 'John', phone: '555-1234' });
// const success = await downloadStormReport(results, repInfo, 'hail-only'); // Hail events only
// const success = await downloadStormReport(results, repInfo, 'ihm-only');  // IHM data only
