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

interface InsuranceDirectoryProps {
  onOpenChat?: () => void;
}

const InsuranceDirectory: React.FC<InsuranceDirectoryProps> = ({ onOpenChat }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'goto'>('all');
  const [goTo, setGoTo] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('insurance_go_to') || '[]')); } catch { return new Set(); }
  });

  const defaultCompanies: InsuranceCompany[] = [
    { name: 'AAA (CSAA Insurance)', app: 'AAA Mobile', loginUrl: 'https://www.csaa-insurance.aaa.com', email: 'myclaims@csaa.com', phone: '(800) 922-8228', notes: 'MyPolicy platform for CSAA Insurance Group. Support: 888.980.5650' },
    { name: 'ALLCAT Claims Service', app: 'N/A (TPA)', email: 'info@allcatclaims.com', phone: '(855) 925-5228', notes: 'Third Party Administrator - claims management TPA. Contact: (830) 996-3311', score: '7/10' },
    { name: 'Allstate', app: 'Allstate Mobile', loginUrl: 'https://myaccount.allstate.com', email: 'claims@claims.allstate.com', phone: '(800) 326-0950', notes: 'MyAccount portal with multi-factor authentication', score: '8/10' },
    { name: 'American Family Insurance', app: 'MyAmFam', loginUrl: 'https://my.amfam.com', email: 'claims@amfam.com', phone: '(800) 692-6326', notes: 'Fingerprint authentication supported', score: '7/10' },
    { name: 'American National', app: 'AN Mobile', loginUrl: 'https://www.anicoweb.com', email: 'Claims@AmericanNational.com', phone: '(800) 333-2860', notes: 'Multi-factor authentication, roadside assistance available', score: '7/10' },
    { name: 'Ameriprise', app: 'MyAmFam (CONNECT)', loginUrl: 'https://www.ameriprise.com', email: 'aahhome@ampf.com', phone: '(800) 872-5246', notes: 'Partners with CONNECT powered by American Family Insurance', score: '9/10' },
    { name: 'Amica Mutual', app: 'Amica', loginUrl: 'https://www.amica.com', email: 'claims@amica.com', phone: '(800) 242-6422', notes: 'J.D. Power #1 Digital Experience 2025. Biometric security (Touch ID/Face ID)', score: '8/10' },
    { name: 'Armed Forces Insurance (AFI)', app: 'Armed Forces Insurance Mobile', loginUrl: 'https://www.afi.org', email: 'claims@afi.org', phone: '(800) 255-0187', notes: 'Founded 1887 for military members and families', score: '7/10' },
    { name: 'ASI Claims (American Strategic)', app: 'Web Portal', loginUrl: 'https://www.americanstrategic.com', email: 'claims@americanstrategic.com', phone: '(866) 274-8765', notes: 'Standard online portal for policy management' },
    { name: 'Auto-Owners Insurance', app: 'Auto-Owners Mobile', loginUrl: 'https://www.auto-owners.com', email: 'claims@auto-owners.com', phone: '(517) 323-1200', notes: 'AO Mobile app with digital ID cards, pay by phone' },
    { name: 'Cincinnati Insurance', app: 'Web Portal', loginUrl: 'https://www.cinfin.com', email: 'claimsinfo@cinfin.com', phone: '(800) 827-4755', notes: 'Independent agent model, claims call center open 24/7', score: '7/10' },
    { name: 'Citizens Insurance (Hanover)', app: 'Citizens Mobile', loginUrl: 'https://www.hanover.com', email: 'claimsinfo@citizensinsurance.com', phone: '(866) 248-4913', notes: 'Part of The Hanover Insurance Group. Digital claims submission', score: '7/10' },
    { name: 'Country Financial', app: 'COUNTRY Financial Mobile', loginUrl: 'https://www.countryfinancial.com', email: 'claims@countryfinancial.com', phone: '(866) 268-6879', notes: 'Mobile claims with photo upload. Rep locator built in' },
    { name: 'CSAA Insurance (AAA)', app: 'AAA Mobile', loginUrl: 'https://www.csaa-insurance.aaa.com', email: 'myclaims@csaa.com', phone: '(800) 922-8228', notes: 'Same as AAA. MyPolicy platform' },
    { name: 'Donegal Insurance', app: 'Web Portal', loginUrl: 'https://www.donegalgroup.com', email: 'claims@donegalgroup.com', phone: '(800) 877-0600', notes: 'Regional carrier - mainly PA, MD, VA, DE' },
    { name: 'EMC Insurance', app: 'Web Portal', loginUrl: 'https://www.emcins.com', email: 'claims@emcins.com', phone: '(800) 447-2295', notes: 'Commercial + Personal lines. Regional Midwest focus', score: '7/10' },
    { name: 'Erie Insurance', app: 'Erie Insurance Mobile', loginUrl: 'https://www.erieinsurance.com', email: 'service@erieinsurance.com', phone: '(800) 367-3743', notes: 'Strong in PA, MD, VA. Claims: 800.367.3743 option 2', score: '9/10' },
    { name: 'Esurance', app: 'Esurance Mobile', loginUrl: 'https://www.esurance.com', email: 'claims@esurance.com', phone: '(800) 378-7262', notes: 'Allstate subsidiary - digital-first approach', score: '8/10' },
    { name: 'Farmers Insurance', app: 'Farmers Mobile', loginUrl: 'https://www.farmers.com', email: 'claims@farmersinsurance.com', phone: '(800) 435-7764', notes: 'Claims hub with live chat. Agent locator integrated', score: '8/10' },
    { name: 'Foremost Insurance', app: 'Web Portal', loginUrl: 'https://www.foremost.com', email: 'foremost.claims@foremost.com', phone: '(800) 527-3907', notes: 'Subsidiary of Farmers. Specialty/manufactured homes' },
    { name: 'GEICO', app: 'GEICO Mobile', loginUrl: 'https://www.geico.com', email: 'claims@geico.com', phone: '(800) 841-3000', notes: 'Virtual assistant available. Photo claims submission. Ad sales', score: '8/10' },
    { name: 'Grange Insurance', app: 'Grange Mobile', loginUrl: 'https://www.grangeinsurance.com', email: 'claimsdepartment@grangeinsurance.com', phone: '(800) 422-0550', notes: 'OH, PA, VA, MD. Independent agent model', score: '7/10' },
    { name: 'Hanover Insurance', app: 'THI Mobile', loginUrl: 'https://www.hanover.com', email: 'claimsinfo@hanover.com', phone: '(800) 628-0250', notes: 'The Hanover. Agent-only model. Claims: 800.628.0250', score: '8/10' },
    { name: 'Hartford (The Hartford)', app: 'The Hartford Mobile', loginUrl: 'https://www.thehartford.com', email: 'customerservice@thehartford.com', phone: '(800) 243-5860', notes: 'AARP-endorsed. Photo claims, direct deposit settlements', score: '8/10' },
    { name: 'Hippo Insurance', app: 'Hippo Mobile', loginUrl: 'https://www.hippo.com', email: 'claims@hippo.com', phone: '(844) 520-8133', notes: 'Smart home sensors included. Fast digital claims', score: '8/10' },
    { name: 'Homesite Insurance', app: 'Web Portal', loginUrl: 'https://www.homesite.com', email: 'claims@homesite.com', phone: '(866) 466-3748', notes: 'American Family subsidiary. Direct-to-consumer model' },
    { name: 'Kemper Insurance', app: 'Kemper Mobile', loginUrl: 'https://www.kemper.com', email: 'claims@kemper.com', phone: '(800) 833-0355', notes: 'Preferred and specialty markets. Trinity Universal subsidiary' },
    { name: 'Lemonade', app: 'Lemonade Mobile', loginUrl: 'https://www.lemonade.com', email: 'support@lemonade.com', phone: '(844) 733-8666', notes: 'AI-powered claims. Maya chatbot. Instant approval possible', score: '9/10' },
    { name: 'Liberty Mutual', app: 'Liberty Mutual Mobile', loginUrl: 'https://www.libertymutual.com', email: 'claims@libertymutual.com', phone: '(800) 225-2467', notes: 'Photo-based claims. Multi-policy discounts. EagleView integration', score: '8/10' },
    { name: 'Markel Insurance', app: 'Web Portal', loginUrl: 'https://www.markel.com', email: 'firstcomp@markel.com', phone: '(800) 431-1270', notes: 'Specialty/surplus lines. First Comp workers comp subsidiary' },
    { name: 'Mercury Insurance', app: 'Mercury Mobile', loginUrl: 'https://www.mercuryinsurance.com', email: 'claims@mercuryinsurance.com', phone: '(800) 503-3724', notes: 'Strong in CA, TX, FL. Online claims tracking', score: '7/10' },
    { name: 'MetLife (Farmers)', app: 'Farmers Mobile', loginUrl: 'https://www.farmers.com', email: 'metlifeclaims@metlife.com', phone: '(800) 854-6011', notes: 'MetLife property policies now handled by Farmers Insurance' },
    { name: 'Nationwide', app: 'Nationwide Mobile', loginUrl: 'https://www.nationwide.com', email: 'claims@nationwide.com', phone: '(877) 669-6877', notes: 'On Your Side Claims service. SmartRide/SmartMiles. File online', score: '8/10' },
    { name: 'NJM Insurance', app: 'NJM Mobile', loginUrl: 'https://www.njm.com', email: 'claims@njm.com', phone: '(800) 232-6600', notes: 'NJ & PA only. Low rates, strong claims satisfaction' },
    { name: 'Norfolk & Dedham (MAPFRE)', app: 'Web Portal', loginUrl: 'https://www.mapfreinsurance.com', email: 'claims@mapfreinsurance.com', phone: '(800) 937-0360', notes: 'Part of MAPFRE Insurance. New England regional focus' },
    { name: 'Pacific Indemnity (Chubb)', app: 'Chubb Mobile', loginUrl: 'https://www.chubb.com', email: 'claims@chubb.com', phone: '(800) 252-4670', notes: 'High-value homes. Appraisal-based settlements. White glove service', score: '9/10' },
    { name: 'Plymouth Rock', app: 'Plymouth Rock Mobile', loginUrl: 'https://www.plymouthrock.com', email: 'claims@plymouthrock.com', phone: '(800) 438-8383', notes: 'NJ, MA, CT, NH focus. Digital ID cards' },
    { name: 'Progressive', app: 'Progressive Mobile', loginUrl: 'https://www.progressive.com', email: 'claims@progressive.com', phone: '(800) 776-4737', notes: 'HomeQuote Explorer. Name Your Price tool. Snapshot discount', score: '8/10' },
    { name: 'QBE Insurance (North America)', app: 'Web Portal', loginUrl: 'https://www.qbe.com/us', email: 'claims@us.qbe.com', phone: '(855) 872-3862', notes: 'Specialty commercial. Crop insurance. International carrier' },
    { name: 'Safeco (Liberty Mutual)', app: 'Safeco Mobile', loginUrl: 'https://www.safeco.com', email: 'claims@safeco.com', phone: '(800) 332-3226', notes: 'Liberty Mutual company. Independent agent model', score: '7/10' },
    { name: 'Selective Insurance', app: 'Web Portal', loginUrl: 'https://www.selective.com', email: 'claimservices@selective.com', phone: '(800) 882-7552', notes: 'Strong in Mid-Atlantic. Agent-only model. Fast claims' },
    { name: 'Shelter Insurance', app: 'Shelter Insurance Mobile', loginUrl: 'https://www.shelterinsurance.com', email: 'claims@shelterinsurance.com', phone: '(800) 743-5837', notes: 'Midwest focus (MO, AR, OK, KS). Agent-based' },
    { name: 'State Auto Insurance', app: 'Web Portal', loginUrl: 'https://www.stateauto.com', email: 'claims@stateauto.com', phone: '(800) 444-9950', notes: 'Liberty Mutual subsidiary (acquired 2022). Midwest/Southeast' },
    { name: 'State Farm', app: 'State Farm Mobile', loginUrl: 'https://www.statefarm.com', email: 'claims@statefarm.com', phone: '(800) 782-8332', notes: 'Largest US insurer. Neighborhood of Good. Drive Safe & Save', score: '9/10' },
    { name: 'Stillwater Insurance', app: 'Web Portal', loginUrl: 'https://www.stillwaterinsurance.com', email: 'claims@stillwaterinsurance.com', phone: '(800) 849-7498', notes: 'Fidelity National Financial subsidiary. Online-focused' },
    { name: 'Travelers', app: 'MyTravelers Mobile', loginUrl: 'https://www.travelers.com', email: 'claims@travelers.com', phone: '(800) 252-4633', notes: 'IntelliDrive. Simply Business partnership. Major commercial carrier', score: '8/10' },
    { name: 'USAA', app: 'USAA Mobile', loginUrl: 'https://www.usaa.com', email: 'claims@usaa.com', phone: '(800) 531-8722', notes: 'Military only. Top-rated. Biometric login. Quick claims photo upload', score: '10/10' },
    { name: 'Utica National', app: 'Web Portal', loginUrl: 'https://www.uticanational.com', email: 'claims@uticanational.com', phone: '(800) 598-8422', notes: 'Northeast regional. Agent-only. Strong small business lines' },
    { name: 'Westfield Insurance', app: 'Web Portal', loginUrl: 'https://www.westfieldinsurance.com', email: 'westfieldclaims@westfieldgrp.com', phone: '(800) 243-0210', notes: 'MyWestfield web portal. Phone: 800.766.9133' }
  ];

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = (import.meta as any).env?.VITE_API_URL || '/api';
        const res = await fetch(`${base}/insurance/companies?limit=200`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length) {
          setCompanies(data.map((d: any) => ({
            name: d.name, app: d.category || 'Web Portal', loginUrl: d.website || undefined,
            email: d.email || '', phone: d.phone || '', notes: d.notes || '',
          })));
          return;
        }
      } catch { /* fallback to local list */ }
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
    <div>
      {/* View & Search */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setViewMode('all')} style={{ padding: '6px 10px', background: viewMode==='all'?'var(--roof-red)':'var(--bg-hover)', border: `1px solid ${viewMode==='all'?'var(--roof-red)':'var(--border-default)'}`, borderRadius: '9999px', color: 'var(--text-primary)', fontSize: '12px' }}>All ({companies.length})</button>
          <button onClick={() => setViewMode('goto')} style={{ padding: '6px 10px', background: viewMode==='goto'?'var(--roof-red)':'var(--bg-hover)', border: `1px solid ${viewMode==='goto'?'var(--roof-red)':'var(--border-default)'}`, borderRadius: '9999px', color: 'var(--text-primary)', fontSize: '12px', display:'inline-flex', alignItems:'center', gap:'4px' }}><Pin className="w-3 h-3"/>Go-To</button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="roof-er-search-bar">
        <div style={{ position: 'relative', width: '100%' }}>
          <Search className="w-5 h-5" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search insurance companies..."
            className="roof-er-search-input"
            style={{ paddingLeft: '52px' }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px 20px', flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--roof-red)' }}>{filteredCompanies.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Insurance Companies</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px 20px', flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--roof-red)' }}>{companies.filter(c => c.app.includes('Mobile')).length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>With Mobile Apps</div>
        </div>
      </div>

      {/* Insurance Company Cards */}
      {filteredCompanies.map((company, idx) => (
        <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '16px', transition: 'all 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--roof-red)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'translateX(0)'; }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', position: 'relative' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{company.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <Smartphone className="w-4 h-4" /><span>{company.app}</span>
              </div>
            </div>
            {company.score && (
              <div style={{ background: 'var(--roof-red)', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{company.score}</div>
            )}
            <button onClick={() => toggleGoTo(company.name)} title={goTo.has(company.name) ? 'Unpin' : 'Pin to Go-To'}
              style={{ position: 'absolute', top: 0, right: 0, background: 'none', border: 'none', cursor: 'pointer', color: goTo.has(company.name) ? 'var(--roof-red)' : 'var(--text-disabled)' }}>
              <Pin className="w-5 h-5" />
            </button>
          </div>

          {/* Contact Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <Mail className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
              <a href={`mailto:${company.email}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{company.email}</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <Phone className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
              <a href={`tel:${company.phone.replace(/[^0-9]/g, '')}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{company.phone}</a>
            </div>
          </div>

          {/* Notes */}
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: '1.6', marginBottom: '12px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', borderLeft: '3px solid var(--roof-red)' }}>
            {company.notes}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { try { localStorage.setItem('chat_quick_company', JSON.stringify({ name: company.name })); } catch {}; onOpenChat?.(); }}
              style={{ padding: '8px 14px', background: 'var(--bg-hover)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <MessageCircle className="w-4 h-4" />Open in Chat
            </button>
            {company.loginUrl && (
              <button onClick={() => window.open(company.loginUrl, '_blank')}
                style={{ padding: '8px 14px', background: 'var(--roof-red)', border: 'none', borderRadius: '6px', color: 'white', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <ExternalLink className="w-4 h-4" />Login Portal
              </button>
            )}
            <button onClick={() => window.location.href = `tel:${company.phone.replace(/[^0-9]/g, '')}`}
              style={{ padding: '8px 14px', background: 'var(--bg-hover)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <Phone className="w-4 h-4" />Call Now
            </button>
            <button onClick={() => window.location.href = `mailto:${company.email}`}
              style={{ padding: '8px 14px', background: 'var(--bg-hover)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <Mail className="w-4 h-4" />Email
            </button>
          </div>
        </div>
      ))}

      {filteredCompanies.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
          {searchQuery ? `No insurance companies found matching "${searchQuery}"` : 'No pinned insurance companies yet. Pin some from the "All" view.'}
        </div>
      )}
    </div>
  );
};

export default InsuranceDirectory;
