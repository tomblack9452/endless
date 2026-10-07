import { applyAtmosphere } from './atmosphere';
import { type AudioState, Sound } from './audio/sound';
import type { MusicId } from './audio/music';
import { createBlockTextures } from './blockTextures';
import { BASE_PALETTE, CONFIG } from './config';
import { lateralSpeedAt, speedAt } from './difficulty';
import { Input } from './input';
import { LivePalette } from './palette';
import { Player, shipGeometry } from './player';
import { describeShip, Portraits, type ShipLook } from './portrait';
import { Stage } from './renderer';
import { Sky } from './sky';
import { SpeedLines } from './speedLines';
import { Trail } from './trail';
import { cycle, DEFAULT_SETTINGS, LEVEL_GAIN, loadSettings, saveSettings, type SettingKey, STEERING_RANGE, TEXT_SCALE, TILT_GAIN } from './settings';
import { EVENT_NOTICE, Events } from './events';
import { Weather } from './weather';
import { Ghost } from './ghost';
import { decalArt } from './decals';
import { Haptics } from './haptics';
import { Hints } from './hints';
import { migrateMissionLooks, migrateTickets } from './legacy';
import { type Feature, isOpen, nextStageText, STAGES, stageFor } from './reveal';
import { hasTouch, type Lesson, LESSONS, LESSON_SECONDS, lessonText, Onboarding, PRACTICE_SEED, STARTER } from './onboarding';
import { Ads, createAdNetwork } from './ads/ads';
import { entitlementFor, Entitlements } from './store/entitlements';
import { Progress } from './progress';
import { creditsFor, insignia, promotionBonus, RANK_COLOURS, rankColour, Ranked, rankName, RANKS, type RunMode, xpToRank } from './ranks';
import { Wallet } from './wallet';
import { Daily, type Quest, questText } from './economy/daily';
import { Weekly } from './economy/weekly';
import { type GoalsTab, GoalsScreen, type TaskRow } from './goalsView';
import { Pass, premiumReward, freeReward, runXp, seasonAt } from './economy/pass';
import { type Reward, rewardLook, rewardParts, rewardText } from './economy/reward';
import { DailyShop, setOffer, vaultAt } from './economy/shop';
import { dayKey, formatWait, untilTomorrow } from './economy/time';
import { EconomyView } from './economy/view';
import { type BoardId, createBackend } from './server/backend';
import { BOARD_TABS, boardCaption, boardForRun, boardName, boardQuery } from './server/boards';
import { Outbox } from './server/outbox';
import { CloudSave } from './server/sync';
import { shareCard } from './share';
import { createStore, type ProductId, type StoreProduct } from './store/store';
import { storage } from './storage';
import { SESSION_KEY } from './server/supabase';
import { googleAvailable, googleSignIn } from './account';
import { fxDistance, fxTime } from './fx';
import { type Course, COURSES, courseLength, type Environment, ENVIRONMENTS, type WeeklyRun, weeklyRun } from './courses';
import { envStatus, nextEnvironment, newlyOpened } from './unlocks';
import { DIVISIONS, divisionReward, emblem, LEAGUES, leagueName, leaguePar, Leagues, LP_PER_DIVISION, weekKey } from './leagues';
import { ACHIEVEMENTS, type Achievement, GROUP_NAMES, type Group, type Snapshot, achievement, progressOn, rewardKeys } from './achievements';
import { SETS, VAULT_ORDER } from './catalogue';
import { GoalLog } from './goals';
import { buildHangar, type HangarState, lookIcon, lookSwatch, monthsUntilVault } from './hangar';
import { type HangarTab, HangarScreen } from './hangarView';
import { byKey, find, keyOf, LOOKS, Looks, type LookItem, type Owner, type ShipId, type Slot, type TrailId, SLOT_NAMES } from './looks';
import type { Fin, Marking } from './looks';
import { MAX_TIER, type ShipStats, STANDARD, SYSTEMS, type SystemId, TIER_COST, TIER_LEAGUE, Upgrades } from './upgrades';
import { newSeed } from './rng';
import { loadNumber } from './storage';
import { type Celebration, formatScore, type ProgressView, type RankResultView, type TitleCard, UI } from './ui';
import type { RoomId } from './interior';
import { biomeForLevel, type PowerKind, themeForLevel, themeName, World } from './world';
import { tintBiome } from './biomes';
import { terrain } from './terrain';

type State = 'title' | 'playing' | 'paused' | 'countdown' | 'crashed' | 'finished';

const DEG = Math.PI / 180;
const PATH_STEP = 4;
const FIRST_PLAYED_KEY = 'endless.firstPlayed';
const REVEAL_KEY = 'endless.reveal';

/** The shop's tabs: looks as cards (today, the set, the vault), then lists (the pass, cores, premium). */
type ShopTab = 'today' | 'set' | 'vault' | 'pass' | 'cores' | 'premium';

/** A name the server made up for a new account ("pilot-3fa2"): the player hasn't picked one. */
const GENERATED_NAME = /^pilot-[0-9a-f]{4}$/;
/** A name the server takes (see set_pilot_name). */
const PILOT_NAME = /^[A-Za-z0-9 _-]{3,16}$/;

type InfoScreen = 'welcome' | 'name' | 'goals' | 'hangar' | 'record' | 'solo' | 'league' | 'shop' | 'pass' | 'boards';

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
function musicFor(level: number): MusicId {
  const biome = biomeForLevel(level);
  return biome === 'ice' || biome === 'volcanic' || biome === 'asteroids' ? biome : themeForLevel(level);
}

const POWER_NOTICE = ['shield. takes one hit', 'magnet. pulls in boost', 'slow-mo'];

/** A wrapped present, for the daily reward. */
const GIFT_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="12" y="26" width="40" height="28" rx="3"/><rect x="8" y="18" width="48" height="10" rx="2"/><path d="M32 18v36"/><path d="M32 18c-4-8-14-10-14-4s10 4 14 4c4 0 14 2 14-4s-10-4-14 4z"/></svg>';
/** A goal badge: a star in a ring. */
const GOAL_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><circle cx="32" cy="32" r="26"/><path d="M32 14l5.4 11.4 12.1 1.6-8.9 8.4 2.3 12.3L32 41.7l-10.9 6 2.3-12.3-8.9-8.4 12.1-1.6z"/></svg>';
/** A season pass badge. */
const PASS_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 6l22 10v16c0 13-9 22-22 26C19 54 10 45 10 32V16z"/><path d="M32 20l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z"/></svg>';

export class Game {
  private readonly basePalette = new LivePalette(); // the level's palette
  private readonly palette = new LivePalette(); // after time of day, read by materials
  private shownTextHex = -1;
  private shownPageHex = -1;
  private readonly stage: Stage;
  private readonly world: World;
  private readonly player: Player;
  private readonly input: Input;
  private readonly speedLines: SpeedLines;
  private readonly sky: Sky;
  private readonly trail: Trail;
  private readonly events: Events;
  private readonly weather: Weather;
  private readonly ghost: Ghost;
  private onIce = false;
  /** This run counts towards opening solo environments: ranked or endless, from the start (not solo, set levels or dev starts). */
  private unlockable = false;
  private readonly sound = new Sound();
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
  private settings = { ...DEFAULT_SETTINGS };
  private settingsOpen = false; // settings screen showing (from the title or pause)
  private readonly ui = new UI();
  private readonly hints = new Hints((text) => this.ui.showHint(text));
  private readonly haptics = new Haptics();
  private readonly progress = new Progress();
  // Run mode: ranked (the weekly level), solo (an environment or a set level) or endless.
  private mode: RunMode = 'ranked';
  /** Solo: the environment being played, or null (endless, ranked, set levels). */
  private environment: Environment | null = null;
  /** This week's ranked level (rebuilt when the week turns). */
  private weekly: WeeklyRun = weeklyRun(weekKey(Date.now()));
  private scoreBase = 0; // solo starts: score begins at half the skipped points
  private readonly ranked = new Ranked();
  private readonly wallet = new Wallet();
  private readonly daily = new Daily();
  private readonly pass = new Pass();
  private readonly econ = new EconomyView();
  private readonly backend = createBackend();
  private readonly cloud = new CloudSave(this.backend);
  /** Finished runs on their way to the leaderboards (kept and retried when there's no signal). */
  private readonly outbox = new Outbox(this.backend);
  private boardTab = 'week';
  private boardSeq = 0;
  private readonly store = createStore();
  private storeProducts: StoreProduct[] = [];
  /** Shop rows for real-money products, in the order shown ('dev' adds cores in the dev build). */
  private deleteArmed = false;
  private portraits = new Portraits(this.palette);
  private shipSent = ''; // the looks last sent to the boards (JSON)
  private shipTimer = 0;
  private nameOk = false; // the player has a pilot name of their own
  private googleEmail: string | null = null; // the Google account this account is kept with ('' none, null unknown)
  private googleBusy = false;
  private googleArmed = false; // asked once to switch to the account a Google login keeps
  private nameWords: Promise<Set<string>> | null = null; // the profanity list, once loaded
  private shopPacks: (ProductId | 'dev' | 'restore' | 'pass-cores' | 'pass-open' | 'dev-premium' | `swap-${number}`)[] = [];
  /** One-time products already bought. */
  private readonly entitlements = new Entitlements();
  private firstPlayed = Date.now();
  private readonly onboarding = new Onboarding();
  /** The practice run in progress (onboarding): the lesson it's on and what's been seen. */
  private practice: { lesson: number; t: number; steerT: number; nearMisses: number; pickups: number } | null = null;
  /** The reveal stage last announced (null until read from storage). */
  private revealSeen: number | null = null;
  private readonly ads = new Ads(createAdNetwork(), () => this.entitlements.has('premium'), () => this.firstPlayed);
  /** The shop card tapped (on the ship to try), or -1. */
  private shopPick = -1;
  private readonly dailyShop = new DailyShop();
  private readonly goalLog = new GoalLog();
  private readonly weeklyGoals = new Weekly();
  private readonly goalsUi = new GoalsScreen();
  private goalsTab: GoalsTab = 'daily';
  /** This ranked run scored at least the league's par (a weekly goal counts these). */
  private beatPar = false;
  /** Credits the last run paid (for doubling with a rewarded ad). */
  private lastRunCredits = 0;
  private readonly hangarUi = new HangarScreen();
  private hangar: HangarState = { slot: 'hull', pick: null };
  private hangarUpgrades = false; // the upgrades chip is open, not a slot of looks
  private hangarFrom: 'shop' | null = null; // where Back goes
  // Ranked: the ship's sideways position every PATH_STEP units (the leaderboard check, and later the ghost).
  private path: number[] = [];
  private pathTimes: number[] = [];
  private pathNext = 0;
  private economyTimer = 0;
  private showroomTime = 0; // turns the showroom camera
  // Revive (not in ranked): once a run. While the offer is up the run isn't recorded yet.
  private revived = false;
  /** The run as it stood at the first crash, when revived: what the boards get (a paid revive never adds to a board score). */
  private preRevive: { score: number; seconds: number; distance: number } | null = null;
  private revivePending = false;
  private reviveAsked = false;
  private countdownT = 0; // seconds of 3-2-1 left
  // A set level (courses.ts) being played, if any.
  private course: Course | null = null;
  private sectionIdx = -1;
  private hitThisRun = false; // anything hit, even a shield save (course stars)
  private finishMs = 0;
  private readonly upgrades = new Upgrades();
  private readonly leagues = new Leagues();
  /** This run's ship systems (your switched-on upgrades). */
  private ship: ShipStats = STANDARD;
  private readonly looks = new Looks();
  /** A locked look being tried on in the hangar (not yet owned). */
  private preview: { slot: Slot; id: string } | null = null;
  private pickupCount = 0;
  private recorded = false; // this run's stats are saved
  private assisted = false; // assist mode was on at some point this run
  /** Which info screen is open from the title (stats, goals, hangar), if any. */
  private infoOpen: InfoScreen | null = null;
  private boostSeconds = 0;
  private roomsEntered = 0;
  private shownSky = -1;
  private runTime = 0; // seconds into the current run

  private state: State = 'title';
  private speed: number = CONFIG.speed.titleDrift;
  private runStart = 0; // field distance when the run began
  private score = 0; // shown score: distance points + bonus
  private distanceScore = 0; // drives levels and difficulty
  private bonus = 0;
  private chain = 0; // near misses in a row
  private chainTimer = 0;
  private nearMissCount = 0;
  private bestChain = 0;
  private nudgeMs = 0;
  private shownRoom = '';
  private level = 1;
  /** Seed of the current (or last) run: the same seed rebuilds the same course. */
  seed = 0;

  /** Dev-only switches, set from the dev panel (never shown in production builds). */
  readonly dev = { invincible: false, fullBoost: false, autopilot: false };

  private boostMeter = 0; // 0..1
  private boosting = false;
  private boostLevel = 0; // eased 0..1, scales the speed boost

  // Power-ups (see CONFIG.powers).
  private shield = false;
  private graceT = 0; // seconds of passing through things after a shield hit
  private magnetT = 0;
  private slowT = 0;
  private slowLevel = 0; // eased 0..1

  private crashMs = 0;
  private shattered = false;
  private fell = false;
  private overShown = false;

