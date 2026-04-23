/**
 * IEM Local Storm Reports live ingest
 *
 * Runs every 30 minutes. Fetches the last 6 hours of NWS Local Storm Reports
 * for VA/MD/PA from Iowa Environmental Mesonet. Fills NCEI's 60-day publication lag.
 *
 * Feature flag: IEM_LSR_LIVE_ENABLED (default: false)
 */

import { Pool } from 'pg';
import { VerifiedEventsService, SourceName } from './verifiedEventsService.js';

const IEM_LSR_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py';

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') {}
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

const HAIL_TYPES = new Set(['H']);
const WIND_TYPES = new Set(['W', 'G', 'M', 'C']);
const TORNADO_TYPES = new Set(['T']);

export class IemLsrLiveService {
  private svc: VerifiedEventsService;
  private enabled: boolean;
  private states: string[];

  constructor(pool: Pool) {
    this.svc = new VerifiedEventsService(pool);
    this.enabled = process.env.IEM_LSR_LIVE_ENABLED === 'true';
    this.states = (process.env.IEM_LSR_STATES || 'VA,MD,PA').split(',').map((s) => s.trim());
  }

  /**
   * Fetch the last N hours of LSRs. Default 6h covers cron 30-min gaps with overlap.
   */
  async ingestRecent(hoursBack = 6): Promise<{ fetched: number; inserted: number; updated: number; errors: number }> {
    if (!this.enabled) {
      console.log('[iem-lsr-live] IEM_LSR_LIVE_ENABLED=false — skipping');
      return { fetched: 0, inserted: 0, updated: 0, errors: 0 };
    }

    const end = new Date();
    const start = new Date(end);
    start.setUTCHours(start.getUTCHours() - hoursBack);

    const sts = start.toISOString().replace(/\.\d{3}Z$/, 'Z').slice(0, 16).replace(':', '') + 'Z';
    const ets = end.toISOString().replace(/\.\d{3}Z$/, 'Z').slice(0, 16).replace(':', '') + 'Z';
    // IEM expects YYYY-MM-DDTHH:MMZ format. Let me simplify:
    const stsF = `${start.toISOString().slice(0, 16)}Z`.replace(':', '').replace(/[-]/g, '');
    // Actually IEM accepts ISO-ish:  YYYY-MM-DDTHH:MM
    const stsIso = start.toISOString().slice(0, 16) + 'Z';
    const etsIso = end.toISOString().slice(0, 16) + 'Z';

    try {
      const url = `${IEM_LSR_URL}?sts=${encodeURIComponent(stsIso)}&ets=${encodeURIComponent(etsIso)}&states=${this.states.join(',')}&fmt=csv`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-live/1.0' } });
      if (!resp.ok) {
        console.warn(`[iem-lsr-live] HTTP ${resp.status}`);
        return { fetched: 0, inserted: 0, updated: 0, errors: 1 };
      }
      const text = await resp.text();
      const rows = parseCsv(text);

      const relevant = rows.filter((r) => {
        const t = (r.TYPECODE || r.typecode || '').toUpperCase();
        return HAIL_TYPES.has(t) || WIND_TYPES.has(t) || TORNADO_TYPES.has(t);
      });

      const batch = [];
      for (const r of relevant) {
        const lat = parseFloat(r.LAT || r.lat || '');
        const lng = parseFloat(r.LON || r.lon || '');
        if (isNaN(lat) || isNaN(lng)) continue;

        const t = (r.TYPECODE || r.typecode || '').toUpperCase();
        const mag = parseFloat(r.MAGNITUDE || r.magnitude || '');
        const state = (r.STATE || r.state || '').toUpperCase().slice(0, 2);

        let hail: number | null = null;
        let wind: number | null = null;
        let tornadoEf: number | null = null;

        if (HAIL_TYPES.has(t) && !isNaN(mag)) hail = mag;
        else if (WIND_TYPES.has(t) && !isNaN(mag)) wind = Math.round(mag);
        else if (TORNADO_TYPES.has(t)) {
          const remark = (r.REMARK || r.remark || '').toUpperCase();
          const m = remark.match(/EF([0-5])/);
          tornadoEf = m ? parseInt(m[1], 10) : null;
        }

        if (hail == null && wind == null && tornadoEf == null) continue;

        const validTime = r.VALID || r.valid;
        if (!validTime) continue;
        let iso: string;
        if (/^\d{12}$/.test(validTime)) {
          iso = `${validTime.slice(0,4)}-${validTime.slice(4,6)}-${validTime.slice(6,8)}T${validTime.slice(8,10)}:${validTime.slice(10,12)}:00Z`;
        } else {
          const d = new Date(validTime);
          if (isNaN(d.getTime())) continue;
          iso = d.toISOString();
        }

        batch.push({
          eventDate: iso,
          latitude: lat,
          longitude: lng,
          state,
          hailSizeInches: hail,
          windMph: wind,
          tornadoEfRank: tornadoEf,
          source: 'iem_lsr' as SourceName,
          sourcePayload: {
            typecode: t,
            typetext: r.TYPETEXT || r.typetext,
            source: r.SOURCE || r.source,
            city: r.CITY || r.city,
            county: r.COUNTY || r.county,
            remark: (r.REMARK || r.remark || '').slice(0, 500),
            wfo: r.WFO || r.wfo,
            valid: validTime,
            ingested_via: 'live-30min',
          },
        });
      }

      if (batch.length === 0) {
        return { fetched: rows.length, inserted: 0, updated: 0, errors: 0 };
      }

      const res = await this.svc.upsertBatch(batch);
      if (res.inserted > 0 || res.errors.length > 0) {
        console.log(`[iem-lsr-live] ${this.states.join(',')} last ${hoursBack}h: +${res.inserted} new, +${res.updated} upd, ${res.errors.length} errors (from ${rows.length} rows, ${relevant.length} relevant)`);
      }
      return {
        fetched: rows.length,
        inserted: res.inserted,
        updated: res.updated,
        errors: res.errors.length,
      };
    } catch (err: any) {
      console.error('[iem-lsr-live] error:', err.message);
      return { fetched: 0, inserted: 0, updated: 0, errors: 1 };
    }
  }

