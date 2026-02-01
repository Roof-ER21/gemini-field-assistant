/**
 * Territory Context Service
 * Provides territory coverage and performance data for Susan AI
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

export interface Territory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  owner_id: string | null;
  is_shared: boolean;
  north_lat: number;
  south_lat: number;
  east_lng: number;
  west_lng: number;
  center_lat: number;
  center_lng: number;
  created_at: string;
  updated_at: string;
  // Stats from aggregation
  total_addresses?: number;
  canvassed_addresses?: number;
  leads_generated?: number;
  appointments_set?: number;
  revenue_generated?: number;
}

export interface TerritoryStats {
  territory_id: string;
  territory_name: string;
  total_addresses: number;
  canvassed_addresses: number;
  coverage_percentage: number;
  leads_generated: number;
  appointments_set: number;
  revenue_generated: number;
}

export interface TerritoryData {
  user_territories: Territory[];
  territory_stats: TerritoryStats[];
}

/**
 * Keywords that indicate territory-related queries
 */
const TERRITORY_KEYWORDS = [
  'territory', 'territories', 'area', 'areas',
  'coverage', 'covered', 'canvassed',
  'zone', 'zones', 'turf',
  'my area', 'my territory', 'my zone',
  'how much', 'how many addresses',
  'completion', 'progress',
  'dmv', 'pa', 'ra' // Common territory names
];

/**
 * Detect if query is territory-related
 */
export function isTerritoryQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  return TERRITORY_KEYWORDS.some(keyword =>
    normalizedQuery.includes(keyword)
  );
}

/**
 * Fetch user's territories and stats
 */
export async function fetchTerritoryData(userEmail?: string): Promise<TerritoryData | null> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const email = userEmail || authService.getCurrentUser()?.email;

    if (!email) {
      console.warn('[TerritoryContext] No user email available');
      return null;
    }

    const headers = {
      'x-user-email': email,
      'Content-Type': 'application/json'
    };

    // Fetch user's territories
    const territoriesResponse = await fetch(`${apiBaseUrl}/territories`, {
      headers
    });

    if (!territoriesResponse.ok) {
      console.warn('[TerritoryContext] Failed to fetch territories:', territoriesResponse.status);
      return null;
    }

    const territoriesData = await territoriesResponse.json();
    const territories: Territory[] = territoriesData.territories || [];

    // For each territory, fetch canvassing stats
    const territoryStats: TerritoryStats[] = [];

    for (const territory of territories) {
      try {
        // Get canvassing data for this territory
        const canvassingResponse = await fetch(
          `${apiBaseUrl}/canvassing/area?territory=${encodeURIComponent(territory.name)}&limit=10000`,
          { headers }
        );

        if (canvassingResponse.ok) {
          const canvassingData = await canvassingResponse.json();
          const entries = canvassingData.entries || [];

          // Calculate stats
          const totalAddresses = entries.length;
          const canvassedAddresses = entries.filter((e: any) =>
            ['contacted', 'interested', 'lead', 'appointment_set', 'sold', 'customer'].includes(e.status)
          ).length;
          const leadsGenerated = entries.filter((e: any) =>
            ['lead', 'appointment_set', 'sold', 'customer'].includes(e.status)
          ).length;
          const appointmentsSet = entries.filter((e: any) =>
            ['appointment_set', 'sold', 'customer'].includes(e.status)
          ).length;

          // Revenue calculation (would need actual job data, estimate for now)
          const revenueGenerated = 0; // TODO: Link to actual sales data

          const coveragePercentage = totalAddresses > 0
            ? (canvassedAddresses / totalAddresses) * 100
            : 0;

          territoryStats.push({
            territory_id: territory.id,
            territory_name: territory.name,
            total_addresses: totalAddresses,
            canvassed_addresses: canvassedAddresses,
            coverage_percentage: coveragePercentage,
            leads_generated: leadsGenerated,
            appointments_set: appointmentsSet,
            revenue_generated: revenueGenerated
          });
        }
      } catch (error) {
        console.error(`[TerritoryContext] Error fetching stats for territory ${territory.name}:`, error);
        // Add empty stats for this territory
        territoryStats.push({
          territory_id: territory.id,
          territory_name: territory.name,
          total_addresses: 0,
          canvassed_addresses: 0,
          coverage_percentage: 0,
          leads_generated: 0,
          appointments_set: 0,
          revenue_generated: 0
        });
      }
    }

    return {
      user_territories: territories,
      territory_stats: territoryStats
    };
  } catch (error) {
    console.error('[TerritoryContext] Error fetching territory data:', error);
    return null;
  }
}

