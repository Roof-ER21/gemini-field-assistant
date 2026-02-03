import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { HailEvent } from './hailMapsService.js';

/**
 * HailTrace JSON format structure
 */
interface HailTraceEvent {
  id: string;
  date: string;
  types: string[];
  hailSize?: number;
  hailSizeAlgorithm?: number;
  hailSizeMeteo?: number;
  windSpeed?: number;
  windStarLevel?: number;
  latitude?: number;
  longitude?: number;
  [key: string]: any; // Allow additional properties
}

interface HailTraceExport {
  events: HailTraceEvent[];
  metadata?: {
    exportDate?: string;
    source?: string;
    version?: string;
    [key: string]: any;
  };
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: string[];
  filename: string;
}

interface HailTraceStatus {
  watching: boolean;
  exportDirectory: string;
  totalImported: number;
  lastImportDate: string | null;
  pendingFiles: string[];
}

/**
 * HailTrace Import Service
 *
 * Watches for JSON exports from HailTrace automation and imports them
 * into the database. Handles deduplication against existing IHM and NOAA events.
 *
 * CRITICAL: All dates are converted to Eastern timezone (America/New_York)
 */
class HailTraceImportService {
  private pool: Pool | null = null;
  private watchInterval: NodeJS.Timeout | null = null;
  private exportDirectory: string;
  private watching = false;
  private processedFiles = new Set<string>();

  constructor() {
    this.exportDirectory = path.resolve(
      process.env.HAILTRACE_EXPORT_DIR ||
      '/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports'
    );
  }

  /**
   * Initialize the service with database pool
   */
  initialize(pool: Pool): void {
    this.pool = pool;
    console.log('[HailTrace] Service initialized with database pool');
  }