  /**
   * Historical backfill — IEM accepts arbitrary start/end windows. We chunk
   * by 7-day windows to keep response sizes manageable, since a single DMV
   * LSR query over months can return large CSVs.
   */
  async ingestHistorical(
    monthsBack: number,
    opts: { forceEnabled?: boolean; chunkDays?: number } = {},
  ): Promise<{ fetched: number; inserted: number; updated: number; errors: number; chunks: number }> {
    if (!this.enabled && !opts.forceEnabled) {
      console.log('[iem-lsr-live] ingestHistorical — disabled via env (override with forceEnabled=true)');
      return { fetched: 0, inserted: 0, updated: 0, errors: 0, chunks: 0 };
    }
    const chunkDays = opts.chunkDays ?? 7;
    const totalDays = Math.ceil(monthsBack * 30.5);
    const now = new Date();
    let fetched = 0, inserted = 0, updated = 0, errors = 0, chunks = 0;
    console.log(`[iem-lsr-live] historical backfill — ${totalDays} days, ${chunkDays}-day chunks, states=${this.states.join(',')}`);

    for (let offset = 0; offset < totalDays; offset += chunkDays) {
      const end = new Date(now);
      end.setUTCDate(end.getUTCDate() - offset);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - chunkDays);
      const stsIso = start.toISOString().slice(0, 16) + 'Z';
      const etsIso = end.toISOString().slice(0, 16) + 'Z';

      try {
        const url = `${IEM_LSR_URL}?sts=${encodeURIComponent(stsIso)}&ets=${encodeURIComponent(etsIso)}&states=${this.states.join(',')}&fmt=csv`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-live/1.0' } });
        if (!resp.ok) { errors++; continue; }
        const text = await resp.text();
        const rows = parseCsv(text);
        fetched += rows.length;
        const relevant = rows.filter((r) => {
          const t = (r.TYPECODE || r.typecode || '').toUpperCase();
          return HAIL_TYPES.has(t) || WIND_TYPES.has(t) || TORNADO_TYPES.has(t);
        });
        const batch: any[] = [];
        for (const r of relevant) {
          const lat = parseFloat(r.LAT || r.lat || '');
          const lng = parseFloat(r.LON || r.lon || '');
          if (isNaN(lat) || isNaN(lng)) continue;
          const t = (r.TYPECODE || r.typecode || '').toUpperCase();
          const mag = parseFloat(r.MAGNITUDE || r.magnitude || '');
          const state = (r.STATE || r.state || '').toUpperCase().slice(0, 2);
          let hail: number | null = null;
          let wind: number | null = null;
          let tornadoEf: number | null = null;
          if (HAIL_TYPES.has(t) && !isNaN(mag)) hail = mag;
          else if (WIND_TYPES.has(t) && !isNaN(mag)) wind = Math.round(mag);
          else if (TORNADO_TYPES.has(t)) {
            const remark = (r.REMARK || r.remark || '').toUpperCase();
            const m = remark.match(/EF([0-5])/);
            tornadoEf = m ? parseInt(m[1], 10) : null;
          }
          if (hail == null && wind == null && tornadoEf == null) continue;
          const validTime = r.VALID || r.valid;
          if (!validTime) continue;
          let iso: string;
          if (/^\d{12}$/.test(validTime)) {
            iso = `${validTime.slice(0,4)}-${validTime.slice(4,6)}-${validTime.slice(6,8)}T${validTime.slice(8,10)}:${validTime.slice(10,12)}:00Z`;
          } else {
            const d = new Date(validTime);
            if (isNaN(d.getTime())) continue;
            iso = d.toISOString();
          }
          batch.push({
            eventDate: iso, latitude: lat, longitude: lng, state,
            hailSizeInches: hail, windMph: wind, tornadoEfRank: tornadoEf,
            source: 'iem_lsr' as SourceName,
            sourcePayload: {
              typecode: t, typetext: r.TYPETEXT || r.typetext, source: r.SOURCE || r.source,
              city: r.CITY || r.city, county: r.COUNTY || r.county,
              remark: (r.REMARK || r.remark || '').slice(0, 500),
              wfo: r.WFO || r.wfo, valid: validTime, ingested_via: 'historical-backfill',
            },
          });
        }
        if (batch.length > 0) {
          const res = await this.svc.upsertBatch(batch);
          inserted += res.inserted;
          updated += res.updated;
          errors += res.errors.length;
        }
        chunks++;
        if (chunks % 5 === 0) {
          console.log(`[iem-lsr-live] backfill progress — chunk ${chunks}, +${inserted} new, +${updated} upd`);
        }
      } catch (err: any) {
        errors++;
        console.warn(`[iem-lsr-live] backfill err ${stsIso}-${etsIso}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`[iem-lsr-live] backfill done — ${chunks} chunks, +${inserted} new, +${updated} upd`);
    return { fetched, inserted, updated, errors, chunks };
  }
}