/**
 * Build territory context block for Susan's prompt
 */
export async function buildTerritoryContext(query: string, userEmail?: string): Promise<string | null> {
  // Only fetch if this is a territory-related query
  if (!isTerritoryQuery(query)) {
    return null;
  }

  console.log('[TerritoryContext] Territory query detected, fetching data...');

  const data = await fetchTerritoryData(userEmail);

  if (!data || data.user_territories.length === 0) {
    return `

[TERRITORY CONTEXT - NO TERRITORIES]
This user is not assigned to any territories yet.
GUIDANCE: Let them know they don't have territories assigned. Suggest they check with their manager about territory assignment.
`;
  }

  const { user_territories, territory_stats } = data;

  let context = '\n\n[TERRITORY CONTEXT]\n';
  context += `Your Territories: ${user_territories.length}\n`;

  for (const territory of user_territories) {
    const stats = territory_stats.find(s => s.territory_id === territory.id);

    context += `\n${territory.name}${territory.description ? ` (${territory.description})` : ''}:\n`;

    if (stats) {
      context += `- Total Addresses: ${stats.total_addresses}\n`;
      context += `- Canvassed: ${stats.canvassed_addresses} (${stats.coverage_percentage.toFixed(1)}% coverage)\n`;
      context += `- Leads Generated: ${stats.leads_generated}\n`;
      context += `- Appointments Set: ${stats.appointments_set}\n`;

      if (stats.revenue_generated > 0) {
        context += `- Revenue: $${stats.revenue_generated.toLocaleString()}\n`;
      }

      // Calculate remaining work
      const remaining = stats.total_addresses - stats.canvassed_addresses;
      if (remaining > 0) {
        context += `- Remaining: ${remaining} addresses (${(100 - stats.coverage_percentage).toFixed(1)}% to go)\n`;
      } else if (stats.coverage_percentage >= 100) {
        context += `- Status: COMPLETE! All addresses canvassed\n`;
      }
    } else {
      context += `- Status: No activity yet\n`;
    }

    // Territory boundaries
    context += `- Location: Center at ${territory.center_lat.toFixed(4)}, ${territory.center_lng.toFixed(4)}\n`;
  }

  // Summary statistics
  const totalAddresses = territory_stats.reduce((sum, s) => sum + s.total_addresses, 0);
  const totalCanvassed = territory_stats.reduce((sum, s) => sum + s.canvassed_addresses, 0);
  const totalLeads = territory_stats.reduce((sum, s) => sum + s.leads_generated, 0);
  const totalAppointments = territory_stats.reduce((sum, s) => sum + s.appointments_set, 0);
  const overallCoverage = totalAddresses > 0 ? (totalCanvassed / totalAddresses) * 100 : 0;

  if (user_territories.length > 1) {
    context += `\nOverall Summary:\n`;
    context += `- Total Addresses Across All Territories: ${totalAddresses}\n`;
    context += `- Total Canvassed: ${totalCanvassed} (${overallCoverage.toFixed(1)}% coverage)\n`;
    context += `- Total Leads: ${totalLeads}\n`;
    context += `- Total Appointments: ${totalAppointments}\n`;
  }

  context += `\nCOACHING GUIDANCE:\n`;
  context += `- If they ask about territories: List the territories above with their stats\n`;
  context += `- If they ask about coverage: Reference the coverage percentage and remaining addresses\n`;
  context += `- If they ask "which territory should I work?": Suggest the one with lowest coverage or highest potential\n`;
  context += `- If they ask about progress: Celebrate the canvassed count and coverage percentage\n`;
  context += `- If coverage is low: Encourage them with "lots of opportunity in your territory!"\n`;
  context += `- If coverage is high: Celebrate "you're crushing it in [territory]!"\n`;
  context += `- Connect territory work to bigger goals: "Every door in your territory is a potential customer"\n`;
  context += `- If multiple territories: Help them prioritize based on coverage gaps or strategic importance\n`;

  return context;
}

export default {
  isTerritoryQuery,
  fetchTerritoryData,
  buildTerritoryContext
};