  private lastTime = 0;
  private titleTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.basePalette.set(BASE_PALETTE);
    this.palette.set(BASE_PALETTE);
    this.stage = new Stage(canvas, this.palette);
    const textures = CONFIG.blocks.textured
      ? createBlockTextures(this.stage.renderer.capabilities.getMaxAnisotropy())
      : undefined;
    this.world = new World(this.stage.scene, this.palette, textures);
    this.player = new Player(this.stage.scene, this.palette);
    this.speedLines = new SpeedLines(this.stage.scene, this.palette);
    this.trail = new Trail(this.player.engine, this.palette);
    this.events = new Events(this.stage.scene);
    this.weather = new Weather(this.stage.scene);
    this.ghost = new Ghost(this.stage.scene, shipGeometry('dart'), this.palette);
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
    // Tapping anywhere also starts; the button is the explicit target.
    this.ui.startButton.addEventListener('click', () => {
      if (this.state === 'title') this.startPrimary();
    });
    this.ui.bindTitleCards(this.onTitleLink);
    this.ui.bindWelcome({
      control: (id) => this.chooseControls(id),
      practice: () => this.startPractice(),
      skip: () => this.finishOnboarding(),
      pick: (key) => this.pickStarter(key),
      done: () => this.finishOnboarding(),
    });
    this.ui.bindRecordTabs((tab) => this.ui.setRecordTab(tab));
    void storage.get(REVEAL_KEY).then((v) => (this.revealSeen = v === null ? -1 : Number(v) || 0));
    this.ui.titleRank.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleRank.addEventListener('click', () => this.onTitleLink('record'));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      // Back to the front: pick up any change to the balances made on the server (the dashboard).
      else void this.wallet.refresh().then(() => this.checkMaxOut()).then(() => this.refreshTitle());
    });
    window.addEventListener('blur', () => this.pause());

    this.ui.bindCelebration();
    this.ui.bindTitleLinks(this.onTitleLink);
    this.ui.bindBoards(BOARD_TABS, (id) => void this.showBoard(id), (name) => void this.savePilotName(name));
    this.ui.bindNameBox('settings', (name) => void this.savePilotName(name, 'settings'));
    this.ui.bindNameBox('name', (name) => void this.saveNameScreen(name));
    window.addEventListener('online', () => void this.outbox.flush());
    const now = Date.now();
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
      this.daily.load(dayKey(now)),
      this.weeklyGoals.load(weekKey(now)),
      this.pass.load(now),
      this.dailyShop.load(),
      this.goalLog.load(),
      looksReady,
    ]).then(async () => {
      await this.onboarding.load(this.progress.stats.runs > 0);
      // A save from before goals: what it has already done counts, with no payout.
      if (!this.goalLog.started) this.goalLog.startWith(ACHIEVEMENTS.filter((a) => progressOn(a, this.snapshot()).done).map((a) => a.id));
      // A new week: pay last week's league reward.
      const weekly = this.leagues.rollWeek();
      if (weekly > 0) {
        this.wallet.add(weekly);
        this.ui.showNotice(`weekly league reward +${formatScore(weekly)} credits`);
      }
      this.refreshTitle();
      // A new player starts with the welcome; the first daily reward waits for the end of it.
      if (this.onboarding.done) this.claimLogin();
      else this.openWelcome();
      void this.connect();
    });
    this.econ.bindShop(this.onShopOffer, this.onShopBuy, this.onShopCores, this.onShopTab);
    this.hangarUi.bindHangar({
      tab: (tab) => this.onHangarTab(tab),
      pick: (id) => this.onHangarPick(id),
      action: () => this.onHangarAction(),
      open: () => this.openHangar({ from: 'shop' }),
    });
    this.econ.bindPass(this.onPassPremium, () => void this.buyProduct('season_pass'));
    this.goalsUi.bind({
      tab: (tab) => {
        this.goalsTab = tab;
        this.goalsUi.setTab(tab);
      },
      claimLogin: () => this.claimLogin(),
      claim: (id) => this.onClaim(id),
      reroll: (id) => void this.onReroll(id),
    });
    this.ui.titleLeague.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleLeague.addEventListener('click', () => (this.open('ranked') ? this.openLeague() : undefined));
    this.ui.bindSolo((i) => this.startCourse(i), (i) => this.startSolo(i));
    this.ui.bindUpgrades(this.onBuyUpgrade, (id) => {
      this.upgrades.toggle(id as SystemId);
      this.haptics.pickup();
      this.renderHangar(true);
    });
    void looksReady.then(() => this.applyLooks());
    void loadSettings().then((s) => {
      this.settings = s;
      this.applySettings();
    });
    // Before modes were split, ranked and solo were endless runs: carry their bests over.
    void Promise.all([loadNumber(CONFIG.storageKeys.best, 0), loadNumber('endless.soloBest', 0), this.progress.load()]).then(([a, b]) => {
      if (Math.max(a, b) > this.progress.endlessBest) this.progress.recordEndless(Math.max(a, b));
      this.refreshTitle();
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
  private beginRun(startScore = 0, seed = newSeed(), mode: RunMode = 'endless', course: Course | null = null, env: Environment | null = null): void {
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
    this.ui.showShare(false);
    this.ui.showDouble(null);
    this.preview = null;
    this.seed = seed;
    this.mode = mode;
    this.unlockable = (mode === 'ranked' || mode === 'endless') && startScore === 0;
    this.course = course;
    this.environment = env;
    this.world.setCourse(course);
    this.world.setEnvironment(env);
    this.sectionIdx = -1;
    this.hitThisRun = false;
    this.scoreBase = 0;
    this.world.assist = this.assistOn();
    // Your switched-on upgrades (ranked checks them against the league's cap before starting).
    this.ship = this.upgrades.stats();
    this.world.collectScale = this.ship.collect;
    this.world.powerRate = this.ship.powerRate;
    this.ui.setMode(this.modeLabel());
    this.pickupCount = 0;
    this.recorded = false;
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
    if (course) {
      const n = Math.max(1, COURSES.indexOf(course) + 1);
      this.ui.setLevel(n);
      this.ui.setProgress(0);
      this.ui.announceLevel(n, course.name);
    } else this.ui.announceLevel(level, this.areaName(level));
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
    this.fell = fell;
    this.state = 'crashed';
    this.crashMs = 0;
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
    this.revivePending = this.canRevive();
    this.reviveAsked = false;
    if (!this.revivePending) this.settleCrash();
  }

  /** Record a crashed run and fill the game-over screen (after any revive offer is turned down). */
  private settleCrash(): void {
    this.revivePending = false;
    const { best, isNew } = this.recordBest(false);
    this.ui.setGameOver(this.score, best, isNew, this.nearMissCount, this.bestChain, this.seed);
    const where = themeForLevel(this.level) === 'interior' ? this.world.roomName || 'corridor' : this.areaName(this.level);
    const extra = this.finishRun(where);
    if (this.course) {
      const length = courseLength(this.course);
      const pct = Math.floor((100 * (this.world.distance - this.world.finishAt + length)) / length);
      this.ui.setGameOverExtra(`${Math.max(0, Math.min(99, pct))}% of ${this.course.name}${extra ? ' · ' + extra : ''}`);
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
    let credits = creditsFor(score, this.mode === 'ranked') + fromPickups;
    credits += this.recordRank(this.state === 'finished');
    if (this.assisted) lines.push('assist mode. not counted as a best');
    this.wallet.add(credits);
    this.lastRunCredits = credits;
    this.ui.showDouble(credits > 0 && this.ads.offers('doubleCredits') ? `double +${formatScore(credits)} credits · ${this.ads.label()}` : null);
    this.ads.afterRun(Date.now(), false);
    lines.push(`+${formatScore(credits)} credits${fromPickups > 0 ? ` (${formatScore(fromPickups)} from pickups)` : ''}`);
    const board = boardForRun(this.mode, this.environment?.id ?? null, this.course !== null);
    if (board && board !== 'ranked') this.submitToBoard(board, this.state === 'finished');
    if (this.unlockable) {
      const next = nextEnvironment(this.progress.furthest);
      if (next) lines.push(`solo: ${next.env.name} opens at level ${next.status.level} (${next.status.toGo} to go)`);
    }
    this.econ.setOverRewards(this.runRewards());
    this.refreshTitle();
    this.checkGoals(); // the stats are in: any goal this run finished pays out now
    return lines.join(' · ');
  }

  /** Daily and weekly goal progress and season pass XP for the run just recorded; lines for the end screen. */
  private runRewards(): string[] {
    const now = Date.now();
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
    if (!this.open('ranked')) {
      // Ranked isn't open yet: its goals take any run, against the bronze par.
      run.ranked = true;
      run.beatPar = score >= leaguePar(0, this.weekly.target);
    }
    const done = [...this.daily.recordRun(dayKey(now), run), ...this.weeklyGoals.recordRun(weekKey(now), run)];
    for (const q of done) out.push(`goal done: ${questText(q, this.open('ranked'))} · claim it in goals`);
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

  /** Add pass XP from anywhere (a claimed goal); pays any tiers reached. Returns lines. */
  private passXp(xp: number): string[] {
    const before = this.pass.tier;
    const paid = this.pass.addXp(Date.now(), xp);
    const lines = [`+${formatScore(xp)} pass xp`];
    for (const r of paid) lines.push(...this.grant(r));
    if (this.pass.tier > before) lines.push(`season pass tier ${this.pass.tier}`);
    return lines;
  }

  /** Pay a reward into the wallet or looks; returns it in words. `source` names cores for the server (earn_cores). */
  private grant(r: Reward, source?: string): string[] {
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
  private claimLogin(): void {
    const day = dayKey(Date.now());
    const step = this.daily.loginDue(day);
    if (step < 0) return;
    const r = this.daily.claimLogin(day);
    if (!r) return;
    const lines = this.grant(r, `login:${day}`);
    this.ui.celebrate([{ kicker: `day ${step + 1} of ${CONFIG.economy.login.length}`, icon: GIFT_ICON, name: 'daily reward', lines }]);
    this.sound.power();
    this.haptics.pickup();
    this.refreshTitle();
    if (this.infoOpen === 'goals') this.renderGoals();
  }

  private shopTab: ShopTab = 'today';

  /** The cards for the open shop tab, and the line, heading and buy button that go with them. */
  private shopTabView(now: number, owned: (key: string) => boolean): { heading: string; reset: string; info: string; items: LookItem[]; cards: { price: string; premium: boolean; deal: boolean }[]; buy: { text: string; enabled: boolean } } {
    const priceOf = (item: LookItem): string => {
      const u = item.unlock;
      return u.by === 'credits' ? `${formatScore(u.cost)} credits` : u.by === 'cores' || u.by === 'vault' ? `${formatScore(u.cost)} cores` : '';
    };
    if (this.shopTab === 'set') {
      const week = weekKey(now);
      const so = setOffer(week, owned);
      const left = Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000 - now;
      const saved = so.full - so.price;
      return {
        heading: so.set.name,
        reset: `this week · new in ${formatWait(left)}`,
        info: so.complete
          ? `you have the whole set. its bonus of ${so.set.bonusCores} cores is yours`
          : `${so.missing.length} of ${so.items.length} looks left · the lot for ${formatScore(so.price)} cores, ${formatScore(saved)} less than one by one · own the whole set for +${so.set.bonusCores} cores`,
        items: so.items,
        cards: so.items.map((item) => ({ price: priceOf(item), premium: item.unlock.by === 'cores', deal: false })),
        buy: so.complete ? { text: 'set complete', enabled: false } : { text: `buy the set · ${formatScore(so.price)} cores`, enabled: this.wallet.cores >= so.price },
      };
    }
    if (this.shopTab === 'vault') {
      const v = vaultAt(now);
      const mine = owned(keyOf(v.item));
      return {
        heading: 'the vault',
        reset: `leaves in ${formatWait(v.leaves)}`,
        info: `a rare look, for sale a month at a time. when it goes it's away for ${VAULT_ORDER.length - 1} months`,
        items: [v.item],
        cards: [{ price: priceOf(v.item), premium: true, deal: false }],
        buy: mine ? { text: `${v.item.name} is yours`, enabled: false } : { text: `buy ${v.item.name} · ${formatScore(v.price)} cores`, enabled: this.wallet.cores >= v.price },
      };
    }
    const offers = this.dailyShop.offers(dayKey(now), owned);
    const f = offers[this.shopPick];
    let buy: { text: string; enabled: boolean } = { text: 'tap a look to try it on', enabled: false };
    if (f) {
      if (owned(keyOf(f.item))) buy = { text: `${f.item.name} is on your ship`, enabled: false };
      else {
        const have = f.currency === 'cores' ? this.wallet.cores : this.wallet.credits;
        const price = `${formatScore(f.price)} ${f.currency}`;
        buy = have >= f.price ? { text: `buy ${f.item.name} · ${price}`, enabled: true } : { text: `${price} · you have ${formatScore(have)}`, enabled: false };
      }
    }
    return {
      heading: "today's looks",
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      info: '',
      items: offers.map((o) => o.item),
      cards: offers.map((o) => ({ price: `${formatScore(o.price)} ${o.currency}`, premium: o.currency === 'cores', deal: o.deal })),
      buy,
    };
  }

  private openShop(tab?: ShopTab): void {
    const now = Date.now();
    if (tab) {
      this.shopTab = tab;
      this.shopPick = -1;
      this.preview = null;
      this.applyLooks();
    }
    const tabs = this.shopTabs();
    if (!tabs.some((t) => t.id === this.shopTab)) this.shopTab = 'today';
    const o = this.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.looks.owns(it, o);
    };
    const looksTab = this.shopTab === 'today' || this.shopTab === 'set' || this.shopTab === 'vault';
    const v = looksTab ? this.shopTabView(now, owned) : { heading: '', reset: '', info: '', items: [] as LookItem[], cards: [] as { price: string; premium: boolean; deal: boolean }[], buy: { text: '', enabled: false } };
    const list = looksTab ? { head: '', note: '', rows: [] } : this.shopList(this.shopTab);
    this.econ.renderShop({
      wallet: `${formatScore(this.wallet.credits)} credits · ${formatScore(this.wallet.cores)} cores`,
      reset: v.reset,
      tabs: tabs.map((t) => ({ ...t, on: t.id === this.shopTab })),
      pane: looksTab ? 'looks' : 'list',
      listHead: list.head,
      listNote: list.note,
      heading: v.heading,
      info: v.info,
      offers: v.items.map((item, i) => ({
        name: item.name,
        slot: item.slot,
        slotName: SLOT_NAMES[item.slot],
        swatch: lookSwatch(item),
        icon: lookIcon(item),
        price: v.cards[i].price,
        premium: v.cards[i].premium,
        deal: v.cards[i].deal,
        owned: owned(keyOf(item)),
        picked: i === this.shopPick,
      })),
      buy: v.buy,
      cores: list.rows,
    });
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('shop');
  }

  /** The shop's tabs. Cores and premium show where they can be bought (the apps, or the dev build). */
  private shopTabs(): { id: ShopTab; label: string }[] {
    const tabs: { id: ShopTab; label: string }[] = [
      { id: 'today', label: 'today' },
      { id: 'set', label: 'weekly set' },
      { id: 'vault', label: 'vault' },
      { id: 'pass', label: 'season pass' },
    ];
    tabs.push({ id: 'cores', label: 'cores' });
    if (this.storeProducts.some((p) => p.id === 'premium') || import.meta.env.DEV || this.entitlements.has('premium')) tabs.push({ id: 'premium', label: 'premium' });
    return tabs;
  }

  private onShopTab = (id: string): void => {
    if (!this.shopTabs().some((t) => t.id === id)) return;
    this.openShop(id as ShopTab);
  };

  /** A list tab's heading, note and rows (what each row's button does is in shopPacks). */
  private shopList(tab: ShopTab): { head: string; note: string; rows: { label: string; button: string; enabled: boolean }[] } {
    const rows: { label: string; button: string; enabled: boolean }[] = [];
    this.shopPacks = [];
    const price = new Map(this.storeProducts.map((p) => [p.id, p.price]));
    const row = (label: string, button: string, enabled: boolean, action: (typeof this.shopPacks)[number]) => {
      rows.push({ label, button, enabled });
      this.shopPacks.push(action);
    };
    if (tab === 'pass') {
      const P = CONFIG.economy.pass;
      const s = seasonAt(Date.now());
      if (this.pass.premium) row(`season ${s.season}'s premium track is yours`, 'see tiers', true, 'pass-open');
      else {
        row(`premium track, season ${s.season}`, `${formatScore(P.premiumCores)} cores`, this.wallet.cores >= P.premiumCores, 'pass-cores');
        const money = price.get('season_pass');
        if (money) row('premium track, for money', money, true, 'season_pass');
        row(`tier ${this.pass.tier} of ${P.tiers} · ends in ${formatWait(s.end - Date.now())}`, 'see tiers', true, 'pass-open');
      }
      return { head: 'season pass', note: "every tier pays on the free track; premium pays more, with the season's new looks.", rows };
    }
    if (tab === 'premium') {
      const own = this.entitlements.has('premium');
      const money = price.get('premium');
      if (own) row('premium is yours. thank you', 'owned', false, 'pass-open');
      else if (money) row('premium, once, for good', money, true, 'premium');
      if (import.meta.env.DEV) row('dev: premium on/off', 'toggle', true, 'dev-premium');
      if (this.store.available) row('bought on another device?', 'restore', true, 'restore');
      return {
        head: 'premium',
        note: 'no ads; ad rewards (revives, double credits, the daily gift) without the ad; the halo hull, regalia paint and crown flame; an extra free revive a day; a badge on the leaderboards. nothing that makes you faster in ranked.',
        rows,
      };
    }
    for (const p of CONFIG.economy.store.products) {
      const cost = price.get(p.id);
      if (!cost || 'pass' in p || 'premium' in p || ('once' in p && this.ownsProduct(p.id))) continue;
      row('look' in p ? `starter pack · ${formatScore(p.cores)} cores and ${rewardText({ look: p.look })}` : `${formatScore(p.cores)} cores`, cost, true, p.id);
    }
    if (this.store.available) row('bought on another device?', 'restore', true, 'restore');
    if (import.meta.env.DEV) row('dev: add cores (purchases stand-in)', '+500', true, 'dev');
    if (rows.length === 0) {
      rows.push({ label: 'packs of cores come with the iOS and Android apps', button: 'soon', enabled: false });
      this.shopPacks.push('restore');
    }
    const S = CONFIG.economy.shop;
    for (const n of S.swaps) row(`swap ${formatScore(n)} cores for ${formatScore(n * S.creditsPerCore)} credits`, `${formatScore(n)} cores`, this.wallet.cores >= n, `swap-${n}`);
    return { head: 'cores', note: 'cores buy premium looks, the vault, revives and the pass, or swap for credits.', rows };
  }

  /** Tap a look: it goes on the ship to try (owned ones are just put on). Tap again to take it off. */
  private onShopOffer = (i: number): void => {
    const now = Date.now();
    const o = this.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.looks.owns(it, o);
    };
    const item = this.shopTabView(now, owned).items[i];
    if (!item) return;
    if (this.shopPick === i && !owned(keyOf(item))) {
      this.shopPick = -1;
      this.preview = null;
    } else {
      this.shopPick = i;
      if (owned(keyOf(item))) {
        this.preview = null;
        this.looks.equip(item.slot, item.id);
      } else this.preview = { slot: item.slot, id: item.id };
    }
    this.haptics.pickup();
    this.applyLooks();
    this.openShop();
  };

  /** Something was bought: put it on, play the sound, and see whether it finished a goal or a set. */
  private afterBuy(items: LookItem[], notice: string): void {
    for (const item of items) this.looks.equip(item.slot, item.id);
    this.preview = null;
    this.sound.pickup();
    this.haptics.pickup();
    this.ui.showNotice(notice);
    this.applyLooks();
    this.refreshTitle();
    this.checkGoals();
  }

  private onShopBuy = (): void => {
    const now = Date.now();
    const o = this.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.looks.owns(it, o);
    };
    if (this.shopTab === 'set') {
      const so = setOffer(weekKey(now), owned);
      if (so.complete || !this.wallet.spendCores(so.price)) return;
      for (const item of so.missing) this.looks.buy(item);
      this.afterBuy(so.items, `${so.set.name} bought and on your ship`);
    } else if (this.shopTab === 'vault') {
      const v = vaultAt(now);
      if (owned(keyOf(v.item)) || !this.wallet.spendCores(v.price)) return;
      this.looks.buy(v.item);
      this.afterBuy([v.item], `${v.item.name} from the vault is on your ship`);
    } else {
      const f = this.dailyShop.offers(dayKey(now), owned)[this.shopPick];
      if (!f || owned(keyOf(f.item))) return;
      const paid = f.currency === 'cores' ? this.wallet.spendCores(f.price) : this.wallet.spend(f.price);
      if (!paid) return;
      this.looks.buy(f.item);
      this.afterBuy([f.item], `${f.item.name} bought and on your ship`);
    }
    this.openShop();
  };

  /** Cores packs: real purchases come with the store (stage D); the dev build adds them free. */
  private onShopCores = (i: number): void => {
    const pack = this.shopPacks[i];
    if (pack === 'dev') {
      this.devAddCores(500);
      this.openShop();
    } else if (pack === 'dev-premium') {
      this.devTogglePremium();
      this.openShop();
    } else if (pack === 'pass-cores') {
      this.onPassPremium();
      this.openShop('pass'); // stay in the shop
    } else if (pack === 'pass-open') this.openPass();
    else if (pack === 'restore') void this.restorePurchases();
    else if (pack?.startsWith('swap-')) this.swapCores(Number(pack.slice(5)));
    else if (pack) void this.buyProduct(pack as ProductId);
  };

  /** Cores into credits, at the shop's rate. */
  private swapCores(n: number): void {
    if (!this.wallet.spendCores(n, 'swap')) {
      this.ui.showNotice('not enough cores');
      return;
    }
    const lines = this.grant({ credits: n * CONFIG.economy.shop.creditsPerCore });
    this.ui.showNotice(lines.join(' · '));
    this.sound.pickup();
    this.refreshTitle();
    this.openShop('cores');
  }

  private openPass(): void {
    const now = Date.now();
    this.pass.turn(now);
    const P = CONFIG.economy.pass;
    const tier = this.pass.tier;
    const s = seasonAt(now);
    const maxed = tier >= P.tiers;
    const passPrice = this.storeProducts.find((p) => p.id === 'season_pass')?.price;
    this.econ.renderPass({
      big: maxed ? 'complete' : String(P.xpPerTier - (this.pass.xp % P.xpPerTier)),
      goal: maxed ? `all ${P.tiers} tiers` : `xp to tier ${tier + 1}`,
      fraction: this.pass.tierFraction,
      detail: `season ${s.season} · tier ${tier} of ${P.tiers} · ends in ${formatWait(s.end - now)}`,
      premium: this.pass.premium ? null : { text: `unlock premium · ${formatScore(P.premiumCores)} cores`, enabled: this.wallet.cores >= P.premiumCores },
      buy: passPrice ? `or unlock for ${passPrice}` : null,
      premiumOwned: this.pass.premium,
      tiers: Array.from({ length: P.tiers }, (_, i) => ({
        tier: i + 1,
        free: rewardText(freeReward(i + 1, s.season)),
        premium: rewardText(premiumReward(i + 1, s.season)),
        reached: i < tier,
        current: i === tier || (maxed && i === P.tiers - 1),
      })),
    });
    this.openInfo('pass');
  }

  private onPassPremium = (): void => {
    if (this.pass.premium || !this.wallet.spendCores(CONFIG.economy.pass.premiumCores)) return;
    const paid = this.pass.unlockPremium();
    const lines = paid.flatMap((r) => this.grant(r));
    this.ui.celebrate([{ kicker: 'season pass', icon: PASS_ICON, name: 'premium unlocked', lines: lines.length > 0 ? mergeCredits(lines) : ['premium rewards from every tier you reach'] }]);
    this.sound.power();
    this.refreshTitle();
    this.openPass();
  };

  // --- revive ----------------------------------------------------------------

  /** A revive is offered once a run, outside ranked, where the lane is known. */
  private canRevive(): boolean {
    return this.mode !== 'ranked' && !this.revived && this.world.laneAt(this.world.distance) !== null;
  }

  private offerRevive(): void {
    const day = dayKey(Date.now());
    const free = this.daily.freeRevivesLeft(day, this.freeRevivesADay()) > 0;
    // Out of free ones: a rewarded ad if there is one (free with premium), otherwise cores.
    const byAd = !free && this.ads.offers('revive');
    const cost = CONFIG.economy.revive.coreCost;
    this.econ.offer(
      {
        kicker: 'crashed',
        name: 'keep going?',
        lines: [free ? 'your free revive today' : `you have ${formatScore(this.wallet.cores)} cores`, `score so far ${formatScore(this.score)}`],
        yes: free ? 'revive · free' : byAd ? `revive · ${this.ads.label()}` : `revive · ${cost} cores`,
        yesEnabled: free || byAd || this.wallet.cores >= cost,
        no: 'no thanks',
        seconds: 6,
      },
      () => {
        if (free) this.daily.useFreeRevive(day);
        else if (byAd) {
          void this.ads.reward('revive').then((ok) => (ok ? this.revive() : this.settleCrash()));
          return;
        } else if (!this.wallet.spendCores(cost)) return this.settleCrash();
        this.revive();
      },
      () => this.settleCrash(),
    );
  }

  /** Double the last run's credits for a rewarded ad (free with premium), once. */
  private async doubleCredits(): Promise<void> {
    const n = this.lastRunCredits;
    if (n <= 0) return;
    this.lastRunCredits = 0;
    this.ui.showDouble(null);
    if (!(await this.ads.reward('doubleCredits'))) {
      // No reward (the ad didn't load or was closed early): the offer stays.
      this.lastRunCredits = n;
      this.ui.showDouble(`double +${formatScore(n)} credits · ${this.ads.label()}`);
      this.ui.showNotice("no ad, no double. try again in a moment");
      return;
    }
    this.grant({ credits: n });
    this.ui.markDoubled(formatScore(n), formatScore(n * 2));
    this.ui.showNotice(`doubled: +${formatScore(n * 2)} credits this run · ${formatScore(this.wallet.credits)} credits now`);
    this.sound.power();
    this.refreshTitle();
  }

  /** The free daily gift (a rewarded ad, or free with premium). */
  private async claimGift(): Promise<void> {
    const day = dayKey(Date.now());
    if (!this.daily.giftReady(day) || !(await this.ads.reward('dailyGift'))) return;
    this.daily.takeGift(day);
    const lines = this.grant(CONFIG.ads.dailyGift, `gift:${day}`);
    this.ui.celebrate([{ kicker: 'free gift', icon: GIFT_ICON, name: 'daily gift', lines }]);
    this.refreshTitle();
  }

  /** Swap an unfinished daily goal for another (a rewarded ad, or free with premium), once a day. */
  private async onReroll(id: string): Promise<void> {
    const i = Number(id.slice(1));
    const day = dayKey(Date.now());
    if (!/^q\d$/.test(id) || !this.daily.canReroll(day) || !(await this.ads.reward('rerollQuest'))) return;
    const q = this.daily.reroll(i, day);
    if (q) this.ui.showNotice(`new goal: ${questText(q, this.open('ranked'))}`);
    this.renderGoals();
    this.refreshTitle();
  }

  /** Free revives a day: one for everyone, more with premium. */
  private freeRevivesADay(): number {
    return 1 + (this.entitlements.has('premium') ? CONFIG.premium.extraFreeRevives : 0);
  }

  /** Back on the lane with the way ahead cleared, a shield on, and a 3-2-1. */
  private revive(): void {
    const R = CONFIG.economy.revive;
    this.revivePending = false;
    this.revived = true;
    this.preRevive = { score: Math.floor(this.score), seconds: this.runTime, distance: this.world.distance - this.runStart };
    this.hitThisRun = true;
    this.world.revive(R.clearAhead);
    this.world.sync();
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.shield = true;
    this.player.setShield(true);
    this.graceT = R.graceSeconds;
    this.stage.shakeX = this.stage.shakeY = 0;
    this.stage.roll = 0;
    this.refreshTitle();
    this.ui.show(null);
    this.ui.showHud(true);
    this.startCountdown();
  }

  /** Hold everything still for a 3-2-1, then play. */
  private startCountdown(): void {
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
    const now = Date.now();
    this.daily.turn(dayKey(now));
    this.weeklyGoals.turn(weekKey(now));
    this.pass.turn(now);
    this.refreshBar(now);
  }

  /** Sign in and sync with the server, if there is one (see src/server). */
  private async connect(): Promise<void> {
    if (await this.backend.signIn()) {
      if (await this.cloud.start()) {
        location.reload(); // the cloud save is newer: start again from it
        return;
      }
      await this.wallet.link(this.backend);
      await this.checkMaxOut();
      this.refreshTitle();
      this.queueShip();
      void this.askName();
      void this.outbox.flush(); // runs that couldn't be sent last time
    }
    const refund = await migrateTickets((n) => this.wallet.addCores(n, 'tickets'));
    if (refund > 0) {
      this.ui.showNotice(`ranked is unlimited now: your spare tickets became ${formatScore(refund)} cores`);
      this.refreshTitle();
    }
    // What the account has bought, as the server's purchase records have it.
    const bought = (await this.backend.purchases()) ?? [];
    for (const id of bought) this.grantProduct(id);
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
    if (this.infoOpen === 'shop') this.openShop();
  }

  /** Buy a real-money product through the app store, then deliver it. */
  private async buyProduct(id: ProductId): Promise<void> {
    // With the server, a purchase is paid to the account (the webhook): no account known, no sale.
    if (this.backend.online) {
      if (!this.backend.userId) await this.backend.signIn();
      const user = this.backend.userId;
      if (!user || !(await this.store.identify(user))) {
        this.ui.showNotice("can't reach the server right now. nothing was charged. try again in a moment");
        return;
      }
    }
    const result = await this.store.buy(id);
    if (result === 'cancelled') return;
    if (result === 'failed') {
      this.ui.showNotice('purchase didn\'t go through. nothing was charged');
      return;
    }
    const p = CONFIG.economy.store.products.find((x) => x.id === id)!;
    const lines: string[] = [];
    if ('cores' in p) {
      // With the server, the store's webhook pays the cores there: take its balance.
      if (this.backend.online) {
        lines.push(`+${formatScore(p.cores)} cores`);
        void this.awaitPaidCores(this.wallet.cores + p.cores);
      } else lines.push(...this.grant({ cores: p.cores }));
    }
    if ('look' in p) lines.push(...this.grant({ look: p.look }));
    if ('pass' in p && !this.pass.premium) lines.push(...this.pass.unlockPremium().flatMap((r) => this.grant(r)), 'season pass premium');
    if ('premium' in p) lines.push('premium: no ads, ad rewards free, the halo hull, regalia paint and crown flame, an extra free revive a day');
    this.grantProduct(id);
    this.ui.celebrate([{ kicker: 'thank you', icon: GIFT_ICON, name: 'purchase complete', lines: mergeCredits(lines) }]);
    this.sound.power();
    this.refreshTitle();
    if (this.infoOpen === 'shop') this.openShop();
    if (this.infoOpen === 'pass') this.openPass();
  }

  /**
   * The store's webhook pays a cores pack on the server a moment after the
   * purchase goes through. Check the server's balance until it's there (or
   * about 20 seconds pass), then show it on whichever screen is open.
   */
  private async awaitPaidCores(target: number): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => window.setTimeout(r, i === 0 ? 1000 : 2000));
      await this.wallet.link(this.backend);
      if (this.wallet.cores >= target) break;
    }
    this.refreshTitle();
    if (this.infoOpen === 'shop') this.openShop();
    else if (this.infoOpen === 'pass') this.openPass();
    else if (this.infoOpen === 'hangar') this.renderHangar(true);
  }

  /** True if a one-time product is owned (premium, the starter pack). */
  private ownsProduct(id: string): boolean {
    const e = entitlementFor(id);
    return e !== null && this.entitlements.has(e);
  }

  /** Own a one-time product (bought, restored, or on the server's records); true if it's new here. */
  private grantProduct(id: string): boolean {
    const e = entitlementFor(id);
    if (!e || !this.entitlements.grant(e)) return false;
    const p = CONFIG.economy.store.products.find((x) => x.id === id);
    if (p && 'look' in p) this.grant({ look: p.look });
    this.applyLooks();
    return true;
  }

  /** Restore one-time purchases on a new install (cores come back with the cloud save). */
  private async restorePurchases(): Promise<void> {
    this.ui.showNotice('checking your purchases…');
    // Google Play's records for the Google account on this phone, and the server's for this game account.
    // At least two seconds, so the answer doesn't flash past the "checking" note.
    const wait = new Promise((r) => window.setTimeout(r, 2000));
    const [fromStore, fromServer] = await Promise.all([this.store.restore(), this.backend.purchases(), wait]);
    const ids = [...new Set([...fromStore, ...(fromServer ?? [])])].filter((id) => !id.startsWith('refunded:'));
    let n = 0;
    for (const id of ids) if (this.grantProduct(id)) n++;
    const owned = ids.some((id) => entitlementFor(id) !== null && this.ownsProduct(id));
    if (n > 0) this.ui.showNotice(`restored ${n} purchase${n === 1 ? '' : 's'}`);
    else if (owned) this.ui.showNotice('all your purchases are here');
    else if (googleAvailable() && !this.googleEmail) this.ui.showNotice('nothing to restore. bought on another phone? sign in with google');
    else this.ui.showNotice('nothing to restore');
    if (this.infoOpen === 'shop') this.openShop();
  }

  /** A picture of this run for the share sheet. */
  private async share(): Promise<void> {
    const lg = this.leagues;
    const best = this.progress.weeklyBest(this.weekly.id);
    await shareCard({
      score: formatScore(this.score),
      heading: `ranked · ${this.weekly.name}`,
      lines: [rankName(this.ranked.rank), leagueName(lg.league, lg.division), `best this week ${formatScore(best)}`],
      sky: '#' + this.palette.sky.getHexString(),
      text: this.palette.textCss(),
    });
  }

  private refreshBar(now = Date.now()): void {
    this.econ.setBar(this.wallet.credits, this.wallet.cores);
    this.econ.setNews('goals', this.daily.loginDue(dayKey(now)) >= 0 || this.goalsToClaim() > 0);
  }

  /** Fold a run into the rank (every mode) and, for ranked, the league; fills the game-over block. Returns bonus credits. */
  private recordRank(finished: boolean): number {
    const lg = this.leagues;
    const ranked = this.mode === 'ranked';
    const score = this.assisted ? 0 : this.score;
    const target = this.weekly.target;
    this.beatPar = false;
    const r = this.ranked.record(this.mode, score, this.level, this.seed, Date.now(), ranked ? this.weekly.id : undefined);
    const promoted = r.rankAfter > r.rankBefore;
    const leagueLines: string[] = [];
    const party: Celebration[] = [];
    let bonus = r.credits;
    if (ranked) {
      this.submitToBoard('ranked', finished);
      this.ui.showShare(true);
      this.beatPar = score >= leaguePar(lg.league, target);
      const res = lg.record(this.score, target);
      bonus += res.credits;
      leagueLines.push(`${leagueName(lg.league, lg.division)} · ${res.lp >= 0 ? '+' : ''}${res.lp} lp (${lg.lp}/${LP_PER_DIVISION})`);
      if (res.divisionUp) {
        leagueLines.push(`division up: +${formatScore(res.credits)} credits`);
        party.push({
          kicker: 'division up',
          icon: emblem(lg.league, lg.division),
          name: leagueName(lg.league, lg.division),
          lines: [`+${formatScore(res.credits)} credits`, `${formatScore(lg.current.weekly[lg.division])} credits a week`],
          color: lg.current.color,
        });
      }
      if (res.divisionDown) leagueLines.push('dropped a division');
      bonus += this.promoteLeague(leagueLines, party);
    }
    if (promoted) {
      const gives: string[] = [];
      for (let k = r.rankBefore + 1; k <= r.rankAfter; k++) gives.push(...this.rankGives(k));
      const newColour = rankColour(r.rankAfter);
      if (newColour !== rankColour(r.rankBefore)) gives.push(`new menu colour: ${newColour.name}`);
      party.unshift({ kicker: 'promoted', icon: insignia(r.rankAfter), name: rankName(r.rankAfter), lines: mergeCredits(gives), color: newColour.accent });
    }
    const lines = [...leagueLines, `+${r.xp} xp${r.doubled ? ' (double)' : ''}`];
    if (ranked) lines.push(`league par this week: ${formatScore(leaguePar(lg.league, target))}`);
    if (promoted) lines.splice(leagueLines.length, 0, `+${formatScore(r.credits)} promotion credits`);
    const view: RankResultView = {
      icon: insignia(r.rankAfter),
      rank: rankName(r.rankAfter),
      promoted,
      xpFraction: this.xpFraction(),
      lines,
    };
    this.ui.setGameOverRank(view);
    if (party.length) this.ui.celebrate(party);
    if (promoted) {
      this.sound.level(true, musicFor(this.level));
      this.haptics.level(true);
      if (this.state !== 'crashed') this.ui.showNotice(`promoted to ${rankName(r.rankAfter)}`);
    }
    return bonus;
  }

  /** Promote to the next league if ready and enough upgrade points are owned. Returns credits. */
  private promoteLeague(lines: string[] | null, party: Celebration[] = []): number {
    const lg = this.leagues;
    const credits = lg.tryPromote(this.upgrades.points());
    if (credits > 0) {
      party.push({
        kicker: 'new league',
        icon: emblem(lg.league, lg.division),
        name: `${lg.current.name} league`,
        lines: this.leagueGives(lg.league),
        color: lg.current.color,
      });
      const text = `promoted to ${lg.current.name} league: +${formatScore(credits)} credits`;
      if (lines) lines.push(text);
      else this.ui.showNotice(text);
      this.sound.level(true, musicFor(this.level));
      this.haptics.level(true);
    } else if (lg.promotionReady && lines) {
      lines.push(`promotion ready: own ${LEAGUES[lg.league + 1].min} upgrade points`);
    }
    return credits;
  }

  /** What reaching rank `k` gives: its promotion credits, any looks, a new insignia. */
  private rankGives(k: number): string[] {
    const out = [`+${formatScore(promotionBonus(k))} credits`];
    if (k > 0 && RANKS[k].tier !== RANKS[k - 1].tier) out.push('new insignia');
    for (const l of LOOKS) if (l.unlock.by === 'rank' && l.unlock.rank === k) out.push(`${l.name} ${SLOT_NAMES[l.slot]}`);
    return out;
  }

  /** What reaching league `l` gives. */
  private leagueGives(l: number): string[] {
    const x = LEAGUES[l];
    const out: string[] = [];
    if (x.promotion > 0) out.push(`+${formatScore(x.promotion)} credits`);
    for (const look of LOOKS) if (look.unlock.by === 'league' && look.unlock.league === l) out.push(`${look.name} ${SLOT_NAMES[look.slot]}`);
    TIER_LEAGUE.forEach((need, t) => {
      if (need === l && need > 0) out.push(`tier ${t + 1} upgrades`);
    });
    out.push(`up to ${x.max} active upgrade points`);
    out.push(`${formatScore(x.weekly[0])}-${formatScore(x.weekly[2])} credits a week`);
    return out;
  }

  /** The most recent `n` ranked runs, oldest first. */
  private recentRanked(n: number) {
    return this.ranked.history.slice(-n);
  }

  private openLeague(): void {
    const lg = this.leagues;
    const l = lg.league;
    const next = LEAGUES[l + 1];
    const owned = this.upgrades.points();
    const target = this.weekly.target;
    const lastDivision = DIVISIONS.length - 1;
    const parNow = leaguePar(l, target);
    const left = Math.max(0, LP_PER_DIVISION - lg.lp);

    let big = String(left);
    let goal: string;
    const checks: ProgressView['checks'] = [];
    if (lg.top) {
      big = String(lg.lp);
      goal = 'lp in the top league';
    } else if (lg.division < lastDivision) {
      goal = `lp to ${leagueName(l, lg.division + 1)}`;
      checks.push({ label: `own ${next.min} upgrade points for ${next.name}`, value: `${owned} owned`, met: owned >= next.min });
    } else {
      goal = lg.promotionReady ? `division full: ${next.name} next` : `lp to finish ${leagueName(l, lg.division)}`;
      checks.push({ label: `fill division ${DIVISIONS[lastDivision]}`, value: `${lg.lp}/${LP_PER_DIVISION} lp`, met: lg.promotionReady });
      checks.push({ label: `own ${next.min} upgrade points`, value: `${owned} owned`, met: owned >= next.min });
    }
    // Roughly how many runs at par that is (+10 LP each).
    const runs = Math.ceil(left / 10);

    const gives: ProgressView['gives'] = [];
    if (!lg.top && lg.division < lastDivision) {
      gives.push({
        title: `${leagueName(l, lg.division + 1)} gives`,
        items: [`+${formatScore(divisionReward(l))} credits`, `${formatScore(lg.current.weekly[lg.division + 1])} credits a week`],
      });
    }
    if (next) gives.push({ title: `${next.name} league gives`, items: this.leagueGives(l + 1) });

    const h = lg.history.slice(-20);
    const net = h.reduce((t, v) => t + v, 0);
    this.ui.renderProgress('league', {
      icon: emblem(l, lg.division),
      name: leagueName(l, lg.division),
      big,
      goal,
      fraction: lg.lp / LP_PER_DIVISION,
      detail: lg.top || lg.promotionReady ? `par ${formatScore(parNow)} this week` : `${lg.lp} / ${LP_PER_DIVISION} lp · about ${runs} run${runs === 1 ? '' : 's'} at par`,
      checks,
      gives,
      trend: { title: h.length ? `last ${h.length} runs` : 'recent runs', values: h, summary: h.length ? `${net >= 0 ? '+' : ''}${net} lp` : '', unit: 'lp' },
      rows: [
        ['par this week', `${formatScore(parNow)} = +10 lp`],
        ['150% of par', `${formatScore(Math.round(parNow * 1.5))} = +25 lp`],
        ['active upgrade points', `${this.upgrades.activePoints()} (cap ${lg.current.max})`],
        ['weekly reward so far', formatScore(lg.weeklySoFar())],
      ],
      ladder: LEAGUES.map((y, k) => ({
        icon: emblem(k, k < l ? 2 : k === l ? lg.division : -1),
        name: y.name,
        needs: `${y.min === y.max ? y.max : `${y.min}-${y.max}`} upgrade points · par ${formatScore(leaguePar(k, target))}`,
        gives: k === 0 ? 'where everyone starts' : this.leagueGives(k).slice(0, 3).join(' · '),
        state: k < l ? 'done' : k === l ? 'current' : 'locked',
      })),
    });
    this.openInfo('league');
    void this.loadBoard();
  }

  /** This week's leaderboard in your league (just your best when offline). */
  private async loadBoard(): Promise<void> {
    const lg = this.leagues;
    const tab = BOARD_TABS[0];
    this.ui.renderBoard([], this.backend.online ? 'loading' : '');
    const rows = await this.backend.board(boardQuery(tab, lg.league));
    const mine = this.progress.weeklyBest(this.weekly.id);
    if (!this.backend.online || rows === null) {
      this.ui.renderBoard(mine > 0 ? [['your best', formatScore(mine)]] : [['no ranked run yet this week', '']], this.backend.online ? "couldn't load the board" : 'the leaderboards need the server');
      return;
    }
    const view: [string, string][] = rows.map((r) => [`${r.rank}. ${r.you ? 'you' : r.name}`, formatScore(r.score)]);
    this.ui.renderBoard(view.length > 0 ? view : [['no runs yet this week', '']], LEAGUES[lg.league].name);
  }

  // --- leaderboards ----------------------------------------------------------------

  /** Send a finished run to its board. Assisted and dev runs never go. */
  private submitToBoard(board: BoardId, finished: boolean): void {
    if (this.assisted || this.invincible() || this.dev.autopilot) return;
    this.queueShip(); // the rank and league badges may have moved
    // A revived run counts as it stood at its first crash.
    const run = this.preRevive ?? { score: Math.floor(this.score), seconds: this.runTime, distance: this.world.distance - this.runStart };
    if (run.distance < 60 || run.seconds < 5 || run.score <= 0) return; // a crash at the start isn't a result
    void this.outbox
      .send({
        board,
        league: board === 'ranked' ? this.leagues.league : 0,
        score: run.score,
        seconds: run.seconds,
        distance: run.distance,
        finished,
        path: board === 'ranked' ? [...this.path] : [],
      })
      .then((res) => {
        if (!res) return; // waiting for a signal
        if (res.status === 'ok' && res.rank) this.ui.showNotice(`${res.newBest ? 'new best: ' : ''}#${res.rank} on the ${boardName(board)} board`);
        else if (res.status === 'rejected' && import.meta.env.DEV) console.warn(`leaderboard turned the run down: ${res.message}`);
      });
  }

  /** Your own best on a tab, for when the board can't be read. */
  private localBest(id: string): number {
    if (id === 'week') return this.progress.weeklyBest(this.weekly.id);
    if (id === 'endless') return this.progress.endlessBest;
    return this.progress.envBest[id] ?? 0;
  }

  /** The looks you have on, as the boards keep them (with the rank and league your badge decals show). */
  private shipLook(): ShipLook {
    return { ...this.looks.equipped, rank: this.ranked.rank, league: this.leagues.league, division: this.leagues.division };
  }

  /** Send your looks to the boards a moment after they change (trying looks on sends nothing: only what's equipped). */
  private queueShip(): void {
    window.clearTimeout(this.shipTimer);
    this.shipTimer = window.setTimeout(() => void this.syncShip(), 2000);
  }

  /** Send your looks to the boards if they've changed since last time. */
  private async syncShip(): Promise<void> {
    if (!this.backend.online) return;
    const ship = this.shipLook();
    const key = JSON.stringify(ship);
    if (key === this.shipSent) return;
    if (await this.backend.setShip(ship)) this.shipSent = key;
  }

  /** A board row for the UI, with a picture of the pilot's ship (yours as you have it on now). */
  private boardRow(r: { rank: number; name: string; score: number; you: boolean; premium?: boolean; ship?: ShipLook | null }) {
    const ship = r.you ? this.shipLook() : (r.ship ?? null);
    return {
      rank: r.rank,
      name: r.name,
      score: formatScore(r.score),
      you: r.you,
      premium: r.premium,
      picture: ship ? () => this.portraits.get(ship) : null,
      looks: ship ? describeShip(ship) : '',
    };
  }

  private openBoards(): void {
    this.openInfo('boards');
    void this.showBoard(this.boardTab);
    void this.backend.pilotName().then((name) => {
      // The name is asked for here, when it's first needed: a generated one ("pilot-3fa2") invites a real one.
      const generated = !name || GENERATED_NAME.test(name);
      if (this.infoOpen === 'boards') this.ui.setPilotName(name ?? '', this.backend.online ? (generated ? 'pick your pilot name: 3 to 16 letters, numbers, spaces, - or _' : '3 to 16 letters, numbers, spaces, - or _. once an hour') : 'names come with the server');
    });
  }

  private async showBoard(id: string): Promise<void> {
    const tab = BOARD_TABS.find((t) => t.id === id) ?? BOARD_TABS[0];
    this.boardTab = tab.id;
    this.ui.setBoardTab(tab.id);
    const seq = ++this.boardSeq;
    const caption = boardCaption(tab, this.leagues.league);
    const mine = this.localBest(tab.id);
    const own = mine > 0 ? [this.boardRow({ rank: 0, name: 'you', score: mine, you: true })] : [];
    if (!this.backend.online) {
      this.ui.renderLeaderboard(caption, own, 'global boards need the server. this is your best on this device.');
      return;
    }
    this.ui.renderLeaderboard(caption, [], 'loading');
    await Promise.all([this.outbox.flush(), this.syncShip()]); // so a run you just finished, and your ship, are on the board
    const rows = await this.backend.board(boardQuery(tab, this.leagues.league));
    if (seq !== this.boardSeq || this.infoOpen !== 'boards') return; // moved on while it loaded
    if (rows === null) this.ui.renderLeaderboard(caption, own, "couldn't load the board. check your connection");
    else if (rows.length === 0) this.ui.renderLeaderboard(caption, [], 'nobody yet. fly a run to be first');
    else this.ui.renderLeaderboard(caption, rows.map((r) => this.boardRow(r)), '');
  }

  private async savePilotName(name: string, box = 'board'): Promise<boolean> {
    if (!this.backend.online) {
      this.ui.setPilotName('', 'names come with the server', box);
      return false;
    }
    const problem = await this.nameProblem(name);
    if (problem) {
      this.ui.setPilotName('', problem, box);
      return false;
    }
    const res = await this.backend.setPilotName(name);
    this.ui.setPilotName(res.ok ? res.message : '', res.ok ? 'saved' : res.message, box);
    if (res.ok) this.nameOk = true;
    if (res.ok && box === 'board') void this.showBoard(this.boardTab);
    return res.ok;
  }

  /** Delete the account (server and device) and start again as a new player. Asks twice. */
  private async deleteAccount(): Promise<void> {
    const row = document.getElementById('delete-account');
    const value = row?.querySelector('.value');
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      if (value) value.textContent = 'tap again';
      this.ui.showNotice('tap again to delete everything. this can\'t be undone');
      window.setTimeout(() => {
        this.deleteArmed = false;
        if (value) value.textContent = 'delete';
      }, 5000);
      return;
    }
    this.deleteArmed = false;
    if (value) value.textContent = 'deleting';
    if (!(await this.backend.deleteAccount())) {
      if (value) value.textContent = 'delete';
      this.ui.showNotice("couldn't reach the server. try again with a connection");
      return;
    }
    await storage.clear('endless.');
    location.reload();
  }

  /**
   * Settings' account row: whether this account is kept with Google (account.ts).
   * Only in the Android app, with the server.
   */
  private refreshAccount(): void {
    const show = googleAvailable() && this.backend.online;
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
    void this.backend.googleAccount().then((email) => {
      this.googleEmail = email;
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
  private async keepWithGoogle(fromWelcome: boolean): Promise<void> {
    if (this.googleBusy) return;
    if (!fromWelcome && this.googleEmail) {
      this.ui.showNotice(`kept with ${this.googleEmail}`);
      return;
    }
    this.googleBusy = true;
    try {
      const token = await googleSignIn();
      if ('error' in token) {
        // A wrongly set up build can also look like a cancel, so say so either way.
        this.ui.showNotice(token.error === 'cancelled' ? 'google sign-in was cancelled' : `google sign-in didn't work: ${token.error}`);
        return;
      }
      const res = await this.backend.linkGoogle(token.idToken, token.nonce);
      if (res === 'linked') {
        this.ui.showNotice('signed in. your account is kept with google now');
        this.cloud.push();
        this.refreshAccount();
        if (fromWelcome) document.getElementById('welcome-google')?.setAttribute('hidden', '');
        return;
      }
      if (res === 'failed') {
        this.ui.showNotice(`couldn't sign in: ${this.backend.authError || 'unknown error'}`);
        return;
      }
      // That Google login keeps another account: switch to it.
      const nothingToLose = fromWelcome || this.progress.stats.runs === 0;
      if (!nothingToLose && !this.googleArmed) {
        this.googleArmed = true;
        const value = document.querySelector('#google-account .value');
        if (value) value.textContent = 'tap again';
        this.ui.showNotice("that google account already has a pilot. tap again to switch to it: it replaces this phone's progress");
        window.setTimeout(() => {
          this.googleArmed = false;
          this.refreshAccount();
        }, 8000);
        return;
      }
      this.googleArmed = false;
      const before = this.backend.userId;
      if (!(await this.backend.signInGoogle(token.idToken, token.nonce))) {
        this.ui.showNotice(`couldn't switch accounts: ${this.backend.authError || 'unknown error'}`);
        return;
      }
      if (this.backend.userId === before) {
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

  /** How far through the current rank's XP band the player is (0..1). */
  private xpFraction(): number {
    const i = this.ranked.rank;
    if (i >= RANKS.length - 1) return 1;
    const lo = RANKS[i].xp;
    const hi = RANKS[i + 1].xp;
    return Math.max(0, Math.min(1, (this.ranked.xp - lo) / (hi - lo)));
  }

  /** The service record: your rank (and the ladder), and your lifetime stats. */
  private openRecord(tab: 'rank' | 'stats' = 'rank'): void {
    this.renderStats();
    this.ui.setRecordTab(tab);
    const rk = this.ranked;
    const i = rk.rank;
    const next = RANKS[i + 1];
    const xpLeft = next ? xpToRank(rk.xp, i + 1) : 0;
    const checks: ProgressView['checks'] = [];
    if (next) {
      checks.push({ label: `${formatScore(next.xp)} xp`, value: `${formatScore(rk.xp)} now`, met: xpLeft === 0 });
    }
    const big = formatScore(next ? xpLeft : rk.xp);
    const goal = next ? `xp to ${rankName(i + 1)}` : 'xp. top rank reached';

    const recent = this.recentRanked(20);
    const xpSum = recent.reduce((t, h) => t + h.xp, 0);
    const avg = recent.length ? Math.round(xpSum / recent.length) : 0;
    const runsToGo = avg > 0 ? Math.ceil(xpLeft / avg) : 0;
    const b = rk.bests();

    this.ui.renderProgress('record', {
      icon: insignia(i),
      name: rankName(i),
      big,
      goal,
      fraction: this.xpFraction(),
      detail: next
        ? `${formatScore(rk.xp - RANKS[i].xp)} / ${formatScore(next.xp - RANKS[i].xp)} xp this rank${runsToGo ? ` · about ${runsToGo} run${runsToGo === 1 ? '' : 's'}` : ''}`
        : 'general grade 4: the top',
      checks,
      gives: next ? [{ title: `${rankName(i + 1)} gives`, items: this.rankGives(i + 1) }] : [],
      trend: {
        title: recent.length ? `last ${recent.length} runs` : 'recent runs',
        values: recent.map((h) => h.xp),
        summary: recent.length ? `+${formatScore(xpSum)} xp · avg ${avg}` : '',
        unit: 'xp',
      },
      rows: [
        ['xp a run', `ranked 1 per ${CONFIG.rank.rankedPointsPerXp} points · others 1 per ${formatScore(CONFIG.rank.pointsPerXp)} · goals ${CONFIG.rank.goalXp}`],
        ['double xp runs left today', String(rk.bonusRunsLeft())],
        ['best this week', formatScore(b.week)],
        ['best ever', formatScore(b.all)],
        ['ranked runs', formatScore(rk.history.length)],
      ],
      ladder: RANKS.map((r, k) => ({
        icon: insignia(k),
        name: rankName(k),
        needs: `${formatScore(r.xp)} xp`,
        gives: k === 0 ? '' : this.rankGives(k).join(' · '),
        state: k < i ? 'done' : k === i ? 'current' : 'locked',
      })),
    });
    this.openInfo('record');
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
    return this.settings.assist && this.mode !== 'ranked';
  }

  /** What the HUD and game-over screen call this run. */
  private modeLabel(): string {
    if (this.mode === 'ranked') return `ranked · ${this.weekly.name}`;
    if (this.course) return `level ${COURSES.indexOf(this.course) + 1} · ${this.course.name}`;
    if (this.environment) return `solo · ${this.environment.name}`;
    return 'endless';
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
  private snapshot(): Snapshot {
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
  private owner(): Owner {
    return this.ownerFor(this.snapshot());
  }

  /** Put the equipped looks (plus any preview) on the ship. */
  private applyLooks(): void {
    const eq = { ...this.looks.equipped };
    if (this.preview) eq[this.preview.slot] = this.preview.id;
    this.player.setShape(eq.hull as ShipId);
    this.player.setPaint(find('paint', eq.paint).colors ?? null);
    const decal = eq.decal === 'rank' ? insignia(this.ranked.rank) : eq.decal === 'league' ? emblem(this.leagues.league, this.leagues.division) : decalArt(eq.decal);
    this.player.setDressing(eq.markings as Marking, eq.fins as Fin, decal);
    const flame = find('engine', eq.engine).colors;
    this.trail.setTint(flame?.[0] ?? null, flame?.[1] ?? null);
    this.trail.setStyle(eq.trail as TrailId);
    this.queueShip();
  }

  // --- the hangar: looks by slot, and the ship's upgrades ---------------------------------------

  /** Open the hangar on a slot of looks (or on the upgrades). `from: 'shop'` makes Back return to the shop. */
  private openHangar(opts: { slot?: Slot; upgrades?: boolean; from?: 'shop' } = {}): void {
    this.hangar = { slot: opts.slot ?? this.hangar.slot, pick: null };
    this.hangarUpgrades = opts.upgrades ?? false;
    this.hangarFrom = opts.from ?? null;
    this.preview = null;
    this.applyLooks();
    this.renderHangar(false);
    // Show the ship (and its engine) over the title scene while choosing.
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('hangar');
  }

  private renderHangar(keepScroll: boolean): void {
    const now = new Date();
    const v = vaultAt(now.getTime());
    const month = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const view = buildHangar(this.hangar, {
      looks: this.looks,
      owner: this.owner(),
      credits: this.wallet.credits,
      cores: this.wallet.cores,
      vault: { key: keyOf(v.item), monthsUntil: (key) => monthsUntilVault(key, VAULT_ORDER, month) },
    });
    this.renderUpgrades();
    const credits = `${formatScore(this.wallet.credits)} credits`;
    this.hangarUi.renderHangar(view, keepScroll, {
      upgrades: this.hangarUpgrades,
      upgradeTag: `${this.upgrades.points()}/${SYSTEMS.length * MAX_TIER}`,
      summary: this.hangarUpgrades ? credits : `${view.summary} · ${credits} · ${formatScore(this.wallet.cores)} cores`,
    });
  }

  private onHangarTab(tab: HangarTab): void {
    this.hangarUpgrades = tab === 'upgrades';
    this.hangar = { slot: tab === 'upgrades' ? this.hangar.slot : tab, pick: null };
    this.preview = null;
    this.applyLooks();
    this.renderHangar(false);
  }

  /** Tap a look: it goes on the ship to see (owned or not); the button underneath puts it on for good, or buys it. */
  private onHangarPick(id: string): void {
    this.hangar.pick = id;
    this.preview = { slot: this.hangar.slot, id };
    this.haptics.pickup();
    this.applyLooks();
    this.renderHangar(true);
  }

  private onHangarAction(): void {
    const id = this.hangar.pick;
    if (!id) return;
    const item = find(this.hangar.slot, id);
    if (this.looks.owns(item, this.owner())) {
      this.looks.equip(item.slot, item.id);
      this.preview = null;
      this.sound.pickup();
      this.applyLooks();
      this.renderHangar(true);
      return;
    }
    const u = item.unlock;
    if (u.by === 'credits') {
      if (!this.wallet.spend(u.cost)) return;
    } else if (u.by === 'cores') {
      if (!this.wallet.spendCores(u.cost)) return;
    } else if (u.by === 'vault') {
      if (keyOf(item) !== keyOf(vaultAt(Date.now()).item) || !this.wallet.spendCores(u.cost)) return;
    } else return;
    this.looks.buy(item);
    this.afterBuy([item], `${item.name} bought and on your ship`);
    this.renderHangar(true);
  }

  // --- goals ---------------------------------------------------------------------------------------

  /** What finishing a goal gives, in words. */
  private goalRewardText(a: Achievement): string {
    const looks = rewardKeys(a.id).map((k) => byKey(k)).filter((l): l is LookItem => !!l);
    return [`+${a.credits.toLocaleString('en-US')} credits`, ...looks.map((l) => `${l.name} ${SLOT_NAMES[l.slot]}`)].join(' · ');
  }

  /** The goals screen's three tabs. */
  private renderGoals(): void {
    const now = Date.now();
    const day = dayKey(now);
    this.daily.turn(day);
    this.weeklyGoals.turn(weekKey(now));
    // Daily: the login calendar and today's goals.
    const due = this.daily.loginDue(day);
    const step = this.daily.loginStep;
    const login = CONFIG.economy.login as readonly Reward[];
    const claimedUpTo = due >= 0 ? step : step === 0 ? login.length : step;
    const Q = CONFIG.economy.quests;
    const W = CONFIG.economy.weekly;
    const taskRows = (list: readonly Quest[], prefix: string, passXp: number): TaskRow[] =>
      list.map((q, i) => ({
        id: `${prefix}${i}`,
        name: questText(q, this.open('ranked')),
        progress: `${formatScore(q.progress)} / ${formatScore(q.target)}`,
        fraction: q.progress / q.target,
        reward: `+${formatScore(q.credits)} credits · +${formatScore(passXp)} pass xp`,
        state: q.claimed ? 'claimed' : q.done ? 'claim' : 'open',
      }));
    const bonusRow = (id: string, name: string, cores: number, ready: boolean, claimed: boolean, list: readonly Quest[]): TaskRow => ({
      id,
      name,
      progress: `${list.filter((q) => q.claimed).length} / ${list.length}`,
      fraction: list.filter((q) => q.claimed).length / Math.max(1, list.length),
      reward: `+${cores} cores`,
      state: claimed ? 'claimed' : ready ? 'claim' : 'open',
    });
    const qs = this.daily.quests;
    this.goalsUi.renderDaily({
      calendar: login.map((r, i) => ({
        day: i + 1,
        reward: rewardParts(r).map((p) => p.replace(/^\+/, '')).join(', '),
        state: i < claimedUpTo ? 'claimed' : i === step && due >= 0 ? 'today' : 'next',
      })),
      claim: due >= 0 ? { text: `claim day ${step + 1}`, enabled: true } : { text: `next reward in ${formatWait(untilTomorrow(now))}`, enabled: false },
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      rows: [...taskRows(qs, 'q', Q.passXp).map((r) => (r.state === 'open' && this.daily.canReroll(day) && this.ads.offers('rerollQuest') ? { ...r, reroll: `swap for another goal · ${this.ads.label()}` } : r)), bonusRow('qall', 'claim all three', Q.allDoneCores, this.daily.bonusReady, this.daily.bonusClaimed, qs)],
    });
    // Weekly.
    const wg = this.weeklyGoals.goals;
    const weekEnd = Date.parse(`${weekKey(now)}T00:00:00Z`) + 7 * 86_400_000;
    this.goalsUi.renderWeekly(`new in ${formatWait(weekEnd - now)}`, [...taskRows(wg, 'w', W.passXp), bonusRow('wall', 'claim all five', W.allDoneCores, this.weeklyGoals.bonusReady, this.weeklyGoals.bonusClaimed, wg)]);
    // Achievements.
    const snap = this.snapshot();
    const groups = (Object.keys(GROUP_NAMES) as Group[]).map((g) => ({
      name: GROUP_NAMES[g],
      rows: ACHIEVEMENTS.filter((a) => a.group === g).map((a): TaskRow => {
        const p = progressOn(a, snap);
        const claimed = this.goalLog.has(a.id);
        return { id: `a:${a.id}`, name: a.name, text: a.text, progress: `${formatScore(p.have)} / ${formatScore(p.target)}`, fraction: p.have / p.target, reward: `${this.goalRewardText(a)} · +${CONFIG.rank.goalXp} xp`, state: claimed ? 'claimed' : p.done ? 'claim' : 'open' };
      }),
    }));
    const doneCount = ACHIEVEMENTS.filter((a) => progressOn(a, snap).done).length;
    this.goalsUi.renderAchievements(`${doneCount} of ${ACHIEVEMENTS.length} done. each pays credits and rank xp, and unlocks a look to wear. they count everything you've done, from the start.`, groups);
    this.goalsUi.setTabNews({ daily: due >= 0 || this.daily.claimable > 0, weekly: this.weeklyGoals.claimable > 0, achievements: this.achievementsToClaim() > 0 });
  }

  /** Finished achievements not yet claimed. */
  private achievementsToClaim(): number {
    const snap = this.snapshot();
    return ACHIEVEMENTS.filter((a) => !this.goalLog.has(a.id) && progressOn(a, snap).done).length;
  }

  /** Everything waiting to be claimed on the goals screen (the bar's dot). */
  private goalsToClaim(): number {
    return this.daily.claimable + this.weeklyGoals.claimable + this.achievementsToClaim();
  }

  /** Claim a finished goal ("q1", "qall", "w3", "wall", "a:<id>"): pay it, with a small moment. */
  private onClaim(id: string): void {
    let lines: string[] = [];
    let name = '';
    if (/^q\d$/.test(id)) {
      const q = this.daily.claim(Number(id.slice(1)));
      if (!q) return;
      name = questText(q, this.open('ranked'));
      lines = [...this.grant({ credits: q.credits }), ...this.passXp(CONFIG.economy.quests.passXp)];
    } else if (/^w\d$/.test(id)) {
      const q = this.weeklyGoals.claim(Number(id.slice(1)));
      if (!q) return;
      name = questText(q, this.open('ranked'));
      lines = [...this.grant({ credits: q.credits }), ...this.passXp(CONFIG.economy.weekly.passXp)];
    } else if (id === 'qall' || id === 'wall') {
      const cores = id === 'qall' ? this.daily.claimBonus() : this.weeklyGoals.claimBonus();
      if (cores <= 0) return;
      this.ui.celebrate([{ kicker: id === 'qall' ? "today's goals" : "this week's goals", icon: GOAL_ICON, name: 'all done', lines: this.grant({ cores }, id === 'qall' ? `goals:${dayKey(Date.now())}` : `weekly:${weekKey(Date.now())}`) }]);
    } else if (id.startsWith('a:')) {
      const a = achievement(id.slice(2));
      if (!a || this.goalLog.has(a.id) || !progressOn(a, this.snapshot()).done) return;
      this.goalLog.add(a.id);
      this.goalLog.save();
      name = a.name;
      const promo = this.ranked.addXp(CONFIG.rank.goalXp);
      lines = [...this.grant({ credits: a.credits + promo.credits }), `+${CONFIG.rank.goalXp} xp`];
      if (promo.rankAfter > promo.rankBefore) {
        this.ui.celebrate([{ kicker: 'promoted', icon: insignia(promo.rankAfter), name: rankName(promo.rankAfter), lines: mergeCredits(Array.from({ length: promo.rankAfter - promo.rankBefore }, (_, k) => this.rankGives(promo.rankBefore + 1 + k)).flat()), color: '#d4a63a' }]);
      }
    } else return;
    if (name) this.ui.showNotice(`${name}: ${mergeCredits(lines).join(' · ')}`);
    this.sound.pickup();
    this.haptics.pickup();
    this.renderGoals();
    this.refreshTitle();
  }

  /**
   * Pay and announce goals finished since last time, and any set a purchase just made whole.
   * Goals can unlock looks and looks can finish goals ("own 25 looks"), so go round until nothing new.
   */
  private checkGoals(): void {
    const party: Celebration[] = [];
    for (let pass = 0; pass < 4; pass++) {
      const snap = this.snapshot();
      const fresh = ACHIEVEMENTS.filter((a) => progressOn(a, snap).done && !this.goalLog.seenDone(a.id));
      const sets = this.looks.completedSets(SETS, this.owner());
      if (fresh.length === 0 && sets.length === 0) break;
      for (const a of fresh) this.goalLog.markSeen(a.id);
      if (fresh.length > 0) this.goalLog.save();
      if (fresh.length > 3) {
        party.push({ kicker: `${fresh.length} goals complete`, icon: GOAL_ICON, name: `${fresh.length} goals`, lines: [...fresh.slice(0, 5).map((a) => a.name), 'claim them in goals'] });
      } else {
        for (const a of fresh) party.push({ kicker: 'goal complete', icon: GOAL_ICON, name: a.name, lines: [a.text, ...this.goalRewardText(a).split(' · '), 'claim it in goals'] });
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
      this.refreshTitle();
      this.haptics.level(false);
    }
  }

  private onBuyUpgrade = (id: string): void => {
    const sys = id as SystemId;
    const check = this.upgrades.check(sys, this.wallet.credits, this.leagues.league);
    if (!check.ok || !this.wallet.spend(check.cost)) return;
    this.upgrades.raise(sys);
    this.wallet.add(this.promoteLeague(null)); // buying the last points may complete a promotion
    this.sound.pickup();
    this.haptics.pickup();
    this.refreshTitle();
    this.renderHangar(true);
  };

  private renderUpgrades(): void {
    const lg = this.leagues.current;
    const active = this.upgrades.activePoints();
    this.ui.setUpgradeNote(
      `${active} of ${this.upgrades.points()} points on · ${lg.name} league cap ${lg.max}${active > lg.max ? ' (over: switch some off for ranked)' : ''}. solo, levels and endless have no cap.`,
    );
    this.ui.renderUpgrades(
      SYSTEMS.map((s) => {
        const tier = this.upgrades.tier(s.id);
        const check = this.upgrades.check(s.id, this.wallet.credits, this.leagues.league);
        const next = Math.min(MAX_TIER, tier + 1);
        return {
          id: s.id,
          name: s.name,
          effect: tier >= MAX_TIER ? s.effect(tier) : `next: ${s.effect(next)}`,
          tier,
          max: MAX_TIER,
          button: check.ok ? formatScore(TIER_COST[tier]) : check.reason,
          canBuy: check.ok,
          on: tier > 0 ? this.upgrades.isOn(s.id) : null,
        };
      }),
    );
  }

  private openGoals(tab: GoalsTab = this.goalsTab): void {
    this.goalsTab = tab;
    this.goalsUi.setTab(tab);
    this.renderGoals();
    this.openInfo('goals');
  }

  private openInfo(which: InfoScreen): void {
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
  private startRanked(): void {
    const active = this.upgrades.activePoints();
    const cap = this.leagues.current.max;
    if (active > cap) {
      // Over the cap: choose which systems to switch off first.
      this.ui.showNotice(`${active} upgrade points on, ${this.leagues.current.name} allows ${cap}. switch some off`);
      if (this.state === 'crashed') this.toMainMenu();
      this.openHangar({ upgrades: true });
      return;
    }
    // The week may have turned since the game started.
    const week = weekKey(Date.now());
    if (this.weekly.id !== weeklyRun(week).id) this.weekly = weeklyRun(week);
    this.beginRun(0, this.weekly.seed, 'ranked');
  }

  /** Solo in one environment: endless there, getting harder. */
  private startSolo(index: number): void {
    const env = ENVIRONMENTS[index];
    if (env && this.envOpen(env)) this.beginRun(0, newSeed(), 'solo', null, env);
  }

  /** Endless: open ground, then every area and biome in turn, forever. */
  private startEndless(): void {
    this.beginRun(0, newSeed(), 'endless');
  }

  /** Retry in the same mode (and environment, or level) as the run that just ended. */
  private retry(): void {
    if (this.mode === 'ranked') this.startRanked();
    else if (this.course) this.startCourse(COURSES.indexOf(this.course));
    else if (this.environment) this.startSolo(ENVIRONMENTS.indexOf(this.environment));
    else this.startEndless();
  }

  private onTitleLink = (name: string): void => {
    // Every way in to a part of the game that isn't open yet says when it opens (the cores chip, cards...).
    const needs: Record<string, Feature> = { solo: 'solo', record: 'record', shop: 'shop', 'shop-cores': 'shop', pass: 'shop', boards: 'leaderboard' };
    const f = needs[name];
    if (f && !this.open(f)) {
      this.ui.showNotice(nextStageText(this.progress.stats.validRuns, this.onboarding.done) || 'not open yet');
      return;
    }
    if (name === 'endless') this.startEndless();
    else if (name === 'solo') this.openSolo();
    else if (name === 'record') this.openRecord();
    else if (name === 'goals') this.openGoals();
    else if (name === 'hangar') this.openHangar();
    else if (name === 'shop') {
      this.shopPick = -1;
      this.preview = null;
      this.openShop();
    }
    else if (name === 'shop-cores') {
      this.preview = null;
      this.openShop(this.shopTabs().some((t) => t.id === 'cores') ? 'cores' : 'today');
    }
    else if (name === 'pass') this.openPass();
    else if (name === 'boards') this.openBoards();
    else if (name === 'daily') this.openGoals('daily');
    else if (name === 'claim') this.claimLogin();
    else if (name === 'gift') void this.claimGift();
  };

  // --- first launch ------------------------------------------------------------------------------

  /** Dev invincibility, or the practice run (which can't be failed). */
  private invincible(): boolean {
    return this.dev.invincible || this.practice !== null;
  }

  private controlsNow(): 'drag' | 'sides' | 'tilt' {
    return this.settings.tilt ? 'tilt' : this.settings.touch === 1 ? 'sides' : 'drag';
  }

  /** The welcome screen, on the step onboarding is at (choosing controls, or dressing the ship). */
  private openWelcome(): void {
    const step = this.onboarding.step === 'dress' ? 'dress' : 'controls';
    if (!hasTouch() && this.settings.tilt) {
      this.settings.tilt = false; // no tilt without a phone
      void saveSettings(this.settings);
    }
    const c = this.controlsNow();
    const controls: [string, string, boolean][] = [
      ['drag', 'drag', c === 'drag'],
      ['sides', 'tap sides', c === 'sides'],
    ];
    if (hasTouch() && typeof DeviceOrientationEvent !== 'undefined') controls.push(['tilt', 'tilt', c === 'tilt']);
    const eq = this.looks.equipped;
    const chips = (slot: 'hull' | 'paint' | 'engine'): [string, string, boolean][] =>
      STARTER[slot].map((key) => [key, byKey(key)?.name ?? key, `${slot}:${eq[slot]}` === key]);
    this.ui.renderWelcome(step, controls, { hull: chips('hull'), paint: chips('paint'), engine: chips('engine') });
    const google = document.getElementById('welcome-google');
    if (google) google.hidden = !(googleAvailable() && this.backend.online);
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('welcome');
  }

  private chooseControls(id: string): void {
    this.settings.tilt = id === 'tilt';
    this.settings.touch = id === 'sides' ? 1 : 0;
    void saveSettings(this.settings);
    this.applySettings();
    this.openWelcome();
  }

  /** The practice run: a fixed course you can't fail, one lesson at a time. */
  private startPractice(): void {
    this.onboarding.set('practice');
    this.infoOpen = null;
    this.beginRun(0, PRACTICE_SEED, 'endless');
    this.recorded = true; // nothing from it counts: no stats, no bests, no boards
    this.unlockable = false; // ...and no unlocks
    this.practice = { lesson: 0, t: 0, steerT: 0, nearMisses: this.nearMissCount, pickups: this.pickupCount };
    this.showLesson();
  }

  private showLesson(): void {
    const p = this.practice;
    if (!p) return;
    const lesson = LESSONS[p.lesson];
    if (lesson === 'boost') this.boostMeter = 1; // a full meter, so boost works straight away
    const how = { keys: !hasTouch(), doubleTap: this.settings.doubleTapBoost };
    this.ui.showTutorial(lessonText(lesson, this.controlsNow(), how), `practice · ${p.lesson + 1} of ${LESSONS.length}`);
  }

  /** Has the player done what the lesson asks? Then the next, and after the last, dress the ship. */
  private practiceTick(dt: number): void {
    const p = this.practice!;
    const lesson: Lesson = LESSONS[p.lesson];
    p.t += dt;
    if (Math.abs(this.input.steering()) > 0.35) p.steerT += dt;
    const done =
      p.t > LESSON_SECONDS ||
      (lesson === 'steer' && p.steerT > 1.2) ||
      (lesson === 'nearMiss' && this.nearMissCount > p.nearMisses) ||
      (lesson === 'pickup' && this.pickupCount > p.pickups) ||
      (lesson === 'boost' && this.boosting);
    if (!done) return;
    this.sound.pickup();
    this.haptics.pickup();
    p.lesson++;
    p.t = 0;
    p.nearMisses = this.nearMissCount;
    p.pickups = this.pickupCount;
    if (p.lesson < LESSONS.length) {
      this.showLesson();
      return;
    }
    this.ui.showTutorial(null);
    this.ui.showNotice('nicely flown. now dress your ship');
    this.toMainMenu();
    this.practice = null;
    this.onboarding.set('dress');
    this.openWelcome();
  }

  /** Try a look from the starter set on (owned or not; the hull chosen is given at the end). */
  private pickStarter(key: string): void {
    const [slot, id] = key.split(':') as [Slot, string];
    this.looks.equip(slot, id);
    this.applyLooks();
    this.haptics.pickup();
    this.openWelcome();
  }

  /** Done (or skipped): keep the hull chosen, and on to the front page. */
  private finishOnboarding(): void {
    if (this.practice) {
      this.practice = null;
      this.ui.showTutorial(null);
      this.toMainMenu();
    }
    const hull = `hull:${this.looks.equipped.hull}`;
    if (STARTER.hull.includes(hull) && !this.looks.owns(byKey(hull)!, this.owner())) this.looks.give(hull);
    this.onboarding.set('done');
    this.infoOpen = null;
    this.player.setVisible(false);
    this.trail.setVisible(false);
    this.ui.show('title');
    this.refreshTitle();
    this.claimLogin();
    void this.askName();
  }

  /**
   * Everyone picks a pilot name once ranked and the leaderboards open (before
   * that nobody sees it, so new players can just fly): a player still on a
   * made-up one ("pilot-3fa2") then gets the name screen on the title, and it
   * stays until a name is saved. Only with the server (names live there).
   */
  private async askName(): Promise<void> {
    if (this.nameOk || !this.backend.online || !this.onboarding.done || !this.open('leaderboard')) return;
    const name = await this.backend.pilotName();
    if (name === null) return; // no answer (no signal): ask another time
    if (!GENERATED_NAME.test(name)) {
      this.nameOk = true;
      return;
    }
    if (this.state !== 'title' || this.infoOpen === 'welcome' || this.infoOpen === 'name') return;
    this.settingsOpen = false;
    this.ui.setPilotName('', '', 'name');
    this.openInfo('name');
  }

  /** Why this name can't be had (shape or profanity: nameFilter.ts), or null if it's fine to send. */
  private async nameProblem(name: string): Promise<string | null> {
    if (!PILOT_NAME.test(name.trim())) return '3 to 16 letters, numbers, spaces, - or _';
    // The word list loads the first time it's needed (it's its own file).
    this.nameWords ??= import('./nameWords.json').then((m) => new Set(m.default as string[]));
    const [{ nameBlocked }, words] = await Promise.all([import('./nameFilter'), this.nameWords]);
    return nameBlocked(name.trim(), words) ? "that name isn't allowed. try another" : null;
  }

  private async saveNameScreen(name: string): Promise<void> {
    const problem = await this.nameProblem(name);
    if (problem) {
      this.ui.setPilotName('', problem, 'name');
      return;
    }
    const res = await this.backend.setPilotName(name.trim());
    if (!res.ok) {
      this.ui.setPilotName('', res.message, 'name');
      return;
    }
    this.nameOk = true;
    this.infoOpen = null;
    this.ui.show('title');
    this.ui.showNotice(`welcome, ${res.message}`);
  }

  /** How much of the game is open to this player (new players see it in stages: reveal.ts). */
  private revealStage(): number {
    return stageFor(this.progress.stats.validRuns, this.onboarding.done);
  }

  private open(f: Feature): boolean {
    return this.allOpen || isOpen(f, this.revealStage());
  }

  /** The big button: ranked once it's open, endless before. */
  private startPrimary(): void {
    if (this.open('ranked')) this.startRanked();
    else this.startEndless();
  }

  /** Say so, once, when a new part of the game opens. */
  private announceReveal(): void {
    if (this.revealSeen === null) return; // not read yet
    const stage = this.revealStage();
    if (stage <= this.revealSeen) return;
    // A save from before the stages (or the first look at an old save): open, without a fanfare.
    const quiet = (this.revealSeen < 0 && stage === STAGES.length) || stage === 0;
    if (!quiet) {
      const lines = STAGES.slice(Math.max(0, this.revealSeen), stage).map((s) => s.text);
      this.ui.celebrate([{ kicker: 'new', icon: GOAL_ICON, name: 'more to play', lines }]);
    }
    this.revealSeen = stage;
    void storage.set(REVEAL_KEY, String(stage));
  }

  /** The live cards above the big button: the pass, today's goals, a reward waiting. */
  private titleCards(now: number): TitleCard[] {
    const cards: TitleCard[] = [];
    const day = dayKey(now);
    const due = this.daily.loginDue(day);
    if (due >= 0) cards.push({ id: 'claim', kicker: 'daily reward', title: `day ${due + 1} ready to claim`, hot: true });
    if (this.daily.giftReady(day) && this.ads.offers('dailyGift')) cards.push({ id: 'gift', kicker: 'free gift', title: this.ads.label(), hot: true });
    const quests = this.daily.quests;
    const done = quests.filter((q) => q.done).length;
    const toClaim = this.goalsToClaim();
    cards.push({ id: 'daily', kicker: "today's goals", title: toClaim > 0 ? `${toClaim} to claim` : done >= quests.length ? 'all done' : `${done} of ${quests.length} done`, fraction: quests.length ? done / quests.length : 0, hot: toClaim > 0 });
    const P = CONFIG.economy.pass;
    const tier = this.pass.tier;
    cards.push({
      id: 'pass',
      kicker: `pass · tier ${tier}`,
      title: tier >= P.tiers ? 'complete' : `${formatScore(P.xpPerTier - (this.pass.xp % P.xpPerTier))} xp to go`,
      fraction: this.pass.tierFraction,
    });
    return cards;
  }

  private refreshTitle(): void {
    const colour = rankColour(this.ranked.rank);
    const dark = this.settings.dark;
    this.ui.setAccent(this.settings.contrast ? (dark ? '#ffffff' : '#2b2824') : dark ? colour.dark : colour.accent, !this.settings.contrast && colour === RANK_COLOURS[RANK_COLOURS.length - 1]);
    const i = this.ranked.rank;
    this.applyLooks(); // the wing decal follows your rank and league
    const lg = this.leagues;
    this.ui.setTitleLeague(emblem(lg.league, lg.division), `${leagueName(lg.league, lg.division)} · ${lg.lp} lp`, lg.lp / LP_PER_DIVISION);
    const next = RANKS[i + 1];
    this.ui.setTitleRank(insignia(i), rankName(i), next ? `${formatScore(xpToRank(this.ranked.xp, i + 1))} xp to ${rankName(i + 1)}` : 'the top rank');
    const wb = this.progress.weeklyBest(this.weekly.id);
    const now = Date.now();
    const runs = this.progress.stats.validRuns;
    if (this.open('ranked')) this.ui.setPrimary('ranked', wb > 0 ? `your best this week ${formatScore(wb)}` : 'the same run for everyone, all week');
    else this.ui.setPrimary('fly', this.progress.endlessBest > 0 ? `endless · best ${formatScore(this.progress.endlessBest)}` : 'endless: every area in turn');
    this.ui.setFeatures((f) => (f === 'endless' || f === 'league' ? this.open('ranked') : f === 'boards' ? this.open('leaderboard') : f === 'solo' || f === 'shop' || f === 'record' ? this.open(f) : true));
    this.ui.setTitleNext(this.allOpen ? '' : nextStageText(runs, this.onboarding.done));
    this.ui.renderTitleCards(this.titleCards(now));
    this.refreshBar(now);
    this.announceReveal();
    this.cloud.push(); // most changes end here: keep the cloud save current
  }

  private renderStats(): void {
    const s = this.progress.stats;
    const hours = Math.floor(s.seconds / 3600);
    const mins = Math.floor((s.seconds % 3600) / 60);
    const worst = this.progress.worstPlace();
    this.ui.renderStats([
      ['runs', formatScore(s.runs)],
      ['time played', hours > 0 ? `${hours}h ${mins}m` : `${mins}m`],
      ['distance', `${(s.distance / 1000).toFixed(1)} km`],
      ['best this week (ranked)', formatScore(this.progress.weeklyBest(this.weekly.id))],
      ['best endless', formatScore(this.progress.endlessBest)],
      ...ENVIRONMENTS.map((e): [string, string] => [`best solo: ${e.name}`, formatScore(this.progress.envBest[e.id] ?? 0)]),
      ['furthest level', String(s.bestLevel || 1)],
      ['best chain', `x${s.bestChain}`],
      ['near misses', formatScore(s.nearMisses)],
      ['pickups', formatScore(s.pickups)],
      ['crash most in', worst ? `${worst} (${s.crashes[worst]})` : '-'],
    ]);
  }

  /** The Android back button: close what's open, pause a run; false on the title screen (leave the app). */
  back(): boolean {
    if (this.settingsOpen) this.closeSettings();
    else if (this.infoOpen === 'welcome') return false;
    else if (this.infoOpen) this.closeInfo();
    else if (this.state === 'playing' || this.state === 'countdown') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'crashed' || this.state === 'finished') this.toMainMenu();
    else return false;
    return true;
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

  private onTap = (): void => {
    if (this.settingsOpen || this.infoOpen) return;
    switch (this.state) {
      case 'title':
        break; // pick a mode with the buttons
      case 'crashed':
        if (this.crashMs >= CONFIG.crash.retryLockMs && !this.revivePending && !this.econ.offerOpen) this.retry();
        break;
      case 'finished':
        if (this.overShown && !this.econ.offerOpen) this.retry();
        break;
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT') return; // typing a name is not a shortcut
    if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'paused') {
      if (this.state === 'title' && !this.settingsOpen && !this.infoOpen) this.startPrimary();
      else this.onTap();
    }
    else if (e.code === 'Escape' || e.code === 'KeyP') {
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
    else if (action === 'delete') void this.deleteAccount();
    else if (action === 'google') void this.keepWithGoogle(false);
    else if (action === 'google-welcome') void this.keepWithGoogle(true);
    else if (action === 'privacy-choices') void this.ads.privacyChoices();
    else if (action === 'tutorial') {
      if (this.state !== 'title') this.toMainMenu();
      this.onboarding.set('controls');
      this.closeSettings();
      this.openWelcome();
    }
    else if (action === 'menu') {
      const practising = this.practice !== null;
      this.toMainMenu();
      if (practising) {
        this.onboarding.set('controls'); // left the practice run: back to the start of onboarding
        this.openWelcome();
      }
    }
    else if (action === 'share') void this.share();
    else if (action === 'double') void this.doubleCredits();
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
      this.openShop();
      return;
    }
    if (this.infoOpen === 'hangar' || this.infoOpen === 'shop') {
      // Leaving the hangar takes off anything only being tried on.
      this.preview = null;
      this.applyLooks();
    }
    if (this.infoOpen === 'welcome' || this.infoOpen === 'name') return; // these end by their own buttons
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
  };

  private applySettings(): void {
    const s = this.settings;
    this.sound.setMuted(!s.sound);
    this.sound.setLevels(LEVEL_GAIN[s.music], LEVEL_GAIN[s.effects]);
    this.input.dragRange = STEERING_RANGE[s.steering];
    this.input.tiltEnabled = s.tilt;
    this.input.tiltSensitivity = TILT_GAIN[s.tiltSensitivity];
    this.input.sidesMode = s.touch === 1;
    this.input.doubleTapBoost = s.doubleTapBoost;
    this.haptics.enabled = s.haptics;
    this.stage.setPerformance(s.performance);
    this.weather.lite = s.performance;
    if (!s.ghost) this.ghost.stop();
    this.world.assist = this.assistOn();
    if (this.assistOn() && this.state !== 'title') this.assisted = true;
    this.ui.setDisplay(TEXT_SCALE[s.textSize], (['right', 'left', 'middle'] as const)[s.boostSide] ?? 'right', s.reduceMotion);
    this.applyLook(this.distanceScore / CONFIG.score.levelLength);
    document.body.classList.toggle('dark', s.dark);
    this.refreshTitle(); // the rank colour has a light and a dark version
    this.ui.renderSettings(s);
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.ui.show('settings');
    this.refreshAccount();
    void this.backend.pilotName().then((name) => this.ui.setPilotName(name ?? '', this.backend.online ? '3 to 16 letters, numbers, spaces, - or _' : 'names come with the server', 'settings'));
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.ui.show(this.state === 'paused' ? 'paused' : 'title');
  }

  /** Abandon the run and go back to the live title scene. Best score still counts. */
  private toMainMenu(): void {
    if (this.state === 'paused') this.finishRun(null); // abandoned mid-run: still counts for stats
    if (this.practice) {
      this.practice = null;
      this.ui.showTutorial(null);
    }
    this.econ.setCountdown(0);
    this.econ.dismissOffer();
    this.ghost.stop();

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
    this.refreshTitle();
    this.lastTime = performance.now();
    void this.askName();
  }

  /** Dev: renderer stats for the FPS readout. */
  devStats(): { ratio: number; calls: number } {
    return { ratio: this.stage.pixelRatio, calls: this.stage.renderer.info.render.calls };
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
    this.refreshTitle();
  }

  /** Everything open: maxed out (the SQL editor's max_out, or the dev panel's "unlock all"). */
  private get allOpen(): boolean {
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
    this.refreshTitle();
    return this.entitlements.has('premium');
  }

  devAddCores(n: number): void {
    this.wallet.addCores(n);
    this.econ.bump('cores');
    this.refreshTitle();
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
    const daylight = Math.pow(0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b, 1 / 2.2);
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
      this.ui.setSkyColor('#' + this.palette.sky.getHexString());
    }
    const page = this.palette.fog.getHex();
    if (page !== this.shownPageHex) {
      this.shownPageHex = page;
      this.ui.setPageColor('#' + this.palette.fog.getHexString());
    }
  }

  private updateTitle(dt: number): void {
    this.titleTime += dt;
    const showroom = this.infoOpen === 'hangar' || this.infoOpen === 'shop' || this.infoOpen === 'welcome';
    const S = CONFIG.camera.showroom;
    if (showroom) {
      this.trail.update(dt, 0, this.player.engineHalfSpan);
      this.showroomTime += dt;
      this.stage.showroomY = S.y;
    }
    this.stage.showroom += ((showroom ? 1 : 0) - this.stage.showroom) * (1 - Math.exp(-S.ease * dt));
    this.stage.showroomAngle = S.angle + this.showroomTime * S.spin;
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
    // Swing back from the showroom orbit to the chase view (a run started from the welcome screen).
    this.stage.showroom *= Math.exp(-CONFIG.camera.showroom.ease * 2 * dt);
    if (this.stage.showroom < 0.001) this.stage.showroom = 0;
    if (this.practice) this.practiceTick(dt);
    else this.offerHints();
    // A set level runs at its sections' difficulty; otherwise speed follows the score.
    const section = this.course ? this.world.sectionAt(this.world.distance) : null;
    // On ice you slow down a little (and slide: see the steering below).
    this.onIce = this.world.onIce();
    const target = speedAt(section ? section.difficulty : this.distanceScore) * (this.onIce ? CONFIG.hazards.ice.slow : 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-CONFIG.speed.ease * dt));
    this.updateBoost(dt);
    const speed = this.currentSpeed();
    // Nose up and down with the hills ahead.
    const dist = this.world.distance;
    const sx = this.world.lateral;
    const slope = (terrain.heightAtX(dist + 6, sx) - terrain.heightAtX(dist, sx)) / 6;
    // Positive pitch dips the nose, so climbing subtracts.
    const pitch = this.boostLevel * CONFIG.boost.shipPitchDeg * DEG - Math.atan(slope) * CONFIG.terrain.shipPitch;
    this.player.update(dt, this.dev.autopilot ? this.autopilot() : this.input.steering(), lateralSpeedAt(speed) * this.ship.steer, pitch, this.onIce ? CONFIG.hazards.ice.grip : 1);
    this.weather.update(dt, speed);
    // No streaks inside the ship: they'd run through its walls and ceiling like loose wires.
    this.speedLines.update(dt, speed, this.settings.reduceMotion ? 0 : this.boostLevel * (1 - this.world.insideMix));
    this.trail.update(dt, this.boostLevel, this.player.engineHalfSpan);
    if (this.boosting) {
      this.boostSeconds += dt;
    }

    const prev = this.world.distance;
    this.world.advance(dt, speed, this.player.lateral);
    if (this.mode === 'ranked') {
      while (this.world.distance - this.runStart >= this.pathNext) {
        this.path.push(Math.round(this.world.lateral * 100) / 100);
        this.pathTimes.push(Math.round(this.runTime * 1000) / 1000);
        this.pathNext += PATH_STEP;
      }
      this.ghost.update(this.runTime, this.world.distance - this.runStart, this.runStart, this.world.lateral);
    }
    this.world.spinPickups(dt);
    const got = this.world.collect(prev);
    if (got > 0) {
      this.boostMeter = Math.min(1, this.boostMeter + got * CONFIG.boost.pickup.amount);
      this.bonus += got * CONFIG.score.pickupPoints;
      this.pickupCount += got;
      this.hints.offer('pickup');
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
      this.ui.announceLevel(level, this.areaName(level));
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
      this.crash(false);
      this.world.sync();
      return;
    }
    const fell = this.world.overPit();
    // Shielded (or just saved by a shield), the walls still hold you in: steer
    // into one and you slide along it instead of out of the course. Touching
    // one with a shield up uses the shield, like any other hit.
    let scraped = false;
    if (!fell && (this.shield || this.graceT > 0) && !this.invincible()) scraped = this.world.clampToWalls(CONFIG.ship.hitHalfWidth + 0.15);
    const hit = !fell && this.graceT <= 0 && (scraped || this.world.hitTest(prev));
    if (hit && this.shield && !this.invincible()) {
      // The shield takes the hit; pass through for a moment.
      this.shield = false;
      this.player.setShield(false);
      this.graceT = CONFIG.powers.shield.graceSeconds + this.ship.graceExtra;
      this.hitThisRun = true;
      this.sound.shieldHit();
      this.haptics.crash();
      this.nudgeMs = CONFIG.score.nearMiss.nudgeMs * 2;
    } else if ((fell || hit) && !this.invincible()) {
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
    this.score = this.distanceScore - this.scoreBase + this.bonus;
    this.ui.setScore(this.score);

    this.updateCamera(dt);
    this.sky.update(dt);
    this.feedAudio(dt, true, speed);
    this.world.sync();
  }

  /** Near-miss chain: each link pays points x chain length; it breaks after a quiet spell. */
  private updateNearMisses(dt: number, prev: number): void {
    const nm = CONFIG.score.nearMiss;
    const n = this.world.passes(prev, CONFIG.audio.passRange);
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
      if (this.chain > this.bestChain) this.bestChain = this.chain;
      this.chainTimer = nm.comboWindow;
      this.nudgeMs = nm.nudgeMs;
      this.ui.showCombo(this.chain, points);
      this.hints.offer('nearMiss');
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

  /** First-run hints, each once ever (see hints.ts). */
  private offerHints(): void {
    if (this.runTime > 1) this.hints.offer('steer');
    if (this.boostMeter >= 0.5 && !this.boosting) this.hints.offer('boost');
    const room = this.world.roomName;
    if (room === 'maintenance gantry' || room === 'hull breach') this.hints.offer('pits');
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
    a.daylight = Math.pow(0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b, 1 / 2.2);
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

  /** Crossed the finish line of a set level. */
  private finishCourse(): void {
    const c = this.course!;
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
    const res = this.progress.recordCourse(c.id, stars, time, this.score);
    const starCredits = res.newStars * CONFIG.courses.starCredits;
    const best = this.progress.course(c.id);
    this.ui.setOverHeading('level complete');
    this.ui.setGameOver(this.score, best.score, this.score >= best.score, this.nearMissCount, this.bestChain, this.seed);
    const extra = this.finishRun(null);
    this.wallet.add(starCredits);
    const starText = [1, 2, 4].map((b) => (stars & b ? '★' : '☆')).join('');
    const lines = [`${starText}  ${formatTime(time)}${res.bestTime ? ' (best)' : ` · best ${formatTime(best.time)}`}`];
    if (starCredits > 0) lines.push(`+${starCredits} credits for new stars`);
    if (!(stars & 2)) lines.push('hit something: no second star');
    if (!(stars & 4)) lines.push(`score ${formatScore(c.target)} for the third star`);
    lines.push(extra);
    this.ui.setGameOverExtra(lines.join(' · '));
    this.refreshTitle();
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

  private gainPower(kind: PowerKind): void {
    const p = CONFIG.powers;
    if (kind === 0) {
      this.shield = true;
      this.player.setShield(true);
    } else if (kind === 1) this.magnetT = p.magnet.seconds + this.ship.magnetExtra;
    else this.slowT = p.slow.seconds;
    this.pickupCount++;
    this.ui.showNotice(POWER_NOTICE[kind]);
    this.sound.power();
    this.haptics.pickup();
  }

  private updatePowers(dt: number): void {
    this.graceT = Math.max(0, this.graceT - dt);
    this.player.updateShield(dt, this.graceT);
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
    this.ui.setPower(parts.join('  '));
  }

  private endPowers(): void {
    this.shield = false;
    this.graceT = this.magnetT = this.slowT = this.slowLevel = 0;
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
      Math.min(c.maxFovBoost, Math.max(0, (this.speed - CONFIG.speed.base) * c.fovPerSpeed)) +
      (still ? 0 : this.boostLevel * CONFIG.boost.fovKick);
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
    this.crashMs += dt * 1000;
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

    if (!this.overShown && this.crashMs >= c.overDelayMs) {
      if (this.revivePending) {
        if (!this.reviveAsked) {
          this.reviveAsked = true;
          this.offerRevive();
        }
        return;
      }
      this.overShown = true;
      this.ui.showHud(false);
      this.ui.hideBanner();
      this.ui.show('over');
    }
  }
}

/** "+250 credits" lines from several promotions at once, added into one. */
function mergeCredits(lines: string[]): string[] {
  let credits = 0;
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^\+([\d,]+) credits$/.exec(l);
    if (m) credits += Number(m[1].replace(/,/g, ''));
    else if (!rest.includes(l)) rest.push(l);
  }
  return credits > 0 ? [`+${formatScore(credits)} credits`, ...rest] : rest;
}