  /**
   * Normalize date to Eastern timezone (America/New_York)
   * CRITICAL: This ensures consistency with IHM and NOAA event dates
   */
  private normalizeToEastern(dateStr: string): string {
    if (!dateStr) return '';

    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        // Convert to Eastern timezone - en-CA locale gives YYYY-MM-DD format
        return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  /**
   * Convert HailTrace event to standard HailEvent format
   */
  private convertToHailEvent(htEvent: HailTraceEvent): HailEvent {
    // Use the best available hail size (prioritize meteorologist > algorithm > general)
    const hailSize = htEvent.hailSizeMeteo ?? htEvent.hailSizeAlgorithm ?? htEvent.hailSize ?? null;

    // Infer severity from hail size
    let severity: HailEvent['severity'] = 'minor';
    if (hailSize !== null) {
      if (hailSize >= 2) severity = 'severe';
      else if (hailSize >= 1) severity = 'moderate';
    }

    return {
      id: `hailtrace-${htEvent.id}`,
      date: this.normalizeToEastern(htEvent.date),
      latitude: htEvent.latitude || 0,
      longitude: htEvent.longitude || 0,
      hailSize,
      windSpeed: htEvent.windSpeed || null,
      severity,
      source: 'HailTrace',
      raw: htEvent
    };
  }

  /**
   * Check if event is duplicate of existing IHM or NOAA event
   * Matches on date (Eastern timezone) and approximate hail size
   */
  private async isDuplicate(event: HailTraceEvent): Promise<boolean> {
    if (!this.pool) return false;

    const normalizedDate = this.normalizeToEastern(event.date);
    const hailSize = event.hailSizeMeteo ?? event.hailSizeAlgorithm ?? event.hailSize;

    try {
      // Check against existing hailtrace_events
      const htCheck = await this.pool.query(
        `SELECT 1 FROM hailtrace_events
         WHERE event_id = $1 AND deleted_at IS NULL
         LIMIT 1`,
        [event.id]
      );

      if (htCheck.rowCount && htCheck.rowCount > 0) {
        return true;
      }

      // Check if similar event exists based on date and hail size
      // (This helps deduplicate against IHM/NOAA if they have the same storm)
      if (hailSize !== null && hailSize !== undefined) {
        const similarCheck = await this.pool.query(
          `SELECT 1 FROM hailtrace_events
           WHERE event_date = $1
           AND ABS(hail_size - $2) < 0.5
           AND deleted_at IS NULL
           LIMIT 1`,
          [normalizedDate, hailSize]
        );

        if (similarCheck.rowCount && similarCheck.rowCount > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[HailTrace] Duplicate check error:', error);
      return false; // Don't skip on error, let the unique constraint handle it
    }
  }

  /**
   * Import a single HailTrace event into the database
   */
  private async importEvent(event: HailTraceEvent, sourceFile: string): Promise<boolean> {
    if (!this.pool) {
      throw new Error('Service not initialized with database pool');
    }

    const normalizedDate = this.normalizeToEastern(event.date);

    try {
      await this.pool.query(
        `INSERT INTO hailtrace_events (
          event_id, event_date, types, hail_size, hail_size_algorithm,
          hail_size_meteo, wind_speed, wind_star_level, latitude, longitude,
          source_file, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (event_id) DO NOTHING`,
        [
          event.id,
          normalizedDate,
          JSON.stringify(event.types || []),
          event.hailSize || null,
          event.hailSizeAlgorithm || null,
          event.hailSizeMeteo || null,
          event.windSpeed || null,
          event.windStarLevel || null,
          event.latitude || null,
          event.longitude || null,
          sourceFile,
          JSON.stringify(event)
        ]
      );

      return true;
    } catch (error) {
      console.error('[HailTrace] Import event error:', error);
      return false;
    }
  }

  /**
   * Import events from a HailTrace JSON file
   */
  async importFromFile(filepath: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: 0,
      skipped: 0,
      duplicates: 0,
      errors: [],
      filename: path.basename(filepath)
    };

    if (!this.pool) {
      result.errors.push('Service not initialized with database pool');
      return result;
    }

    try {
      // Read and parse JSON file
      const fileContent = fs.readFileSync(filepath, 'utf-8');
      const data: HailTraceExport = JSON.parse(fileContent);

      if (!data.events || !Array.isArray(data.events)) {
        result.errors.push('Invalid HailTrace format: missing or invalid events array');
        return result;
      }

      console.log(`[HailTrace] Processing ${data.events.length} events from ${result.filename}`);

      // Process each event
      for (const event of data.events) {
        // Validate event has required fields
        if (!event.id || !event.date) {
          result.skipped++;
          result.errors.push(`Event missing required fields (id or date): ${JSON.stringify(event)}`);
          continue;
        }

        // Check for duplicates
        const isDup = await this.isDuplicate(event);
        if (isDup) {
          result.duplicates++;
          continue;
        }

        // Import the event
        const imported = await this.importEvent(event, result.filename);
        if (imported) {
          result.imported++;
        } else {
          result.skipped++;
        }
      }

      result.success = true;
      console.log(`[HailTrace] Import complete: ${result.imported} imported, ${result.duplicates} duplicates, ${result.skipped} skipped`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to process file: ${errorMsg}`);
      console.error('[HailTrace] Import error:', error);
    }

    return result;
  }

  /**
   * Scan export directory for new JSON files and import them
   */
  private async scanAndImport(): Promise<void> {
    if (!this.pool) return;

    try {
      // Ensure directory exists
      if (!fs.existsSync(this.exportDirectory)) {
        console.log(`[HailTrace] Export directory not found: ${this.exportDirectory}`);
        return;
      }

      // Read directory
      const files = fs.readdirSync(this.exportDirectory);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filepath = path.join(this.exportDirectory, file);

        // Skip if already processed in this session
        if (this.processedFiles.has(filepath)) {
          continue;
        }

        console.log(`[HailTrace] Found new file: ${file}`);

        // Import the file
        const result = await this.importFromFile(filepath);

        if (result.success) {
          this.processedFiles.add(filepath);
          console.log(`[HailTrace] Successfully processed ${file}: ${result.imported} events imported`);

          // Optionally move processed file to archive subdirectory
          const archiveDir = path.join(this.exportDirectory, 'processed');
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }

          const archivePath = path.join(archiveDir, file);
          fs.renameSync(filepath, archivePath);
          console.log(`[HailTrace] Moved ${file} to processed/`);
        } else {
          console.error(`[HailTrace] Failed to process ${file}:`, result.errors);
        }
      }
    } catch (error) {
      console.error('[HailTrace] Scan and import error:', error);
    }
  }

  /**
   * Start watching the export directory for new files
   */
  startWatching(intervalMs = 60000): void {
    if (this.watching) {
      console.log('[HailTrace] Already watching for files');
      return;
    }

    if (!this.pool) {
      console.error('[HailTrace] Cannot start watching: service not initialized');
      return;
    }

    console.log(`[HailTrace] Starting file watcher (checking every ${intervalMs}ms)`);
    console.log(`[HailTrace] Watching directory: ${this.exportDirectory}`);

    this.watching = true;

    // Initial scan
    this.scanAndImport();

    // Set up periodic scanning
    this.watchInterval = setInterval(() => {
      this.scanAndImport();
    }, intervalMs);
  }

  /**
   * Stop watching the export directory
   */
  stopWatching(): void {
    if (!this.watching) {
      console.log('[HailTrace] Not currently watching');
      return;
    }

    console.log('[HailTrace] Stopping file watcher');

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    this.watching = false;
  }

  /**
   * Get current status of HailTrace integration
   */
  async getStatus(): Promise<HailTraceStatus> {
    const status: HailTraceStatus = {
      watching: this.watching,
      exportDirectory: this.exportDirectory,
      totalImported: 0,
      lastImportDate: null,
      pendingFiles: []
    };

    if (!this.pool) {
      return status;
    }

    try {
      // Get total imported count
      const countResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM hailtrace_events WHERE deleted_at IS NULL`
      );
      status.totalImported = parseInt(countResult.rows[0]?.count || '0', 10);

      // Get last import date
      const lastImportResult = await this.pool.query(
        `SELECT MAX(imported_at) as last_import FROM hailtrace_events`
      );
      status.lastImportDate = lastImportResult.rows[0]?.last_import || null;

      // Check for pending files
      if (fs.existsSync(this.exportDirectory)) {
        const files = fs.readdirSync(this.exportDirectory);
        status.pendingFiles = files.filter(f =>
          f.endsWith('.json') && !this.processedFiles.has(path.join(this.exportDirectory, f))
        );
      }

    } catch (error) {
      console.error('[HailTrace] Status check error:', error);
    }

    return status;
  }

  /**
   * Get HailTrace events for a specific date range
   */
  async getEvents(params: {
    startDate?: string;
    endDate?: string;
    minHailSize?: number;
    limit?: number;
  }): Promise<HailEvent[]> {
    if (!this.pool) {
      return [];
    }

    const { startDate, endDate, minHailSize, limit = 100 } = params;

    try {
      let query = `
        SELECT * FROM hailtrace_events
        WHERE deleted_at IS NULL
      `;
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        query += ` AND event_date >= $${paramIndex++}`;
        queryParams.push(startDate);
      }

      if (endDate) {
        query += ` AND event_date <= $${paramIndex++}`;
        queryParams.push(endDate);
      }

      if (minHailSize !== undefined) {
        query += ` AND hail_size >= $${paramIndex++}`;
        queryParams.push(minHailSize);
      }

      query += ` ORDER BY event_date DESC LIMIT $${paramIndex}`;
      queryParams.push(limit);

      const result = await this.pool.query(query, queryParams);

      // Convert database records to HailEvent format
      return result.rows.map(row => ({
        id: `hailtrace-${row.event_id}`,
        date: row.event_date,
        latitude: row.latitude || 0,
        longitude: row.longitude || 0,
        hailSize: row.hail_size,
        windSpeed: row.wind_speed,
        severity: this.inferSeverity(row.hail_size),
        source: 'HailTrace',
        raw: row.raw_data
      }));

    } catch (error) {
      console.error('[HailTrace] Get events error:', error);
      return [];
    }
  }

  /**
   * Infer severity from hail size
   */
  private inferSeverity(hailSize: number | null): HailEvent['severity'] {
    if (!hailSize || Number.isNaN(hailSize)) return 'minor';
    if (hailSize >= 2) return 'severe';
    if (hailSize >= 1) return 'moderate';
    return 'minor';
  }

  /**
   * Get import statistics
   */
  async getImportStats(): Promise<any[]> {
    if (!this.pool) {
      return [];
    }

    try {
      const result = await this.pool.query(`
        SELECT * FROM hailtrace_import_stats
        ORDER BY imported_at DESC
        LIMIT 50
      `);

      return result.rows;
    } catch (error) {
      console.error('[HailTrace] Get import stats error:', error);
      return [];
    }
  }

  /**
   * Manually trigger a scan of the export directory
   */
  async manualScan(): Promise<{ processed: number; pending: number }> {
    await this.scanAndImport();

    const status = await this.getStatus();
    return {
      processed: this.processedFiles.size,
      pending: status.pendingFiles.length
    };
  }
}

export const hailtraceImportService = new HailTraceImportService();
export type { ImportResult, HailTraceStatus, HailTraceEvent, HailTraceExport };
