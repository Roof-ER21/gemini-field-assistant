/**
 * Check-in Context Service
 * Provides field canvassing session and activity data for Susan AI
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface CheckInSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  target_city: string | null;
  target_state: string | null;
  target_zip_code: string | null;
  target_territory: string | null;
  notes: string | null;
}

export interface CheckInStats {
  doors_knocked: number;
  contacts_made: number;
  leads_generated: number;
  appointments_set: number;
  total_sessions: number;
  total_hours: number;
}

export interface TerritoryCheckIn {
  id: string;
  territory_id: string;
  territory_name: string;
  user_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  check_in_lat: number;
  check_in_lng: number;
  doors_knocked: number;
  contacts_made: number;
  leads_generated: number;
  appointments_set: number;
  notes: string | null;
}

export interface CheckInData {
  active_session: CheckInSession | null;
  active_territory_checkin: TerritoryCheckIn | null;
  today_stats: CheckInStats;
  team_in_field: number;
}

/**
 * Keywords that indicate check-in/field activity queries
 */
const CHECKIN_KEYWORDS = [
  'field', 'canvassing', 'canvass', 'knock', 'knocking',
  'doors', 'door', 'check in', 'checked in', 'checkin',
  'where am i', 'location', 'session',
  'today', 'so far', 'this session',
  'contacts', 'leads', 'appointments',
  'in the field', 'out in field', 'working field',
  'territory', 'area', 'working in'
];

/**
 * Detect if query is check-in/field-related
 */
export function isCheckinQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  return CHECKIN_KEYWORDS.some(keyword =>
    normalizedQuery.includes(keyword)
  );
}

/**
 * Fetch user's check-in and field activity data
 */
export async function fetchCheckinData(userEmail?: string): Promise<CheckInData | null> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const email = userEmail || authService.getCurrentUser()?.email;

    if (!email) {
      console.warn('[CheckinContext] No user email available');
      return null;
    }

    const headers = {
      'x-user-email': email,
      'Content-Type': 'application/json'
    };

    // Fetch active canvassing session
    let activeSession: CheckInSession | null = null;
    try {
      const sessionResponse = await fetch(`${apiBaseUrl}/canvassing/sessions?limit=1`, {
        headers
      });

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        const sessions = sessionData.sessions || [];
        // Get the most recent session that's still active (no ended_at)
        activeSession = sessions.find((s: CheckInSession) => !s.ended_at) || null;
      }
    } catch (error) {
      console.error('[CheckinContext] Error fetching session:', error);
    }

    // Fetch active territory check-in
    let activeTerritoryCheckin: TerritoryCheckIn | null = null;
    try {
      const territoryResponse = await fetch(`${apiBaseUrl}/territories/active-checkin`, {
        headers
      });

      if (territoryResponse.ok) {
        const territoryData = await territoryResponse.json();
        activeTerritoryCheckin = territoryData.checkIn || null;
      }
    } catch (error) {
      console.error('[CheckinContext] Error fetching territory check-in:', error);
    }

    // Fetch today's stats
    let todayStats: CheckInStats = {
      doors_knocked: 0,
      contacts_made: 0,
      leads_generated: 0,
      appointments_set: 0,
      total_sessions: 0,
      total_hours: 0
    };

    try {
      const statsResponse = await fetch(`${apiBaseUrl}/canvassing/stats?daysBack=1`, {
        headers
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        const stats = statsData.stats;

        if (stats) {
          todayStats = {
            doors_knocked: Number(stats.total_doors_knocked) || 0,
            contacts_made: Number(stats.total_contacts_made) || 0,
            leads_generated: Number(stats.total_leads_generated) || 0,
            appointments_set: Number(stats.total_appointments_set) || 0,
            total_sessions: Number(stats.total_sessions) || 0,
            total_hours: Number(stats.total_hours) || 0
          };
        }
      }
    } catch (error) {
      console.error('[CheckinContext] Error fetching stats:', error);
    }

    // Fetch team in field count (rough estimate from team stats)
    let teamInField = 0;
    try {
      const teamResponse = await fetch(`${apiBaseUrl}/canvassing/team-stats?daysBack=1`, {
        headers
      });

      if (teamResponse.ok) {
        const teamData = await teamResponse.json();
        // Estimate active reps from unique reps who knocked today
        teamInField = teamData.stats?.unique_reps || 0;
      }
    } catch (error) {
      console.error('[CheckinContext] Error fetching team stats:', error);
    }

    return {
      active_session: activeSession,
      active_territory_checkin: activeTerritoryCheckin,
      today_stats: todayStats,
      team_in_field: teamInField
    };
  } catch (error) {
    console.error('[CheckinContext] Error fetching check-in data:', error);
    return null;
  }
}

