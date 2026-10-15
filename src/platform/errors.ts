import { Capacitor } from '@capacitor/core';
import { storage } from '../core/storage';
import type { Backend, ClientError } from '../server/backend';
import { appVersion, describeDevice } from './feedback';

// Error reports: uncaught errors and unhandled rejections, and the key
// failures (sign-in, purchases, ads, the cloud save) reported where they
// happen with reportError. Each is written down on the device first, like a
// run in the outbox, and sent a few at a time once there's a server and a
// signal (log_errors, 0018). At most 20 a session, and the same one only once.
// Nothing personal goes: emails, tokens, account ids and long keys are taken
// out, and there's no name or save in them.

const KEY = 'endless.errors';
export const SESSION_MAX = 20;
const WAITING_MAX = 40; // kept on the device while there's no signal
const SEND_MAX = 20; // a call (the server takes no more)
const STACK_LINES = 6;

/** Take anything personal out of a message or stack: emails, tokens, ids, query strings. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>') // a JWT
    .replace(/\b(bearer|token|key|apikey|secret|password|nonce)([\s:=]+)\S+/gi, '$1$2<hidden>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<long>')
    .replace(/(\/[^\s?]*)\?[^\s)]*/g, '$1'); // query strings on addresses (they can carry ids)
}

/** The top of a stack, each line short: the file's name and place, not its whole address. */
export function shortStack(stack: string | undefined): string {
  if (!stack) return '';
  return scrub(stack)
    .split('\n')
    .map((l) => l.trim().replace(/\(?(?:[a-z]+:\/\/)?[^\s()]*\/([^/\s()]+:\d+(?::\d+)?)\)?/g, '$1'))
    .filter((l) => l.length > 0)
    .slice(0, STACK_LINES)
    .join('\n')
    .slice(0, 800);
}

/** A message and stack from whatever was thrown. */
export function describeError(e: unknown): { message: string; stack: string } {
  if (e instanceof Error) return { message: `${e.name}: ${e.message}`, stack: e.stack ?? '' };
  if (typeof e === 'string') return { message: e, stack: '' };
  const m = (e as { message?: unknown; code?: unknown } | null)?.message;
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof m === 'string') return { message: code !== undefined ? `${String(code)} ${m}` : m, stack: '' };
  try {
    return { message: JSON.stringify(e) ?? String(e), stack: '' };
  } catch {
    return { message: String(e), stack: '' };
  }
}

export class ErrorLog {
  private items: ClientError[] = [];
  private loaded: Promise<void> | null = null;
  private seen = new Set<string>();
  private reported = 0;
  private backend: Backend | null = null;
  private screen: () => string = () => '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending: Promise<void> | null = null;
  version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  platform = '';
  device = '';

  constructor(private readonly now: () => number = () => Date.now()) {}

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const raw = await storage.get(KEY);
        const old = raw ? (JSON.parse(raw) as ClientError[]) : [];
        if (Array.isArray(old)) this.items = [...old, ...this.items].slice(-WAITING_MAX);
      } catch {
        // Corrupt value: start empty.
      }
    })();
    return this.loaded;
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify(this.items));
  }

  get waiting(): number {
    return this.items.length;
  }

  /** Send to this server from now on, saying which screen was up. */
  attach(backend: Backend, screen: () => string): void {
    this.backend = backend;
    this.screen = screen;
    this.queueSend(0);
  }

  /**
   * Note an error (`where`: what was going on, e.g. "purchase"). Kept unless
   * the session's 20 are used up or the same one was noted already.
   */
  report(where: string, e: unknown): void {
    const { message, stack } = describeError(e);
    const text = scrub(`${where ? `${where}: ` : ''}${message}`).slice(0, 300);
    const short = shortStack(stack);
    const key = `${text}\n${short}`;
    if (this.reported >= SESSION_MAX || this.seen.has(key) || !text) return;
    this.seen.add(key);
    this.reported++;
    let screen = '';
    try {
      screen = this.screen().slice(0, 40);
    } catch {
      // The game isn't up yet.
    }
    this.items.push({ message: text, stack: short, version: this.version, platform: this.platform, device: this.device, screen, at: this.now() });
    if (this.items.length > WAITING_MAX) this.items.splice(0, this.items.length - WAITING_MAX);
    void this.load().then(() => this.save());
    this.queueSend(3000);
  }

  private queueSend(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.send(), ms);
  }

  /** Send what's waiting (a batch at a time); anything that can't go now waits for the next try. */
  send(): Promise<void> {
    this.sending ??= (async () => {
      await this.load();
      const b = this.backend;
      while (b?.online && b.userId && this.items.length > 0) {
        const batch = this.items.slice(0, SEND_MAX);
        const r = await b.logErrors(batch);
        if (r === 'retry') break;
        this.items.splice(0, batch.length); // taken, or turned down for good
        this.save();
      }
    })().finally(() => (this.sending = null));
    return this.sending;
  }

  /** Catch what nothing else does: uncaught errors and unhandled rejections. */
  install(target: Window): void {
    target.addEventListener('error', (ev) => {
      // A script or image that failed to load fires here too, with no error: skip those.
      if (ev.error === undefined && !ev.message) return;
      this.report('', ev.error ?? ev.message);
    });
    target.addEventListener('unhandledrejection', (ev) => this.report('unhandled', ev.reason));
    target.addEventListener('online', () => this.queueSend(1000));
    this.platform = Capacitor.getPlatform();
    this.device = describeDevice(navigator.userAgent).slice(0, 80);
    void appVersion().then((v) => (this.version = v.slice(0, 40)));
  }
}

/** The game's one error log. */
export const errorLog = new ErrorLog();

/** Note an error at one of the key places (sign-in, purchases, ads, the cloud save). */
export function reportError(where: string, e: unknown): void {
  errorLog.report(where, e);
}
