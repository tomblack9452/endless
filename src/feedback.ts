import { Capacitor } from '@capacitor/core';

// "send feedback" (settings and the pause screen): a mail to the public
// address, with a blank space to write in and a small block underneath saying
// which version, which device and which screen it came from.

export const FEEDBACK_TO = 'tomblackdev@proton.me';
export const FEEDBACK_SUBJECT = 'Endless Space feedback';

/** A short name for the device and its system, from the browser's user agent. */
export function describeDevice(ua: string): string {
  const android = /Android\s+([\d.]+)/i.exec(ua);
  if (android) {
    // "Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv" -> "Pixel 7". A reduced agent says only "K".
    const model = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/i.exec(ua)?.[1]?.trim();
    const named = model && model !== 'K' && !/^wv$/i.test(model) ? `${model} · ` : '';
    return `${named}android ${android[1]}`;
  }
  const ios = /(iPhone|iPad|iPod).*?OS\s+([\d_]+)/.exec(ua);
  if (ios) return `${ios[1]} · ios ${ios[2].replace(/_/g, '.')}`;
  const os = /Windows/.test(ua) ? 'windows' : /CrOS/.test(ua) ? 'chromeos' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : '';
  const browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : '';
  if (os || browser) return `web · ${[browser, os].filter(Boolean).join(' on ')}`;
  return ua.slice(0, 160) || 'unknown';
}

/** The mail's body: room to write first, then the details. Lines end in CRLF, as mail expects. */
export function feedbackBody(o: { version: string; device: string; screen: string }): string {
  return ['', '', '', '', '--', `version: ${o.version}`, `device: ${o.device}`, `screen: ${o.screen}`, ''].join('\r\n');
}

/** The mailto: link that opens the player's mail app with everything filled in. */
export function feedbackUrl(o: { version: string; device: string; screen: string }): string {
  return `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(feedbackBody(o))}`;
}

/** The app's version and build: from Android in the app, from package.json (and the build stamp) on the web. */
export async function appVersion(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      return `${info.version} (${info.build})`;
    } catch {
      // Fall back to the web build's own version.
    }
  }
  return `${__APP_VERSION__} web · ${__BUILD__}`;
}

/** Open the mail app with the feedback mail ready. Works in the Android app (an intent) and on the web. */
export async function sendFeedback(screen: string): Promise<void> {
  const url = feedbackUrl({ version: await appVersion(), device: describeDevice(navigator.userAgent), screen });
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