/**
 * Calculate duration from timestamp
 */
function getDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diff = now.getTime() - start.getTime();

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m ago`;
  }
  return `${minutes}m ago`;
}

/**
 * Build check-in context block for Susan's prompt
 */
export async function buildCheckinContext(query: string, userEmail?: string): Promise<string | null> {
  // Only fetch if this is a check-in/field-related query
  if (!isCheckinQuery(query)) {
    return null;
  }

  console.log('[CheckinContext] Field activity query detected, fetching data...');

  const data = await fetchCheckinData(userEmail);

  if (!data) {
    return `

[FIELD ACTIVITY CONTEXT - UNAVAILABLE]
Unable to retrieve field activity data.
GUIDANCE: Let them know their field activity data isn't available right now. Suggest checking the Canvassing tab directly.
`;
  }

  const { active_session, active_territory_checkin, today_stats, team_in_field } = data;

  let context = '\n\n[FIELD ACTIVITY CONTEXT]\n';

  // Active session info
  if (active_session) {
    const duration = getDuration(active_session.started_at);
    context += `Current Session: ACTIVE\n`;
    context += `- Started: ${new Date(active_session.started_at).toLocaleTimeString()} (${duration})\n`;
    if (active_session.target_territory) {
      context += `- Target Territory: ${active_session.target_territory}\n`;
    } else if (active_session.target_city) {
      context += `- Target Area: ${active_session.target_city}${active_session.target_state ? ', ' + active_session.target_state : ''}\n`;
    }
  } else if (active_territory_checkin) {
    const duration = getDuration(active_territory_checkin.checked_in_at);
    context += `Current Session: ACTIVE (Territory Check-in)\n`;
    context += `- Checked in: ${new Date(active_territory_checkin.checked_in_at).toLocaleTimeString()} (${duration})\n`;
    context += `- Territory: ${active_territory_checkin.territory_name}\n`;
    context += `- Location: ${active_territory_checkin.check_in_lat.toFixed(4)}, ${active_territory_checkin.check_in_lng.toFixed(4)}\n`;
  } else {
    context += `Current Session: Not checked in\n`;
  }

  // Today's stats
  context += `\nToday's Stats:\n`;
  context += `- Doors Knocked: ${today_stats.doors_knocked}\n`;
  context += `- Contacts Made: ${today_stats.contacts_made}\n`;
  context += `- Leads Generated: ${today_stats.leads_generated}\n`;
  context += `- Appointments Set: ${today_stats.appointments_set}\n`;

  if (today_stats.total_hours > 0) {
    context += `- Time in Field: ${today_stats.total_hours.toFixed(1)} hours\n`;
  }

  // Team activity
  if (team_in_field > 0) {
    context += `\nTeam In Field: ${team_in_field} rep${team_in_field !== 1 ? 's' : ''} active today\n`;
  }

  // Session-specific stats (if checked in to territory)
  if (active_territory_checkin) {
    context += `\nCurrent Session Stats:\n`;
    context += `- Doors Knocked: ${active_territory_checkin.doors_knocked}\n`;
    context += `- Contacts Made: ${active_territory_checkin.contacts_made}\n`;
    context += `- Leads Generated: ${active_territory_checkin.leads_generated}\n`;
    context += `- Appointments Set: ${active_territory_checkin.appointments_set}\n`;
  }

  context += `\nCOACHING GUIDANCE:\n`;
  context += `- If they ask "where am I?": Reference the active session location/territory above\n`;
  context += `- If they ask "how many doors?": Use today's doors knocked (${today_stats.doors_knocked})\n`;
  context += `- If they ask about progress: Celebrate the numbers, encourage consistency\n`;
  context += `- If not checked in: Remind them to check in when they start field work\n`;
  context += `- Connect activity to goals: "That's great progress toward your monthly goal!"\n`;
  context += `- If low activity: Be encouraging, suggest strategies (time of day, neighborhood selection)\n`;
  context += `- Celebrate milestones: Every 10 doors, every lead, every appointment\n`;

  return context;
}

export default {
  isCheckinQuery,
  fetchCheckinData,
  buildCheckinContext
};
