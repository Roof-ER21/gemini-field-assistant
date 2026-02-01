/**
 * Google Sheets Sync Service
 * Pulls sales leaderboard data from Google Sheets into local PostgreSQL tables.
 */

import { google } from 'googleapis';
import type { Pool } from 'pg';

export interface SignupData {
  name: string;
  monthlySignups: number;
  yearlySignups: number;
  monthlyData: number[];
}

export interface EstimateData {
  name: string;
  monthlyEstimate: number;
  yearlyEstimate: number;
  monthlyData: number[];
}

export interface SyncResult {
  success: boolean;
  total: number;
  synced: number;
  created: number;
  updated: number;
  deactivated: number;
  message?: string;
  error?: string;
}

interface CombinedRepData {
  name: string;
  monthlySignups: number;
  yearlySignups: number;
  revenue2025: number;
  revenue2026: number;
  yearlyRevenue: number;
  allTimeRevenue: number;
  monthlyRevenue: number;
  yearlyEstimate: number;
}

export function createSheetsService(pool: Pool) {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1YSJD4RoqS_FLWF0LN1GRJKQhQNCdPT_aThqX6R6cZ4I';

  let sheetsClient: ReturnType<typeof google.sheets> | null = null;
  let authClient: any = null;

  function normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  function toDisplayName(nameLower: string): string {
    return nameLower
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function parseRevenue(value: any): number {
    if (!value) return 0;
    const cleaned = value.toString().replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned || '0');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = value.toString().replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned || '0');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const MONTH_LABELS = [
    { index: 0, names: ['january', 'jan'] },
    { index: 1, names: ['february', 'feb'] },
    { index: 2, names: ['march', 'mar'] },
    { index: 3, names: ['april', 'apr'] },
    { index: 4, names: ['may'] },
    { index: 5, names: ['june', 'jun'] },
    { index: 6, names: ['july', 'jul'] },
    { index: 7, names: ['august', 'aug'] },
    { index: 8, names: ['september', 'sep', 'sept'] },
    { index: 9, names: ['october', 'oct'] },
    { index: 10, names: ['november', 'nov'] },
    { index: 11, names: ['december', 'dec'] }
  ];

  function normalizeHeader(value: any): { raw: string; compact: string } {
    const raw = String(value || '').trim().toLowerCase();
    const compact = raw.replace(/[^a-z]/g, '');
    return { raw, compact };
  }

  function findHeaderRow(rows: any[][]): number {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const normalized = row.map(cell => normalizeHeader(cell).compact);
      const hasName = normalized.some(cell =>
        cell === 'repname' ||
        cell === 'name' ||
        cell.includes('repname') ||
        cell.includes('estimate')
      );
      const monthHits = normalized.reduce((count, cell) => {
        return count + (MONTH_LABELS.some(month => month.names.includes(cell)) ? 1 : 0);
      }, 0);

      if ((hasName && monthHits >= 1) || monthHits >= 3) {
        return i;
      }
    }
    return 0;
  }

  function pickSheetTitle(sheetInfo: any, candidates: string[]): string | null {
    const titles = sheetInfo.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean) as string[];
    if (!titles || titles.length === 0) return null;

    const titleMap = new Map<string, string>();
    for (const title of titles) {
      titleMap.set(title.toLowerCase(), title);
    }

    for (const candidate of candidates) {
      const found = titleMap.get(candidate.toLowerCase());
      if (found) return found;
    }

    return null;
  }

  function extractYearFromTitle(title: string): number | null {
    const match = title.match(/\b(20\d{2})\b/);
    if (!match) return null;
    return parseInt(match[1], 10);
  }

  function calculateBonusTier(signups: number): number {
    if (signups >= 40) return 6;
    if (signups >= 35) return 5;
    if (signups >= 30) return 4;
    if (signups >= 25) return 3;
    if (signups >= 20) return 2;
    if (signups >= 15) return 1;
    return 0;
  }

  function initializeAuth(): void {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      authClient = null;
      return;
    }

    try {
      let formattedPrivateKey = privateKey;

      if (!privateKey.startsWith('-----BEGIN')) {
        try {
          formattedPrivateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
        } catch {
          formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
        }
      } else {
        formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
      }

      if (!formattedPrivateKey.includes('\n') && formattedPrivateKey.includes('-----BEGIN')) {
        formattedPrivateKey = formattedPrivateKey
          .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
          .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');
      }

      authClient = new google.auth.JWT({
        email: clientEmail,
        key: formattedPrivateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
    } catch (error) {
      console.error('[SHEETS] Failed to initialize Google auth:', error instanceof Error ? error.message : 'Unknown error');
      authClient = null;
    }
  }

  async function connect(): Promise<ReturnType<typeof google.sheets>> {
    if (!authClient) {
      initializeAuth();
    }

    if (!authClient) {
      throw new Error('Missing Google Sheets credentials');
    }

    if (!sheetsClient) {
      sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    }

    await authClient.authorize();
    return sheetsClient;
  }

  function parseSignupsRows(rows: any[][]): Map<string, SignupData> {
    if (rows.length === 0) return new Map();

    const headerIndex = findHeaderRow(rows);
    const headerRow = rows[headerIndex] || [];
    const processedData: Map<string, SignupData> = new Map();
    const currentMonth = new Date().getMonth();

    let nameColumn = -1;
    let totalColumn = -1;
    const monthColumns = new Map<number, number>();

    headerRow.forEach((cell: any, idx: number) => {
      const header = normalizeHeader(cell);
      if (nameColumn === -1 && (header.compact === 'repname' || header.compact === 'name' || header.raw.includes('rep name'))) {
        nameColumn = idx;
      }
      if (totalColumn === -1 && header.compact.includes('totalsignups')) {
        totalColumn = idx;
      }

      for (const month of MONTH_LABELS) {
        if (month.names.includes(header.compact)) {
          monthColumns.set(month.index, idx);
        }
      }
    });

    if (nameColumn === -1) {
      nameColumn = 0;
    }

    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      if (!row[nameColumn]) continue;

      const name = row[nameColumn].toString().trim();
      const monthlySignups = Array.from({ length: 12 }, () => 0);

      for (const [monthIndex, colIndex] of monthColumns.entries()) {
        monthlySignups[monthIndex] = parseNumber(row[colIndex]);
      }

      const sumMonthly = monthlySignups.reduce((acc, val) => acc + val, 0);
      const totalValue = totalColumn >= 0 ? parseNumber(row[totalColumn]) : 0;
      const yearlySignups = totalValue > 0 || sumMonthly === 0 ? totalValue : sumMonthly;

      processedData.set(normalizeName(name), {
        name,
        monthlySignups: monthlySignups[currentMonth] || 0,
        yearlySignups,
        monthlyData: monthlySignups
      });
    }

    return processedData;
  }

  async function fetchSignupsForYear(year: number, allowGeneric: boolean): Promise<Map<string, SignupData>> {
    const sheets = await connect();

    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
    const candidates = [
      `${year}`,
      `Sign Ups ${year}`,
      `Signups ${year}`,
      `${year} Sign Ups`
    ];

    if (allowGeneric) {
      candidates.push('Sign Ups', 'Signups');
    }

    let sheetTitle = pickSheetTitle(sheetInfo as any, candidates);
    if (!sheetTitle) {
      sheetTitle =
        sheetInfo.data.sheets
          ?.map(sheet => sheet.properties?.title)
          .filter(Boolean)
          .find(title => {
            if (!title) return false;
            const lower = title.toLowerCase();
            if (!lower.includes('sign up') && !lower.includes('signup') && title !== String(year)) {
              return false;
            }
            const titleYear = extractYearFromTitle(title);
            if (titleYear) {
              return titleYear === year;
            }
            return allowGeneric;
          }) || null;
    }

    if (!sheetTitle) {
      return new Map();
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z`
    });

    const rows = response.data.values || [];
    return parseSignupsRows(rows);
  }

  async function fetchSignups(): Promise<Map<string, SignupData>> {
    const currentYear = new Date().getFullYear();
    return fetchSignupsForYear(currentYear, true);
  }

  async function fetchAllTimeRevenue(): Promise<Map<string, number>> {
    const sheets = await connect();

    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'All Time Revenue!A2:B'
      });
    } catch (error) {
      const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
      const fallbackSheet = sheetInfo.data.sheets?.find(sheet =>
        sheet.properties?.title?.toLowerCase().includes('all time')
      );

      if (!fallbackSheet?.properties?.title) {
        return new Map();
      }

      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${fallbackSheet.properties.title}!A2:B`
      });
    }

    const rows = response.data.values || [];
    const processedData: Map<string, number> = new Map();

    for (const row of rows) {
      if (!row[0]) continue;
      const name = row[0].toString().trim();
      const revenue = parseRevenue(row[1]);
      processedData.set(normalizeName(name), revenue);
    }

    return processedData;
  }

  async function fetchYearlyRevenue(year: number): Promise<Map<string, number>> {
    const sheets = await connect();

    const sheetGid = year === 2025 ? 827556465 : 1252542042;
    let response;

    try {
      const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
      const yearlyRevenueSheet = sheetInfo.data.sheets?.find(sheet => sheet.properties?.sheetId === sheetGid);

      if (yearlyRevenueSheet?.properties?.title) {
        response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${yearlyRevenueSheet.properties.title}!A2:B`
        });
      } else {
        const fallbackNames = [`${year} Revenue`, `Revenue ${year}`, 'Yearly Revenue'];
        for (const sheetName of fallbackNames) {
          try {
            response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `'${sheetName}'!A2:B`
            });
            if (response) break;
          } catch {
            continue;
          }
        }
      }
    } catch (error) {
      console.warn(`[SHEETS] Error finding ${year} revenue sheet:`, (error as Error).message);
      return new Map();
    }

    if (!response) {
      return new Map();
    }

    const rows = response.data.values || [];
    const processedData: Map<string, number> = new Map();

    for (const row of rows) {
      if (!row[0]) continue;
      const name = row[0].toString().trim();
      const revenue = parseRevenue(row[1]);
      processedData.set(normalizeName(name), revenue);
    }

    return processedData;
  }

  function parseEstimateRows(rows: any[][]): Map<string, EstimateData> {
    if (rows.length === 0) return new Map();

    const headerIndex = findHeaderRow(rows);
    const headerRow = rows[headerIndex] || [];

    let nameColumn = -1;
    let totalColumn = -1;
    const monthColumns = new Map<number, number>();

    headerRow.forEach((cell: any, idx: number) => {
      const header = normalizeHeader(cell);
      if (nameColumn === -1 && (header.compact === 'repname' || header.compact === 'name' || header.raw.includes('rep name') || header.raw.includes('estimates'))) {
        nameColumn = idx;
      }
      if (totalColumn === -1 && header.compact.includes('total')) {
        totalColumn = idx;
      }

      for (const month of MONTH_LABELS) {
        if (month.names.includes(header.compact)) {
          monthColumns.set(month.index, idx);
        }
      }
    });

    if (nameColumn === -1) {
      nameColumn = 0;
    }

    const processedData: Map<string, EstimateData> = new Map();
    const currentMonth = new Date().getMonth();

    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      if (!row[nameColumn]) continue;

      const name = row[nameColumn].toString().trim();
      const monthlyData = Array.from({ length: 12 }, () => 0);

      for (const [monthIndex, colIndex] of monthColumns.entries()) {
        monthlyData[monthIndex] = parseNumber(row[colIndex]);
      }

      const sumMonthly = monthlyData.reduce((acc, val) => acc + val, 0);
      const totalValue = totalColumn >= 0 ? parseNumber(row[totalColumn]) : 0;
      const yearlyEstimate = totalValue > 0 || sumMonthly === 0 ? totalValue : sumMonthly;

      processedData.set(normalizeName(name), {
        name,
        monthlyEstimate: monthlyData[currentMonth] || 0,
        yearlyEstimate,
        monthlyData
      });
    }

    return processedData;
  }

  async function fetchEstimatesForYear(year: number): Promise<Map<string, EstimateData>> {
    const sheets = await connect();
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });

    const candidates = [
      `Estimates Submitted ${year}`,
      `Estimates ${year}`,
      `${year} Estimates`,
      `${year} Estimates Submitted`
    ];

    let sheetTitle = pickSheetTitle(sheetInfo as any, candidates);
    if (!sheetTitle) {
      sheetTitle =
        sheetInfo.data.sheets
          ?.map(sheet => sheet.properties?.title)
          .filter(Boolean)
          .find(title => {
            if (!title) return false;
            const lower = title.toLowerCase();
            if (!lower.includes('estimate')) return false;
            const titleYear = extractYearFromTitle(title);
            if (titleYear) {
              return titleYear === year;
            }
            return !titleYear;
          }) || null;
    }

    if (!sheetTitle) {
      return new Map();
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z`
    });

    const rows = response.data.values || [];
    return parseEstimateRows(rows);
  }

  async function upsertMonthlyMetrics(rows: Array<{
    salesRepId: number;
    year: number;
    month: number;
    signups: number;
    estimates: number;
    revenue: number;
  }>): Promise<void> {
    if (rows.length === 0) return;

    // Validate and filter rows to prevent integer overflow errors
    const validRows = rows.filter(row => {
      const isValid = Number.isInteger(row.salesRepId) &&
                      Number.isInteger(row.year) &&
                      Number.isInteger(row.month) &&
                      row.year >= 2000 && row.year <= 2100 &&
                      row.month >= 1 && row.month <= 12;
      if (!isValid) {
        console.warn('[SHEETS] Invalid monthly metrics row skipped:', {
          salesRepId: row.salesRepId,
          year: row.year,
          month: row.month,
          signups: row.signups
        });
      }
      return isValid;
    });

    if (validRows.length === 0) return;

    const values: Array<string | number> = [];
    const placeholders = validRows.map((row, index) => {
      const baseIndex = index * 6;
      values.push(row.salesRepId, row.year, row.month, row.signups, row.estimates, row.revenue);
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`;
    });

    const query = `
      INSERT INTO sales_rep_monthly_metrics (
        sales_rep_id, year, month, signups, estimates, revenue
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (sales_rep_id, year, month) DO UPDATE
      SET signups = EXCLUDED.signups,
          estimates = EXCLUDED.estimates,
          revenue = EXCLUDED.revenue,
          updated_at = NOW()
    `;

    await pool.query(query, values);
  }

  async function upsertYearlyMetrics(rows: Array<{
    salesRepId: number;
    year: number;
    signups: number;
    estimates: number;
    revenue: number;
  }>): Promise<void> {
    if (rows.length === 0) return;

    // Validate and filter rows to prevent integer overflow errors
    const validRows = rows.filter(row => {
      const isValid = Number.isInteger(row.salesRepId) &&
                      Number.isInteger(row.year) &&
                      row.year >= 2000 && row.year <= 2100;
      if (!isValid) {
        console.warn('[SHEETS] Invalid yearly metrics row skipped:', {
          salesRepId: row.salesRepId,
          year: row.year,
          signups: row.signups
        });
      }
      return isValid;
    });

    if (validRows.length === 0) return;

    const values: Array<string | number> = [];
    const placeholders = validRows.map((row, index) => {
      const baseIndex = index * 5;
      values.push(row.salesRepId, row.year, row.signups, row.estimates, row.revenue);
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`;
    });

    const query = `
      INSERT INTO sales_rep_yearly_metrics (
        sales_rep_id, year, signups, estimates, revenue
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (sales_rep_id, year) DO UPDATE
      SET signups = EXCLUDED.signups,
          estimates = EXCLUDED.estimates,
          revenue = EXCLUDED.revenue,
          updated_at = NOW()
    `;

    await pool.query(query, values);
  }


  async function performFullSync(): Promise<SyncResult> {
    const startedAt = new Date();
    let syncLogId: number | null = null;

    try {
      try {
        const logResult = await pool.query(
          `INSERT INTO sheets_sync_log (sync_type, started_at)
           VALUES ($1, $2)
           RETURNING id`,
          ['full', startedAt]
        );
        syncLogId = logResult.rows[0]?.id ?? null;
      } catch (logError) {
        console.warn('[SHEETS] Unable to record sync start:', (logError as Error).message);
      }

      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;

      const [
        currentSignups,
        previousSignups,
        currentEstimates,
        previousEstimates,
        allTimeRevenue,
        revenue2025,
        revenue2026
      ] = await Promise.all([
        fetchSignupsForYear(currentYear, true),
        fetchSignupsForYear(previousYear, false),
        fetchEstimatesForYear(currentYear),
        fetchEstimatesForYear(previousYear),
        fetchAllTimeRevenue(),
        fetchYearlyRevenue(2025),
        fetchYearlyRevenue(2026)
      ]);

      const primaryYear = currentSignups.size > 0 ? currentYear : previousYear;
      const primarySignups = currentSignups.size > 0 ? currentSignups : previousSignups;
      const primaryEstimates = primaryYear === currentYear ? currentEstimates : previousEstimates;

      if (primarySignups.size === 0) {
        throw new Error('No signup data returned from Google Sheets');
      }

      const signupsByYear = new Map<number, Map<string, SignupData>>([
        [currentYear, currentSignups],
        [previousYear, previousSignups]
      ]);

      const estimatesByYear = new Map<number, Map<string, EstimateData>>([
        [currentYear, currentEstimates],
        [previousYear, previousEstimates]
      ]);

      const revenueByYear = new Map<number, Map<string, number>>([
        [2025, revenue2025],
        [2026, revenue2026]
      ]);

      const combinedData: Map<string, CombinedRepData> = new Map();

      for (const [nameLower, data] of primarySignups.entries()) {
        combinedData.set(nameLower, {
          name: data.name,
          monthlySignups: data.monthlySignups,
          yearlySignups: data.yearlySignups,
          revenue2025: 0,
          revenue2026: 0,
          yearlyRevenue: 0,
          allTimeRevenue: 0,
          monthlyRevenue: 0,
          yearlyEstimate: 0
        });
      }

      for (const [nameLower, revenue] of allTimeRevenue.entries()) {
        const existing = combinedData.get(nameLower);
        if (existing) {
          existing.allTimeRevenue = revenue;
        } else {
          combinedData.set(nameLower, {
            name: toDisplayName(nameLower),
            monthlySignups: 0,
            yearlySignups: 0,
            revenue2025: 0,
            revenue2026: 0,
            yearlyRevenue: 0,
            allTimeRevenue: revenue,
            monthlyRevenue: 0,
            yearlyEstimate: 0
          });
        }
      }

      for (const [nameLower, revenue] of revenue2025.entries()) {
        const existing = combinedData.get(nameLower);
        if (existing) {
          existing.revenue2025 = revenue;
        } else {
          combinedData.set(nameLower, {
            name: toDisplayName(nameLower),
            monthlySignups: 0,
            yearlySignups: 0,
            revenue2025: revenue,
            revenue2026: 0,
            yearlyRevenue: 0,
            allTimeRevenue: 0,
            monthlyRevenue: 0,
            yearlyEstimate: 0
          });
        }
      }

      for (const [nameLower, revenue] of revenue2026.entries()) {
        const existing = combinedData.get(nameLower);
        if (existing) {
          existing.revenue2026 = revenue;
        } else {
          combinedData.set(nameLower, {
            name: toDisplayName(nameLower),
            monthlySignups: 0,
            yearlySignups: 0,
            revenue2025: 0,
            revenue2026: revenue,
            yearlyRevenue: 0,
            allTimeRevenue: 0,
            monthlyRevenue: 0,
            yearlyEstimate: 0
          });
        }
      }

      const hasEstimates = primaryEstimates.size > 0;

      for (const [nameLower, estimate] of primaryEstimates.entries()) {
        const existing = combinedData.get(nameLower);
        if (existing) {
          existing.monthlyRevenue = estimate.monthlyEstimate;
          existing.yearlyEstimate = estimate.yearlyEstimate;
        } else {
          combinedData.set(nameLower, {
            name: estimate.name,
            monthlySignups: 0,
            yearlySignups: 0,
            revenue2025: 0,
            revenue2026: 0,
            yearlyRevenue: 0,
            allTimeRevenue: 0,
            monthlyRevenue: estimate.monthlyEstimate,
            yearlyEstimate: estimate.yearlyEstimate
          });
        }
      }

      for (const data of combinedData.values()) {
        if (primaryYear === 2025) {
          data.yearlyRevenue = data.revenue2025;
        } else if (primaryYear === 2026) {
          data.yearlyRevenue = data.revenue2026;
        } else {
          data.yearlyRevenue = 0;
        }

        if (data.yearlyRevenue === 0 && data.yearlyEstimate > 0) {
          data.yearlyRevenue = data.yearlyEstimate;
        }
      }

      const existingRepsResult = await pool.query(
        `SELECT id, name, email, monthly_signup_goal
         FROM sales_reps`
      );

      const existingByName = new Map<string, any>();
      const existingByEmail = new Map<string, any>();
      const repIdByName = new Map<string, number>();

      for (const rep of existingRepsResult.rows) {
        if (rep.name) {
          const nameKey = normalizeName(rep.name);
          existingByName.set(nameKey, rep);
          repIdByName.set(nameKey, rep.id);
        }
        if (rep.email) {
          existingByEmail.set(rep.email.toLowerCase(), rep);
        }
      }

      const sheetNames = new Set<string>();
      const sheetEmails = new Set<string>();

      let created = 0;
      let updated = 0;

      for (const [nameLower, data] of combinedData.entries()) {
        sheetNames.add(nameLower);

        const generatedEmail = `${nameLower.replace(/\s+/g, '.')}@theroofdocs.com`;
        sheetEmails.add(generatedEmail);

        const existing = existingByName.get(nameLower) || existingByEmail.get(generatedEmail);
        const monthlyGoal = existing?.monthly_signup_goal ?? 15;
        const goalProgress = monthlyGoal > 0 ? (data.monthlySignups / monthlyGoal) * 100 : 0;
        const bonusTier = calculateBonusTier(data.monthlySignups);

        if (existing) {
          await pool.query(
            `UPDATE sales_reps
             SET name = $1,
                 email = $2,
                 monthly_signups = $3,
                 yearly_signups = $4,
                 monthly_revenue = COALESCE($5, monthly_revenue),
                 yearly_revenue = $6,
                 revenue_2025 = $7,
                 revenue_2026 = $8,
                 all_time_revenue = CASE WHEN $9 > 0 THEN $9 ELSE all_time_revenue END,
                 goal_progress = $10,
                 current_bonus_tier = $11,
                 is_active = true,
                 updated_at = NOW()
             WHERE id = $12`,
            [
              data.name,
              generatedEmail,
              data.monthlySignups,
              data.yearlySignups,
              hasEstimates ? data.monthlyRevenue : null,
              data.yearlyRevenue,
              data.revenue2025,
              data.revenue2026,
              data.allTimeRevenue,
              goalProgress,
              bonusTier,
              existing.id
            ]
          );
          updated += 1;
          repIdByName.set(nameLower, existing.id);
        } else {
          const insertResult = await pool.query(
            `INSERT INTO sales_reps (
              name, email, team, title, avatar,
              monthly_revenue, yearly_revenue, revenue_2025, revenue_2026,
              all_time_revenue, monthly_signups, yearly_signups,
              goal_progress, monthly_signup_goal, yearly_signup_goal,
              current_bonus_tier, is_active
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9,
              $10, $11, $12,
              $13, $14, $15,
              $16, $17
            )
            RETURNING id`,
            [
              data.name,
              generatedEmail,
              'Unassigned',
              'Sales Representative',
              null,
              hasEstimates ? data.monthlyRevenue : 0,
              data.yearlyRevenue,
              data.revenue2025,
              data.revenue2026,
              data.allTimeRevenue,
              data.monthlySignups,
              data.yearlySignups,
              goalProgress,
              monthlyGoal,
              180,
              bonusTier,
              true
            ]
          );
          created += 1;

          const newId = insertResult.rows[0]?.id;
          if (newId) {
            repIdByName.set(nameLower, newId);
            await pool.query(
              `INSERT INTO player_profiles (sales_rep_id, display_alias)
               VALUES ($1, $2)
               ON CONFLICT (sales_rep_id) DO NOTHING`,
              [newId, data.name]
            );
          }
        }
      }

      try {
        const yearsToSync = new Set<number>();
        for (const [year, map] of signupsByYear.entries()) {
          if (map.size > 0) yearsToSync.add(year);
        }
        for (const [year, map] of estimatesByYear.entries()) {
          if (map.size > 0) yearsToSync.add(year);
        }
        if (revenue2025.size > 0) yearsToSync.add(2025);
        if (revenue2026.size > 0) yearsToSync.add(2026);

        const monthlyRows: Array<{
          salesRepId: number;
          year: number;
          month: number;
          signups: number;
          estimates: number;
          revenue: number;
        }> = [];
        const yearlyRows: Array<{
          salesRepId: number;
          year: number;
          signups: number;
          estimates: number;
          revenue: number;
        }> = [];

        for (const year of yearsToSync) {
          const signupsMap = signupsByYear.get(year) || new Map();
          const estimatesMap = estimatesByYear.get(year) || new Map();
          const revenueMap = revenueByYear.get(year) || new Map();

          const nameSet = new Set<string>([
            ...signupsMap.keys(),
            ...estimatesMap.keys(),
            ...revenueMap.keys()
          ]);

          for (const nameLower of nameSet) {
            const repId = repIdByName.get(nameLower);
            if (!repId) continue;

            const signupData = signupsMap.get(nameLower);
            const estimateData = estimatesMap.get(nameLower);
            const revenue = revenueMap.get(nameLower) ?? 0;

            yearlyRows.push({
              salesRepId: repId,
              year,
              signups: signupData?.yearlySignups ?? 0,
              estimates: estimateData?.yearlyEstimate ?? 0,
              revenue
            });

            const signupMonths = signupData?.monthlyData || [];
            const estimateMonths = estimateData?.monthlyData || [];

            for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
              const signupsValue = signupMonths[monthIndex] ?? 0;
              const estimatesValue = estimateMonths[monthIndex] ?? 0;
              const revenueValue = estimatesValue;

              if (signupsValue === 0 && estimatesValue === 0) {
                continue;
              }

              monthlyRows.push({
                salesRepId: repId,
                year,
                month: monthIndex + 1,
                signups: signupsValue,
                estimates: estimatesValue,
                revenue: revenueValue
              });
            }
          }
        }

        await upsertYearlyMetrics(yearlyRows);
        await upsertMonthlyMetrics(monthlyRows);
      } catch (metricsError) {
        console.warn('[SHEETS] Failed to update time-series metrics:', (metricsError as Error).message);
      }

      let deactivated = 0;
      for (const rep of existingRepsResult.rows) {
        const nameLower = rep.name ? normalizeName(rep.name) : '';
        const emailLower = rep.email ? rep.email.toLowerCase() : '';

        if (nameLower && sheetNames.has(nameLower)) continue;
        if (emailLower && sheetEmails.has(emailLower)) continue;

        const result = await pool.query(
          `UPDATE sales_reps
           SET is_active = false, updated_at = NOW()
           WHERE id = $1 AND is_active = true`,
          [rep.id]
        );
        if (result.rowCount > 0) {
          deactivated += 1;
        }
      }

      const synced = created + updated;
      const total = combinedData.size;

      if (syncLogId) {
        await pool.query(
          `UPDATE sheets_sync_log
           SET records_synced = $1,
               records_created = $2,
               records_updated = $3,
               records_deleted = $4,
               completed_at = NOW()
           WHERE id = $5`,
          [synced, created, updated, deactivated, syncLogId]
        );
      }

      return {
        success: true,
        total,
        synced,
        created,
        updated,
        deactivated,
        message: `Synced ${synced} of ${total} reps`
      };
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown sync error';
      console.error('[SHEETS] Sync failed:', errorMessage);

      if (syncLogId) {
        try {
          await pool.query(
            `UPDATE sheets_sync_log
             SET error_message = $1,
                 completed_at = NOW()
             WHERE id = $2`,
            [errorMessage, syncLogId]
          );
        } catch (logError) {
          console.warn('[SHEETS] Failed to update sync log after error:', (logError as Error).message);
        }
      }

      return {
        success: false,
        total: 0,
        synced: 0,
        created: 0,
        updated: 0,
        deactivated: 0,
        error: errorMessage,
        message: 'Google Sheets sync failed'
      };
    }
  }

  return {
    connect,
    fetchSignups,
    fetchAllTimeRevenue,
    fetchYearlyRevenue,
    performFullSync,
    calculateBonusTier
  };
}

export type SheetsService = ReturnType<typeof createSheetsService>;
