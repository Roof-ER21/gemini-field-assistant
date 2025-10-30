import React, { useState } from 'react';
import { MapPin, Search, Navigation, Phone, Bookmark } from 'lucide-react';

const MapsPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const locations = [
    { name: 'ABC Roofing Supply', address: '123 Industrial Blvd, Richmond, VA', phone: '(804) 555-0100' },
    { name: 'Quality Materials Inc', address: '456 Commerce St, Norfolk, VA', phone: '(757) 555-0200' },
    { name: 'Pro Builder Depot', address: '789 Trade Center, Virginia Beach, VA', phone: '(757) 555-0300' },
    { name: 'Premier Supply Co', address: '321 Main St, Charlottesville, VA', phone: '(434) 555-0400' },
    { name: 'Roofing Warehouse', address: '654 Industrial Way, Roanoke, VA', phone: '(540) 555-0500' }
  ];

  const filteredLocations = searchQuery.trim()
    ? locations.filter(loc =>
        loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.address.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : locations;

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <MapPin className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Find Locations
        </div>

        {/* Search Bar */}
        <div className="roof-er-search-bar">
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              className="w-5 h-5"
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-disabled)'
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for suppliers, contractors, or addresses..."
              className="roof-er-search-input"
              style={{ paddingLeft: '52px' }}
            />
          </div>
        </div>

        {/* Location Cards */}
        {filteredLocations.map((location, idx) => (
          <div key={idx} className="roof-er-location-card">
            <div className="roof-er-location-name">{location.name}</div>
            <div className="roof-er-location-address">{location.address}</div>
            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
              {location.phone}
            </div>
            <div className="roof-er-location-actions">
              <button className="roof-er-location-btn">
                <Navigation className="w-4 h-4 inline mr-1" />
                Directions
              </button>
              <button className="roof-er-location-btn">
                <Phone className="w-4 h-4 inline mr-1" />
                Call
              </button>
              <button className="roof-er-location-btn">
                <Bookmark className="w-4 h-4 inline mr-1" />
                Save
              </button>
            </div>
          </div>
        ))}

        {filteredLocations.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)'
          }}>
            No locations found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

export default MapsPanel;
