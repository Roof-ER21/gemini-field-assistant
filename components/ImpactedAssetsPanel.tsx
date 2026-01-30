/**
 * ImpactedAssetsPanel - Monitor customer properties for storm impacts
 * Proactive outreach when storms affect tracked properties
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Calendar,
  Cloud,
  Wind,
  Droplets,
  Plus,
  RefreshCw,
  Bell,
  Home,
  Trash2,
  Edit,
  Eye
} from 'lucide-react';
import {
  impactedAssetApi,
  CustomerProperty,
  ImpactAlert,
  ImpactedAssetStats,
  AlertSeverity,
  AlertStatus,
  AlertType
} from '../services/impactedAssetApi';

const ImpactedAssetsPanel: React.FC = () => {
  const [stats, setStats] = useState<ImpactedAssetStats | null>(null);
  const [properties, setProperties] = useState<CustomerProperty[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<ImpactAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'alerts' | 'properties'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProperty, setNewProperty] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    notifyOnHail: true,
    notifyOnWind: true,
    notifyOnTornado: true,
    notifyRadiusMiles: 10,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsData, propertiesData, alertsData] = await Promise.all([
        impactedAssetApi.getStats(30),
        impactedAssetApi.getProperties({ activeOnly: true }),
        impactedAssetApi.getAlerts({ status: 'pending' })
      ]);

      setStats(statsData);
      setProperties(propertiesData);
      setPendingAlerts(alertsData);
    } catch (error) {
      console.error('Error fetching impacted assets data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProperty = async () => {
    if (!newProperty.customerName || !newProperty.address) {
      alert('Customer name and address are required');
      return;
    }

    const result = await impactedAssetApi.addProperty(newProperty);
    if (result) {
      setShowAddModal(false);
      setNewProperty({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        notifyOnHail: true,
        notifyOnWind: true,
        notifyOnTornado: true,
        notifyRadiusMiles: 10,
        notes: ''
      });
      fetchData();
    }
  };

  const handleCallCustomer = (phoneNumber: string) => {
    window.location.href = `tel:${phoneNumber.replace(/[^0-9]/g, '')}`;
  };

  const handleEmailCustomer = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  const handleMarkAlertContacted = async (alertId: string) => {
    const success = await impactedAssetApi.markAlertContacted(alertId);
    if (success) {
      fetchData();
    }
  };

  const handleConvertAlert = async (alertId: string) => {
    const outcome = prompt('Enter conversion details:');
    if (outcome) {
      const success = await impactedAssetApi.convertAlert(alertId, outcome);
      if (success) {
        fetchData();
      }
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    const notes = prompt('Reason for dismissing (optional):');
    const success = await impactedAssetApi.dismissAlert(alertId, notes || undefined);
    if (success) {
      fetchData();
    }
  };

  const handleDeleteProperty = async (propertyId: string) => {
    if (confirm('Are you sure you want to stop monitoring this property?')) {
      const success = await impactedAssetApi.deleteProperty(propertyId);
      if (success) {
        fetchData();
      }
    }
  };

  const getSeverityColor = (severity: AlertSeverity): string => {
    const colors: Record<AlertSeverity, string> = {
      'critical': '#ef4444',
      'high': '#f97316',
      'medium': '#f59e0b',
      'low': '#10b981'
    };
    return colors[severity];
  };

  const getAlertTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'hail':
        return <Droplets className="w-5 h-5" />;
      case 'wind':
        return <Wind className="w-5 h-5" />;
      case 'tornado':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Cloud className="w-5 h-5" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading impacted assets...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        {/* Header */}
        <div className="roof-er-page-title">
          <Shield className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Impacted Assets Monitor
        </div>

        {/* Stats Overview */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Properties Monitored
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--roof-red)' }}>
                {stats.activeProperties}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {stats.totalProperties} total
              </div>
            </div>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Pending Alerts
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>
                {stats.pendingAlerts}
              </div>
              {stats.pendingAlerts > 0 && (
                <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bell className="w-3 h-3" />
                  Requires attention
                </div>
              )}
            </div>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Conversions
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>
                {stats.conversions}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {stats.conversionRate.toFixed(1)}% conversion rate
              </div>
            </div>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Total Alerts
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#3b82f6' }}>
                {stats.pendingAlerts + stats.contactedAlerts}
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              flex: 1,
              padding: '14px',
              background: 'var(--roof-red)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Plus className="w-5 h-5" />
            Add Property
          </button>
          <button
            onClick={fetchData}
            style={{
              flex: 1,
              padding: '14px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)' }}>
          {(['overview', 'alerts', 'properties'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: selectedTab === tab ? '2px solid var(--roof-red)' : '2px solid transparent',
                color: selectedTab === tab ? 'var(--roof-red)' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'alerts' ? `Alerts (${pendingAlerts.length})` : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {selectedTab === 'overview' && stats && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Recent Alerts
            </h3>
            {stats.recentAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                No recent alerts
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.recentAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${getSeverityColor(alert.alertSeverity)}`,
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      <div style={{ color: getSeverityColor(alert.alertSeverity) }}>
                        {getAlertTypeIcon(alert.alertType)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {alert.alertType.toUpperCase()} - {alert.alertSeverity.toUpperCase()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                          {formatDate(alert.stormDate)} • {alert.stormDistanceMiles.toFixed(1)} miles away
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '4px 10px',
                        background: alert.status === 'pending' ? '#f59e0b' : '#10b981',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                    >
                      {alert.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedTab === 'alerts' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Pending Alerts
            </h3>
            {pendingAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#10b981' }} />
                No pending alerts. All caught up!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pendingAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `2px solid ${getSeverityColor(alert.alertSeverity)}`,
                      borderRadius: '12px',
                      padding: '20px'
                    }}
                  >
                    {/* Alert Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ color: getSeverityColor(alert.alertSeverity) }}>
                          {getAlertTypeIcon(alert.alertType)}
                        </div>
                        <div>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {alert.alertType.toUpperCase()} Alert
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            {formatDate(alert.stormDate)} • {alert.stormDistanceMiles.toFixed(1)} miles from property
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '6px 14px',
                          background: getSeverityColor(alert.alertSeverity),
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'uppercase'
                        }}
                      >
                        {alert.alertSeverity}
                      </div>
                    </div>

                    {/* Storm Details */}
                    <div style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                        {alert.hailSizeInches && (
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                              Hail Size
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {alert.hailSizeInches}" diameter
                            </div>
                          </div>
                        )}
                        {alert.windSpeedMph && (
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                              Wind Speed
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {alert.windSpeedMph} mph
                            </div>
                          </div>
                        )}
                        {alert.tornadoRating && (
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                              Tornado Rating
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {alert.tornadoRating}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Customer Info */}
                    {alert.property && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Customer Information
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--roof-red)', marginBottom: '4px' }}>
                          {alert.property.customerName}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <MapPin className="w-4 h-4 inline mr-1" />
                          {alert.property.address}, {alert.property.city}, {alert.property.state}
                        </div>
                        {alert.property.customerPhone && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            <Phone className="w-4 h-4 inline mr-1" />
                            {alert.property.customerPhone}
                          </div>
                        )}
                        {alert.property.customerEmail && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <Mail className="w-4 h-4 inline mr-1" />
                            {alert.property.customerEmail}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {alert.property?.customerPhone && (
                        <button
                          onClick={() => handleCallCustomer(alert.property!.customerPhone!)}
                          style={{
                            padding: '10px 16px',
                            background: 'var(--roof-red)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Phone className="w-4 h-4" />
                          Call Now
                        </button>
                      )}
                      {alert.property?.customerEmail && (
                        <button
                          onClick={() => handleEmailCustomer(alert.property!.customerEmail!)}
                          style={{
                            padding: '10px 16px',
                            background: 'var(--bg-hover)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Mail className="w-4 h-4" />
                          Email
                        </button>
                      )}
                      <button
                        onClick={() => handleMarkAlertContacted(alert.id)}
                        style={{
                          padding: '10px 16px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark Contacted
                      </button>
                      <button
                        onClick={() => handleConvertAlert(alert.id)}
                        style={{
                          padding: '10px 16px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <TrendingUp className="w-4 h-4" />
                        Convert to Sale
                      </button>
                      <button
                        onClick={() => handleDismissAlert(alert.id)}
                        style={{
                          padding: '10px 16px',
                          background: 'var(--bg-hover)',
                          color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <XCircle className="w-4 h-4" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedTab === 'properties' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Monitored Properties
            </h3>
            {properties.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                <Home className="w-12 h-12 mx-auto mb-4" />
                No properties being monitored yet. Add one to get started!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {properties.map((property) => (
                  <div
                    key={property.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '12px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--roof-red)', marginBottom: '4px' }}>
                          {property.customerName}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {property.address}, {property.city}, {property.state}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteProperty(property.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-tertiary)',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: '6px',
                      padding: '10px',
                      marginBottom: '12px',
                      fontSize: '12px'
                    }}>
                      <div style={{ marginBottom: '6px', color: 'var(--text-secondary)' }}>
                        <strong>Monitoring:</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {property.notifyOnHail && (
                          <span style={{ padding: '2px 8px', background: '#3b82f6', color: 'white', borderRadius: '12px', fontSize: '11px' }}>
                            Hail
                          </span>
                        )}
                        {property.notifyOnWind && (
                          <span style={{ padding: '2px 8px', background: '#10b981', color: 'white', borderRadius: '12px', fontSize: '11px' }}>
                            Wind
                          </span>
                        )}
                        {property.notifyOnTornado && (
                          <span style={{ padding: '2px 8px', background: '#ef4444', color: 'white', borderRadius: '12px', fontSize: '11px' }}>
                            Tornado
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: '6px', color: 'var(--text-tertiary)' }}>
                        Radius: {property.notifyRadiusMiles} miles
                      </div>
                    </div>

                    {(property.customerPhone || property.customerEmail) && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {property.customerPhone && (
                          <button
                            onClick={() => handleCallCustomer(property.customerPhone!)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              background: 'var(--roof-red)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <Phone className="w-3 h-3" />
                            Call
                          </button>
                        )}
                        {property.customerEmail && (
                          <button
                            onClick={() => handleEmailCustomer(property.customerEmail!)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              background: 'var(--bg-hover)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-default)',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <Mail className="w-3 h-3" />
                            Email
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Property Modal */}
        {showAddModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowAddModal(false)}
          >
            <div
              style={{
                background: 'var(--bg-elevated)',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-primary)' }}>
                Add Property to Monitor
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={newProperty.customerName}
                    onChange={(e) => setNewProperty({ ...newProperty, customerName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={newProperty.customerPhone}
                      onChange={(e) => setNewProperty({ ...newProperty, customerPhone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={newProperty.customerEmail}
                      onChange={(e) => setNewProperty({ ...newProperty, customerEmail: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Address *
                  </label>
                  <input
                    type="text"
                    value={newProperty.address}
                    onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      City
                    </label>
                    <input
                      type="text"
                      value={newProperty.city}
                      onChange={(e) => setNewProperty({ ...newProperty, city: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      State
                    </label>
                    <input
                      type="text"
                      value={newProperty.state}
                      onChange={(e) => setNewProperty({ ...newProperty, state: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      ZIP
                    </label>
                    <input
                      type="text"
                      value={newProperty.zipCode}
                      onChange={(e) => setNewProperty({ ...newProperty, zipCode: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>
                    Monitor for:
                  </label>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={newProperty.notifyOnHail}
                        onChange={(e) => setNewProperty({ ...newProperty, notifyOnHail: e.target.checked })}
                      />
                      Hail
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={newProperty.notifyOnWind}
                        onChange={(e) => setNewProperty({ ...newProperty, notifyOnWind: e.target.checked })}
                      />
                      Wind
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={newProperty.notifyOnTornado}
                        onChange={(e) => setNewProperty({ ...newProperty, notifyOnTornado: e.target.checked })}
                      />
                      Tornado
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Alert Radius (miles)
                  </label>
                  <input
                    type="number"
                    value={newProperty.notifyRadiusMiles}
                    onChange={(e) => setNewProperty({ ...newProperty, notifyRadiusMiles: parseInt(e.target.value) || 10 })}
                    min="1"
                    max="100"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Notes
                  </label>
                  <textarea
                    value={newProperty.notes}
                    onChange={(e) => setNewProperty({ ...newProperty, notes: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button
                    onClick={handleAddProperty}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'var(--roof-red)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Add Property
                  </button>
                  <button
                    onClick={() => setShowAddModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImpactedAssetsPanel;
