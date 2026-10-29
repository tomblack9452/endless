import { applyAtmosphere } from '../world/atmosphere';
import { type AudioState, Sound } from '../audio/sound';
import type { MusicId } from '../audio/music';
import { createBlockTextures } from '../world/blockTextures';
import { AutoGraphics } from './autoGraphics';
import { BASE_PALETTE, CONFIG } from './config';
import { lateralSpeedAt, speedAt } from '../world/difficulty';
import { Input } from '../platform/input';
import { LivePalette } from '../world/palette';
import { Player, shipGeometry } from '../ship/player';
import { Portraits, type ShipLook } from '../ship/portrait';
import { Stage } from '../world/renderer';
import { Sky } from '../world/sky';
import { SpeedLines } from '../world/speedLines';
import { Trail } from '../ship/trail';
import { cycle, DEFAULT_SETTINGS, LEVEL_GAIN, loadSettings, saveSettings, type SettingKey, STEERING_RANGE, TEXT_SCALE, TILT_GAIN } from './settings';
import { EVENT_NOTICE, Events } from '../world/events';
import { Weather } from '../world/weather';
import { Ghost, rivalGhost } from '../ship/ghost';
import { decalArt } from '../ship/decals';
import { Haptics } from '../platform/haptics';
import { SAFE, setSafeColours } from '../world/itemColours';
import { remindersAvailable } from '../platform/reminders';
import { Capacitor } from '@capacitor/core';
import { exitChoice } from '../platform/exit';
import { sendFeedback } from '../platform/feedback';
import { errorLog } from '../platform/errors';
import { latestNotes, SEEN_KEY, whatsNewOnLaunch } from '../ui/whatsNew';
import { cancelOpenReport } from '../ui/report';
import { quickRetryOn, tapRetries } from './retry';
import { GateTracker, kmText, Milestones, milestonesCount } from './runBonus';
import { crashMomentOn, crashOverReady, crashTimeScale } from './crashMoment';
import { distanceText, sparkSvg, summaryRows } from '../ui/runSummary';
import { type HintId, Hints, tipText } from '../ui/hints';
import { migrateMissionLooks, migrateTickets } from '../progression/legacy';
import { type Feature, nextStageText } from '../progression/reveal';
import { type ControlId, hasTouch, type Lesson, type LessonState, Onboarding } from '../ui/onboarding';
import { itemCard, powerItem } from '../ui/guide';
import { TeachView } from '../ui/tutorialView';
import { Color } from 'three';
import { Ads, createAdNetwork } from '../ads/ads';
import { entitlementFor, Entitlements } from '../store/entitlements';
import { Progress } from '../progression/progress';
import { creditsFor, insignia, Ranked, rankName, RANKS, type RunMode } from '../progression/ranks';
import { Wallet } from '../progression/wallet';
import { Daily, questText } from '../economy/daily';
import { Weekly } from '../economy/weekly';
import { type GoalsTab, GoalsScreen } from '../ui/goalsView';
import { Pass, runXp } from '../economy/pass';
import { type Reward, rewardLook, rewardParts, rewardText } from '../economy/reward';
import { DailyShop } from '../economy/shop';
import { dayKey } from '../economy/time';
import { EconomyView } from '../economy/view';
import { type BoardId, createBackend, type RunSubmission } from '../server/backend';
import { BOARD_TABS, boardForRun } from '../server/boards';
import { Outbox } from '../server/outbox';
import { CloudSave } from '../server/sync';
import { shareAvailable, shareCard } from '../platform/share';
import { createStore, type StoreProduct } from '../store/store';
import { storage } from './storage';
import { fxDistance, fxTime } from '../world/fx';
import { type Course, COURSES, courseLength, type DailyRun, dailyRun, type Environment, ENVIRONMENTS, type WeeklyRun, weeklyRun } from '../world/courses';
import { Challenge, streakReward } from '../progression/challenge';
import { envStatus, nextEnvironment, newlyOpened } from '../progression/unlocks';
import { emblem, leagueName, leaguePar, Leagues, weekKey } from '../progression/leagues';
import { ACHIEVEMENTS, type Snapshot, achievement, progressOn } from '../progression/achievements';
import { refreshSeasonLooks, SETS } from '../ship/catalogue';
import { GoalLog } from '../progression/goals';
import { HangarScreen } from '../ui/hangarView';
import { find, keyOf, Looks, type LookItem, type Owner, type ShipId, type Slot, type TrailId } from '../ship/looks';
import type { Fin, Marking } from '../ship/looks';
import { MAX_TIER, type ShipStats, STANDARD, SYSTEMS, type SystemId, Upgrades } from '../ship/upgrades';
import { newSeed } from './rng';
import { loadNumber } from './storage';
import { type Celebration, formatScore, UI } from '../ui/ui';
import type { RoomId } from '../world/interior';
import { biomeForLevel, type PowerKind, themeForLevel, themeName, World } from '../world/world';
import { tintBiome } from '../world/biomes';
import { terrain } from '../world/terrain';
import { ShowroomSpin } from '../ship/showroom';
import { ShopScreens } from '../screens/shop';
import { Purchases } from './purchases';
import { BoardScreens } from '../screens/boards';
import { GoalScreens } from '../screens/goals';
import { HangarScreens } from '../screens/hangar';
import { ReminderPrompts } from '../platform/reminderPrompts';
import { AccountScreens } from '../screens/account';
import { FirstLaunch } from '../screens/onboarding';
import { RecordScreen } from '../screens/record';
import { RankKeeper } from '../progression/rankKeeper';
import { Revives } from './revives';
import { TitleScreen } from '../screens/title';

type State = 'title' | 'playing' | 'paused' | 'countdown' | 'crashed' | 'finished';

const DEG = Math.PI / 180;
const PATH_STEP = 4;
const FIRST_PLAYED_KEY = 'endless.firstPlayed';
export const REVEAL_KEY = 'endless.reveal';

/** A name the server made up for a new account ("pilot-3fa2"): the player hasn't picked one. */
export const GENERATED_NAME = /^pilot-[0-9a-f]{4}$/;

type InfoScreen = 'welcome' | 'name' | 'goals' | 'hangar' | 'record' | 'solo' | 'league' | 'shop' | 'store' | 'pass' | 'boards';

/** "5 oct": the Monday this week's ranked course started. */
/** "1:23.4" */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** Music for an area of a set level. */
function musicForArea(theme: 'land' | 'canyon' | 'interior', biome?: string): MusicId {
  if (biome === 'ice' || biome === 'volcanic' || biome === 'asteroids') return biome;
  return theme;
}

/** Music for a level: the theme's, or the biome's own where it has one. */
export function musicFor(level: number): MusicId {
  const biome = biomeForLevel(level);
  return biome === 'ice' || biome === 'volcanic' || biome === 'asteroids' ? biome : themeForLevel(level);
}

/** Where the boost button sits, by the boostSide setting (0 right, 1 left, 2 middle). */
const BOOST_SIDES = ['right', 'left', 'middle'] as const;

/** A wrapped present, for the daily reward. */
export const GIFT_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="12" y="26" width="40" height="28" rx="3"/><rect x="8" y="18" width="48" height="10" rx="2"/><path d="M32 18v36"/><path d="M32 18c-4-8-14-10-14-4s10 4 14 4c4 0 14 2 14-4s-10-4-14 4z"/></svg>';
/** A goal badge: a star in a ring. */
export const GOAL_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><circle cx="32" cy="32" r="26"/><path d="M32 14l5.4 11.4 12.1 1.6-8.9 8.4 2.3 12.3L32 41.7l-10.9 6 2.3-12.3-8.9-8.4 12.1-1.6z"/></svg>';
/** What's new: a four-point sparkle. */
const NEW_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 6c2 14 6 20 20 22-14 2-18 8-20 22-2-14-6-20-20-22 14-2 18-8 20-22z"/><path d="M50 40c1 5 2 7 7 8-5 1-6 3-7 8-1-5-2-7-7-8 5-1 6-3 7-8z"/></svg>';
/** The daily challenge: a flag at the finish line. */
const FLAG_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M16 58V8"/><path d="M16 10h34l-7 10 7 10H16"/><path d="M27 10v20M38 10v20M16 20h34"/></svg>';
/** A season pass badge. */
export const PASS_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 6l22 10v16c0 13-9 22-22 26C19 54 10 45 10 32V16z"/><path d="M32 20l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z"/></svg>';

/** "+250 credits" lines from several promotions at once, added into one. */
export function mergeCredits(lines: string[]): string[] {
  let credits = 0;
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^\+([\d,]+) credits$/.exec(l);
    if (m) credits += Number(m[1].replace(/,/g, ''));
    else if (!rest.includes(l)) rest.push(l);
  }
  return credits > 0 ? [`+${formatScore(credits)} credits`, ...rest] : rest;
}

export class Game {
  private readonly basePalette = new LivePalette(); // the level's palette
  private readonly palette = new LivePalette(); // after time of day, read by materials
  private shownTextHex = -1;
  private shownPageHex = -1;
  readonly stage: Stage;
  readonly world: World;
  readonly player: Player;
  readonly input: Input;
  private readonly speedLines: SpeedLines;
  /** Graphics on auto: drops to low once per session if runs keep going slow. */
  private readonly autoGraphics = new AutoGraphics();
  private readonly sky: Sky;
  readonly trail: Trail;
  private readonly events: Events;
  private readonly weather: Weather;
  private readonly ghost: Ghost;
  /** Ranked: the ghost of the pilot just above you (settings > rival's ghost). */
  private readonly rival: Ghost;
  /** Counts runs, so an answer from the server for an earlier run is ignored. */
  private runSerial = 0;
  /** Zen mode: no score, rewards or boards; a crash respawns (and the next run is one). */
  private zen = false;
  private zenNext = false;
  /** The run's speed, sampled for the summary on the game-over screen. */
  private speeds: number[] = [];
  private sampleT = 0;
  /** This crash plays its slow-motion moment, and how long ago it happened (real ms). */
  private moment = false;
  private crashRealMs = 0;
  private hitWhat = '';
  private onIce = false;
  /** This run counts towards opening solo environments: ranked or endless, from the start (not solo, set levels or dev starts). */
  unlockable = false;
  readonly sound = new Sound();
  private readonly audio: AudioState = {
    playing: false,
    speed: 0,
    boost: 0,
    steer: 0,
    canyon: 0,
    interior: 0,
    daylight: 1,
    intensity: 0,
    chain: 0,
  };
  settings = { ...DEFAULT_SETTINGS };
  settingsOpen = false; // settings screen showing (from the title or pause)
  readonly ui = new UI();
  readonly hints = new Hints((text, tip) => this.ui.showHint(text, tip));
  /** The Android app (not the web): back can leave it, so "ask before closing" applies. */
  private native = Capacitor.getPlatform() === 'android';
  /** The "close endless space?" dialog is up. */
  exitAsking = false;
  readonly haptics = new Haptics();
  readonly progress = new Progress();
  // Run mode: ranked (the weekly level), solo (an environment or a set level) or endless.
  mode: RunMode = 'ranked';
  /** Solo: the environment being played, or null (endless, ranked, set levels). */
  private environment: Environment | null = null;
  /** This week's ranked level (rebuilt when the week turns). */
  weekly: WeeklyRun = weeklyRun(weekKey(Date.now()));
  /** Today's challenge (rebuilt when the day turns, by the trusted clock). */
  today: DailyRun = dailyRun(dayKey(Date.now()));
  /** The daily challenge being flown (the day it belongs to), or null. */
  dailyRunNow: DailyRun | null = null;
  /** The daily challenge's bests and streak on this device. */
  readonly challenge = new Challenge();
  private scoreBase = 0; // solo starts: score begins at half the skipped points
  readonly ranked = new Ranked();
  readonly wallet = new Wallet();
  readonly daily = new Daily();
  readonly pass = new Pass();
  readonly econ = new EconomyView();
  readonly backend = createBackend();
  readonly cloud = new CloudSave(this.backend);
  /** Finished runs on their way to the leaderboards (kept and retried when there's no signal). */
  readonly outbox = new Outbox(this.backend);
  /** The last run sent to a board: its notice still shows when the rate limit held it back a moment (not mid-run). */
  private lastSent: RunSubmission | null = null;
  boardTab = 'week';
  readonly store = createStore();
  storeProducts: StoreProduct[] = [];
  portraits = new Portraits(this.palette);
  private shipSent = ''; // the looks last sent to the boards (JSON)
  recordSent = ''; // the service record summary last sent (JSON)
  private shipTimer = 0;
  nameLater = false; // the name screen was put off for this session
  googleEmail: string | null = null; // the Google account this account is kept with ('' none, null unknown)
  storeFrom: 'shop' | null = null; // where Back goes from the store
  passFrom: 'store' | null = null; // and from the season pass
  /** One-time products already bought. */
  readonly entitlements = new Entitlements();
  private firstPlayed = Date.now();
  /** The saved days, weeks and pass are loaded (retime waits for them). */
  economyLoaded = false;
  readonly onboarding = new Onboarding();
  /**
   * The practice run in progress (onboarding), or a trial of other controls: the
   * lesson it's on, what the player has done in it, the controls flown, the
   * lessons done, and the pickup or power-up coming up (and those still to come).
   */
  practice: {
    kind: 'lessons' | 'trial';
    lesson: number;
    s: LessonState;
    control: ControlId;
    learned: Lesson[];
    item: 'pickup' | PowerKind | null;
    coming: boolean;
    queue: ('pickup' | PowerKind)[];
    confirmT: number;
  } | null = null;
  /** The next run is the practice course (its own pickups and power-ups). */
  practiceNext = false;
  /** "how did that feel?": the controls the last practice or trial was flown with. */
  feelUsed: ControlId | null = null;
  readonly teach = new TeachView();
  /** Obstacles flown past this run (the practice run's obstacle lesson). */
  private passCount = 0;
  /** The reveal stage last announced (null until read from storage). */
  revealSeen: number | null = null;
  readonly ads = new Ads(
    createAdNetwork(),
    () => this.entitlements.has('premium'),
    () => this.firstPlayed,
  );
  /** The shop card tapped (on the ship to try), or -1. */
  shopPick = -1;
  readonly dailyShop = new DailyShop();
  readonly goalLog = new GoalLog();
  readonly weeklyGoals = new Weekly();
  readonly goalsUi = new GoalsScreen();
  goalsTab: GoalsTab = 'daily';
  /** This ranked run scored at least the league's par (a weekly goal counts these). */
  beatPar = false;
  /** Credits the last run paid (for doubling with a rewarded ad). */
  lastRunCredits = 0;
  readonly hangarUi = new HangarScreen();
  hangarFrom: 'shop' | null = null; // where Back goes
  // Ranked: the ship's sideways position every PATH_STEP units (the leaderboard check, and later the ghost).
  private path: number[] = [];
  private pathTimes: number[] = [];
  private pathNext = 0;
  private economyTimer = 0;
  /** The saved settings have been read (until then they're the defaults). */
  settingsLoaded = false;
  /** Asking the server whether it's back, and when it was last asked (the device's clock). */
  private rechecking = false;
  private lastRecheck = 0;
  /** The minute the title's cards were last drawn (the daily card's time left). */
  private titleMinute = 0;
  /** Turns the showroom camera: on its own, or by a drag on the open scene. */
  private readonly showroomSpin = new ShowroomSpin({ spin: CONFIG.camera.showroom.spin });
  // Revive (not in ranked): once a run. While the offer is up the run isn't recorded yet.
  revived = false;
  /** The run as it stood at the first crash, when revived: what the boards get (a paid revive never adds to a board score). */
  preRevive: { score: number; seconds: number; distance: number } | null = null;
  revivePending = false;
  private reviveAsked = false;
  private countdownT = 0; // seconds of 3-2-1 left
  // A set level (courses.ts) being played, if any.
  private course: Course | null = null;
  private sectionIdx = -1;
  hitThisRun = false; // anything hit, even a shield save (course stars)
  private finishMs = 0;
  readonly upgrades = new Upgrades();
  readonly leagues = new Leagues();
  /** This run's ship systems (your switched-on upgrades). */
  private ship: ShipStats = STANDARD;
  readonly looks = new Looks();
  /** A locked look being tried on in the hangar (not yet owned). */
  preview: Partial<Record<Slot, string>> | null = null;
  private pickupCount = 0;
  recorded = false; // this run's stats are saved
  assisted = false; // assist mode was on at some point this run
  /** Which info screen is open from the title (stats, goals, hangar), if any. */
  infoOpen: InfoScreen | null = null;
  private boostSeconds = 0;
  private roomsEntered = 0;
  private shownSky = -1;
  runTime = 0; // seconds into the current run

