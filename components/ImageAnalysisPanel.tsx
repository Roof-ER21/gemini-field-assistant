import React, { useState } from 'react';
import { Upload, Camera, Image as ImageIcon } from 'lucide-react';

const ImageAnalysisPanel: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const recentAnalyses = [
    { title: 'Recent Analysis', desc: '123 Main St - Storm damage detected', icon: '📷', time: 'Today' },
    { title: 'Today 2:15 PM', desc: '456 Oak Ave - 2,400 sq ft measured', icon: '📐', time: '2:15 PM' },
    { title: 'Today 1:30 PM', desc: '789 Elm St - Safety concerns identified', icon: '⚠️', time: '1:30 PM' }
  ];

  const handleUpload = () => {
    alert('Photo upload feature - connects to camera/gallery for damage documentation');
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <ImageIcon className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Image Analysis
        </div>

        {/* Upload Zone */}
        <div className="roof-er-upload-zone" onClick={handleUpload}>
          <div className="roof-er-upload-icon">
            <Camera className="w-16 h-16" style={{ color: 'var(--roof-red)' }} />
          </div>
          <div className="roof-er-upload-text">Drop photos here or click to upload</div>
          <div className="roof-er-upload-subtext">
            Roof damage • Measurements • Safety hazards
          </div>
        </div>

        {/* Recent Analyses */}
        <div className="roof-er-page-title" style={{ fontSize: '18px', marginTop: '30px' }}>
          Recent Analyses
        </div>
        <div className="roof-er-doc-grid">
          {recentAnalyses.map((item, idx) => (
            <div key={idx} className="roof-er-doc-card">
              <div className="roof-er-doc-icon">{item.icon}</div>
              <div className="roof-er-doc-title">{item.title}</div>
              <div className="roof-er-doc-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImageAnalysisPanel;
