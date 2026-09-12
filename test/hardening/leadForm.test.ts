import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { panelFromSearch } from '../../utils/panelDeepLink';

const source = fs.readFileSync('server/index.ts', 'utf8');
const start = source.indexOf("  (function(){\n    var f = $('inspForm');");
const end = source.indexOf('\n  /* ── sticky mini booking form', start);
const template = source.slice(start, end);

function form(company: boolean, outcome: 'success' | '500' | 'offline') {
  const dom = new JSDOM(`<form id="inspForm">${['fn', 'ln', 'ph', 'em', 'ad1', 'ad2', 'city', 'state', 'zip', 'ms', 'how', 'howMore', 'appt'].map(id => `<input id="${id}" value="${id === 'ph' ? '7035550100' : 'test'}">`).join('')}<input type="radio" name="slot" value="morning" checked><button id="inspBtn">Request inspection</button><div id="formErr" style="display:none"></div></form><div id="formDone" style="display:none"><span id="doneName"></span></div>`, { url: 'https://get.theroofdocs.com/free-inspection', runScripts: 'outside-only' });
  const w = dom.window as any;
  w.$ = (id: string) => w.document.getElementById(id);
  w.POST_URL = '/api/profiles/contact'; w.PROFILE_ID = 'profile';
  w.HTMLElement.prototype.scrollIntoView = vi.fn();
  w.fetch = outcome === 'offline' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: outcome === 'success' });
  const script = new Function('isCompany', `return \`${template}\`;`)(company);
  w.eval(script);
  return w;
}

describe.each([true, false])('lead form (company=%s)', company => {
  it.each(['500', 'offline'] as const)('preserves data and enables retry after %s', async outcome => {
    const w = form(company, outcome);
    w.$('inspForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(w.$('formDone').style.display).toBe('none');
    expect(w.$('inspForm').style.display).not.toBe('none');
    expect(w.$('fn').value).toBe('test');
    expect(w.$('inspBtn').disabled).toBe(false);
    expect(w.$('formErr').getAttribute('role')).toBe('alert');
    expect(w.sessionStorage.getItem('inspection-lead:/free-inspection')).toContain('7035550100');
    w.close();
  });
  it('shows success and clears the draft only after acceptance', async () => {
    const w = form(company, 'success');
    w.$('inspForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(w.$('formDone').style.display).toBe('block');
    expect(w.$('inspForm').style.display).toBe('none');
    expect(w.sessionStorage.getItem('inspection-lead:/free-inspection')).toBeNull();
    w.close();
  });
});

it('routes push notifications and all three install shortcuts without opening admin', () => {
  expect(panelFromSearch('?panel=stormmap')).toBe('stormmap');
  expect(panelFromSearch('?tab=knowledge')).toBe('knowledge');
  expect(panelFromSearch('?tab=email')).toBe('email');
  expect(panelFromSearch('?persona=susan')).toBe('chat');
  expect(panelFromSearch('?panel=admin')).toBe('home');
  expect(panelFromSearch('?panel=unknown')).toBe('home');
});

it('registers shell routes before static files and revalidates update files', () => {
  const calls: any[] = [];
  const begin = source.indexOf('    // Shell routes must precede express.static');
  const finish = source.indexOf("    console.log('✅ Static file serving", begin);
  vm.runInNewContext(source.slice(begin, finish), {
    app: { get: (...args: any[]) => calls.push(['get', ...args]), use: (...args: any[]) => calls.push(['use', ...args]) },
    express: { static: (_dir: string, options: any) => options }, path, distDir: '/dist', hitGetDomain: () => false,
  });
  expect(calls.map(call => call[0])).toEqual(['get', 'use']);
  const set = vi.fn(); const sendFile = vi.fn();
  calls[0][2]({}, { set, sendFile });
  expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store, max-age=0');
  const options = calls[1][1];
  expect(options.immutable).toBe(true);
  const setHeader = vi.fn();
  options.setHeaders({ setHeader }, '/dist/sw.js');
  options.setHeaders({ setHeader }, '/dist/manifest.json');
  expect(setHeader).toHaveBeenCalledTimes(2);
  options.setHeaders({ setHeader }, '/dist/assets/main-hash.js');
  expect(setHeader).toHaveBeenCalledTimes(2);
});

it.each([false, true])('keeps video inert on phones (desktop=%s)', desktop => {
  const markup = source.match(/return `(<div data-company-welcome>.*?)`;/)![1].replace('${escAttr(vUrl)}', '/brand/company-welcome.mp4');
  const dom = new JSDOM(markup, { runScripts: 'outside-only' });
  const begin = source.indexOf('  // Load welcome video only');
  const finish = source.indexOf('  /* ── lead form', begin);
  (dom.window as any).matchMedia = (query: string) => ({ matches: query.includes('min-width') && desktop });
  dom.window.eval(source.slice(begin, finish));
  expect(dom.window.document.querySelector('video') !== null).toBe(desktop);
  expect(dom.window.document.querySelector('img') !== null).toBe(!desktop);
  dom.window.close();
});
