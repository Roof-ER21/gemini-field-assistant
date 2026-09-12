import React, { useEffect, useState } from 'react';
import { useDivision } from '../contexts/DivisionContext';
import { useSettings } from '../contexts/SettingsContext';
import {
  MessageSquare,
  Mail,
  ChevronRight,
  Sun,
  Moon,
  CloudSun,
  CloudRain,
  CloudSnow,
  Cloud,
  Wind,
  AlertTriangle,
  User,
  Globe,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { authService } from '../services/authService';

type PanelType =
  | 'home'
  | 'chat'
  | 'image'
  | 'transcribe'
  | 'email'
  | 'live'
  | 'knowledge'
  | 'admin'
  | 'agnes'
  | 'agnes-learning'
  | 'translator'
  | 'documentjob'
  | 'team'
  | 'learning'
  | 'canvassing'
  | 'impacted'
  | 'territories'
  | 'stormmap'
  | 'leaderboard'
  | 'contests'
  | 'myprofile'
  | 'inspections'
  | 'notifications';

interface HomePageRedesignedProps {
  setActivePanel: (panel: PanelType) => void;
  userEmail?: string;
}

// Weather-based motivational quotes
const WEATHER_QUOTES: Record<string, { insurance: string[]; retail: string[] }> = {
  sunny: {
    insurance: [
      'Clear skies today — perfect for roof inspections. Get up there.',
      "Sun's out. Homeowners are outside. Time to knock.",
      'Beautiful day to document damage and build your pipeline.',
    ],
    retail: [
      "Perfect weather for door-knocking. Everyone's in a good mood.",
      "Sun's out, people are outside — easiest conversations happen today.",
      "Great day to be in the field. Let's set some appointments.",
    ],
  },
  cloudy: {
    insurance: [
      'Overcast skies remind homeowners about their roof. Use it.',
      'Cloud cover today — good for inspections without the glare.',
      'Gray sky? Homeowners are thinking about weather. Perfect timing.',
    ],
    retail: [
      'Overcast but comfortable — ideal knocking weather.',
      "Cloudy days keep homeowners inside. They'll answer the door.",
      'Not too hot, not too cold. Get those doors knocked.',
    ],
  },
  rainy: {
    insurance: [
      'Rain today = leak calls tomorrow. Be ready.',
      'Rainy days are research days. Prep your supplements and follow-ups.',
      "Can't knock? Sharpen your emails and call your pipeline.",
    ],
    retail: [
      'Rain means homeowners are HOME. Dial, text, follow up.',
      "Can't knock doors? Practice with Agnes 24. Get sharper.",
      'Rainy day = training day. Hit Agnes, review your scripts, come back stronger.',
    ],
  },
  stormy: {
    insurance: [
      'Storm activity detected. Check Storm Maps NOW — be first.',
      'Storms = opportunity. Document everything. Get to those doors first.',
      'New storm data incoming. Your next claim could be today.',
    ],
    retail: [
      "Storms today — stay safe. Tomorrow's gonna be a busy one.",
      'Bad weather today means homeowners thinking about their home tomorrow.',
      'Storm day = prep day. Review your product knowledge and come out swinging.',
    ],
  },
  cold: {
    insurance: [
      'Cold out there. Warm up with some emails and Susan time.',
      "Bundle up if you're inspecting today. Safety first.",
      'Cold weather = drafty windows = opportunity for your pipeline.',
    ],
    retail: [
      "Cold day — lead with windows. 'Have you noticed any drafts?'",
      "When it's cold, homeowners FEEL their old windows. Perfect pitch day.",
      'Bundle up and knock. The cold is your best visual cue for windows.',
    ],
  },
  hot: {
    insurance: [
      'Hot one today. Hydrate and inspect smart.',
      "AC running hard? So are your homeowners' bills. Solar pitch?",
      'Hot days show shingle wear fast. Great for documentation.',
    ],
    retail: [
      'Hot day — lead with energy savings. Windows, insulation, solar.',
      "'Has your AC been running nonstop?' — easiest opener on a hot day.",
      'Hydrate between doors. The heat is your opening for energy efficiency.',
    ],
  },
};

interface WeatherData {
  temp: number | null;
  condition: string;
  description: string;
  icon: typeof Sun;
}

// General field tips by division — rotates daily, tap to cycle.
// Sourced from the actual training material in public/docs/ (Roof-ER Sales
// Training slides + Retail Training docs), photo/documentation tips weighted
// heaviest for insurance per the manual's own emphasis.
const FIELD_TIPS: Record<'insurance' | 'retail', string[]> = {
  insurance: [
    // Slide 29 — the inspection photo checklist
    'Full photo set on EVERY inspection: mailbox/house number, house overview, collateral on all four elevations (screens, gutters, downspouts, siding), roof metals, close-ups of each circled hail hit and slashed wind mark, a chalked-up overview, and granules in the gutters.',
    // Slide 29 — why the photos matter
    "Getting enough photos to sell the homeowner is the MOST important part of the inspection. A fast inspection means nothing if you can't show the damage.",
    // Slide 29 — chalk convention
    'Circle hail hits, slash wind damage. Take a close-up of each, then finish with an overview shot of the majority of the damage chalked up.',
    // Slides 67 & 69 — orientation rules
    "Photo Reports are ALWAYS taken in portrait orientation — landscape photos won't populate properly. (Hover photos are the exception: landscape is usually more effective there.)",
    // Slides 29 & 32 — granules
    "Shoot the granules in the gutters and at the bottom of downspouts: 'These granules are what protect your home — wind and hail knock them out and shorten your roof's life.'",
    // Slide 88 — average ticket
    'Raise your average ticket with photos: hail damage to downspouts, gutters, window wraps, window screens, and ALL metals — especially metal roofing over windows and porches.',
    // Slide 67 — adjuster meeting DOs
    'Adjuster meetings: show up 15–30 minutes early, chalk metals the day BEFORE (not shingles), and never start your Photo Report or Hover while the adjuster is still inspecting.',
    // Slide 30 — collateral story
    "Collateral damage is your evidence: 'Think of us like lawyers — this collateral builds the case that gets the roof approved.'",
    // Slide 31 — the hail explainer
    "The hail explainer that closes: 'These divots fill with water, freeze, and expand — that breaks apart the shingle and leads to leaks. That's why your policy covers this.'",
    // Photo discipline, restated — the habit the manual drills
    'Before you leave the roof: did you photograph every elevation and every slope, even the clean ones? Missing photos are missed approvals.',
  ],
  retail: [
    // Field Etiquette #3–4
    'Doorbell Sandwich: knock — pause — ring the doorbell — knock again. Then take two big steps back (Broomstick Theory). Space earns respect.',
    // Objections & Rebuttals — A.E.R.
    "Every objection runs through A.E.R.: Agree ('Makes sense, right?'), Empathize, Redirect to 'My job is simple' — then straight into the re-intro.",
    // Pitch Essentials — indifference
    "'I'm not here to sell — just to share.' Statements, not questions. You should never have to convince a homeowner they need the free quote.",
    // No-money rebuttal
    "No budget? Frame the quote as a gift: guaranteed in writing, untouched by inflation, on file for whenever they're ready — 'Fair enough?'",
    // Spouse objection (C.O.W.S)
    "'Talk to my spouse'? — 'That's actually what my job IS: a time that works for both you AND your spouse.' Never fight it, schedule around it.",
    // Field Etiquette #8
    'Pregnant pause: after key statements and questions, stop talking. Silence builds curiosity and engagement.',
    // Neighbor hook (5 non-negotiables)
    "Point at the neighbor's project — 'We're doing the roof up the street, just giving the neighbors a heads up' beats any script.",
    // Field Etiquette #10
    "Keep your eyes OUTSIDE while you wait at the door. It's respectful — and they can't wave you off from inside before answering.",
  ],
};

const HomePageRedesigned: React.FC<HomePageRedesignedProps> = ({ setActivePanel, userEmail }) => {
  const { isRetail } = useDivision();
  const user = authService.getCurrentUser();
  const { isFeatureEnabled } = useSettings();
  const [summaryState, setSummaryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const isAdmin = user?.role === 'admin';
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [topIntel, setTopIntel] = useState<string | null>(null);
  const [stormSummary, setStormSummary] = useState<{
    count: number;
    maxMagnitude: number | null;
  } | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [summaries, setSummaries] = useState<
    Array<{ summary: string; topics: string[]; action_items: string[] }>
  >([]);
  const [playbook, setPlaybook] = useState<string[]>([]);
  const [playbookIdx, setPlaybookIdx] = useState(0);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const [tipIdx, setTipIdx] = useState(dayOfYear);
  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.name?.split(' ')[0] || 'there';
    if (hour < 12) return { text: `Good morning, ${name}`, icon: Sun };
    if (hour < 17) return { text: `Good afternoon, ${name}`, icon: CloudSun };
    return { text: `Good evening, ${name}`, icon: Moon };
  };

  // Get weather-based quote
  const getWeatherQuote = (condition: string) => {
    const pool = WEATHER_QUOTES[condition] || WEATHER_QUOTES.sunny;
    const quotes = isRetail ? pool.retail : pool.insurance;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
    );
    return quotes[dayOfYear % quotes.length];
  };

  // Fetch weather from NWS (free, no key needed)
  useEffect(() => {
    const state = user?.state || 'VA';
    // NWS observation stations by state
    const stations: Record<string, string> = {
      VA: 'KDCA', // Reagan National (DC/NoVA)
      MD: 'KBWI', // Baltimore
      PA: 'KPHL', // Philadelphia
    };
    const station = stations[state] || 'KDCA';

    fetch(`https://api.weather.gov/stations/${station}/observations/latest`, {
      headers: { 'User-Agent': 'Susan21-RoofER/1.0 (admin@roofer.com)' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.properties) return;
        const props = data.properties;
        const tempC = props.temperature?.value;
        const tempF = tempC != null ? Math.round((tempC * 9) / 5 + 32) : null;
        const desc = props.textDescription || '';
        const descLower = desc.toLowerCase();

        let condition =
          descLower.includes('clear') || descLower.includes('sun') ? 'sunny' : 'unknown';
        let icon: typeof Sun = Cloud;

        if (descLower.includes('thunder') || descLower.includes('storm')) {
          condition = 'stormy';
          icon = AlertTriangle;
        } else if (
          descLower.includes('rain') ||
          descLower.includes('drizzle') ||
          descLower.includes('shower')
        ) {
          condition = 'rainy';
          icon = CloudRain;
        } else if (
          descLower.includes('snow') ||
          descLower.includes('ice') ||
          descLower.includes('sleet')
        ) {
          condition = 'cold';
          icon = CloudSnow;
        } else if (
          descLower.includes('cloud') ||
          descLower.includes('overcast') ||
          descLower.includes('fog')
        ) {
          condition = 'cloudy';
          icon = Cloud;
        } else if (descLower.includes('wind')) {
          condition = 'cloudy';
          icon = Wind;
        } else if (tempF != null && tempF < 40) {
          condition = 'cold';
          icon = CloudSnow;
        } else if (tempF != null && tempF > 85) {
          condition = 'hot';
          icon = Sun;
        }

        setWeather({
          temp: tempF,
          condition,
          description: desc || 'Conditions unavailable',
          icon,
        });
      })
      .catch(() => {});
  }, [user?.state]);

  // Load storm summary + top intel
  useEffect(() => {
    if (!isRetail && userEmail) {
      fetch('/api/dashboard/storm-summary', { headers: { 'x-user-email': userEmail } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setStormSummary(d);
        })
        .catch(() => {});
    }

    fetch('/api/agent-network?limit=1', { headers: { 'x-user-email': userEmail || '' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d) && d.length > 0 && d[0].content) {
          setTopIntel(
            d[0].content.length > 120 ? d[0].content.substring(0, 120) + '...' : d[0].content,
          );
        }
      })
      .catch(() => {});
  }, [userEmail, isRetail]);

  // Susan board: rep's recent conversation summaries + company playbook
  useEffect(() => {
    if (!userEmail) {
      setSummaryState('ready');
      return;
    }
    setSummaryState('loading');
    let cancelled = false;
    const headers = { 'x-user-email': userEmail };
    const parseArr = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      if (typeof v === 'string') {
        try {
          const parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    fetch('/api/memory/summaries?limit=3', { headers })
      .then((r) => {
        if (!r.ok) throw new Error('Summaries unavailable');
        return r.json();
      })
      .then((rows) => {
        if (cancelled) return;
        setSummaryState('ready');
        if (!Array.isArray(rows)) return;
        setSummaries(
          rows
            .filter(
              (r: { summary?: unknown; topics?: unknown; action_items?: unknown }) => r?.summary,
            )
            .map((r: { summary?: unknown; topics?: unknown; action_items?: unknown }) => ({
              summary: String(r.summary),
              topics: parseArr(r.topics),
              action_items: parseArr(r.action_items),
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setSummaryState('error');
      });

    fetch('/api/learning/global?limit=6', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const learnings = Array.isArray(d?.learnings) ? d.learnings : [];
        setPlaybook(learnings.map((l: { content?: unknown }) => String(l.content)).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userEmail, summaryAttempt]);

  const greeting = getGreeting();
  const weatherQuote =
    weather && weather.condition !== 'unknown' ? getWeatherQuote(weather.condition) : null;
  const hasRecentStorms = !isRetail && stormSummary && stormSummary.count > 0;

  const tools = [
    {
      id: 'myprofile',
      title: 'Share your profile',
      description: 'Your QR code and homeowner contact page',
      icon: User,
    },
    {
      id: 'translator',
      title: 'Translate a conversation',
      description: 'Talk with a homeowner in their language',
      icon: Globe,
    },
    {
      id: 'email',
      title: 'Draft an email',
      description: 'Prepare a follow-up or claim response',
      icon: Mail,
    },
    {
      id: 'image',
      title: 'Analyze documents & photos',
      description: 'Review damage, estimates, and claim details',
      icon: FileText,
    },
  ];
  const tips = FIELD_TIPS[isRetail ? 'retail' : 'insurance'];
  const WeatherIcon = weather?.icon || Cloud;
  return (
    <div className="field-home">
      <div className="field-home-head">
        <div>
          <h1>{greeting.text}</h1>
          <p>Your next conversation starts here.</p>
        </div>
        {weather && (
          <div className="field-weather">
            <WeatherIcon size={24} aria-hidden="true" />
            <span>
              {weather.temp == null ? 'Temperature unavailable' : weather.temp + '°F'}
              <br />
              {weather.description}
            </span>
          </div>
        )}
      </div>
      <div className="field-primary-actions" aria-label="Start a task">
        {isFeatureEnabled('feature_susan_chat') && (
          <button
            className="field-action field-action-primary"
            onClick={() => setActivePanel('chat')}
          >
            <MessageSquare size={20} aria-hidden="true" />
            Ask Susan
          </button>
        )}
        <button className="field-action" onClick={() => setActivePanel('image')}>
          <FileText size={20} aria-hidden="true" />
          Analyze a document
        </button>
      </div>
      {hasRecentStorms && isAdmin && isFeatureEnabled('feature_storm_map') && (
        <button className="field-action field-storm" onClick={() => setActivePanel('stormmap')}>
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{stormSummary!.count} storm events this month. Open Storm Maps</span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      <div className="field-home-grid">
        <div>
          <section className="field-section" aria-labelledby="field-recent-heading">
            <div className="field-section-head">
              <h2 id="field-recent-heading">Pick up where you left off</h2>
            </div>
            {summaries.length > 0 ? (
              summaries.slice(0, 2).map((summary, index) => (
                <article className="field-panel" key={index}>
                  <small>Recent conversation</small>
                  <p>{summary.summary}</p>
                  {summary.action_items[0] && (
                    <small>Suggested follow-up: {summary.action_items[0]}</small>
                  )}
                  {isFeatureEnabled('feature_susan_chat') && (
                    <button className="field-text-button" onClick={() => setActivePanel('chat')}>
                      Open Susan <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  )}
                </article>
              ))
            ) : (
              <div className="field-panel">
                <p role="status">
                  {summaryState === 'loading'
                    ? 'Loading your recent conversations…'
                    : summaryState === 'error'
                      ? 'Recent conversations could not load.'
                      : 'Ask Susan about a claim, a document, or your next homeowner conversation.'}
                </p>
                {summaryState === 'error' ? (
                  <button
                    className="field-text-button"
                    onClick={() => setSummaryAttempt((attempt) => attempt + 1)}
                  >
                    Try again
                  </button>
                ) : (
                  <small>Your recent conversation summaries will appear here.</small>
                )}
              </div>
            )}
          </section>
          {topIntel && (
            <section className="field-section" aria-labelledby="field-intel-heading">
              <h2 id="field-intel-heading">From the team</h2>
              <div className="field-panel">
                <p>{topIntel}</p>
                <button className="field-text-button" onClick={() => setActivePanel('team')}>
                  Open team messages <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
          <section className="field-section" aria-labelledby="field-tools-heading">
            <div className="field-section-head">
              <h2 id="field-tools-heading">Field tools</h2>
            </div>
            <div className="field-tool-list">
              {tools.map(({ id, title, description, icon: Icon }) => (
                <button
                  key={id}
                  className="field-tool"
                  onClick={() => setActivePanel(id as PanelType)}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside aria-label="Field guidance">
          <section className="field-section">
            <div className="field-section-head">
              <h2>In the field</h2>
              <button
                className="field-text-button"
                aria-label="Show another field tip"
                onClick={() => setTipIdx((index) => index + 1)}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Next tip
              </button>
            </div>
            <div className="field-panel">
              <p>{tips[tipIdx % tips.length]}</p>
              {weatherQuote && <small>{weatherQuote}</small>}
            </div>
          </section>
          {playbook.length > 0 && (
            <section className="field-section">
              <div className="field-section-head">
                <h2>Company playbook</h2>
                {playbook.length > 1 && (
                  <button
                    className="field-text-button"
                    onClick={() => setPlaybookIdx((index) => index + 1)}
                  >
                    Next note
                  </button>
                )}
              </div>
              <div className="field-panel">
                <p>{playbook[playbookIdx % playbook.length]}</p>
                <button className="field-text-button" onClick={() => setActivePanel('knowledge')}>
                  Open knowledge base <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

export default HomePageRedesigned;
