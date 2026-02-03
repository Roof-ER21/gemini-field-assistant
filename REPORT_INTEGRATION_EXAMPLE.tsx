/**
 * Example Frontend Integration for PDF Report Generation
 *
 * This file shows how to integrate the PDF report generation
 * into your storm damage search UI.
 */

import React, { useState } from 'react';
import { Download, FileText, AlertCircle } from 'lucide-react';

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

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('📄 Generating PDF report...');

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

  return (
    <div className="space-y-2">
      <button
        onClick={handleGenerateReport}
        disabled={loading || !searchResults.damageScore}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium
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
  }
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

// Usage example:
// const success = await downloadStormReport(results, { name: 'John', phone: '555-1234' });