  state: State = 'title';
  private speed: number = CONFIG.speed.titleDrift;
  runStart = 0; // field distance when the run began
  score = 0; // shown score: distance points + bonus
  private distanceScore = 0; // drives levels and difficulty
  private bonus = 0;
  private chain = 0; // near misses in a row
  private chainTimer = 0;
  private nearMissCount = 0;
  private bestChain = 0;
  private nudgeMs = 0;
  private shownRoom = '';
  level = 1;
  /** Seed of the current (or last) run: the same seed rebuilds the same course. */
  seed = 0;

  /** Dev-only switches, set from the dev panel (never shown in production builds). */
  readonly dev = { invincible: false, fullBoost: false, autopilot: false };

  boostMeter = 0; // 0..1
  boosting = false;
  private boostLevel = 0; // eased 0..1, scales the speed boost

  // Power-ups (see CONFIG.powers).
  shield = false;
  graceT = 0; // seconds of passing through things after a shield hit
  private magnetT = 0;
  private slowT = 0;
  private slowLevel = 0; // eased 0..1
  private phaseT = 0; // phase armed: seconds left to pass through the next thing hit
  private passT = 0; // seconds of passing through it (phase used)
  private doubleT = 0; // double points: seconds left
  /** Gate runs ahead (endless) and the distance milestones passed (endless and solo). */
  private readonly gates = new GateTracker();
  private readonly milestones = new Milestones();
  /** Credits from milestones and gate runs this run (paid with the run's credits). */
  private bonusCredits = 0;

  private crashMs = 0;
  private shattered = false;
  private fell = false;
  private overShown = false;
  /** This crash skips the game-over screen (the quick retry setting, outside ranked). */
  private quick = false;
  /** crashMs when the crashed run was settled (after any revive offer). */
  private settledMs = 0;
  /** This run set a new personal best (the share card says so). */
  private shareNew = false;
  /** The daily run's streak line for the end screen. */
  private dailyLine = '';
  /** The best line for quick retry's panel. */
  private quickLine = '';

  private lastTime = 0;
  private titleTime = 0;

  readonly shop = new ShopScreens(this);

  readonly purchases = new Purchases(this);

  readonly boards = new BoardScreens(this);

  readonly goals = new GoalScreens(this);

  readonly hangarScreen = new HangarScreens(this);

  readonly reminders = new ReminderPrompts(this);

  readonly account = new AccountScreens(this);

  readonly firstLaunch = new FirstLaunch(this);

  readonly record = new RecordScreen(this);

  readonly ranks = new RankKeeper(this);

  readonly revives = new Revives(this);

  readonly title = new TitleScreen(this);

