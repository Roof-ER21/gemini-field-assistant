import React, { useState } from 'react';
import { Building2, Search, Phone, Mail, ExternalLink, Smartphone, Pin, MessageCircle } from 'lucide-react';

interface InsuranceCompany {
  name: string;
  app: string;
  loginUrl?: string;
  email: string;
  phone: string;
  notes: string;
  score?: string;
}

interface MapsPanelProps { onOpenChat?: () => void }

const MapsPanel: React.FC<MapsPanelProps> = ({ onOpenChat }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'goto'>('all');
  const [goTo, setGoTo] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('insurance_go_to') || '[]')); } catch { return new Set(); }
  });

  const defaultCompanies: InsuranceCompany[] = [
    {
      name: 'AAA (CSAA Insurance)',
      app: 'AAA Mobile',
      loginUrl: 'https://www.csaa-insurance.aaa.com',
      email: 'myclaims@csaa.com',
      phone: '(800) 922-8228',
      notes: 'MyPolicy platform for CSAA Insurance Group. Support: 888.980.5650'
    },
    {
      name: 'ALLCAT Claims Service',
      app: 'N/A (TPA)',
      email: 'info@allcatclaims.com',
      phone: '(855) 925-5228',
      notes: 'Third Party Administrator - claims management TPA. Contact: (830) 996-3311',
      score: '7/10'
    },
    {
      name: 'Allstate',
      app: 'Allstate Mobile',
      loginUrl: 'https://myaccount.allstate.com',
      email: 'claims@claims.allstate.com',
      phone: '(800) 326-0950',
      notes: 'MyAccount portal with multi-factor authentication',
      score: '8/10'
    },
    {
      name: 'American Family Insurance',
      app: 'MyAmFam',
      loginUrl: 'https://my.amfam.com',
      email: 'claims@amfam.com',
      phone: '(800) 692-6326',
      notes: 'Fingerprint authentication supported',
      score: '7/10'
    },
    {
      name: 'American National',
      app: 'AN Mobile',
      loginUrl: 'https://www.anicoweb.com',
      email: 'Claims@AmericanNational.com',
      phone: '(800) 333-2860',
      notes: 'Multi-factor authentication, roadside assistance available',
      score: '7/10'
    },
    {
      name: 'Ameriprise',
      app: 'MyAmFam (CONNECT)',
      loginUrl: 'https://www.ameriprise.com',
      email: 'aahhome@ampf.com',
      phone: '(800) 872-5246',
      notes: 'Partners with CONNECT powered by American Family Insurance',
      score: '9/10'
    },
    {
      name: 'Amica Mutual',
      app: 'Amica',
      loginUrl: 'https://www.amica.com',
      email: 'claims@amica.com',
      phone: '(800) 242-6422',
      notes: 'J.D. Power #1 Digital Experience 2025. Biometric security (Touch ID/Face ID)',
      score: '8/10'
    },
    {
      name: 'Armed Forces Insurance (AFI)',
      app: 'Armed Forces Insurance Mobile',
      loginUrl: 'https://www.afi.org',
      email: 'claims@afi.org',
      phone: '(800) 255-0187',
      notes: 'Founded 1887 for military members and families',
      score: '7/10'
    },
    {
      name: 'ASI Claims (American Strategic)',
      app: 'Web Portal',
      loginUrl: 'https://portal.asipolicy.com',
      email: 'claims@asicorp.org',
      phone: '(866) 274-5677',
      notes: 'One of top 15 largest homeowners insurers in US. Support: (800) 492-5629',
      score: '6/10'
    },
    {
      name: 'Assurant',
      app: 'Web Portal',
      loginUrl: 'https://manage.myassurantpolicy.com',
      email: 'supportemail@assurant.com',
      phone: '(800) 423-4403',
      notes: 'Web-based management. Claims Center: w1.assurant.com/ACC/account/Login',
      score: '7/10'
    },
    {
      name: 'California Casualty',
      app: 'Snap Appraisal (claims only)',
      loginUrl: 'https://www.calcas.com',
      email: 'myclaim@calcas.com',
      phone: '(800) 800-9410',
      notes: 'Specializes in teachers, firefighters, police, nurses',
      score: '8/10'
    },
    {
      name: 'Chubb',
      app: 'Chubb Mobile',
      loginUrl: 'https://www.chubb.com',
      email: 'uspropertyclaims@chubb.com',
      phone: '(866) 324-8222',
      notes: 'One-time payments available without login',
      score: '7/10'
    },
    {
      name: 'Encompass',
      app: 'Encompass Insurance',
      loginUrl: 'https://www.encompassinsurance.com',
      email: 'claims@claims.encompassins.com',
      phone: '(800) 588-7400',
      notes: 'App not available in all states. Support: 888-293-5108',
      score: '8/10'
    },
    {
      name: 'Erie Insurance',
      app: 'Erie Insurance Mobile',
      loginUrl: 'https://www.erieinsurance.com',
      email: 'RichmondPropertySupport@erieinsurance.com',
      phone: '(800) 367-3743',
      notes: 'Paperless options available. Touch ID login supported',
      score: '6/10'
    },
    {
      name: 'Farm Bureau (Virginia)',
      app: 'Web Portal',
      loginUrl: 'https://www.vafb.com',
      email: 'claimsnewmail@vafb.com',
      phone: '(804) 290-1000',
      notes: 'Quick Pay for Property/Vehicle, Life/Annuities, Business/Ag without login',
      score: '7/10'
    },
    {
      name: 'Farmers Insurance',
      app: 'Farmers Mobile App',
      loginUrl: 'https://www.farmers.com',
      email: 'imaging@farmersinsurance.com',
      phone: '(800) 435-7764',
      notes: 'Multi-policy management supported',
      score: '5/10'
    },
    {
      name: 'Farmers of Salem',
      app: 'Web Portal',
      loginUrl: 'https://www.farmersofsalem.com',
      email: 'claimsmail@fosnj.com',
      phone: '(856) 935-1851',
      notes: 'Regional insurer (NJ, MD, PA, DE). Limited online self-service. Support: 800-498-0954',
      score: '7/10'
    },
    {
      name: 'Foremost Insurance',
      app: 'Foremost Insurance Mobile',
      loginUrl: 'https://www.foremost.com',
      email: 'myclaim@foremost.com',
      phone: '(800) 274-7865',
      notes: 'Part of Farmers Insurance. Touch ID login. Free guest payments 24/7',
      score: '7/10'
    },
    {
      name: 'Frederick Mutual',
      app: 'Frederick Mutual Insurance',
      loginUrl: 'https://www.frederickmutual.com',
      email: 'irclaims@frederickmutual.com',
      phone: '(800) 544-8737',
      notes: 'Upload photos for claims. Helpdesk: (800) 544-8737',
      score: '7/10'
    },
    {
      name: 'Grange Insurance',
      app: 'Grange Mobile',
      loginUrl: 'https://www.grangeinsurance.com',
      email: 'property@grangeinsurance.com',
      phone: '(800) 686-0025',
      notes: 'Live tow truck tracking for roadside. Guest payment fee: $9.99',
      score: '8/10'
    },
    {
      name: 'Hanover Insurance / Citizens',
      app: 'Hanover Mobile',
      loginUrl: 'https://www.hanover.com',
      email: 'firstreport@hanover.com',
      phone: '(800) 628-0250',
      notes: 'Fingerprint/face ID login. Serves both Hanover and Citizens. Phone: 800-573-1187',
      score: '8/10'
    },
    {
      name: 'Hippo',
      app: 'Hippo Home',
      loginUrl: 'https://www.hippo.com',
      email: 'claims@hippo.com',
      phone: '(855) 999-9746',
      notes: '24/7 claims reporting, app-based management',
      score: '6/10'
    },
    {
      name: 'HOAIC (Homeowners of America)',
      app: 'Web Portal',
      loginUrl: 'https://hoaic.com',
      email: 'claims@HOAIC.com',
      phone: '(866) 407-9896',
      notes: 'Web portal only - 24/7 accessible. Support: (866) 407-9896 option 2',
      score: '7/10'
    },
    {
      name: 'Homesite Insurance',
      app: 'Web Portal',
      loginUrl: 'https://go.homesite.com',
      email: 'claimdocuments@afics.com',
      phone: '(866) 621-4823',
      notes: 'SSL 2048-bit encryption. Support: 1-800-466-3748',
      score: '6/10'
    },
    {
      name: 'IAT Insurance Group',
      app: 'Web Portal',
      loginUrl: 'https://www.iatinsurancegroup.com',
      email: 'new.loss@iatinsurance.com',
      phone: '(866) 576-7971',
      notes: 'Payment portal requires policy info. Billing: 800-821-8014. Recommend ACH',
      score: '6/10'
    },
    {
      name: 'Kemper Insurance',
      app: 'Kemper Auto Insurance',
      loginUrl: 'https://customer.kemper.com',
      email: 'NPSC@kemper.com',
      phone: '(800) 353-6737',
      notes: 'Alternative portal: customer.kemper.com/auto/cp. Phone: 877-488-7488',
      score: '9/10'
    },
    {
      name: 'Lemonade',
      app: 'Lemonade Insurance',
      loginUrl: 'https://www.lemonade.com',
      email: 'help@lemonade.com',
      phone: '(844) 733-8666',
      notes: 'Digital-first, app-required for most operations. 4.9/5 rating on iOS',
      score: '7/10'
    },
    {
      name: 'Liberty Mutual',
      app: 'Liberty Mutual Mobile',
      loginUrl: 'https://www.libertymutual.com',
      email: 'imaging@libertymutual.com',
      phone: '(800) 225-2467',
      notes: 'Touch/face recognition login supported',
      score: '7/10'
    },
    {
      name: 'Loudoun Mutual',
      app: 'Loudoun Mutual Insurance',
      loginUrl: 'https://www.loudounmutual.com',
      email: 'claims@loudounmutual.com',
      phone: '(540) 882-3232',
      notes: 'Virginia-focused since 1849. 24/7 claims submission with photos',
      score: '7/10'
    },
    {
      name: 'Mercury Insurance',
      app: 'Mercury Insurance: Car & Home',
      loginUrl: 'https://www.mercuryinsurance.com',
      email: 'myclaim@mercuryinsurance.com',
      phone: '(800) 503-3724',
      notes: 'One-time payment requires only policy number. Phone: 800-503-3724',
      score: '7/10'
    },
    {
      name: 'MetLife Home Insurance',
      app: 'MetLife US App',
      loginUrl: 'https://www.metlife.com',
      email: 'metlifecatteam@metlife.com',
      phone: '(800) 422-4272',
      notes: 'Quick Pay for one-time payments. Phone: 800-638-5433',
      score: '6/10'
    },
    {
      name: 'MSI Insurance',
      app: 'Web Portal',
      loginUrl: 'https://apps.msimga.com',
      email: 'TPA.Support@alacritysolutions.com',
      phone: '(844) 306-0752',
      notes: 'Coastal insurance specialist (Atlantic/Gulf, FL, TX, MA). Coverage up to $1.5M',
      score: '6/10'
    },
    {
      name: 'National General Insurance',
      app: 'National General',
      loginUrl: 'https://www.nationalgeneral.com',
      email: 'claims@ngic.com',
      phone: '(888) 325-1190',
      notes: 'Mandatory 2FA security. Phone: 888-293-5108 or 866-468-3466',
      score: '9/10'
    },
    {
      name: 'Nationwide',
      app: 'Nationwide Mobile',
      loginUrl: 'https://www.nationwide.com',
      email: 'nationwide-claims@nationwide.com',
      phone: '(800) 421-3535',
      notes: 'Face & Fingerprint login for Android',
      score: '7/10'
    },
    {
      name: 'Penn National Insurance',
      app: 'Penn National Insurance',
      loginUrl: 'https://www.pennnat.com',
      email: 'clmmail@pnat.com',
      phone: '(800) 942-9715',
      notes: 'Available in 12 states. Biometric login. Payments over $5k require phone',
      score: '7/10'
    },
    {
      name: 'Progressive',
      app: 'Progressive',
      loginUrl: 'https://www.progressive.com',
      email: 'PGRH_claims@progressive.com',
      phone: '(877) 828-9702',
      notes: 'Home insurance redirects to provider portal',
      score: '8/10'
    },
    {
      name: 'Pure Insurance',
      app: 'PURE Insurance',
      loginUrl: 'https://www.pureinsurance.com',
      email: 'claims@pureinsurance.com',
      phone: '(888) 813-7873',
      notes: 'High net worth insurance provider. Member-exclusive benefits',
      score: '6/10'
    },
    {
      name: 'QBE Insurance',
      app: 'Web Portal',
      loginUrl: 'https://selfservice.qbena.com',
      email: 'MSIQBE.support@alacritysolutions.com',
      phone: '(800) 779-3269',
      notes: 'Enhanced security with MFA required. Web-based portal only',
      score: '7/10'
    },
    {
      name: 'SafeCo Insurance',
      app: 'Safeco Mobile',
      loginUrl: 'https://www.safeco.com',
      email: 'imaging@safeco.com',
      phone: '(800) 332-3226',
      notes: 'Biometric login (Touch ID/Face ID). Digital insurance cards',
      score: '6/10'
    },
    {
      name: 'Sagesure Insurance',
      app: 'Web Portal',
      loginUrl: 'https://www.MySageSure.com',
      email: 'eclaims@sagesure.com',
      phone: '(877) 304-4785',
      notes: 'Coastal homeowners specialist. Support: (800) 481-0661',
      score: '6/10'
    },
    {
      name: 'State Auto Insurance',
      app: 'State Auto Safety 360 Mobile',
      loginUrl: 'https://www.stateauto.com',
      email: 'claims@stateauto.com',
      phone: '(800) 766-1853',
      notes: 'Safety 360 tracks driving behavior. Support: 833-SAHelps (833-724-3577)',
      score: '8/10'
    },
    {
      name: 'State Farm',
      app: 'State Farm',
      loginUrl: 'https://www.statefarm.com',
      email: 'statefarmfireclaims@statefarm.com',
      phone: '(844) 458-4300',
      notes: 'Single login for all State Farm products',
      score: '7/10'
    },
    {
      name: 'Stillwater Insurance',
      app: 'Stillwater Insurance',
      loginUrl: 'https://www.stillwater.com',
      email: 'claims@stillwater.com',
      phone: '(800) 220-1351',
      notes: 'View coverages, documents, manage claims, contact agent',
      score: '5/10'
    },
    {
      name: 'SWBC Insurance',
      app: 'Web Portal',
      loginUrl: 'https://www.swbc.com',
      email: 'info@swbc.com',
      phone: '(866) 476-8399',
      notes: 'NOTE: They take 24 hours to assign claim number. Contact SWBC directly',
      score: '7/10'
    },
    {
      name: 'The Philadelphia Contributionship',
      app: 'MyKey Mobile - TPC Insurance',
      loginUrl: 'https://www.1752.com',
      email: 'claims@1752.com',
      phone: '(800) 269-1409',
      notes: "America's oldest property insurer (founded 1752). Support: 1-888-627-1752",
      score: '8/10'
    },
    {
      name: 'Travelers Insurance',
      app: 'MyTravelers',
      loginUrl: 'https://www.travelers.com',
      email: 'nccenter@travelers.com',
      phone: '(800) 238-6225',
      notes: '24/7 claim filing and tracking. Alternative: 800-759-6194',
      score: '6/10'
    },
    {
      name: 'Universal Property Insurance',
      app: 'UPCIC Mobile',
      loginUrl: 'https://www.universalproperty.com',
      email: 'claimpath@universalproperty.com',
      phone: '(800) 470-0599',
      notes: 'ClaimPath portal for claims. Android app has poor ratings',
      score: '9/10'
    },
    {
      name: 'USAA',
      app: 'USAA Mobile',
      loginUrl: 'https://www.usaa.com',
      email: 'Get the Claim Specific Email @usaa.com',
      phone: '(800) 531-8722',
      notes: 'Military members only. Biometric login (Touch ID/Face ID) supported',
      score: '7/10'
    },
    {
      name: 'Westfield Insurance',
      app: 'Web Portal',
      loginUrl: 'https://www.westfieldinsurance.com',
      email: 'westfieldclaims@westfieldgrp.com',
      phone: '(800) 243-0210',
      notes: 'MyWestfield web portal. Phone: 800.766.9133'
    }
  ];

  // Try fetching from backend API; explicitly fall back to local list if unavailable
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = (import.meta as any).env?.VITE_API_URL || '/api';
        const res = await fetch(`${base}/insurance/companies?limit=200`);
        if (!res.ok) throw new Error(`insurance_companies: status ${res.status}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length) {
          setCompanies(
            data.map((d: any) => ({
              name: d.name,
              app: d.category || 'Web Portal',
              loginUrl: d.website || undefined,
              email: d.email || '',
              phone: d.phone || '',
              notes: d.notes || '',
            }))
          );
          return;
        }
      } catch (err) {
        console.warn('insurance_companies: API unavailable, using local list');
      }
      if (!cancelled) setCompanies(defaultCompanies);
    })();
    return () => { cancelled = true; };
  }, []);

  const baseList = viewMode === 'goto' ? companies.filter(c => goTo.has(c.name)) : companies;
  const filteredCompanies = searchQuery.trim()
    ? baseList.filter(company =>
        company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        company.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        company.notes.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : baseList;

  const toggleGoTo = (name: string) => {
    setGoTo(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      try { localStorage.setItem('insurance_go_to', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-page-title">
          <Building2 className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Insurance Companies Directory
        </div>

        {/* View & Search */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setViewMode('all')} style={{ padding: '6px 10px', background: viewMode==='all'?'var(--roof-red)':'var(--bg-hover)', border: `1px solid ${viewMode==='all'?'var(--roof-red)':'var(--border-default)'}`, borderRadius: '9999px', color: 'var(--text-primary)', fontSize: '12px' }}>All</button>
            <button onClick={() => setViewMode('goto')} style={{ padding: '6px 10px', background: viewMode==='goto'?'var(--roof-red)':'var(--bg-hover)', border: `1px solid ${viewMode==='goto'?'var(--roof-red)':'var(--border-default)'}`, borderRadius: '9999px', color: 'var(--text-primary)', fontSize: '12px', display:'inline-flex', alignItems:'center', gap:'4px' }}><Pin className="w-3 h-3"/>Go‑To</button>
          </div>
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
              placeholder="Search insurance companies by name, email, or notes..."
              className="roof-er-search-input"
              style={{ paddingLeft: '52px' }}
            />
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap'
        }}>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            padding: '12px 20px',
            flex: 1,
            minWidth: '200px'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--roof-red)' }}>
              {filteredCompanies.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Insurance Companies
            </div>
          </div>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            padding: '12px 20px',
            flex: 1,
            minWidth: '200px'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--roof-red)' }}>
              {companies.filter(c => c.app.includes('Mobile')).length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              With Mobile Apps
            </div>
          </div>
        </div>

        {/* Insurance Company Cards */}
        {filteredCompanies.map((company, idx) => (
          <div key={idx} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--roof-red)';
            e.currentTarget.style.transform = 'translateX(4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', position: 'relative' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {company.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <Smartphone className="w-4 h-4" />
                  <span>{company.app}</span>
                </div>
              </div>
              {company.score && (
                <div style={{
                  background: 'var(--roof-red)',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600
                }}>
                  {company.score}
                </div>
              )}
              <button
                onClick={() => toggleGoTo(company.name)}
                title={goTo.has(company.name) ? 'Unpin from Go‑To' : 'Pin to Go‑To'}
                style={{ position: 'absolute', top: 0, right: 0, background: 'none', border: 'none', cursor: 'pointer', color: goTo.has(company.name) ? 'var(--roof-red)' : 'var(--text-disabled)' }}
              >
                <Pin className="w-5 h-5" />
              </button>
            </div>

            {/* Contact Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-tertiary)' }}>
                <Mail className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                <a href={`mailto:${company.email}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--roof-red)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>
                  {company.email}
                </a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-tertiary)' }}>
                <Phone className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                <a href={`tel:${company.phone.replace(/[^0-9]/g, '')}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--roof-red)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>
                  {company.phone}
                </a>
              </div>
            </div>

            {/* Notes */}
            <div style={{
              fontSize: '13px',
              color: 'var(--text-tertiary)',
              lineHeight: '1.6',
              marginBottom: '12px',
              padding: '12px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              borderLeft: '3px solid var(--roof-red)'
            }}>
              {company.notes}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => { try { localStorage.setItem('chat_quick_company', JSON.stringify({ name: company.name })); } catch {}; onOpenChat?.(); }}
                style={{
                  padding: '8px 14px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 500
                }}
              >
                <MessageCircle className="w-4 h-4" />
                Open in Chat
              </button>
              {company.loginUrl && (
                <button
                  onClick={() => window.open(company.loginUrl, '_blank')}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--roof-red)',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
                  <ExternalLink className="w-4 h-4" />
                  Login Portal
                </button>
              )}
              <button
                onClick={() => window.location.href = `tel:${company.phone.replace(/[^0-9]/g, '')}`}
                style={{
                  padding: '8px 14px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--roof-red)';
                  e.currentTarget.style.borderColor = 'var(--roof-red)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                }}>
                <Phone className="w-4 h-4" />
                Call Now
              </button>
              <button
                onClick={() => window.location.href = `mailto:${company.email}`}
                style={{
                  padding: '8px 14px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--roof-red)';
                  e.currentTarget.style.borderColor = 'var(--roof-red)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                }}>
                <Mail className="w-4 h-4" />
                Email
              </button>
            </div>
          </div>
        ))}

        {filteredCompanies.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)'
          }}>
            No insurance companies found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

export default MapsPanel;
