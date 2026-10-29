import { reportError } from '../platform/errors';
import { storage } from '../core/storage';
import { SESSION_KEY } from '../server/supabase';
import { googleAvailable, googleSignIn } from '../platform/account';
import type { Game } from '../core/game';

/** A name the server made up for a new account ("pilot-3fa2"): the player hasn't picked one. */
export const GENERATED_NAME = /^pilot-[0-9a-f]{4}$/;

/** A name the server takes (see set_pilot_name). */
const PILOT_NAME = /^[A-Za-z0-9 _-]{3,16}$/;

export class AccountScreens {
  constructor(private readonly g: Game) {}

  /** Shop rows for real-money products, in the order shown ('dev' adds cores in the dev build). */
  private deleteArmed = false;

  private deleteTimer = 0;

  private nameOk = false; // the player has a pilot name of their own

  private googleBusy = false;

  private googleArmed = false; // asked once to switch to the account a Google login keeps

  private nameWords: Promise<Set<string>> | null = null; // the profanity list, once loaded

  async savePilotName(name: string, box = 'board'): Promise<boolean> {
    if (!this.g.backend.online) {
      this.g.ui.setPilotName('', 'names come with the server', box);
      return false;
    }
    const problem = await this.nameProblem(name);
    if (problem) {
      this.g.ui.setPilotName('', problem, box);
      return false;
    }
    const res = await this.g.backend.setPilotName(name);
    this.g.ui.setPilotName(res.ok ? res.message : '', res.ok ? 'saved' : res.message, box);
    if (res.ok) this.nameOk = true;
    if (res.ok && box === 'board') void this.g.boards.showBoard(this.g.boardTab);
    return res.ok;
  }