  constructor(canvas: HTMLCanvasElement) {
    this.basePalette.set(BASE_PALETTE);
    this.palette.set(BASE_PALETTE);
    this.stage = new Stage(canvas, this.palette);
    const textures = CONFIG.blocks.textured ? createBlockTextures(this.stage.renderer.capabilities.getMaxAnisotropy()) : undefined;
    this.world = new World(this.stage.scene, this.palette, textures);
    this.player = new Player(this.stage.scene, this.palette);
    this.speedLines = new SpeedLines(this.stage.scene, this.palette);
    this.trail = new Trail(this.player.engine, this.palette);
    this.events = new Events(this.stage.scene);
    this.weather = new Weather(this.stage.scene);
    this.ghost = new Ghost(this.stage.scene, shipGeometry('dart'), this.palette);
    this.rival = new Ghost(this.stage.scene, shipGeometry('dart'), this.palette, new Color('#e8a265'), 0.5);
    void this.ghost.load();
    this.sky = new Sky(this.stage.scene);
    this.input = new Input(document.body);
    this.input.bindBoostControl(this.ui.boostControl);
    this.input.onTiltDenied = () => this.ui.showNotice('motion access off. drag to steer');
    this.sound.attachUnlock();
    this.ui.bindMenus(this.onMenu, this.onSetting);
    this.applySettings();
    this.applyLook(0);

    this.world.reset(0, false);
    this.stage.warmUp();
    this.ui.show('title');
    this.ui.showHud(false);

    document.body.addEventListener('pointerdown', this.onTap);
    window.addEventListener('keydown', this.onKey);
    this.ui.pauseButton.addEventListener('pointerdown', this.onPauseButton);
    this.ui.bindPause(() => this.pause());
    this.ui.bindHintSkip(() => {
      this.hints.skip();
      this.ui.hideHint();
      this.ui.showNotice('tips off. settings can replay them');
    });
    // Tapping anywhere also starts; the button is the explicit target.
    this.ui.startButton.addEventListener('click', () => {
      if (this.state === 'title') this.title.startPrimary();
    });
    this.ui.bindTitleCards(this.onTitleLink);
    this.ui.bindWelcome({
      control: (id) => this.firstLaunch.chooseControls(id),
      practice: () => this.firstLaunch.startPractice(),
      skip: () => this.firstLaunch.skipPractice(),
      pick: (key) => this.firstLaunch.pickStarter(key),
      done: () => this.firstLaunch.finishOnboarding(),
      feel: (id) => this.firstLaunch.chooseControls(id),
      tryIt: () => this.firstLaunch.startTrial(),
      keep: () => this.firstLaunch.keepControls(),
      guideClose: () => this.firstLaunch.closeGuide(),
    });
    this.ui.bindRecordTabs((tab) => this.ui.setRecordTab(tab));
    void storage.get(REVEAL_KEY).then((v) => (this.revealSeen = v === null ? -1 : Number(v) || 0));
    this.ui.titleRank.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleRank.addEventListener('click', () => this.onTitleLink('record'));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.sound.suspend(); // no music or engine from the background, whatever screen was up
        void this.reminders.planReminders(); // what's done today is known now
      }
      // Back to the front: pick up any change to the balances made on the server (the dashboard),
      // and the server's clock again (the device's may have been moved meanwhile).
      else {
        if (this.state !== 'paused') this.sound.resume(); // a paused run stays quiet until it's resumed
        void this.backend.syncClock().then((known) => known && this.retime());
        void this.wallet
          .refresh()
          .then(() => this.checkMaxOut())
          .then(() => this.title.refreshTitle());
        this.ads.preload();
      }
    });
    window.addEventListener('blur', () => this.pause());

    this.ui.bindCelebration();
    this.ui.bindTitleLinks(this.onTitleLink);
    this.ui.bindBoards(
      BOARD_TABS,
      (id) => void this.boards.showBoard(id),
      (name) => void this.account.savePilotName(name),
    );
    this.ui.bindNameBox('settings', (name) => void this.account.savePilotName(name, 'settings'));
    this.ui.bindNameBox('name', (name) => void this.account.saveNameScreen(name));
    window.addEventListener('online', () => {
      void this.outbox.flush();
      void this.recheck();
    });
    window.addEventListener('offline', () => this.refreshBar());
    // The server's clock, for the day's and week's keys: asked for now, alongside
    // the loads, and waited for a moment at most (a slow or missing signal keeps
    // the device's clock, and connect() checks again once it's known).
    const clock = Promise.race([this.backend.syncClock(), new Promise((done) => setTimeout(done, 800))]);
    const dated = clock.then(() => {
      const now = this.now();
      return Promise.all([this.daily.load(dayKey(now)), this.weeklyGoals.load(weekKey(now)), this.pass.load(now)]);
    });
    // Looks load once; a login reward can give one, so it waits for them.
    const looksReady = Promise.all([this.looks.load().then(() => migrateMissionLooks(this.looks)), this.entitlements.load()]);
    void storage.get(FIRST_PLAYED_KEY).then((v) => {
      if (v) this.firstPlayed = Number(v) || this.firstPlayed;
      else void storage.set(FIRST_PLAYED_KEY, String(this.firstPlayed));
    });
    void Promise.all([
      this.progress.load(),
      this.ranked.load(),
      this.wallet.load(),
      this.leagues.load(),
      this.upgrades.load(),
      dated,
      this.dailyShop.load(),
      this.goalLog.load(),
      this.challenge.load(),
      looksReady,
    ]).then(async () => {
      await this.onboarding.load(this.progress.stats.runs > 0);
      await this.hints.load(this.progress.stats.runs > 0);
      this.economyLoaded = true;
      // A save from before goals: what it has already done counts, with no payout.
      if (!this.goalLog.started) this.goalLog.startWith(ACHIEVEMENTS.filter((a) => progressOn(a, this.snapshot()).done).map((a) => a.id));
      // A new week: this week's ranked run, and last week's league reward.
      this.turnWeek(this.now());
      this.title.refreshTitle();
      // A new player starts with the welcome; the first daily reward waits for the end of it.
      if (this.onboarding.done) this.claimLogin();
      else this.firstLaunch.openWelcome();
      void this.checkWhatsNew();
      void this.connect();
      void this.reminders.planReminders();
    });
    this.outbox.onLate = (run, res) => {
      if (run === this.lastSent && this.state !== 'playing' && this.state !== 'countdown') this.boards.boardNotice(run.board, res);
    };
    this.econ.bindShop(this.shop.onShopOffer, this.shop.onShopBuy, this.shop.onShopTab, this.shop.onShopSet);
    this.bindShowroomDrag();
    this.econ.bindStore(this.shop.onStoreAct);
    this.hangarUi.bindHangar({
      tab: (tab) => this.hangarScreen.onHangarTab(tab),
      pick: (id) => this.hangarScreen.onHangarPick(id),
      action: () => this.hangarScreen.onHangarAction(),
      open: () => this.hangarScreen.openHangar({ from: 'shop' }),
    });
    this.econ.bindPass(this.shop.onPassPremium, () => void this.purchases.buyProduct('season_pass'));
    this.goalsUi.bind({
      tab: (tab) => {
        this.goalsTab = tab;
        this.goalsUi.setTab(tab);
      },
      claimLogin: () => this.claimLogin(),
      claim: (id) => this.goals.onClaim(id),
      reroll: (id) => void this.revives.onReroll(id),
    });
    this.ui.titleLeague.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleLeague.addEventListener('click', () => (this.title.open('ranked') ? this.boards.openLeague() : undefined));
    this.ui.bindSolo(
      (i) => this.startCourse(i),
      (i) => this.startSolo(i),
    );
    this.ui.bindUpgrades(this.hangarScreen.onBuyUpgrade, (id) => {
      this.upgrades.toggle(id as SystemId);
      this.haptics.pickup();
      this.hangarScreen.renderHangar(true);
    });
    void looksReady.then(() => this.applyLooks());
    void loadSettings().then((s) => {
      this.settings = s;
      this.settingsLoaded = true;
      this.applySettings();
      void this.reminders.planReminders();
    });
    // Before modes were split, ranked and solo were endless runs: carry their bests over.
    void Promise.all([loadNumber(CONFIG.storageKeys.best, 0), loadNumber('endless.soloBest', 0), this.progress.load()]).then(([a, b]) => {
      if (Math.max(a, b) > this.progress.endlessBest) this.progress.recordEndless(Math.max(a, b));
      this.title.refreshTitle();
    });
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  // --- state changes -------------------------------------------------------

  /**
   * `startScore` > 0 starts part-way along (dev skip). `seed` replays a
   * known course; otherwise every run gets a fresh one.
   */
  beginRun(
    startScore = 0,
    seed = newSeed(),
    mode: RunMode = 'endless',
    course: Course | null = null,
    env: Environment | null = null,
    daily: DailyRun | null = null,
  ): void {
    this.ui.clearCelebration();
    this.econ.dismissOffer();
    this.econ.setCountdown(0);
    this.econ.setOverRewards([]);
    this.revived = this.revivePending = this.reviveAsked = false;
    this.preRevive = null;
    this.path = [];
    this.pathTimes = [];
    this.pathNext = 0;
    this.ghost.start(mode === 'ranked' ? this.weekly.id : null, this.settings.ghost);
    this.rival.stop();
    const serial = ++this.runSerial;
    if (mode === 'ranked' && this.settings.rivalGhost) void this.loadRival(serial);
    this.zen = this.zenNext && mode === 'endless' && !course && !env && !daily;
    this.zenNext = false;
    this.ui.setZen(this.zen);
    this.gates.reset();
    this.milestones.reset();
    this.bonusCredits = 0;
    this.speeds = [];
    this.sampleT = 0;
    this.hitWhat = '';
    this.ui.showShare(false);
    this.ui.showDouble(null);
    this.preview = null;
    this.seed = seed;
    this.mode = mode;
    this.dailyRunNow = daily;
    this.dailyLine = '';
    this.unlockable = (mode === 'ranked' || mode === 'endless') && startScore === 0 && !this.zen;
    this.course = course;
    this.environment = env;
    this.world.setCourse(course);
    this.world.setEnvironment(env);
    this.world.scripted = this.practiceNext; // the practice course places its own pickups and power-ups
    this.world.gateRuns = mode === 'endless' && !course && !env && !this.zen && !this.practiceNext; // gate runs: endless only
    this.practiceNext = false;
    this.passCount = 0;
    this.sectionIdx = -1;
    this.hitThisRun = false;
    this.scoreBase = 0;
    this.world.assist = this.assistOn();
    // Your switched-on upgrades (ranked checks them against the league's cap before starting).
    // The daily challenge is one board for everyone: the standard ship, whatever you own.
    this.ship = daily ? STANDARD : this.upgrades.stats();
    this.world.collectScale = this.ship.collect;
    this.world.powerRate = this.ship.powerRate;
    this.ui.setMode(this.modeLabel());
    this.pickupCount = 0;
    this.recorded = this.zen; // zen keeps nothing: no stats, bests, credits or boards
    this.assisted = this.assistOn();
    this.boostSeconds = this.roomsEntered = 0;
    this.infoOpen = null;
    this.applyLooks();
    this.world.reset(CONFIG.field.startClearance, true, startScore, seed);
    const level = Math.floor(startScore / CONFIG.score.levelLength) + 1;
    this.sound.ignite();
    this.sound.setTheme(this.areaMusic(level));
    this.runStart = this.world.distance - startScore / CONFIG.score.pointsPerUnit;
    this.distanceScore = startScore;
    this.score = startScore - this.scoreBase;
    this.bonus = 0;
    this.speed = speedAt(startScore);
    this.chain = this.chainTimer = this.nearMissCount = this.bestChain = 0;
    this.nudgeMs = 0;
    this.ui.hideCombo();
    this.crashMs = 0;
    this.shattered = false;
    this.overShown = false;
    this.ui.showQuickRetry(null);
    this.boostMeter = this.dev.fullBoost ? 1 : 0;
    this.boosting = false;
    this.boostLevel = 0;
    this.endPowers();
    if (this.ship.startShield) {
      this.shield = true;
      this.player.setShield(true);
    }
    this.stage.pullBack = this.stage.drop = 0;
    this.speedLines.update(0, 0, 0);
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.events.clear();
    this.weather.clear();
    this.input.releaseAll();
    this.input.calibrate(); // however you're holding the phone now is straight ahead
    this.input.enabled = true;
    this.level = level;
    const progress = startScore / CONFIG.score.levelLength;
    this.ui.setScore(this.score);
    if (this.unlockable) this.progress.reachedLevel(level);
    this.ui.setLevel(level);
    this.ui.setProgress(progress - (level - 1));
    this.applyLook(progress);
    if (daily) {
      this.ui.setLevel(1);
      this.ui.setProgress(0);
      this.ui.announceLevel(1, `daily · ${daily.name}`);
    } else if (course) {
      const n = Math.max(1, COURSES.indexOf(course) + 1);
      this.ui.setLevel(n);
      this.ui.setProgress(0);
      this.ui.announceLevel(n, course.name);
    } else if (this.zen) this.ui.showRoom(`zen · ${this.areaName(level)}`);
    else this.ui.announceLevel(level, this.areaName(level));
    this.ui.setOverHeading('crashed');
    this.ui.show(null);
    this.ui.showHud(true);
    this.state = 'playing';
    this.runTime = 0;
  }

  /** `fell` = dropped into a pit (falls away) rather than hitting something (shatters). */
  private crash(fell = false): void {
    if (this.state === 'crashed') return;
    this.ghost.stop();
    this.rival.stop();
    this.fell = fell;
    this.state = 'crashed';
    this.crashMs = 0;
    this.crashRealMs = 0;
    this.hitWhat = fell ? '' : this.world.hitName();
    this.moment = crashMomentOn({
      setting: this.settings.crashMoment,
      reduceMotion: this.settings.reduceMotion,
      ranked: this.mode === 'ranked',
      practice: this.practice !== null,
      zen: this.zen,
    });
    if (this.moment) this.ui.showRoom(fell ? 'fell' : this.hitWhat ? `hit ${this.hitWhat}` : 'hit');
    this.input.enabled = false;
    this.speedLines.update(0, 0, 0);
    if (fell) {
      this.sound.fall();
      this.haptics.fall();
      this.player.fall();
    } else {
      this.sound.crash();
      this.haptics.crash();
    }
    this.ui.hideCombo();
    this.trail.setVisible(false);
    this.sound.setWind(0);
    this.player.setShield(false);
    this.ui.setPower('');
    this.revivePending = this.revives.canRevive();
    this.reviveAsked = false;
    this.quick = quickRetryOn(this.settings.quickRetry, this.mode, this.practice !== null);
    this.settledMs = 0;
    if (!this.revivePending) this.settleCrash();
  }

  /** Record a crashed run and fill the game-over screen (after any revive offer is turned down). */
  settleCrash(): void {
    this.revivePending = false;
    this.settledMs = this.crashMs;
    const { best, isNew } = this.recordBest(false);
    this.quickLine = isNew ? `${formatScore(this.score)} · new best` : `${formatScore(this.score)} · best ${formatScore(best)}`;
    this.ui.setGameOver(this.score, best, isNew, this.nearMissCount, this.bestChain, this.seed);
    this.fillSummary(true);
    const where = themeForLevel(this.level) === 'interior' ? this.world.roomName || 'corridor' : this.areaName(this.level);
    const extra = this.finishRun(where);
    this.offerShare(isNew);
    if (this.course) {
      const length = courseLength(this.course);
      const pct = Math.floor((100 * (this.world.distance - this.world.finishAt + length)) / length);
      this.ui.setGameOverExtra(
        [`${Math.max(0, Math.min(99, pct))}% of ${this.course.name}`, this.dailyRunNow ? this.dailyLine : '', extra].filter(Boolean).join(' · '),
      );
    } else this.ui.setGameOverExtra(extra);
  }

  /**
   * Each mode keeps its own best: ranked (this week's level), each solo
   * environment, each set level, and endless. Assisted runs never count.
   */
  private recordBest(finished: boolean): { best: number; isNew: boolean } {
    const p = this.progress;
    const score = this.assisted ? 0 : this.score;
    if (this.mode === 'ranked') {
      const isNew = p.recordWeekly(this.weekly.id, score, finished);
      if (isNew && this.path.length > 1) this.ghost.save({ week: this.weekly.id, step: PATH_STEP, xs: [...this.path], ts: [...this.pathTimes] });
      return { best: p.weeklyBest(this.weekly.id), isNew };
    }
    if (this.dailyRunNow) return this.recordDaily(this.state === 'finished');
    if (this.course) {
      const before = p.course(this.course.id).score;
      if (!finished) p.recordCourse(this.course.id, 0, this.runTime, score);
      return { best: Math.max(before, Math.floor(score)), isNew: score > before };
    }
    if (this.environment) {
      const isNew = p.recordEnv(this.environment.id, score);
      return { best: p.envBest[this.environment.id] ?? 0, isNew };
    }
    const isNew = p.recordEndless(score);
    return { best: p.endlessBest, isNew };
  }

  /** Save this run into the lifetime stats (once). Returns a line for the game-over screen. */
  private finishRun(crashedIn: string | null): string {
    if (this.recorded) return '';
    this.recorded = true;
    this.progress.recordRun({
      score: this.assisted ? 0 : this.score,
      level: this.level,
      distance: this.world.distance,
      seconds: this.runTime,
      nearMisses: this.nearMissCount,
      bestChain: this.bestChain,
      pickups: this.pickupCount,
      crashedIn,
    });
    const lines: string[] = [];
    // Ranked pays full rate; solo, set levels and endless half.
    const score = this.assisted ? 0 : this.score;
    const fromPickups = this.assisted ? 0 : this.pickupCount * CONFIG.economy.runCredits.pickupCredits;
    let credits = creditsFor(score, this.mode === 'ranked') + fromPickups + this.bonusCredits;
    credits += this.ranks.recordRank(this.state === 'finished');
    if (this.assisted) lines.push('assist mode. not counted as a best');
    this.wallet.add(credits);
    this.lastRunCredits = credits;
    this.ui.showDouble(credits > 0 && this.ads.offers('doubleCredits') ? `double +${formatScore(credits)} credits · ${this.ads.label()}` : null);
    this.ads.afterRun(Date.now(), false); // the device clock, like the first-played time it is measured from
    this.ads.preload(); // an ad ready for the offers after a run (none for premium)
    const from = [
      fromPickups > 0 ? `${formatScore(fromPickups)} from pickups` : '',
      this.bonusCredits > 0 ? `${formatScore(this.bonusCredits)} from milestones and gate runs` : '',
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`+${formatScore(credits)} credits${from ? ` (${from})` : ''}`);
    const board = boardForRun(this.mode, this.environment?.id ?? null, this.course !== null, this.dailyRunNow !== null);
    if (board && board !== 'ranked') this.submitToBoard(board, this.state === 'finished');
    if (this.unlockable && !this.allOpen) {
      const next = nextEnvironment(this.progress.furthest);
      if (next) lines.push(`solo: ${next.env.name} opens at level ${next.status.level} (${next.status.toGo} to go)`);
    }
    this.econ.setOverRewards(this.runRewards());
    this.title.refreshTitle();
    this.checkGoals(); // the stats are in: any goal this run finished pays out now
    return lines.join(' · ');
  }

  /** Daily and weekly goal progress and season pass XP for the run just recorded; lines for the end screen. */
  private runRewards(): string[] {
    const now = this.now();
    const score = this.assisted ? 0 : this.score;
    const out: string[] = [];
    const run = {
      ranked: this.mode === 'ranked',
      score,
      level: this.level,
      nearMisses: this.nearMissCount,
      pickups: this.pickupCount,
      boostSeconds: this.boostSeconds,
      rooms: this.roomsEntered,
      beatPar: this.beatPar,
    };
    if (!this.title.open('ranked')) {
      // Ranked isn't open yet: its goals take any run, against the bronze par.
      run.ranked = true;
      run.beatPar = score >= leaguePar(0, this.weekly.target);
    }
    const done = [...this.daily.recordRun(dayKey(now), run), ...this.weeklyGoals.recordRun(weekKey(now), run)];
    for (const q of done) out.push(`goal done: ${questText(q, this.title.open('ranked'))} · claim it in goals`);
    const xp = runXp(score);
    const before = this.pass.tier;
    const paid = this.pass.addXp(now, xp);
    for (const r of paid) this.grant(r);
    const tier = this.pass.tier;
    if (tier > before) out.push(`season pass: tier ${tier} reached`);
    else if (xp > 0) out.push(`season pass +${xp} xp · tier ${tier}`);
    if (paid.length > 0) out.push(paid.map(rewardText).join(' · '));
    return out;
  }

  /** Pay a reward into the wallet or looks; returns it in words. `source` names cores for the server (earn_cores). */
  grant(r: Reward, source?: string): string[] {
    if (r.credits) {
      this.wallet.add(r.credits);
      this.econ.bump('credits');
    }
    if (r.cores) {
      this.wallet.addCores(r.cores, r.source ?? source ?? 'reward');
      this.econ.bump('cores');
    }
    const look = rewardLook(r);
    if (look) this.looks.give(`${look.slot}:${look.id}`);
    return rewardParts(r);
  }

  // --- economy screens -------------------------------------------------------

  /** Today's login reward, if it's not claimed yet: paid and shown. */
  claimLogin(): void {
    const day = dayKey(this.now());
    const step = this.daily.loginDue(day);
    if (step < 0) return;
    const r = this.daily.claimLogin(day);
    if (!r) return;
    const lines = this.grant(r, `login:${day}`);
    this.ui.celebrate([{ kicker: `day ${step + 1} of ${CONFIG.economy.login.length}`, icon: GIFT_ICON, name: 'daily reward', lines }]);
    this.sound.power();
    this.haptics.pickup();
    this.title.refreshTitle();
    if (this.infoOpen === 'goals') this.goals.renderGoals();
  }

  // --- revive ----------------------------------------------------------------

  /** Hold everything still for a 3-2-1, then play. */
  startCountdown(): void {
    this.state = 'countdown';
    this.speedLines.update(0, 0, 0);
    this.countdownT = CONFIG.economy.revive.countdown;
    this.input.enabled = false;
    this.input.releaseAll();
    this.econ.setCountdown(Math.ceil(this.countdownT));
  }

  private updateCountdown(dt: number): void {
    this.countdownT -= dt;
    this.econ.setCountdown(Math.ceil(this.countdownT));
    this.feedAudio(dt, false, this.speed);
    if (this.countdownT > 0) return;
    this.econ.setCountdown(0);
    this.state = 'playing';
    this.input.enabled = true;
    this.input.releaseAll();
    this.input.calibrate();
    this.sound.ignite();
  }

  /** The wallet bar and the day turning, about once a second on the title. */
  private tickEconomy(dt: number): void {
    this.economyTimer -= dt;
    if (this.economyTimer > 0) return;
    this.economyTimer = 1;
    const now = this.now();
    this.daily.turn(dayKey(now));
    this.weeklyGoals.turn(weekKey(now));
    this.pass.turn(now);
    this.turnWeek(now);
    void this.reminders.offerReminders();
    if (Date.now() - this.lastRecheck > 20_000) {
      // Offline: is the server back?
      this.lastRecheck = Date.now();
      void this.recheck();
    }
    if (this.turnDay(now) || Math.floor(now / 60_000) !== this.titleMinute) {
      // A new day's challenge, or the minute its time left counts down.
      this.titleMinute = Math.floor(now / 60_000);
      this.ui.renderTitleCards(this.title.titleCards(now));
    }
    this.refreshBar(now);
    // The season looks by the trusted clock (start-up had only the phone's); owned or worn ones stay.
    const keep = (l: LookItem) => this.looks.has(keyOf(l)) || this.looks.equipped[l.slot] === l.id;
    if (refreshSeasonLooks(now, keep) && this.infoOpen === 'hangar') this.hangarScreen.renderHangar(true);
  }

  /** The week by the trusted clock: this week's ranked run, and last week's league reward paid. Not mid-run. */
  private turnWeek(now: number): void {
    const week = weekKey(now);
    if (this.weekly.id !== `ranked-${week}`) this.weekly = weeklyRun(week);
    this.payLeagueWeek(now);
  }

  /** Today's challenge by the trusted clock; true if the day turned. Not mid-run (the run keeps its own). */
  private turnDay(now: number): boolean {
    const day = dayKey(now);
    if (this.today.day === day) return false;
    this.today = dailyRun(day);
    return true;
  }

  /** A new league week: pay last week's reward (before anything else rolls the week over and it's lost). */
  payLeagueWeek(now: number): void {
    const weekly = this.leagues.rollWeek(now);
    if (weekly <= 0) return;
    this.wallet.add(weekly);
    this.ui.showNotice(`weekly league reward +${formatScore(weekly)} credits`);
  }

  /** The time for rewards, streaks, days and weeks: the server's clock when known, the device's offline. */
  now(): number {
    return this.backend.now();
  }

  /** The server's clock has arrived (late at start-up, or moved): turn the day and week by it, and pay today's login reward if it's due. */
  private retime(): void {
    if (!this.economyLoaded) return;
    this.tickEconomy(Infinity);
    if (this.onboarding.done) this.claimLogin();
  }

  /** Sign in and sync with the server, if there is one (see src/server). */
  private async connect(): Promise<void> {
    // The server's clock may have come after start-up stopped waiting: check today by it (asking again if need be).
    if (this.backend.clockKnown || (await this.backend.syncClock())) this.retime();
    errorLog.attach(this.backend, () => this.errorScreen());
    if (!(await this.signInAndSync())) return;
    const refund = await migrateTickets((n) => this.wallet.addCores(n, 'tickets'));
    if (refund > 0) {
      this.ui.showNotice(`ranked is unlimited now: your spare tickets became ${formatScore(refund)} cores`);
      this.title.refreshTitle();
    }
    // What the account has bought, as the server's purchase records have it.
    const records = (await this.backend.purchases()) ?? [];
    const bought = [...new Set(records.map((r) => r.product))];
    for (const id of bought) this.purchases.grantProduct(id);
    const pass = this.purchases.restorePass(records);
    if (pass) this.ui.celebrate([{ kicker: 'season pass', icon: PASS_ICON, name: 'premium restored', lines: pass }]);
    // Refunded (and not bought again): no longer owned on this device either.
    for (const id of bought) {
      const e = id.startsWith('refunded:') ? entitlementFor(id.slice(9)) : null;
      if (e && !bought.some((b) => entitlementFor(b) === e)) this.entitlements.revoke(e);
    }
    this.applyLooks();
    await this.store.start(this.backend.userId);
    void this.ads.start().then(() => {
      const row = document.getElementById('privacy-choices');
      if (row) row.hidden = !this.ads.privacyRequired; // Google asks for a way back to the consent form here
    });
    this.storeProducts = await this.store.products();
    if (this.infoOpen === 'store') this.shop.openStore();
  }

  /**
   * Sign in, then bring the cloud save, the wallet and the waiting runs up to
   * date. False if the cloud save was newer and the game is starting again
   * from it. Started offline, it runs again when the server comes back (recheck).
   */
  private async signInAndSync(): Promise<boolean> {
    if (!(await this.backend.signIn())) return true;
    void errorLog.send(); // anything noted before signing in
    if (await this.cloud.start()) {
      location.reload(); // the cloud save is newer: start again from it
      return false;
    }
    await this.wallet.link(this.backend);
    await this.checkMaxOut();
    this.title.refreshTitle();
    this.queueShip();
    void this.account.askName();
    void this.outbox.flush(); // runs that couldn't be sent last time
    return true;
  }

  /** The end screen's share button: for a new personal best in any mode, and every ranked run. */
  private offerShare(isNew: boolean): void {
    this.shareNew = isNew && !this.assisted && this.score > 0;
    this.ui.showShare((this.shareNew || this.mode === 'ranked') && shareAvailable());
  }

  /** A picture of this run for the share sheet: the score, the mode or board, and your ship, in the store art's dusk. */
  private async share(): Promise<void> {
    const lg = this.leagues;
    const lines: string[] = [];
    if (this.mode === 'ranked')
      lines.push(
        `${rankName(this.ranked.rank)} · ${leagueName(lg.league, lg.division)}`,
        `best this week ${formatScore(this.progress.weeklyBest(this.weekly.id))}`,
      );
    else if (this.dailyRunNow) {
      const streak = this.challenge.streakOn(this.dailyRunNow.day);
      lines.push(streak > 1 ? `${streak} days in a row` : 'the same course for everyone today');
    } else lines.push(rankName(this.ranked.rank));
    const outcome = await shareCard({
      score: formatScore(this.score),
      mode: this.modeLabel(),
      kicker: this.shareNew ? 'new best' : '',
      lines,
      ship: this.portraits.get(this.shipLook(), 4),
    });
    if (outcome === 'saved') this.ui.showNotice('share card saved');
    else if (outcome === 'unavailable') this.ui.showNotice("sharing isn't available here");
  }

  /** There's a server, but it can't be reached right now (no signal, or it's down). Everything on the device carries on. */
  offline(): boolean {
    return this.backend.online && (!this.backend.reachable || (typeof navigator !== 'undefined' && navigator.onLine === false));
  }

  /** Offline: ask the server for the time now and then (it needs no sign-in), and pick everything up again when it answers. */
  async recheck(): Promise<void> {
    if (!this.offline() || this.rechecking) return;
    this.rechecking = true;
    try {
      if (!(await this.backend.syncClock())) return;
      this.retime();
      if (!this.backend.userId) await this.signInAndSync();
      else {
        void this.outbox.flush();
        void errorLog.send();
        void this.wallet.refresh().then(() => this.title.refreshTitle());
      }
    } finally {
      this.rechecking = false;
      this.refreshBar();
    }
  }

  refreshBar(now = this.now()): void {
    this.ui.setOffline(this.offline());
    this.econ.setBar(this.wallet.credits, this.wallet.cores);
    this.econ.setNews('goals', this.daily.loginDue(dayKey(now)) >= 0 || this.goals.goalsToClaim() > 0);
  }

  // --- leaderboards ----------------------------------------------------------------

  /** Send a finished run to its board. Assisted and dev runs never go. */
  submitToBoard(board: BoardId, finished: boolean): void {
    if (this.assisted || this.invincible() || this.dev.autopilot) return;
    this.queueShip(); // the rank and league badges may have moved
    // A revived run counts as it stood at its first crash.
    const run = this.preRevive ?? { score: Math.floor(this.score), seconds: this.runTime, distance: this.world.distance - this.runStart };
    if (run.distance < 60 || run.seconds < 5 || run.score <= 0) return; // a crash at the start isn't a result
    const sub: RunSubmission = {
      board,
      league: board === 'ranked' ? this.leagues.league : 0,
      score: run.score,
      seconds: run.seconds,
      distance: run.distance,
      finished,
      path: board === 'ranked' || board === 'daily' ? [...this.path] : [],
      ...(board === 'daily' && this.dailyRunNow ? { day: this.dailyRunNow.day } : {}),
      ...(board === 'ranked' ? { week: this.weekly.id.replace(/^ranked-/, '') } : {}),
    };
    this.lastSent = sub;
    void this.outbox.send(sub).then((res) => {
      if (!res) return; // waiting for a signal
      this.boards.boardNotice(board, res);
    });
  }

  /** The looks you have on, as the boards keep them (with the rank and league your badge decals show). */
  shipLook(): ShipLook {
    return { ...this.looks.equipped, rank: this.ranked.rank, league: this.leagues.league, division: this.leagues.division };
  }

  /** Send your looks to the boards a moment after they change (trying looks on sends nothing: only what's equipped). */
  private queueShip(): void {
    window.clearTimeout(this.shipTimer);
    this.shipTimer = window.setTimeout(() => void this.syncShip(), 2000);
  }

  /** Send your looks to the boards if they've changed since last time. */
  async syncShip(): Promise<void> {
    if (!this.backend.online) return;
    const ship = this.shipLook();
    const key = JSON.stringify(ship);
    if (key === this.shipSent) return;
    if (await this.backend.setShip(ship)) this.shipSent = key;
  }

  /** Dev: steer down the safe lane, as the fairness tests do. */
  private autopilot(): number {
    // A little further ahead and firmer than the tests' pilot: the real ship eases into its turns.
    const lane = this.world.laneAt(this.world.distance + 5);
    if (lane === null) return this.input.steering();
    return Math.max(-1, Math.min(1, (lane - this.world.lateral) * 3));
  }

  /** Assist mode works everywhere but ranked. */
  private assistOn(): boolean {
    return this.settings.assist && this.mode !== 'ranked' && !this.dailyRunNow;
  }

  /** What the HUD and game-over screen call this run. */
  private modeLabel(): string {
    if (this.mode === 'ranked') return `ranked · ${this.weekly.name}`;
    if (this.dailyRunNow) return `daily · ${this.dailyRunNow.name}`;
    if (this.course) return `level ${COURSES.indexOf(this.course) + 1} · ${this.course.name}`;
    if (this.environment) return `solo · ${this.environment.name}`;
    return this.zen ? 'zen' : 'endless';
  }

  /** The area's name, biome and music at `level` (solo stays in its environment). */
  private areaName(level: number): string {
    return this.environment ? this.environment.name : themeName(level);
  }

  private areaBiome(level: number): ReturnType<typeof biomeForLevel> {
    return this.environment ? this.environment.biome : biomeForLevel(level);
  }

  private areaMusic(level: number): MusicId {
    return this.environment ? musicForArea(this.environment.theme, this.environment.biome) : musicFor(level);
  }

  /** The player as the goals see them (everything here is already saved: nothing extra is tracked). */
  snapshot(): Snapshot {
    const base = this.baseSnapshot();
    // "Own N looks" counts the looks goals unlock too, so count once without it and then again with.
    base.looksOwned = this.looks.count(this.ownerFor(base));
    return base;
  }

  private baseSnapshot(): Snapshot {
    const st = this.progress.stats;
    return {
      runs: st.runs,
      distance: st.distance,
      seconds: st.seconds,
      nearMisses: st.nearMisses,
      bestChain: st.bestChain,
      pickups: st.pickups,
      crashes: Object.values(st.crashes).reduce((n, v) => n + v, 0),
      furthest: this.progress.furthest,
      endlessBest: this.progress.endlessBest,
      envBest: this.progress.envBest,
      coursesDone: COURSES.filter((c) => this.progress.course(c.id).stars & 1).length,
      stars: this.progress.totalStars(),
      upgradePoints: this.upgrades.points(),
      looksOwned: 0,
    };
  }

  private ownerFor(snap: Snapshot): Owner {
    // Maxed out: plenty of stars, premium looks on.
    const all = this.allOpen;
    return {
      rank: this.ranked.rank,
      stars: all ? 999 : this.progress.totalStars(),
      league: this.leagues.league,
      premium: all || this.entitlements.has('premium'),
      goal: (id) => {
        const a = achievement(id);
        if (all) return { have: a?.target ?? 1, target: a?.target ?? 1, done: true };
        return a ? progressOn(a, snap) : { have: 0, target: 1, done: false };
      },
    };
  }

  /** What the player has, for unlocking looks. */
  owner(): Owner {
    return this.ownerFor(this.snapshot());
  }

  /** Put the equipped looks (plus any preview) on the ship. */
  applyLooks(): void {
    const eq = { ...this.looks.equipped };
    if (this.preview) Object.assign(eq, this.preview);
    this.player.setShape(eq.hull as ShipId);
    this.player.setPaint(find('paint', eq.paint).colors ?? null);
    const decal =
      eq.decal === 'rank' ? insignia(this.ranked.rank) : eq.decal === 'league' ? emblem(this.leagues.league, this.leagues.division) : decalArt(eq.decal);
    this.player.setDressing(eq.markings as Marking, eq.fins as Fin, decal);
    const flame = find('engine', eq.engine).colors;
    this.trail.setTint(flame?.[0] ?? null, flame?.[1] ?? null);
    this.trail.setStyle(eq.trail as TrailId);
    this.queueShip();
  }

  // --- the hangar: looks by slot, and the ship's upgrades ---------------------------------------

  // --- goals ---------------------------------------------------------------------------------------

  /**
   * Pay and announce goals finished since last time, and any set a purchase just made whole.
   * Goals can unlock looks and looks can finish goals ("own 25 looks"), so go round until nothing new.
   */
  checkGoals(): void {
    const party: Celebration[] = [];
    for (let pass = 0; pass < 4; pass++) {
      const snap = this.snapshot();
      const fresh = ACHIEVEMENTS.filter((a) => progressOn(a, snap).done && !this.goalLog.seenDone(a.id));
      const sets = this.looks.completedSets(SETS, this.owner());
      if (fresh.length === 0 && sets.length === 0) break;
      for (const a of fresh) this.goalLog.markSeen(a.id);
      if (fresh.length > 0) this.goalLog.save();
      if (fresh.length > 3) {
        party.push({
          kicker: `${fresh.length} goals complete`,
          icon: GOAL_ICON,
          name: `${fresh.length} goals`,
          lines: [...fresh.slice(0, 5).map((a) => a.name), 'claim them in goals'],
        });
      } else {
        for (const a of fresh)
          party.push({
            kicker: 'goal complete',
            icon: GOAL_ICON,
            name: a.name,
            lines: [a.text, ...this.goals.goalRewardText(a).split(' · '), 'claim it in goals'],
          });
      }
      for (const id of sets) {
        const set = SETS.find((x) => x.id === id);
        if (!set) continue;
        this.grant({ cores: set.bonusCores }, `set:${set.id}`);
        party.push({ kicker: 'set complete', icon: GOAL_ICON, name: set.name, lines: [`you own every look in it`, `+${set.bonusCores} cores`] });
      }
    }
    if (party.length > 0) {
      this.ui.celebrate(party);
      this.title.refreshTitle();
      this.haptics.level(false);
    }
  }

  openInfo(which: InfoScreen): void {
    this.infoOpen = which;
    this.ui.show(which);
  }

  /** A ranked or endless run reached `level`: remember it, and say so when it opens a solo environment. */
  private noteReached(level: number): void {
    const before = this.progress.reachedLevel(level);
    const opened = newlyOpened(before, level);
    if (opened.length > 0) this.ui.showNotice(`solo unlocked: ${opened.map((e) => e.name).join(', ')}`);
  }

  /** Is this solo environment open to fly? */
  private envOpen(env: Environment): boolean {
    return this.allOpen || envStatus(env, this.progress.furthest).open;
  }

  /** Solo: pick an environment (endless in it, with a high score each) or a set level. */
  private openSolo(): void {
    const furthest = this.progress.furthest;
    const next = this.allOpen ? null : nextEnvironment(furthest);
    this.ui.renderEnvironments(
      ENVIRONMENTS.map((e, i) => {
        const st = envStatus(e, furthest);
        const locked = !this.envOpen(e);
        return {
          index: i,
          name: e.name,
          best: this.progress.envBest[e.id] ?? 0,
          locked,
          need: locked ? `reach level ${st.level} in ranked or endless` : '',
          toGo: locked ? `${st.toGo} level${st.toGo === 1 ? '' : 's'} to go` : '',
          fraction: st.fraction,
        };
      }),
      next
        ? `next to unlock: ${next.env.name}, ${next.status.toGo} level${next.status.toGo === 1 ? '' : 's'} to go. environments open as you reach them in ranked or endless (you're furthest at level ${furthest}).`
        : 'every environment is open. pick a place and see how far you get: it stays there and keeps getting harder.',
    );
    this.openCourses();
    this.openInfo('solo');
  }

  /** Ranked: this week's level (the same for everyone), your upgrades up to the league's cap. */
  startRanked(): void {
    const active = this.upgrades.activePoints();
    const cap = this.leagues.current.max;
    if (active > cap) {
      // Over the cap: choose which systems to switch off first.
      this.ui.showNotice(`${active} upgrade points on, ${this.leagues.current.name} allows ${cap}. switch some off`);
      if (this.state === 'crashed') this.toMainMenu();
      this.hangarScreen.openHangar({ upgrades: true });
      return;
    }
    // The week may have turned since the game started.
    this.turnWeek(this.now());
    this.beginRun(0, this.weekly.seed, 'ranked');
  }

  /** Solo in one environment: endless there, getting harder. */
  private startSolo(index: number): void {
    const env = ENVIRONMENTS[index];
    if (env && this.envOpen(env)) this.beginRun(0, newSeed(), 'solo', null, env);
  }

  /** Endless: open ground, then every area and biome in turn, forever. */
  startEndless(): void {
    this.beginRun(0, newSeed(), 'endless');
  }

  /** Zen: endless at a gentle, capped speed; a crash fades and carries on. No score, rewards or boards. */
  private startZen(): void {
    this.zenNext = true;
    this.beginRun(0, newSeed(), 'endless');
  }

  /** Ranked with the rival's ghost on: ask the server for the run just above yours, and fly it if it's still this run. */
  private async loadRival(serial: number): Promise<void> {
    const r = await this.backend.rivalRun().catch(() => null);
    if (!r || serial !== this.runSerial || this.mode !== 'ranked' || (this.state !== 'playing' && this.state !== 'countdown' && this.state !== 'paused'))
      return;
    this.rival.fly(rivalGhost(r.path, r.seconds, this.weekly.id, PATH_STEP));
    this.ui.showNotice(`racing ${r.name}'s ghost · ${formatScore(r.score)}`);
  }

  /** The daily challenge: today's course (by the trusted clock), the standard ship, one board for everyone. */
  private startDaily(): void {
    this.turnDay(this.now());
    this.beginRun(0, this.today.course.seed, 'solo', this.today.course, null, this.today);
  }

  /** Retry in the same mode (and environment, or level) as the run that just ended. */
  private retry(): void {
    if (this.mode === 'ranked') this.startRanked();
    else if (this.dailyRunNow) this.startDaily();
    else if (this.course) this.startCourse(COURSES.indexOf(this.course));
    else if (this.environment) this.startSolo(ENVIRONMENTS.indexOf(this.environment));
    else if (this.zen) this.startZen();
    else this.startEndless();
  }

  private onTitleLink = (name: string): void => {
    // Every way in to a part of the game that isn't open yet says when it opens (the cores chip, cards...).
    const needs: Record<string, Feature> = {
      solo: 'solo',
      record: 'record',
      shop: 'shop',
      'shop-cores': 'shop',
      pass: 'shop',
      boards: 'leaderboard',
      challenge: 'daily',
    };
    const f = needs[name];
    if (f && !this.title.open(f)) {
      this.ui.showNotice(nextStageText(this.progress.stats.validRuns, this.onboarding.done) || 'not open yet');
      return;
    }
    if (name === 'endless') this.startEndless();
    else if (name === 'zen') this.startZen();
    else if (name === 'challenge') this.startDaily();
    else if (name === 'solo') this.openSolo();
    else if (name === 'record') this.record.openRecord();
    else if (name === 'goals') this.goals.openGoals();
    else if (name === 'hangar') this.hangarScreen.openHangar();
    else if (name === 'shop') {
      this.shopPick = -1;
      this.preview = null;
      this.shop.openShop();
    } else if (name === 'shop-cores') this.shop.openStore(null);
    else if (name === 'pass') this.shop.openPass(null);
    else if (name === 'boards') this.boards.openBoards();
    else if (name === 'daily') this.goals.openGoals('daily');
    else if (name === 'claim') this.claimLogin();
    else if (name === 'gift') void this.revives.claimGift();
  };

  // --- first launch ------------------------------------------------------------------------------

  /** Dev invincibility, or the practice run (which can't be failed). */
  private invincible(): boolean {
    return this.dev.invincible || this.practice !== null;
  }

  /** Double-tap and hold boosts: the setting, and never with tap-sides steering (quick taps there are steering). */
  doubleTapOn(): boolean {
    return this.settings.doubleTapBoost && this.settings.touch !== 1;
  }

  /** How the player steers now (keys: a computer, with the keys chosen over the mouse). */
  controlsNow(): ControlId {
    if (this.settings.tilt) return 'tilt';
    if (this.settings.touch === 1) return 'sides';
    return !hasTouch() && (this.onboarding.keys ?? true) ? 'keys' : 'drag';
  }

  /**
   * The Android back button (and Escape): close what's open, pause a run. At the top (the title or
   * welcome screen) it asks before closing, or returns false to leave the app (see exit.ts).
   */
  back(): boolean {
    if (this.exitAsking) this.closeExitAsk();
    else if (this.ui.celebrating) this.ui.skipCelebration();
    else if (this.econ.offerOpen && !(this.state === 'crashed' && this.revivePending))
      this.econ.declineOffer(); // the reminders offer: no thanks
    else if (cancelOpenReport()) return true;
    else if (this.ui.guideOpen) this.firstLaunch.closeGuide();
    else if (this.settingsOpen) this.closeSettings();
    else if (this.infoOpen === 'welcome') return this.backAtTop();
    else if (this.infoOpen) this.closeInfo();
    else if (this.state === 'playing' || this.state === 'countdown') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'crashed' && this.revivePending) this.declineRevive();
    else if (this.state === 'crashed' || this.state === 'finished') this.toMainMenu();
    else return this.backAtTop();
    return true;
  }

  /** Back with nothing left to close: ask first (true), or false to leave (Android) or do nothing (web). */
  private backAtTop(): boolean {
    if (exitChoice({ native: this.native, ask: this.settings.confirmExit, asking: this.exitAsking }) !== 'ask') return false;
    this.exitAsking = true;
    this.econ.offer(
      { kicker: '', name: 'close endless space?', lines: ['your progress is saved'], yes: 'close', yesEnabled: true, no: 'stay', seconds: 0 },
      () => {
        this.exitAsking = false;
        void import('@capacitor/app').then(({ App }) => App.exitApp());
      },
      () => (this.exitAsking = false),
    );
    return true;
  }

  /** "stay" (or back again while the dialog shows). */
  private closeExitAsk(): void {
    this.exitAsking = false;
    this.econ.dismissOffer();
  }

  /** Back on the revive offer (or before it shows): no thanks, and the game-over screen. */
  private declineRevive(): void {
    this.econ.dismissOffer();
    this.reviveAsked = true;
    this.settleCrash();
  }

  private pause(): void {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.econ.setCountdown(0);
    this.state = 'paused';
    this.speedLines.update(0, 0, 0); // not frozen on screen while paused
    this.input.releaseAll();
    this.sound.suspend();
    this.ui.show('paused');
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.lastTime = performance.now();
    this.sound.resume();
    this.ui.show(null);
    this.startCountdown(); // a moment to get ready before control comes back
  }

  /** A sideways drag on the open scene over a showroom turns the ship round. It never reaches the tap or the steering. */
  private bindShowroomDrag(): void {
    const spin = this.showroomSpin;
    for (const surface of document.querySelectorAll<HTMLElement>('.showroom-spin')) {
      let id = -1;
      let lastX = 0;
      const end = (e: PointerEvent): void => {
        if (e.pointerId !== id) return;
        e.stopPropagation();
        id = -1;
        spin.release();
      };
      surface.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (id !== -1) return;
        id = e.pointerId;
        lastX = e.clientX;
        spin.perPx = (1.3 * Math.PI) / Math.max(1, window.innerWidth); // a full width's drag: a bit over half a turn
        spin.drag(0);
        surface.setPointerCapture?.(id);
      });
      surface.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        e.stopPropagation();
        spin.drag(e.clientX - lastX);
        lastX = e.clientX;
      });
      surface.addEventListener('pointerup', end);
      surface.addEventListener('pointercancel', end);
      surface.addEventListener('lostpointercapture', end);
    }
  }

  private onTap = (): void => {
    if (this.settingsOpen || this.infoOpen) return;
    switch (this.state) {
      case 'title':
        break; // pick a mode with the buttons
      case 'crashed':
        if (
          tapRetries({
            crashMs: this.crashMs,
            settledMs: this.settledMs,
            revivePending: this.revivePending,
            offerOpen: this.econ.offerOpen,
            quick: this.quick,
            lockMs: CONFIG.crash.retryLockMs,
          })
        )
          this.retry();
        break;
      case 'finished':
        if (this.overShown && !this.econ.offerOpen) this.retry();
        break;
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT') return; // typing a name is not a shortcut
    if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'paused') {
      if (this.state === 'title' && !this.settingsOpen && !this.infoOpen) this.title.startPrimary();
      else this.onTap();
    } else if (e.code === 'Escape')
      this.back(); // what Android's back button does
    else if (e.code === 'KeyP') {
      if (this.settingsOpen) this.closeSettings();
      else if (this.infoOpen) this.closeInfo();
      else if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
  };

  private onPauseButton = (e: PointerEvent): void => {
    e.stopPropagation();
    this.pause();
  };

  // --- menus ---------------------------------------------------------------

  private onMenu = (action: string): void => {
    if (action === 'resume') this.resume();
    else if (action === 'settings') this.openSettings();
    else if (action === 'delete') void this.account.deleteAccount();
    else if (action === 'google') void this.account.keepWithGoogle(false);
    else if (action === 'google-welcome') void this.account.keepWithGoogle(true);
    else if (action === 'privacy-choices') void this.ads.privacyChoices();
    else if (action === 'feedback') void sendFeedback(this.feedbackScreen());
    else if (action === 'name-later' && this.infoOpen === 'name') this.closeInfo();
    else if (action === 'tips') {
      this.hints.replay();
      this.ui.showNotice('tips are back for your next runs');
    } else if (action === 'tutorial') {
      if (this.state !== 'title') this.toMainMenu();
      this.onboarding.go('replay');
      this.feelUsed = null;
      this.closeSettings();
      this.firstLaunch.openWelcome();
    } else if (action === 'guide') this.ui.showGuide('got it');
    else if (action === 'whats-new') this.showWhatsNew();
    else if (action === 'menu') {
      const practising = this.practice;
      this.toMainMenu();
      if (practising) {
        // Left the practice run: back to the start of onboarding (a trial: back to "how did that feel?").
        if (practising.kind === 'trial') this.feelUsed = practising.control;
        this.onboarding.go('quit');
        this.firstLaunch.openWelcome();
      }
    } else if (action === 'share') void this.share();
    else if (action === 'details') this.ui.showDetails(!this.ui.detailsOpen);
    else if (action === 'double') void this.revives.doubleCredits();
    else if (action === 'back') {
      if (this.infoOpen) this.closeInfo();
      else this.closeSettings();
    }
  };

  private closeInfo(): void {
    if (this.infoOpen === 'hangar' && this.hangarFrom === 'shop') {
      // Back to the shop it was opened from, not all the way out.
      this.hangarFrom = null;
      this.preview = null;
      this.applyLooks();
      this.shop.openShop();
      return;
    }
    if (this.infoOpen === 'store' && this.storeFrom === 'shop') {
      this.storeFrom = null;
      this.shop.openShop();
      return;
    }
    if (this.infoOpen === 'pass' && this.passFrom === 'store') {
      this.passFrom = null;
      this.shop.openStore();
      return;
    }
    if (this.infoOpen === 'hangar' || this.infoOpen === 'shop') {
      // Leaving the hangar takes off anything only being tried on.
      this.preview = null;
      this.applyLooks();
    }
    if (this.infoOpen === 'name') {
      // Later (no signal, or no name in mind): asked again next time the game starts, not after every run.
      this.nameLater = true;
    } else if (this.infoOpen === 'welcome') return; // it ends by its own buttons
    if (this.infoOpen === 'boards') this.portraits.release(); // its pictures stay cached; the renderer goes
    if (this.state === 'title') {
      // The ship only shows on the screens that show it off (hangar, shop, welcome).
      this.player.setVisible(false);
      this.trail.setVisible(false);
    }
    this.infoOpen = null;
    this.ui.show('title');
  }

  private onSetting = (key: SettingKey): void => {
    cycle(this.settings, key);
    this.applySettings();
    void saveSettings(this.settings);
    if (key === 'reminders' && this.settings.reminders) void this.reminders.turnOnReminders();
    else if (key === 'reminders' || key === 'reminderTime') void this.reminders.planReminders();
  };

  applySettings(): void {
    const s = this.settings;
    this.sound.setMuted(!s.sound);
    this.sound.setLevels(LEVEL_GAIN[s.music], LEVEL_GAIN[s.effects]);
    this.input.dragRange = STEERING_RANGE[s.steering];
    this.input.tiltEnabled = s.tilt;
    this.input.tiltSensitivity = TILT_GAIN[s.tiltSensitivity];
    this.input.sidesMode = s.touch === 1;
    this.input.doubleTapBoost = s.doubleTapBoost;
    this.haptics.strength = s.haptics;
    const low = this.lowGraphics();
    this.stage.setPerformance(low);
    this.weather.lite = low;
    if (!s.ghost) this.ghost.stop();
    this.world.assist = this.assistOn();
    if (this.assistOn() && this.state !== 'title') this.assisted = true;
    this.ui.setDisplay(TEXT_SCALE[s.textSize], this.boostSide(), s.reduceMotion, s.leftHanded);
    this.showroomSpin.auto = !s.reduceMotion; // the showroom's ship turns only when dragged
    // Colour-blind mode: the safe palette for hazards, pickups and power-ups, and a shape for each power-up.
    setSafeColours(s.colourBlind);
    this.world.setColourBlind(s.colourBlind);
    for (const p of [this.basePalette, this.palette]) p.pickup.set(s.colourBlind ? SAFE.pickup : CONFIG.boost.pickup.color);
    this.applyLook(this.distanceScore / CONFIG.score.levelLength);
    this.ui.setDark(s.dark);
    this.title.refreshTitle(); // the rank colour has a light and a dark version
    this.ui.renderSettings(s);
  }

  /** Where the boost button sits: the setting, mirrored for the left hand (right and left swap; the middle stays). */
  boostSide(): (typeof BOOST_SIDES)[number] {
    const side = BOOST_SIDES[this.settings.boostSide] ?? 'right';
    if (!this.settings.leftHanded || side === 'middle') return side;
    return side === 'right' ? 'left' : 'right';
  }

  /** Where "send feedback" was pressed, for the mail: settings (over the title or a paused run), or the pause screen. */
  /** The first launch after an update: a few lines about it (never on a fresh install, never twice). */
  private async checkWhatsNew(): Promise<void> {
    const seen = await storage.get(SEEN_KEY);
    if (seen === __APP_VERSION__) return;
    await storage.set(SEEN_KEY, __APP_VERSION__);
    const lines = whatsNewOnLaunch(seen, __APP_VERSION__, !this.onboarding.done);
    if (lines) this.showWhatsNew();
  }

  /** The card for this version (settings > help > what's new shows it again). */
  private showWhatsNew(): void {
    const notes = latestNotes(__APP_VERSION__);
    if (!notes) return;
    this.ui.celebrate([{ kicker: "what's new", icon: NEW_ICON, name: `version ${notes.version}`, lines: [...notes.lines] }]);
  }

  /** What was up when an error happened, for the error log. */
  private errorScreen(): string {
    if (this.settingsOpen) return 'settings';
    if (this.infoOpen) return String(this.infoOpen);
    return this.state === 'playing' || this.state === 'paused' || this.state === 'crashed' ? `${this.state} (${this.mode}, level ${this.level})` : this.state;
  }

  private feedbackScreen(): string {
    const run = `${this.mode} run, level ${this.level}`;
    if (this.settingsOpen) return this.state === 'paused' ? `settings (paused ${run})` : 'settings';
    return this.state === 'paused' ? `pause (${run})` : this.state;
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.ui.setNative(this.native, remindersAvailable());
    this.ui.show('settings');
    this.account.refreshAccount();
    void this.backend
      .pilotName()
      .then((name) =>
        this.ui.setPilotName(name ?? '', this.backend.online ? '3 to 16 letters, numbers, spaces, - or _' : 'names come with the server', 'settings'),
      );
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.ui.show(this.state === 'paused' ? 'paused' : 'title');
  }

  /** Abandon the run and go back to the live title scene. Best score still counts. */
  toMainMenu(): void {
    this.ui.showQuickRetry(null);
    if (this.state === 'paused' && !this.recorded) {
      // Abandoned mid-run: it still counts, for its best and the stats.
      this.recordBest(false);
      this.finishRun(null);
    }
    // Left with a revive still on offer: the run ends as it stood, rather than not at all.
    if (this.state === 'crashed' && this.revivePending) this.settleCrash();
    if (this.practice) {
      this.practice = null;
      this.teach.show(false);
    }
    this.econ.setCountdown(0);
    this.econ.dismissOffer();
    this.ghost.stop();
    this.rival.stop();
    this.zen = false;
    this.ui.setZen(false);

    this.state = 'title';
    this.input.enabled = false;
    this.input.releaseAll();
    this.boosting = false;
    this.boostLevel = 0;
    this.endPowers();
    this.chain = 0;
    this.speed = CONFIG.speed.titleDrift;
    this.stage.pullBack = this.stage.drop = 0;
    this.stage.shakeX = this.stage.shakeY = 0;
    this.speedLines.update(0, 0, 0);
    this.player.reset(); // clears any crash pieces or fall
    this.player.setVisible(false);
    this.trail.setVisible(false);
    this.events.clear();
    this.sound.setWind(0);
    this.applyLooks();
    this.world.reset(0, false);
    this.level = 1;
    this.applyLook(0);
    this.sound.toTitle();
    this.ui.hideCombo();
    this.ui.hideBanner();
    this.ui.showHud(false);
    this.ui.show('title');
    this.title.refreshTitle();
    this.lastTime = performance.now();
    void this.account.askName();
  }

  /** Dev: renderer stats for the FPS readout. */
  devStats(): { ratio: number; calls: number; triangles: number; textures: number; geometries: number; low: boolean } {
    const info = this.stage.renderer.info;
    return {
      ratio: this.stage.pixelRatio,
      calls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      low: this.lowGraphics(),
    };
  }

  /** Low graphics: chosen in settings, or auto after it dropped this session. */
  private lowGraphics(): boolean {
    const g = this.settings.graphics;
    return g === 2 || (g === 0 && this.autoGraphics.dropped);
  }

  /** Graphics on auto: during play, drop to low once if frames stay slow, with a quiet notice. */
  private watchGraphics(frameMs: number): void {
    if (this.settings.graphics !== 0 || this.autoGraphics.dropped) return;
    if (this.state !== 'playing') {
      this.autoGraphics.reset();
      return;
    }
    if (!this.autoGraphics.feed(frameMs)) return;
    this.applySettings();
    this.ui.showNotice('graphics on low to keep things smooth. settings can change it');
  }

  /** Dev: force every interior room to be `id` (null = random). */
  devSetRoom(id: RoomId | null): void {
    this.world.devRoom = id;
  }

  /** Dev: build this hand-made section everywhere it fits (null: as normal). */
  devSetPiece(id: string | null): void {
    this.world.devPieces = id ? [id] : [];
  }

  /** Dev: draw sections' routes on the floor. */
  devShowRoutes(on: boolean): void {
    this.world.showRoutes = on;
  }

  /** Dev: unlock everything: top rank, every sector and star, all looks and upgrades, plenty of credits. */
  devUnlockAll(): void {
    this.maxOut();
    this.ui.showNotice('dev: everything unlocked');
  }

  /** The top rank and league, every look, every upgrade at its top tier and 100,000 credits. */
  private maxOut(): void {
    this.ranked.addXp(Math.max(0, RANKS[RANKS.length - 1].xp - this.ranked.xp));
    this.looks.buyAll();
    this.leagues.devTop();
    for (const s of SYSTEMS) while (this.upgrades.tier(s.id) < MAX_TIER) this.upgrades.raise(s.id);
    this.progress.openAll(); // every solo environment, set level and part of the game
    if (!this.onboarding.done) this.onboarding.set('done');
    this.wallet.add(100000);
    this.title.refreshTitle();
  }

  /** Everything open: maxed out (the SQL editor's max_out, or the dev panel's "unlock all"). */
  get allOpen(): boolean {
    return this.progress.allOpen;
  }

  /** Maxed out from the SQL editor (players.max_out): done once, when the game next opens or comes back. */
  private async checkMaxOut(): Promise<void> {
    if (!this.backend.online || !(await this.backend.takeMaxOut())) return;
    this.maxOut();
    this.ui.showNotice('maxed out: every look, upgrade and level, top rank and league');
  }

  /** Dev: cores, standing in for purchases until the store is in. */
  /** Dev: premium on or off (as if bought, or never bought). */
  devTogglePremium(): boolean {
    if (this.entitlements.has('premium')) this.entitlements.clear();
    else this.entitlements.grant('premium');
    this.applyLooks();
    this.title.refreshTitle();
    return this.entitlements.has('premium');
  }

  devAddCores(n: number): void {
    this.wallet.addCores(n);
    this.econ.bump('cores');
    this.title.refreshTitle();
  }

  /** The launch splash has gone (main.ts). */
  splashGone(): void {
    this.ui.splashGone();
  }

  /** Dev: replay the last run's course from where it started (same seed). */
  devReplay(): void {
    this.beginRun(this.devStart, this.seed);
  }

  private devStart = 0;

  /** Dev: start a run a little before `level` begins. */
  devStartAt(level: number): void {
    const lead = 60; // points before the level starts, so you see the change
    this.devStart = Math.max(0, (level - 1) * CONFIG.score.levelLength - lead);
    this.beginRun(this.devStart);
  }

  // --- loop ----------------------------------------------------------------

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    this.stage.setTerrain(this.world.distance, this.world.lateral);
    // Interior animation: shared clock and distance, fans, sparks.
    const fxDt = Math.max(0, Math.min((now - this.lastTime) / 1000, 0.05));
    fxTime.value += fxDt;
    fxDistance.value = this.world.distance;
    if (this.world.insideMix > 0) {
      this.world.spinFans(fxDt);
      this.world.sparks.update(this.state === 'paused' ? 0 : fxDt, this.world.distance, this.world.lateral);
    }
    const [grass, grain, strata] = this.groundStyle();
    this.stage.setGroundStyle(grass, grain, this.world.lateral, this.world.distance, strata);
    if (this.state === 'playing' || this.state === 'title') this.stage.adapt(now - this.lastTime);
    this.watchGraphics(now - this.lastTime);
    const dt = Math.max(0, Math.min((now - this.lastTime) / 1000, 1 / 20));
    this.lastTime = now;

    switch (this.state) {
      case 'title':
        this.updateTitle(dt);
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'crashed':
        this.updateCrashed(dt);
        break;
      case 'finished':
        this.updateFinished(dt);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'paused':
        break;
    }
    this.econ.tickOffer(dt);
    if (this.state === 'title') this.tickEconomy(dt);
    // Off a run (title, crash, finish) the area's weather fades out rather than freezing in the air.
    if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'countdown') {
      this.weather.set('none', 0);
      this.weather.update(dt, 0);
    }
    this.stage.render();
  };

  /** Apply time of day for `levelProgress` (score / levelLength) to every material and the UI. */
  private applyLook(levelProgress: number): void {
    const w = this.world;
    const space = Math.max(w.deckMix, w.asteroidMix);
    applyAtmosphere(this.basePalette, this.palette, levelProgress, w.canyonMix, w.interiorMix, space, this.settings.contrast);
    if (!this.settings.contrast) {
      tintBiome(this.palette, w.biome, w.biomeMix);
      this.events.tint(this.palette);
      this.weather.tint(this.palette);
    }
    this.stage.fog.density = CONFIG.fog.density * this.events.fogScale() * this.weather.fogScale();
    // Stars: full over the deck, faint outside at night.
    const sky = this.palette.sky;
    const daylight = (0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b) ** (1 / 2.2);
    const night = Math.max(0, Math.min(1, (0.55 - daylight) / 0.35)) * CONFIG.space.nightStars * (1 - w.interiorMix);
    this.sky.setAmount(Math.max(space, night));
    this.stage.setPlanetVisible(1 - this.world.interiorMix);
    this.stage.setUnderfloor(Math.max(w.insideMix, w.asteroidMix));
    this.player.setShadowAmount(1 - w.asteroidMix); // nothing to cast it on in space
    this.stage.applyPalette();
    this.world.applyPalette();
    this.speedLines.applyPalette();
    this.player.applyPalette();
    // The DOM only changes when the colour actually does.
    const text = this.palette.text.getHex();
    if (text !== this.shownTextHex) {
      this.shownTextHex = text;
      this.ui.setTextColor(this.palette.textCss());
    }
    // The HUD's backing band takes the sky colour, so it's invisible by day and
    // only shows where something bright sits behind the text.
    const skyHex = this.palette.sky.getHex();
    if (skyHex !== this.shownSky) {
      this.shownSky = skyHex;
      this.ui.setSkyColor(`#${this.palette.sky.getHexString()}`);
    }
    const page = this.palette.fog.getHex();
    if (page !== this.shownPageHex) {
      this.shownPageHex = page;
      this.ui.setPageColor(`#${this.palette.fog.getHexString()}`);
    }
  }

  private updateTitle(dt: number): void {
    this.titleTime += dt;
    const showroom = this.infoOpen === 'hangar' || this.infoOpen === 'shop' || this.infoOpen === 'welcome';
    const S = CONFIG.camera.showroom;
    if (showroom) {
      this.trail.update(dt, 0, this.player.engineHalfSpan);
      this.stage.showroomAngle = S.angle + this.showroomSpin.update(dt);
      this.stage.showroomY = S.y;
    }
    this.stage.showroom += ((showroom ? 1 : 0) - this.stage.showroom) * (1 - Math.exp(-S.ease * dt));
    this.speed = CONFIG.speed.titleDrift;
    // Slow lateral sway so the idle scene feels alive.
    const lateral = Math.sin(this.titleTime * 0.23) * 2.2;
    this.world.advance(dt, this.speed, lateral);
    this.world.sync();
    this.stage.roll = -Math.sin(this.titleTime * 0.23 + 0.6) * 2.5 * DEG;
    this.stage.fovBoost = 0;
    this.stage.shakeX = this.stage.shakeY = 0;
    this.feedAudio(dt, false, this.speed);
  }

  private updatePlaying(dt: number): void {
    this.input.update(dt);
    this.runTime += dt;
    const before = this.distanceScore + this.bonus; // what this frame scores (double points)
    // Swing back from the showroom orbit to the chase view (a run started from the welcome screen).
    this.stage.showroom *= Math.exp(-CONFIG.camera.showroom.ease * 2 * dt);
    if (this.stage.showroom < 0.001) this.stage.showroom = 0;
    if (this.practice) this.firstLaunch.practiceTick(dt);
    else this.offerHints();
    // A set level runs at its sections' difficulty; otherwise speed follows the score.
    const section = this.course ? this.world.sectionAt(this.world.distance) : null;
    // On ice you slow down a little (and slide: see the steering below).
    this.onIce = this.world.onIce();
    const pace = speedAt(section ? section.difficulty : this.distanceScore);
    const target = (this.zen ? Math.min(pace, CONFIG.zen.maxSpeed) : pace) * (this.onIce ? CONFIG.hazards.ice.slow : 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-CONFIG.speed.ease * dt));
    this.updateBoost(dt);
    const speed = this.currentSpeed();
    // Nose up and down with the hills ahead.
    const dist = this.world.distance;
    const sx = this.world.lateral;
    const slope = (terrain.heightAtX(dist + 6, sx) - terrain.heightAtX(dist, sx)) / 6;
    // Positive pitch dips the nose, so climbing subtracts.
    const pitch = this.boostLevel * CONFIG.boost.shipPitchDeg * DEG - Math.atan(slope) * CONFIG.terrain.shipPitch;
    this.player.update(
      dt,
      this.dev.autopilot ? this.autopilot() : this.input.steering(),
      lateralSpeedAt(speed) * this.ship.steer,
      pitch,
      this.onIce ? CONFIG.hazards.ice.grip : 1,
    );
    this.weather.update(dt, speed);
    // No streaks inside the ship: they'd run through its walls and ceiling like loose wires.
    this.speedLines.update(dt, speed, this.settings.reduceMotion || this.lowGraphics() ? 0 : this.boostLevel * (1 - this.world.insideMix));
    this.trail.update(dt, this.boostLevel, this.player.engineHalfSpan);
    if (this.boosting) {
      this.boostSeconds += dt;
    }

    const prev = this.world.distance;
    this.world.advance(dt, speed, this.player.lateral);
    if (this.mode === 'ranked' || this.dailyRunNow) {
      while (this.world.distance - this.runStart >= this.pathNext) {
        this.path.push(Math.round(this.world.lateral * 100) / 100);
        this.pathTimes.push(Math.round(this.runTime * 1000) / 1000);
        this.pathNext += PATH_STEP;
      }
    }
    if (this.mode === 'ranked') {
      this.ghost.update(this.runTime, this.world.distance - this.runStart, this.runStart, this.world.lateral);
      this.rival.update(this.runTime, this.world.distance - this.runStart, this.runStart, this.world.lateral);
    }
    this.sampleT -= dt;
    if (this.sampleT <= 0 && this.speeds.length < CONFIG.summary.maxSamples) {
      this.sampleT = CONFIG.summary.sampleSeconds;
      this.speeds.push(Math.round(speed * 10) / 10);
    }
    this.runBonuses();
    this.world.spinPickups(dt);
    const got = this.world.collect(prev);
    if (got > 0) {
      this.boostMeter = Math.min(1, this.boostMeter + got * CONFIG.boost.pickup.amount);
      this.bonus += got * CONFIG.score.pickupPoints;
      this.pickupCount += got;
      this.tip('pickup');
      if (this.practice) this.firstLaunch.practiceGot('pickup');
      this.ui.flashBoost();
      this.sound.pickup();
      this.haptics.pickup();
    }
    const power = this.world.collectPower(prev);
    if (power >= 0) this.gainPower(power as PowerKind);
    this.updatePowers(dt);
    this.updateEvents(dt, speed * dt);
    this.ui.setBoost(this.boostMeter, this.boostMeter >= CONFIG.boost.minToStart, this.boosting);

    const distancePoints = (this.world.distance - this.runStart) * CONFIG.score.pointsPerUnit;
    this.bonus += (distancePoints - this.distanceScore) * CONFIG.score.boostBonus * this.boostLevel;
    this.distanceScore = distancePoints;
    const progress = distancePoints / CONFIG.score.levelLength;
    const level = Math.floor(progress) + 1;
    if (this.course && section) {
      this.updateCourse();
    } else if (level !== this.level) {
      const themeChange = this.areaName(level) !== this.areaName(this.level) || themeForLevel(level) !== themeForLevel(this.level);
      this.level = level;
      this.ui.setLevel(level);
      if (this.unlockable) this.noteReached(level);
      if (this.zen) {
        if (themeChange) this.ui.showRoom(this.areaName(level)); // zen: only the area's name, quietly
      } else if (!this.practice) this.ui.announceLevel(level, this.areaName(level)); // in practice the lesson card has the top band
      this.sound.level(themeChange, this.areaMusic(level));
      this.haptics.level(themeChange);
      this.maybeStartEvent(level);
    }
    if (!this.course) {
      this.ui.setProgress(progress - (level - 1));
      this.applyLook(progress);
    }
    if (this.state !== 'playing') {
      this.world.sync(); // crossed the finish line this frame
      return;
    }

    // Lava: the run ends, whatever shield you have.
    if (this.world.inLava() && !this.invincible()) {
      if (this.zen) return this.zenRespawn();
      this.crash(false);
      this.world.sync();
      return;
    }
    const fell = this.world.overPit();
    // Shielded (or just saved by a shield), the walls still hold you in: steer
    // into one and you slide along it instead of out of the course. Touching
    // one with a shield up uses the shield, like any other hit.
    // Phase works the same way: through the next obstacle, never out through a wall.
    let scraped = false;
    const guarded = this.shield || this.graceT > 0 || this.phaseT > 0 || this.passT > 0;
    if (!fell && guarded && !this.invincible()) scraped = this.world.clampToWalls(CONFIG.ship.hitHalfWidth + 0.15);
    const passing = this.graceT > 0 || this.passT > 0;
    const struck = !fell && !passing && this.world.hitTest(prev);
    const hit = struck || (!fell && !passing && scraped && this.shield);
    if (struck && this.phaseT > 0 && !this.invincible()) {
      // Phase takes it before the shield: the ship ghosts through, and the shield stays.
      this.phaseT = 0;
      this.passT = CONFIG.powers.phase.passSeconds;
      this.hitThisRun = true;
      this.gates.hit();
      this.sound.power();
      this.haptics.nearMiss();
    } else if (hit && this.shield && !this.invincible()) {
      // The shield takes the hit; pass through for a moment.
      this.shield = false;
      this.player.setShield(false);
      this.graceT = CONFIG.powers.shield.graceSeconds + this.ship.graceExtra;
      this.hitThisRun = true;
      this.gates.hit();
      this.sound.shieldHit();
      this.haptics.crash();
      this.nudgeMs = CONFIG.score.nearMiss.nudgeMs * 2;
    } else if ((fell || hit) && !this.invincible()) {
      if (this.zen) return this.zenRespawn();
      this.crash(fell);
      this.world.sync();
      return;
    }
    this.updateNearMisses(dt, prev);
    if (this.world.roomName !== this.shownRoom) {
      // A doorway: name the room (corridors have no name) and hiss.
      if (this.world.roomName) {
        this.ui.showRoom(this.world.roomName);
        this.roomsEntered++;
      }
      if (this.world.interiorMix > 0.5) this.sound.door();
      this.shownRoom = this.world.roomName;
    }
    // Double points: everything scored this frame counts again (and again, for a bigger factor).
    const gained = this.distanceScore + this.bonus - before;
    if (this.doubleT > 0 && gained > 0) this.bonus += gained * (CONFIG.powers.double.factor - 1);
    this.score = this.distanceScore - this.scoreBase + this.bonus;
    this.ui.setScore(this.score);
    if (this.zen) this.ui.setZenDistance(distanceText(this.world.distance - this.runStart));

    this.updateCamera(dt);
    this.sky.update(dt);
    this.feedAudio(dt, true, speed);
    this.world.sync();
  }

  /** Near-miss chain: each link pays points x chain length; it breaks after a quiet spell. */
  private updateNearMisses(dt: number, prev: number): void {
    const nm = CONFIG.score.nearMiss;
    const n = this.world.passes(prev, CONFIG.audio.passRange);
    this.passCount += n;
    if (this.practice) this.practice.s.passed += n;
    for (let i = 0; i < n; i++) {
      const gap = this.world.passGap[i];
      const side = this.world.passSide[i];
      if (gap > nm.gap) {
        this.sound.pass(side, gap, 0); // close, but not a near miss
        continue;
      }
      this.chain = Math.min(this.chain + 1, nm.maxCombo);
      const points = nm.points * this.chain;
      this.bonus += points;
      this.nearMissCount++;
      if (this.practice) this.practice.s.nearMisses++;
      if (this.chain > this.bestChain) this.bestChain = this.chain;
      this.chainTimer = nm.comboWindow;
      this.nudgeMs = nm.nudgeMs;
      if (!this.zen) this.ui.showCombo(this.chain, points); // zen has no score to show
      this.tip('nearMiss');
      this.haptics.nearMiss();
      this.sound.pass(side, gap, this.chain);
    }
    if (this.chain > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) {
        this.chain = 0;
        this.ui.hideCombo();
      }
    }
  }

  /** The first-run walkthrough, each tip at its moment and once (see hints.ts); and the pits hint. */
  private offerHints(): void {
    if (this.hints.active) {
      if (this.runTime > 0.8) this.tip('steer');
      if (this.runTime > 4) this.tip('avoid');
      if (this.world.pickupAhead(40, 110)) this.tip('pickup');
      if (this.world.powerAhead(40, 120)) this.tip('power');
      if (this.boostMeter >= 0.5 && !this.boosting) this.tip('boost');
    }
    const room = this.world.roomName;
    if (room === 'maintenance gantry' || room === 'hull breach') this.tip('pits');
  }

  /** Offer hint `id`, worded for the steering in use. Not during the practice run, which has its own prompts. */
  private tip(id: HintId): void {
    if (this.practice) return;
    this.hints.offer(id, tipText(id, this.controlsNow(), { keys: id === 'boost' && !hasTouch(), doubleTap: this.doubleTapOn(), side: this.boostSide() }));
  }

  /** Fill or drain the meter and ease the boost amount in and out. */
  private updateBoost(dt: number): void {
    const b = CONFIG.boost;
    const want = this.input.boostHeld();
    if (this.boosting) {
      if (!want || this.boostMeter <= 0) {
        this.boosting = false;
        this.sound.boostEnd(this.boostMeter <= 0);
      }
    } else if (want && this.boostMeter >= b.minToStart) {
      this.boosting = true;
      this.sound.boostStart();
      this.haptics.boost();
    }
    if (this.boosting) this.boostMeter = Math.max(0, this.boostMeter - dt / (b.drainSeconds * this.ship.boostDrain));
    else this.boostMeter = Math.min(1, this.boostMeter + (dt * this.ship.boostFill) / b.fillSeconds);
    const goal = this.boosting ? 1 : 0;
    const rate = this.boosting ? b.easeIn : b.easeOut;
    this.boostLevel += (goal - this.boostLevel) * (1 - Math.exp(-rate * dt));
  }

  /** Hand the frame's state to the sound engine (reused object, no allocation). */
  private feedAudio(dt: number, playing: boolean, speed: number): void {
    const a = this.audio;
    a.playing = playing;
    a.speed = speed;
    a.boost = playing ? this.boostLevel : 0;
    a.steer = playing ? this.player.steer : 0;
    a.chain = playing ? this.chain : 0;
    a.canyon = this.world.canyonMix;
    a.interior = this.world.interiorMix;
    const sky = this.palette.sky;
    a.daylight = (0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b) ** (1 / 2.2);
    // Busier music deeper into each theme and at higher speed.
    const sub = (this.level - 1) % CONFIG.themes.levelsPerTheme;
    const speedNorm = (this.speed - CONFIG.speed.base) / (CONFIG.speed.max - CONFIG.speed.base);
    a.intensity = playing ? Math.min(1, 0.25 + sub * 0.25 + speedNorm * 0.5) : 0;
    this.sound.update(dt, a);
  }

  /** Ground patches and grain for the current biome: lush on alien ground, faint elsewhere, none indoors. */
  private groundStyle(): [number, number, number] {
    const w = this.world;
    const outside = (1 - w.insideMix) * (1 - w.asteroidMix);
    const grass: Record<string, number> = { alien: 1, ice: 0.25, volcanic: 0.4, canyon: 0.15 };
    return [(grass[w.biome] ?? 0) * outside, outside, w.canyonMix * outside];
  }

  /** A set level, each frame: section changes (banner, event), progress, look, and the finish. */
  private updateCourse(): void {
    const c = this.course!;
    // The section the ship is in now (it may have just moved into the next one this frame).
    const i = this.world.sectionIndexAt(this.world.distance);
    const section = c.sections[i];
    if (i !== this.sectionIdx) {
      const prev = this.sectionIdx >= 0 ? c.sections[this.sectionIdx] : null;
      const areaChange = !prev || prev.theme !== section.theme || (prev.biome ?? '') !== (section.biome ?? '');
      this.sectionIdx = i;
      if (prev) {
        this.ui.showRoom(section.name);
        this.sound.level(areaChange, musicForArea(section.theme, section.biome));
        this.haptics.level(areaChange);
      } else this.sound.setTheme(musicForArea(section.theme, section.biome));
      if (section.event) {
        // For the whole section (at its speed), not the usual 22 seconds.
        this.events.start(section.event, section.length / speedAt(section.difficulty) + 2);
        this.ui.showNotice(section.name);
      }
    }
    const length = courseLength(c);
    const done = (this.world.distance - this.world.finishAt + length) / length;
    this.ui.setProgress(Math.max(0, Math.min(1, done)));
    // Time of day comes from how hard the section is: later levels run into evening.
    this.applyLook(section.difficulty / CONFIG.score.levelLength);
    if (this.world.distance >= this.world.finishAt) this.finishCourse();
  }

  /** Crossed the finish line of a set level (or the daily challenge). */
  private finishCourse(): void {
    const c = this.course!;
    if (this.dailyRunNow) {
      this.finishDaily();
      return;
    }
    this.state = 'finished';
    this.ghost.stop();
    this.finishMs = 0;
    this.input.enabled = false;
    this.boosting = false;
    this.sound.level(true, musicFor(1));
    this.haptics.level(true);
    let stars = 1;
    if (!this.hitThisRun && !this.assisted) stars |= 2;
    if (!this.assisted && this.score >= c.target) stars |= 4;
    const time = this.runTime;
    const before = this.progress.course(c.id).score;
    const res = this.progress.recordCourse(c.id, stars, time, this.score);
    const starCredits = res.newStars * CONFIG.courses.starCredits;
    const best = this.progress.course(c.id);
    this.ui.setOverHeading('level complete');
    this.ui.setGameOver(this.score, best.score, this.score >= best.score, this.nearMissCount, this.bestChain, this.seed);
    this.fillSummary(false);
    const extra = this.finishRun(null);
    this.offerShare(this.score > before);
    this.wallet.add(starCredits);
    const starText = [1, 2, 4].map((b) => (stars & b ? '★' : '☆')).join('');
    const lines = [`${starText}  ${formatTime(time)}${res.bestTime ? ' (best)' : ` · best ${formatTime(best.time)}`}`];
    if (starCredits > 0) lines.push(`+${starCredits} credits for new stars`);
    if (!(stars & 2)) lines.push('hit something: no second star');
    if (!(stars & 4)) lines.push(`score ${formatScore(c.target)} for the third star`);
    lines.push(extra);
    this.ui.setGameOverExtra(lines.join(' · '));
    this.title.refreshTitle();
  }

  /** Crossed the daily challenge's finish line. */
  private finishDaily(): void {
    this.state = 'finished';
    this.ghost.stop();
    this.finishMs = 0;
    this.input.enabled = false;
    this.boosting = false;
    this.sound.level(true, musicFor(1));
    this.haptics.level(true);
    const { best, isNew } = this.recordBest(true);
    this.ui.setOverHeading('finished');
    this.ui.setGameOver(this.score, best, isNew, this.nearMissCount, this.bestChain, this.seed);
    this.fillSummary(false);
    const extra = this.finishRun(null);
    this.offerShare(isNew);
    this.ui.setGameOverExtra([formatTime(this.runTime), this.dailyLine, extra].filter(Boolean).join(' · '));
    this.title.refreshTitle();
  }

  /** The daily run as it ended: today's best and the streak, and the streak's reward on a new day. */
  private recordDaily(finished: boolean): { best: number; isNew: boolean } {
    const d = this.dailyRunNow!;
    const counts = finished || this.runTime >= CONFIG.daily.countsAfter;
    const r = this.challenge.record(d.day, this.score, counts);
    void this.reminders.planReminders(); // today's done: no reminder today
    this.dailyLine = r.streak > 0 ? `${r.streak} day streak` : '';
    if (r.reward) {
      const lines = this.grant(r.reward); // on the card that follows, not the end screen as well
      this.ui.celebrate([
        {
          kicker: `${r.streak} day${r.streak === 1 ? '' : 's'} in a row`,
          icon: FLAG_ICON,
          name: 'daily streak',
          lines: [
            ...lines,
            r.streak < CONFIG.daily.streak.length ? `tomorrow: ${rewardText(streakReward(r.streak + 1))}` : 'the top of the ladder: keep it going',
          ],
        },
      ]);
    }
    return { best: r.best, isNew: r.isNew };
  }

  /** Coast on for a moment after the finish, then show the results. */
  private updateFinished(dt: number): void {
    this.finishMs += dt * 1000;
    this.speed *= 1 - Math.min(1, dt * 1.5);
    this.world.advance(dt, this.speed, 0);
    this.world.sync();
    this.trail.update(dt, 0, this.player.engineHalfSpan);
    this.player.update(dt, 0, 0, 0);
    this.feedAudio(dt, false, this.speed);
    if (!this.overShown && this.finishMs > 900) {
      this.overShown = true;
      this.ui.showHud(false);
      this.ui.hideBanner();
      this.ui.show('over');
    }
  }

  private startCourse(index: number): void {
    const c = COURSES[index];
    if (!c) return;
    this.beginRun(0, c.seed, 'solo', c);
  }

  private openCourses(): void {
    const tiles = COURSES.map((c, i) => {
      const r = this.progress.course(c.id);
      const prev = i === 0 ? null : this.progress.course(COURSES[i - 1].id);
      const locked = !(i === 0 || (prev && prev.stars & 1)) && !this.allOpen;
      return {
        index: i,
        name: c.name,
        stars: r.stars,
        time: locked ? `finish ${COURSES[i - 1].name}` : r.time > 0 ? formatTime(r.time) : '',
        locked,
      };
    });
    const stars = COURSES.reduce((n, c) => n + [1, 2, 4].filter((b) => this.progress.course(c.id).stars & b).length, 0);
    this.ui.renderCourses(tiles, `${stars} of ${COURSES.length * 3} stars`);
  }

  /** Forward speed including boost and slow-mo. */
  private currentSpeed(): number {
    const slow = 1 - (1 - CONFIG.powers.slow.factor) * this.slowLevel;
    const assist = this.assistOn() ? CONFIG.assist.speed : 1;
    return this.speed * (1 + (CONFIG.boost.speedMultiplier - 1) * this.boostLevel) * slow * assist;
  }

  /** As the middle level of a theme begins, maybe start its event (same per seed). */
  private maybeStartEvent(level: number): void {
    if ((level - 1) % CONFIG.themes.levelsPerTheme !== 1) return;
    const roll = (Math.imul(this.seed ^ level, 2654435761) >>> 0) / 4294967296;
    if (roll >= CONFIG.events.chance) return;
    const kind = Events.forBiome(this.areaBiome(level));
    this.events.start(kind);
    this.ui.showNotice(EVENT_NOTICE[kind]);
  }

  /** The area's own weather: snow on the ice field, ash on the volcanic plain, heavier deeper in. */
  private updateWeather(): void {
    const w = this.world;
    const W = CONFIG.weather;
    const sub = (this.level - 1) % CONFIG.themes.levelsPerTheme;
    const loop = Math.floor((this.level - 1) / (CONFIG.themes.levelsPerTheme * 3));
    const outside = (1 - w.insideMix) * w.biomeMix;
    if (w.biome === 'ice') this.weather.set('snow', (W.snow[sub] + loop * W.loopStep) * outside);
    else if (w.biome === 'volcanic') this.weather.set('ash', (W.ash[sub] + loop * W.loopStep) * outside);
    else this.weather.set('none', 0);
  }

  private updateEvents(dt: number, dz: number): void {
    this.updateWeather();
    const ev = this.events;
    // An event ends early if the theme changes under it.
    // Set levels choose their events per section; otherwise an event ends if the area changes under it.
    const allowed = ev.kind === 'none' || this.course !== null || Events.forBiome(this.areaBiome(this.level)) === ev.kind;
    ev.update(dt, dz, allowed);
    if (ev.impact !== null) {
      this.sound.impact(ev.impact);
      this.haptics.pickup();
    }
    if (ev.alarm) this.sound.alarm();
    this.sound.setWind(ev.kind === 'sandstorm' ? ev.amount : 0);
  }

  /** Distance milestones (endless and solo) and gate runs (endless), each frame. */
  private runBonuses(): void {
    if (this.practice) return;
    const run = this.world.distance - this.runStart;
    if (milestonesCount(this.mode, this.dailyRunNow !== null, this.zen) && !this.assisted) {
      for (const m of this.milestones.pass(run)) {
        this.bonusCredits += m.credits;
        this.ui.showMilestone(kmText(m.km), `+${m.credits} credits`);
        this.sound.level(false, this.areaMusic(this.level));
        this.haptics.pickup();
      }
    }
    if (!this.world.gateRuns) return;
    for (const e of this.gates.update(this.world.distance, this.world.gateLog)) {
      if (e.kind === 'ahead') this.ui.showMilestone('gate run', `clear it clean for +${CONFIG.gateRuns.credits} credits`);
      else if (e.kind === 'clear') {
        this.bonusCredits += e.credits;
        this.ui.showMilestone('gate run clear', `+${e.credits} credits`);
        this.sound.power();
        this.haptics.pickup();
      } else this.ui.showNotice('gate run: hit one. no bonus this time');
    }
  }

  /** Zen: a crash fades out and back in on the safe lane, with the way ahead cleared. Nothing is lost. */
  private zenRespawn(): void {
    const Z = CONFIG.zen;
    this.ui.fadeRespawn(Z.fadeMs);
    this.sound.shieldHit();
    this.haptics.nearMiss();
    this.world.revive(Z.clearAhead);
    this.world.sync();
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.endPowers();
    this.graceT = Z.fadeMs / 1000; // a moment to find the line again
    this.boosting = false;
    this.boostLevel = 0;
    this.chain = 0;
    this.ui.hideCombo();
    this.speed = Math.min(this.speed, CONFIG.zen.maxSpeed) * 0.7;
  }

  /** The run summary behind "details" on the end screen. */
  private fillSummary(crashed: boolean): void {
    const view = {
      speeds: this.speeds,
      distance: this.world.distance - this.runStart,
      level: this.level,
      nearMisses: this.nearMissCount,
      bestChain: this.bestChain,
      crashed,
      hit: crashed && !this.fell ? this.hitWhat : '',
    };
    this.ui.setRunSummary(sparkSvg(this.speeds), summaryRows(view));
  }

  private gainPower(kind: PowerKind): void {
    const p = CONFIG.powers;
    if (kind === 0) {
      this.shield = true;
      this.player.setShield(true);
    } else if (kind === 1) this.magnetT = p.magnet.seconds + this.ship.magnetExtra;
    else if (kind === 2) this.slowT = p.slow.seconds;
    else if (kind === 3) this.phaseT = p.phase.seconds;
    else this.doubleT = p.double.seconds;
    this.pickupCount++;
    if (this.practice)
      this.firstLaunch.practiceGot(kind); // the lesson card says it
    else this.ui.showNotice(itemCard(powerItem(kind)).on);
    this.sound.power();
    this.haptics.pickup();
  }

  private updatePowers(dt: number): void {
    this.graceT = Math.max(0, this.graceT - dt);
    this.phaseT = Math.max(0, this.phaseT - dt);
    this.passT = Math.max(0, this.passT - dt);
    this.doubleT = Math.max(0, this.doubleT - dt);
    this.player.updateShield(dt, this.graceT);
    // Phase: the ship ghosts while it's armed, and most of all while it passes through.
    this.player.setPhase(this.passT > 0 ? 1 : this.phaseT > 0 ? 0.6 : 0, this.runTime, this.settings.reduceMotion);
    if (this.magnetT > 0) {
      this.magnetT = Math.max(0, this.magnetT - dt);
      this.world.attractPickups(dt);
    }
    this.slowT = Math.max(0, this.slowT - dt);
    const goal = this.slowT > 0 ? 1 : 0;
    this.slowLevel += (goal - this.slowLevel) * (1 - Math.exp(-4 * dt));
    const parts: string[] = [];
    if (this.shield) parts.push('shield');
    if (this.magnetT > 0) parts.push(`magnet ${Math.ceil(this.magnetT)}`);
    if (this.slowT > 0) parts.push(`slow-mo ${Math.ceil(this.slowT)}`);
    if (this.phaseT > 0) parts.push(`phase ${Math.ceil(this.phaseT)}`);
    if (this.doubleT > 0) parts.push(`x${CONFIG.powers.double.factor} ${Math.ceil(this.doubleT)}`);
    this.ui.setPower(parts.join('  '));
  }

  private endPowers(): void {
    this.shield = false;
    this.graceT = this.magnetT = this.slowT = this.slowLevel = 0;
    this.phaseT = this.passT = this.doubleT = 0;
    this.player.setPhase(0, 0, true);
    this.player.setShield(false);
    this.player.updateShield(0, 0);
    this.ui.setPower('');
  }

  private updateCamera(dt: number): void {
    const c = CONFIG.camera;
    const rollTarget = -this.player.steer * c.maxRollDeg * DEG;
    this.stage.roll += (rollTarget - this.stage.roll) * (1 - Math.exp(-c.rollEase * dt));
    const still = this.settings.reduceMotion;
    if (still) this.stage.roll *= 0.3; // a hint of lean, no swing
    this.stage.fovBoost =
      Math.min(c.maxFovBoost, Math.max(0, (this.speed - CONFIG.speed.base) * c.fovPerSpeed)) + (still ? 0 : this.boostLevel * CONFIG.boost.fovKick);
    const b = CONFIG.boost;
    this.stage.pullBack = this.boostLevel * b.cameraPullBack;
    this.stage.drop = this.boostLevel * b.cameraDrop;
    const v = still ? 0 : this.boostLevel * b.vibration;
    this.stage.shakeX = (Math.random() * 2 - 1) * v;
    this.stage.shakeY = (Math.random() * 2 - 1) * v;
    if (this.nudgeMs > 0 && !still) {
      // Near-miss kick: a quick downward jolt that fades out.
      const nm = CONFIG.score.nearMiss;
      this.stage.shakeY -= nm.nudge * (this.nudgeMs / nm.nudgeMs);
      this.nudgeMs -= dt * 1000;
    }
  }

  private updateCrashed(dt: number): void {
    const c = CONFIG.crash;
    // The crash moment: the crash plays slowed for its first second (real time), then at speed.
    const scale = crashTimeScale(this.crashRealMs, this.moment);
    this.crashRealMs += dt * 1000;
    this.crashMs += dt * 1000 * scale;
    dt *= scale;
    this.feedAudio(dt, false, 0); // music keeps going, muffled, under the game-over text
    if (this.crashMs < c.freezeMs) return;

    if (this.fell) {
      this.player.updateFall(dt);
    } else {
      if (!this.shattered) {
        this.shattered = true;
        this.player.shatter();
      }
      this.player.updateFragments(dt);
    }

    const t = (this.crashMs - c.freezeMs) / c.shakeMs;
    if (t < 1) {
      const amp = this.settings.reduceMotion ? 0 : c.shakeAmount * (1 - t) * (1 - t);
      this.stage.shakeX = (Math.random() * 2 - 1) * amp;
      this.stage.shakeY = (Math.random() * 2 - 1) * amp * 0.6;
    } else {
      this.stage.shakeX = this.stage.shakeY = 0;
    }
    // Ease the roll back to level over the frozen scene.
    this.stage.roll *= 1 - Math.min(1, dt * 3);

    if (!this.overShown && crashOverReady(this.crashRealMs, this.crashMs, this.moment)) {
      if (this.revivePending) {
        if (!this.reviveAsked) {
          this.reviveAsked = true;
          this.revives.offerRevive();
        }
        return;
      }
      this.overShown = true;
      // Quick retry: a small line over the frozen scene instead of the game-over screen.
      if (this.quick) {
        this.ui.showQuickRetry(this.quickLine);
        return;
      }
      this.ui.showHud(false);
      this.ui.hideBanner();
      this.ui.show('over');
    }
  }
}
