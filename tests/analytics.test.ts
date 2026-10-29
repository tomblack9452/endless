import { describe, expect, it } from 'vitest';
import { Analytics, type AnalyticsPlugin } from '../src/platform/analytics';

function fake() {
  const sent: string[] = [];
  const enabled: boolean[] = [];
  const plugin: AnalyticsPlugin = {
    async setEnabled({ enabled: e }) {
      enabled.push(e);
    },
    async logEvent({ name }) {
      sent.push(name);
    },
    async setCurrentScreen({ screenName }) {
      sent.push(`screen:${screenName}`);
    },
  };
  return { sent, enabled, load: async () => plugin };
}

describe('analytics', () => {
  it('sends nothing until the player has agreed, then what waited for the answer', async () => {
    const f = fake();
    const a = new Analytics(f.load);
    a.log('sign_up', { method: 'anonymous' });
    a.screen('title');
    expect(f.sent).toEqual([]);
    await a.setConsent(true);
    a.log('run_start', { mode: 'endless' });
    expect(f.sent).toEqual(['sign_up', 'run_start']);
    expect(f.enabled).toEqual([true]);
  });

  it('drops what waited when the player says no', async () => {
    const f = fake();
    const a = new Analytics(f.load);
    a.log('sign_up', { method: 'anonymous' });
    await a.setConsent(false);
    a.log('run_start', { mode: 'endless' });
    await a.setConsent(true);
    expect(f.sent).toEqual([]);
  });

  it('stops when "share usage stats" is turned off, and tells Firebase', async () => {
    const f = fake();
    const a = new Analytics(f.load);
    await a.setConsent(true);
    await a.setSetting(false);
    a.log('view_store', { source: 'dock' });
    expect(f.sent).toEqual([]);
    expect(f.enabled).toEqual([true, false]);
    expect(a.enabled).toBe(false);
  });

  it('never sends in a build without Firebase, whatever the answers', async () => {
    const a = new Analytics(null);
    await a.setConsent(true);
    await a.setSetting(true);
    expect(a.enabled).toBe(false);
  });

  it('stays quiet if the plugin fails to load', async () => {
    const a = new Analytics(async () => {
      throw new Error('no firebase');
    });
    await a.setConsent(true);
    expect(a.enabled).toBe(false);
    expect(() => a.log('run_start', { mode: 'ranked' })).not.toThrow();
  });
});
