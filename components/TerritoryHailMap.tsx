/**
 * TerritoryHailMap — Storm Map Page
 *
 * Embeds the standalone Storm Maps app (appealing-bravery-production)
 * in a full-height iframe. This ensures perfect visual unity between
 * the field assistant and the standalone app with zero code duplication.
 *
 * The standalone app handles:
 * - Google Maps with hail event markers
 * - Sidebar with storm dates, search, tabs
 * - MRMS MESH hail overlay
 * - GPS tracking + canvassing alerts
 * - Report generation
 * - NHP hail swath rendering
 *
 * Data flows through sa21.up.railway.app/api/hail/search (CORS enabled).
 */

import React from 'react';

interface TerritoryHailMapProps {
  isAdmin?: boolean;
}

const STORM_MAPS_URL = 'https://appealing-bravery-production-d7d6.up.railway.app';

export default function TerritoryHailMap(_props: TerritoryHailMapProps) {
  return (
    <div className="roof-er-content-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <iframe
        src={STORM_MAPS_URL}
        title="Storm Maps"
        style={{
          width: '100%',
          flex: 1,
          border: 'none',
          minHeight: 0,
        }}
        allow="geolocation"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
