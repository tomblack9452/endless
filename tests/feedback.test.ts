import { describe, expect, it } from 'vitest';
import { describeDevice, FEEDBACK_SUBJECT, FEEDBACK_TO, feedbackBody, feedbackUrl } from '../src/feedback';

const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36';
const REDUCED = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

describe('feedback mail', () => {
  it('names the device and Android version from the user agent', () => {
    expect(describeDevice(PIXEL)).toBe('Pixel 7 · android 14');
    expect(describeDevice(SAMSUNG)).toBe('SM-S911B · android 13');
    expect(describeDevice(REDUCED)).toBe('android 10'); // a reduced agent hides the model
    expect(describeDevice(IPHONE)).toBe('iPhone · ios 17.4');
    expect(describeDevice(WINDOWS)).toBe('web · chrome on windows');
    expect(describeDevice('')).toBe('unknown');
  });

  it('leaves room to write, then the version, device and screen', () => {
    const body = feedbackBody({ version: '1.0.5 (6)', device: 'Pixel 7 · android 14', screen: 'settings' });
    const lines = body.split('\r\n');
    expect(lines.slice(0, 4).every((l) => l === '')).toBe(true);
    expect(body).toContain('version: 1.0.5 (6)');
    expect(body).toContain('device: Pixel 7 · android 14');
    expect(body).toContain('screen: settings');
    expect(body.indexOf('version')).toBeLessThan(body.indexOf('device'));
  });

  it('builds a mailto link to the public address with the subject and body encoded', () => {
    const o = { version: '1.0.5 web · dev', device: 'web · chrome on windows', screen: 'pause (endless run, level 3)' };
    const url = feedbackUrl(o);
    expect(url.startsWith(`mailto:${FEEDBACK_TO}?`)).toBe(true);
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(q.get('subject')).toBe(FEEDBACK_SUBJECT);
    expect(q.get('body')).toBe(feedbackBody(o));
    expect(url).not.toContain(' '); // spaces encoded, not "+"
    expect(url).toContain('%0D%0A');
  });
});