  /** Delete the account (server and device) and start again as a new player. Asks twice. */
  async deleteAccount(): Promise<void> {
    const row = document.getElementById('delete-account');
    const value = row?.querySelector('.value');
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      if (value) value.textContent = 'tap again';
      this.g.ui.showNotice("tap again to delete everything. this can't be undone");
      this.deleteTimer = window.setTimeout(() => {
        this.deleteArmed = false;
        if (value) value.textContent = 'delete';
      }, 5000);
      return;
    }
    window.clearTimeout(this.deleteTimer); // a slow delete keeps saying "deleting"
    this.deleteArmed = false;
    if (value) value.textContent = 'deleting';
    if (!(await this.g.backend.deleteAccount())) {
      if (value) value.textContent = 'delete';
      this.g.ui.showNotice("couldn't reach the server. try again with a connection");
      return;
    }
    await storage.clear('endless.');
    location.reload();
  }

  /**
   * Settings' account row: whether this account is kept with Google (account.ts).
   * Only in the Android app, with the server.
   */
  refreshAccount(): void {
    const show = googleAvailable() && this.g.backend.online;
    const group = document.getElementById('account-group');
    if (group) group.hidden = !show;
    if (!show) return;
    const value = document.querySelector('#google-account .value');
    const note = document.getElementById('google-note');
    const set = (v: string, n: string): void => {
      if (value) value.textContent = v;
      if (note) note.textContent = n;
    };
    set('checking', '');
    void this.g.backend.googleAccount().then((email) => {
      this.g.googleEmail = email;
      if (email === null) set('sign in', "couldn't check just now. you can still sign in");
      else if (email) set(email, 'kept with this google account. sign in with it on another phone to carry on there');
      else set('sign in', 'your progress is only on this phone. sign in with google to get it back if you lose or change phones');
    });
  }

  /**
   * Keep this account with Google, or (when that Google login already keeps
   * another account, e.g. on a new phone) switch to that account. Switching
   * replaces this phone's progress, so it asks twice unless there's nothing to lose.
   */
  async keepWithGoogle(fromWelcome: boolean): Promise<void> {
    if (this.googleBusy) return;
    if (!fromWelcome && this.g.googleEmail) {
      this.g.ui.showNotice(`kept with ${this.g.googleEmail}`);
      return;
    }
    this.googleBusy = true;
    try {
      const token = await googleSignIn();
      if ('error' in token) {
        // A wrongly set up build can also look like a cancel, so say so either way.
        this.g.ui.showNotice(token.error === 'cancelled' ? 'google sign-in was cancelled' : `google sign-in didn't work: ${token.error}`);
        return;
      }
      const res = await this.g.backend.linkGoogle(token.idToken, token.nonce);
      if (res === 'linked') {
        this.g.ui.showNotice('signed in. your account is kept with google now');
        this.g.cloud.push();
        this.refreshAccount();
        if (fromWelcome) document.getElementById('welcome-google')?.setAttribute('hidden', '');
        return;
      }
      if (res === 'failed') {
        reportError('google link', this.g.backend.authError || 'unknown error');
        this.g.ui.showNotice(`couldn't sign in: ${this.g.backend.authError || 'unknown error'}`);
        return;
      }
      // That Google login keeps another account: switch to it.
      const nothingToLose = fromWelcome || this.g.progress.stats.runs === 0;
      if (!nothingToLose && !this.googleArmed) {
        this.googleArmed = true;
        const value = document.querySelector('#google-account .value');
        if (value) value.textContent = 'tap again';
        this.g.ui.showNotice("that google account already has a pilot. tap again to switch to it: it replaces this phone's progress");
        window.setTimeout(() => {
          this.googleArmed = false;
          this.refreshAccount();
        }, 8000);
        return;
      }
      this.googleArmed = false;
      const before = this.g.backend.userId;
      if (!(await this.g.backend.signInGoogle(token.idToken, token.nonce))) {
        reportError('google switch', this.g.backend.authError || 'unknown error');
        this.g.ui.showNotice(`couldn't switch accounts: ${this.g.backend.authError || 'unknown error'}`);
        return;
      }
      if (this.g.backend.userId === before) {
        this.refreshAccount(); // it was this account all along
        return;
      }
      // Start again as that account: forget this phone's save (keeping the new
      // session), and the cloud save comes down on the reload.
      const session = await storage.get(SESSION_KEY);
      await storage.clear('endless.');
      if (session) await storage.set(SESSION_KEY, session);
      location.reload();
    } finally {
      this.googleBusy = false;
    }
  }

  /**
   * Everyone picks a pilot name once ranked and the leaderboards open (before
   * that nobody sees it, so new players can just fly): a player still on a
   * made-up one ("pilot-3fa2") then gets the name screen on the title, and it
   * stays until a name is saved. Only with the server (names live there).
   */
  async askName(): Promise<void> {
    if (this.nameOk || this.g.nameLater || !this.g.backend.online || !this.g.onboarding.done || !this.g.title.open('leaderboard')) return;
    const name = await this.g.backend.pilotName();
    if (name === null) return; // no answer (no signal): ask another time
    if (!GENERATED_NAME.test(name)) {
      this.nameOk = true;
      return;
    }
    if (this.g.state !== 'title' || this.g.infoOpen === 'welcome' || this.g.infoOpen === 'name') return;
    this.g.settingsOpen = false;
    this.g.ui.setPilotName('', '', 'name');
    this.g.openInfo('name');
  }

  /** Why this name can't be had (shape or profanity: nameFilter.ts), or null if it's fine to send. */
  private async nameProblem(name: string): Promise<string | null> {
    if (!PILOT_NAME.test(name.trim())) return '3 to 16 letters, numbers, spaces, - or _';
    // The word list loads the first time it's needed (it's its own file).
    this.nameWords ??= import('../platform/nameWords.json').then((m) => new Set(m.default as string[]));
    const [{ nameBlocked }, words] = await Promise.all([import('../platform/nameFilter'), this.nameWords]);
    return nameBlocked(name.trim(), words) ? "that name isn't allowed. try another" : null;
  }

  async saveNameScreen(name: string): Promise<void> {
    const problem = await this.nameProblem(name);
    if (problem) {
      this.g.ui.setPilotName('', problem, 'name');
      return;
    }
    const res = await this.g.backend.setPilotName(name.trim());
    if (!res.ok) {
      this.g.ui.setPilotName('', res.message, 'name');
      return;
    }
    this.nameOk = true;
    this.g.infoOpen = null;
    this.g.ui.show('title');
    this.g.ui.showNotice(`welcome, ${res.message}`);
  }
}
