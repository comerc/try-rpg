/**
 * Persistent logger for post-mortem diagnosis.
 *
 * - Captures: uncaught errors, unhandled rejections, console.error/warn,
 *   and explicit diag() calls from game code.
 * - Persists last N entries in localStorage under STORAGE_KEY so they
 *   survive refresh / close / new session.
 * - Hotkeys (in-game): Ctrl+Shift+L — download logs as .txt file.
 *                      Ctrl+Shift+K — clear stored logs.
 * - From the JS console: `window.__rtsLogs()` prints them, `window.__rtsDownloadLogs()` saves.
 */

type Level = 'info' | 'warn' | 'error' | 'diag';
interface Entry { t: number; level: Level; msg: string; stack?: string; }

const STORAGE_KEY = 'rts-logs-v1';
const MAX_ENTRIES = 800;

export class Logger {
  private static installed = false;
  private static entries: Entry[] = [];
  private static session = Date.now();

  static install() {
    if (this.installed) return;
    this.installed = true;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.entries = JSON.parse(raw);
    } catch { this.entries = []; }

    this.log('info', `=== Session start ${new Date(this.session).toISOString()} ===`);

    window.addEventListener('error', (e) => {
      const msg = e.message ?? String(e.error);
      this.log('error', `[uncaught] ${msg}`, e.error?.stack);
    });

    window.addEventListener('unhandledrejection', (e) => {
      const reason: any = e.reason;
      const msg = reason?.message ?? String(reason);
      this.log('error', `[unhandled rejection] ${msg}`, reason?.stack);
    });

    const origErr = console.error.bind(console);
    console.error = (...args: any[]) => {
      try { this.log('error', args.map((a) => formatArg(a)).join(' ')); } catch {}
      origErr(...args);
    };
    const origWarn = console.warn.bind(console);
    console.warn = (...args: any[]) => {
      try { this.log('warn', args.map((a) => formatArg(a)).join(' ')); } catch {}
      origWarn(...args);
    };

    (window as any).__rtsLogs = () => {
      console.groupCollapsed(`RTS logs (${this.entries.length})`);
      for (const e of this.entries) console.log(`${new Date(e.t).toISOString()} [${e.level}] ${e.msg}${e.stack ? '\n' + e.stack : ''}`);
      console.groupEnd();
      return this.entries;
    };
    (window as any).__rtsDownloadLogs = () => this.download();
    (window as any).__rtsClearLogs = () => this.clear();

    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.code === 'KeyL') { e.preventDefault(); this.download(); }
      else if (e.code === 'KeyK') { e.preventDefault(); this.clear(); }
    });

    window.addEventListener('beforeunload', () => this.persist());
  }

  static log(level: Level, msg: string, stack?: string) {
    const entry: Entry = { t: Date.now(), level, msg };
    if (stack) entry.stack = stack;
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.persist();
  }

  static diag(msg: string) { this.log('diag', msg); }
  static info(msg: string) { this.log('info', msg); }

  static download() {
    const text = this.entries.map((e) =>
      `${new Date(e.t).toISOString()} [${e.level.padEnd(5)}] ${e.msg}${e.stack ? '\n    ' + e.stack.split('\n').join('\n    ') : ''}`
    ).join('\n');
    const blob = new Blob([text || '(empty)'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fname = `rts-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static clear() {
    this.entries = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  static getAll(): Entry[] { return this.entries.slice(); }

  private static persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries)); } catch {}
  }
}

function formatArg(a: any): string {
  if (a == null) return String(a);
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
  try { return JSON.stringify(a); } catch { return String(a); }
}
