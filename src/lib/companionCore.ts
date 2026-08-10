/**
 * Rep Companion capture core (vendored).
 * Canonical source: ~/ai4-build/rep-companion/companion-core — keep edits in
 * sync there; this copy is flattened to one browser-only file for sa21.
 *
 * Rules: ring buffers only, nothing leaves the device until the rep presses
 * the button; never record keystroke values; patches always call through and
 * never throw into the host app.
 */

export const ENVELOPE_SCHEMA = 'roofer.companion-report.v1';

export interface ConsoleEntry { level: 'log' | 'info' | 'warn' | 'error' | 'debug'; message: string; ts: number; }
export interface NetworkEntry { method: string; url: string; status: number; durationMs: number; requestId: string | null; ts: number; }
export interface Breadcrumb { kind: 'click' | 'nav' | 'input' | 'custom'; detail: string; ts: number; }

export interface CompanionReport {
  schema: typeof ENVELOPE_SCHEMA;
  reportId: string;
  createdAt: string;
  app: string;
  route: string;
  userId: string | null;
  buildHash: string | null;
  userAgent: string;
  message: string;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  breadcrumbs: Breadcrumb[];
  requestIds: string[];
  screenshot: string | null;
}

export interface CompanionConfig {
  app: string;
  endpoint: string;
  userId?: string | null;
  buildHash?: string | null;
  maxConsole?: number;
  maxNetwork?: number;
  maxBreadcrumbs?: number;
}

const SECRET_PARAMS = /([?&])(token|key|apikey|api_key|auth|password|secret|signature)=[^&#]*/gi;

class RingBuffer<T> {
  private buf: T[] = [];
  constructor(private cap: number) {}
  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.cap) this.buf.shift();
  }
  snapshot(): T[] { return [...this.buf]; }
}

function truncate(s: string, max = 500): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function serializeArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try { return JSON.stringify(a); } catch { return String(a); }
}

export function scrubUrl(url: string): string {
  return url.replace(SECRET_PARAMS, '$1$2=[redacted]');
}

export class Companion {
  private consoleBuf: RingBuffer<ConsoleEntry>;
  private networkBuf: RingBuffer<NetworkEntry>;
  private crumbBuf: RingBuffer<Breadcrumb>;
  private requestIds: string[] = [];
  private restorers: Array<() => void> = [];
  private installed = false;

  constructor(private cfg: CompanionConfig) {
    this.consoleBuf = new RingBuffer(cfg.maxConsole ?? 200);
    this.networkBuf = new RingBuffer(cfg.maxNetwork ?? 50);
    this.crumbBuf = new RingBuffer(cfg.maxBreadcrumbs ?? 50);
  }

  setUser(userId: string | null): void { this.cfg.userId = userId; }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.patchConsole();
    this.patchFetch();
    this.listenBreadcrumbs();
  }

  uninstall(): void {
    for (const r of this.restorers.splice(0)) { try { r(); } catch { /* never throw */ } }
    this.installed = false;
  }

  addBreadcrumb(kind: Breadcrumb['kind'], detail: string): void {
    this.crumbBuf.push({ kind, detail: truncate(detail, 200), ts: Date.now() });
  }

  recordNetwork(entry: Omit<NetworkEntry, 'ts'>): void {
    this.networkBuf.push({ ...entry, url: scrubUrl(entry.url), ts: Date.now() });
    if (entry.requestId) {
      this.requestIds = [entry.requestId, ...this.requestIds.filter((i) => i !== entry.requestId)].slice(0, 25);
    }
  }

  buildReport(message: string, extras: { screenshot?: string | null } = {}): CompanionReport {
    return {
      schema: ENVELOPE_SCHEMA,
      reportId: cryptoRandomId(),
      createdAt: new Date().toISOString(),
      app: this.cfg.app,
      route: typeof location !== 'undefined' ? location.pathname : '',
      userId: this.cfg.userId ?? null,
      buildHash: this.cfg.buildHash ?? null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      message,
      console: this.consoleBuf.snapshot(),
      network: this.networkBuf.snapshot(),
      breadcrumbs: this.crumbBuf.snapshot(),
      requestIds: [...this.requestIds],
      screenshot: extras.screenshot ?? null,
    };
  }

  async send(message: string, extras: { screenshot?: string | null } = {}): Promise<{ reportId: string; delivered: boolean }> {
    const report = this.buildReport(message, extras);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-request-id': report.reportId };
      if (this.cfg.userId) headers['x-user-email'] = this.cfg.userId;
      const res = await fetch(this.cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(report) });
      return { reportId: report.reportId, delivered: res.ok };
    } catch {
      return { reportId: report.reportId, delivered: false };
    }
  }

  private patchConsole(): void {
    const c = console;
    const levels: ConsoleEntry['level'][] = ['log', 'info', 'warn', 'error', 'debug'];
    for (const level of levels) {
      const original = c[level].bind(c);
      c[level] = (...args: unknown[]) => {
        try {
          this.consoleBuf.push({ level, message: truncate(args.map(serializeArg).join(' ')), ts: Date.now() });
        } catch { /* capture must never break the app */ }
        original(...args);
      };
      this.restorers.push(() => { c[level] = original; });
    }
  }

  private patchFetch(): void {
    const original = window.fetch;
    if (!original) return;
    const self = this;
    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const started = Date.now();
      const inputMethod = typeof input === 'object' && input !== null && 'method' in input ? (input as Request).method : undefined;
      const method = String(init?.method ?? inputMethod ?? 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      try {
        const res = await original.call(window, input, init);
        self.recordNetwork({
          method, url, status: res.status,
          durationMs: Date.now() - started,
          requestId: res.headers?.get?.('x-request-id') ?? null,
        });
        return res;
      } catch (err) {
        self.recordNetwork({ method, url, status: 0, durationMs: Date.now() - started, requestId: null });
        throw err;
      }
    };
    this.restorers.push(() => { window.fetch = original; });
  }

  private listenBreadcrumbs(): void {
    const onClick = (e: Event) => {
      try {
        const el = e.target as Element | null;
        if (!el) return;
        const label = el.getAttribute?.('aria-label') || el.getAttribute?.('data-testid') || '';
        const text = (el.textContent || '').trim().slice(0, 40);
        this.addBreadcrumb('click', `${el.tagName?.toLowerCase() ?? '?'}${el.id ? '#' + el.id : ''} ${label || text}`.trim());
      } catch { /* never throw */ }
    };
    document.addEventListener('click', onClick, { capture: true, passive: true });
    this.restorers.push(() => document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions));

    const onNav = () => this.addBreadcrumb('nav', String(window.location?.pathname ?? ''));
    window.addEventListener('popstate', onNav);
    this.restorers.push(() => window.removeEventListener('popstate', onNav));
  }
}

function cryptoRandomId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (c?.randomUUID) return c.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
