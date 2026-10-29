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
import { describeShip, Portraits, type ShipLook } from '../ship/portrait';
import { Stage } from '../world/renderer';
import { Sky } from '../world/sky';
import { SpeedLines } from '../world/speedLines';
import { Trail } from '../ship/trail';
import {
  cycle,
  DEFAULT_SETTINGS,
  LEVEL_GAIN,
  loadSettings,
  REMINDER_TIMES,
  saveSettings,
  type SettingKey,
  STEERING_RANGE,
  TEXT_SCALE,
  TILT_GAIN,
} from './settings';
import { EVENT_NOTICE, Events } from '../world/events';
import { Weather } from '../world/weather';
import { Ghost, rivalGhost } from '../ship/ghost';
import { decalArt } from '../ship/decals';
import { Haptics } from '../platform/haptics';
import { SAFE, setSafeColours } from '../world/itemColours';
import { askPermission, planReminders, remindersAvailable, scheduleReminders } from '../platform/reminders';
import { Capacitor } from '@capacitor/core';
import { exitChoice } from '../platform/exit';
import { sendFeedback } from '../platform/feedback';
import { errorLog, reportError } from '../platform/errors';
import { latestNotes, SEEN_KEY, whatsNewOnLaunch } from '../ui/whatsNew';
import { cancelOpenReport } from '../ui/report';
import { quickRetryOn, tapRetries } from './retry';
import { GateTracker, kmText, Milestones, milestonesCount } from './runBonus';
import { crashMomentOn, crashOverReady, crashTimeScale } from './crashMoment';
import { distanceText, sparkSvg, summaryRows } from '../ui/runSummary';
import { type HintId, Hints, tipText } from '../ui/hints';
import { migrateMissionLooks, migrateTickets } from '../progression/legacy';
import { type Feature, isOpen, nextStageText, STAGES, stageFor } from '../progression/reveal';
import {
  CONTROL_CARDS,
  controlChoices,
  type ControlId,
  freshLesson,
  hasTouch,
  type Lesson,
  lessonMet,
  lessonOver,
  type LessonState,
  LESSONS,
  lessonText,
  Onboarding,
  PRACTICE_SEED,
  STARTER,
  TRIAL_SECONDS,
} from '../ui/onboarding';
import { itemCard, powerItem } from '../ui/guide';
import { type Mark, TeachView } from '../ui/tutorialView';
import { Color, Vector3 } from 'three';
import { Ads, createAdNetwork, type RewardedPlacement } from '../ads/ads';
import { entitlementFor, Entitlements } from '../store/entitlements';
import { Progress } from '../progression/progress';
import { creditsFor, insignia, promotionBonus, RANK_COLOURS, rankColour, Ranked, rankName, RANKS, type RunMode, xpToRank } from '../progression/ranks';
import { Wallet } from '../progression/wallet';
import { Daily, type Quest, questText } from '../economy/daily';
import { Weekly } from '../economy/weekly';
import { type GoalsTab, GoalsScreen, type TaskRow } from '../ui/goalsView';
import { Pass, passBought, passRefunded, premiumReward, freeReward, runXp, seasonAt } from '../economy/pass';
import { type Reward, rewardLook, rewardParts, rewardText } from '../economy/reward';
import { asksBeforeSpending, DailyShop, setOffer, vaultAt } from '../economy/shop';
import { dayKey, formatWait, untilTomorrow } from '../economy/time';
import { EconomyView, type StoreButton, type StoreCard } from '../economy/view';
import { type BoardId, createBackend, type PilotStats, type Purchase, type ReportReason, type RunSubmission, type SubmitResult } from '../server/backend';
import { BOARD_TABS, boardCaption, boardForRun, boardName, boardQuery } from '../server/boards';
import { Outbox } from '../server/outbox';
import { CloudSave } from '../server/sync';
import { shareAvailable, shareCard } from '../platform/share';
import { createStore, type ProductId, type StoreProduct } from '../store/store';
import { storage } from './storage';
import { SESSION_KEY } from '../server/supabase';
import { googleAvailable, googleSignIn } from '../platform/account';
import { fxDistance, fxTime } from '../world/fx';
import { type Course, COURSES, courseLength, type DailyRun, dailyRun, type Environment, ENVIRONMENTS, type WeeklyRun, weeklyRun } from '../world/courses';
import { Challenge, streakReward } from '../progression/challenge';
import { envStatus, nextEnvironment, newlyOpened } from '../progression/unlocks';
import { DIVISIONS, divisionReward, emblem, LEAGUES, leagueName, leaguePar, Leagues, LP_PER_DIVISION, weekKey } from '../progression/leagues';
import { ACHIEVEMENTS, type Achievement, GROUP_NAMES, type Group, type Snapshot, achievement, progressOn, rewardKeys } from '../progression/achievements';
import { refreshSeasonLooks, SETS, VAULT_ORDER } from '../ship/catalogue';
import { GoalLog } from '../progression/goals';
import { buildHangar, type HangarState, lookIcon, lookSwatch, monthsUntilVault } from '../ship/hangar';
import { type HangarTab, HangarScreen } from '../ui/hangarView';
import { byKey, find, keyOf, LOOKS, Looks, type LookItem, type Owner, type ShipId, type Slot, type TrailId, SLOT_NAMES } from '../ship/looks';
import type { Fin, Marking } from '../ship/looks';
import { MAX_TIER, type ShipStats, STANDARD, SYSTEMS, type SystemId, TIER_COST, TIER_LEAGUE, Upgrades } from '../ship/upgrades';
import { newSeed } from './rng';
import { loadNumber } from './storage';
import { type Celebration, formatScore, type PilotCardView, type ProgressView, type RankResultView, type TitleCard, UI } from '../ui/ui';
import type { RoomId } from '../world/interior';
import { biomeForLevel, type PowerKind, themeForLevel, themeName, World } from '../world/world';
import { tintBiome } from '../world/biomes';
import { terrain } from '../world/terrain';
import { ShowroomSpin } from '../ship/showroom';

type State = 'title' | 'playing' | 'paused' | 'countdown' | 'crashed' | 'finished';

const DEG = Math.PI / 180;
const PATH_STEP = 4;
const FIRST_PLAYED_KEY = 'endless.firstPlayed';
const REVEAL_KEY = 'endless.reveal';
/** The reminders were offered once (after the 5th valid run): kept on this device only. */
const REMINDERS_OFFERED_KEY = 'endless.remindersOffered';

/** The shop's tabs: looks as cards (today, the set, the vault), then lists (the pass, cores, premium). */
type ShopTab = 'today' | 'set' | 'vault';

/** A name the server made up for a new account ("pilot-3fa2"): the player hasn't picked one. */
const GENERATED_NAME = /^pilot-[0-9a-f]{4}$/;
/** A name the server takes (see set_pilot_name). */
const PILOT_NAME = /^[A-Za-z0-9 _-]{3,16}$/;

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
function musicFor(level: number): MusicId {
  const biome = biomeForLevel(level);
  return biome === 'ice' || biome === 'volcanic' || biome === 'asteroids' ? biome : themeForLevel(level);
}

/** Where the boost button sits, by the boostSide setting (0 right, 1 left, 2 middle). */
const BOOST_SIDES = ['right', 'left', 'middle'] as const;
/** The practice run puts each pickup and power-up this far ahead (about 2.5 s at its speed). */
const ITEM_AHEAD = 95;
/** How long a picked-up item's "on" line stays before the next. */
const CONFIRM_SECONDS = 1.8;
/** After the practice magnet: pickups this far ahead, this far to the side of the lane, for it to pull in. */
const MAGNET_DEMO: [number, number][] = [
  [36, 1.6],
  [50, -1.6],
  [64, 1.6],
];

/** A wrapped present, for the daily reward. */
const GIFT_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="12" y="26" width="40" height="28" rx="3"/><rect x="8" y="18" width="48" height="10" rx="2"/><path d="M32 18v36"/><path d="M32 18c-4-8-14-10-14-4s10 4 14 4c4 0 14 2 14-4s-10-4-14 4z"/></svg>';
/** A goal badge: a star in a ring. */
const GOAL_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><circle cx="32" cy="32" r="26"/><path d="M32 14l5.4 11.4 12.1 1.6-8.9 8.4 2.3 12.3L32 41.7l-10.9 6 2.3-12.3-8.9-8.4 12.1-1.6z"/></svg>';
/** What's new: a four-point sparkle. */
const NEW_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 6c2 14 6 20 20 22-14 2-18 8-20 22-2-14-6-20-20-22 14-2 18-8 20-22z"/><path d="M50 40c1 5 2 7 7 8-5 1-6 3-7 8-1-5-2-7-7-8 5-1 6-3 7-8z"/></svg>';
/** The daily challenge: a flag at the finish line. */
const FLAG_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M16 58V8"/><path d="M16 10h34l-7 10 7 10H16"/><path d="M27 10v20M38 10v20M16 20h34"/></svg>';
/** Credits and cores side by side (the wallet's two chips), for the first look at the shop. */
const WALLET_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><circle cx="22" cy="34" r="15"/><path d="M27.5 28.5a8 8 0 1 0 0 11"/><path d="M44 16l13 7.5v15L44 46l-13-7.5v-15z"/><path d="M44 25l6 3.5v7L44 39l-6-3.5v-7z"/></svg>';
/** The first look at the shop or the store says what credits and cores are for (once, on this save). */
const WALLET_EXPLAINED_KEY = 'endless.walletExplained';
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
  /** Graphics on auto: drops to low once per session if runs keep going slow. */
  private readonly autoGraphics = new AutoGraphics();
  private readonly sky: Sky;
  private readonly trail: Trail;
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
  private readonly hints = new Hints((text, tip) => this.ui.showHint(text, tip));
  /** The Android app (not the web): back can leave it, so "ask before closing" applies. */
  private native = Capacitor.getPlatform() === 'android';
  /** The "close endless space?" dialog is up. */
  private exitAsking = false;
  private readonly haptics = new Haptics();
  private readonly progress = new Progress();
  // Run mode: ranked (the weekly level), solo (an environment or a set level) or endless.
  private mode: RunMode = 'ranked';
  /** Solo: the environment being played, or null (endless, ranked, set levels). */
  private environment: Environment | null = null;
  /** This week's ranked level (rebuilt when the week turns). */
  private weekly: WeeklyRun = weeklyRun(weekKey(Date.now()));
  /** Today's challenge (rebuilt when the day turns, by the trusted clock). */
  private today: DailyRun = dailyRun(dayKey(Date.now()));
  /** The daily challenge being flown (the day it belongs to), or null. */
  private dailyRunNow: DailyRun | null = null;
  /** The daily challenge's bests and streak on this device. */
  private readonly challenge = new Challenge();
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
  /** The last run sent to a board: its notice still shows when the rate limit held it back a moment (not mid-run). */
  private lastSent: RunSubmission | null = null;
  private boardTab = 'week';
  private boardSeq = 0;
  private readonly store = createStore();
  private storeProducts: StoreProduct[] = [];
  /** Shop rows for real-money products, in the order shown ('dev' adds cores in the dev build). */
  private deleteArmed = false;
  private deleteTimer = 0;
  private portraits = new Portraits(this.palette);
  private shipSent = ''; // the looks last sent to the boards (JSON)
  private recordSent = ''; // the service record summary last sent (JSON)
  private shipTimer = 0;
  private nameOk = false; // the player has a pilot name of their own
  private nameLater = false; // the name screen was put off for this session
  private walletExplained = false; // looked at this session whether the wallet card was shown
  private googleEmail: string | null = null; // the Google account this account is kept with ('' none, null unknown)
  private googleBusy = false;
  private googleArmed = false; // asked once to switch to the account a Google login keeps
  private nameWords: Promise<Set<string>> | null = null; // the profanity list, once loaded
  private storeFrom: 'shop' | null = null; // where Back goes from the store
  private passFrom: 'store' | null = null; // and from the season pass
  /** One-time products already bought. */
  private readonly entitlements = new Entitlements();
  private firstPlayed = Date.now();
  /** The saved days, weeks and pass are loaded (retime waits for them). */
  private economyLoaded = false;
  private readonly onboarding = new Onboarding();
  /**
   * The practice run in progress (onboarding), or a trial of other controls: the
   * lesson it's on, what the player has done in it, the controls flown, the
   * lessons done, and the pickup or power-up coming up (and those still to come).
   */
  private practice: {
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
  private practiceNext = false;
  /** "how did that feel?": the controls the last practice or trial was flown with. */
  private feelUsed: ControlId | null = null;
  private readonly teach = new TeachView();
  private readonly markV = new Vector3();
  /** Obstacles flown past this run (the practice run's obstacle lesson). */
  private passCount = 0;
  /** The reveal stage last announced (null until read from storage). */
  private revealSeen: number | null = null;
  private readonly ads = new Ads(
    createAdNetwork(),
    () => this.entitlements.has('premium'),
    () => this.firstPlayed,
  );
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
  /** The saved settings have been read (until then they're the defaults). */
  private settingsLoaded = false;
  /** The reminders offer was looked at this session (it's made once, ever). */
  private reminderOfferChecked = false;
  /** Asking the server whether it's back, and when it was last asked (the device's clock). */
  private rechecking = false;
  private lastRecheck = 0;
  /** The minute the title's cards were last drawn (the daily card's time left). */
  private titleMinute = 0;
  /** Turns the showroom camera: on its own, or by a drag on the open scene. */
  private readonly showroomSpin = new ShowroomSpin({ spin: CONFIG.camera.showroom.spin });
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
  private preview: Partial<Record<Slot, string>> | null = null;
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
      if (this.state === 'title') this.startPrimary();
    });
    this.ui.bindTitleCards(this.onTitleLink);
    this.ui.bindWelcome({
      control: (id) => this.chooseControls(id),
      practice: () => this.startPractice(),
      skip: () => this.skipPractice(),
      pick: (key) => this.pickStarter(key),
      done: () => this.finishOnboarding(),
      feel: (id) => this.chooseControls(id),
      tryIt: () => this.startTrial(),
      keep: () => this.keepControls(),
      guideClose: () => this.closeGuide(),
    });
    this.ui.bindRecordTabs((tab) => this.ui.setRecordTab(tab));
    void storage.get(REVEAL_KEY).then((v) => (this.revealSeen = v === null ? -1 : Number(v) || 0));
    this.ui.titleRank.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleRank.addEventListener('click', () => this.onTitleLink('record'));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.sound.suspend(); // no music or engine from the background, whatever screen was up
        void this.planReminders(); // what's done today is known now
      }
      // Back to the front: pick up any change to the balances made on the server (the dashboard),
      // and the server's clock again (the device's may have been moved meanwhile).
      else {
        if (this.state !== 'paused') this.sound.resume(); // a paused run stays quiet until it's resumed
        void this.backend.syncClock().then((known) => known && this.retime());
        void this.wallet
          .refresh()
          .then(() => this.checkMaxOut())
          .then(() => this.refreshTitle());
        this.ads.preload();
      }
    });
    window.addEventListener('blur', () => this.pause());

    this.ui.bindCelebration();
    this.ui.bindTitleLinks(this.onTitleLink);
    this.ui.bindBoards(
      BOARD_TABS,
      (id) => void this.showBoard(id),
      (name) => void this.savePilotName(name),
    );
    this.ui.bindNameBox('settings', (name) => void this.savePilotName(name, 'settings'));
    this.ui.bindNameBox('name', (name) => void this.saveNameScreen(name));
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
      this.refreshTitle();
      // A new player starts with the welcome; the first daily reward waits for the end of it.
      if (this.onboarding.done) this.claimLogin();
      else this.openWelcome();
      void this.checkWhatsNew();
      void this.connect();
      void this.planReminders();
    });
    this.outbox.onLate = (run, res) => {
      if (run === this.lastSent && this.state !== 'playing' && this.state !== 'countdown') this.boardNotice(run.board, res);
    };
    this.econ.bindShop(this.onShopOffer, this.onShopBuy, this.onShopTab, this.onShopSet);
    this.bindShowroomDrag();
    this.econ.bindStore(this.onStoreAct);
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
    this.ui.bindSolo(
      (i) => this.startCourse(i),
      (i) => this.startSolo(i),
    );
    this.ui.bindUpgrades(this.onBuyUpgrade, (id) => {
      this.upgrades.toggle(id as SystemId);
      this.haptics.pickup();
      this.renderHangar(true);
    });
    void looksReady.then(() => this.applyLooks());
    void loadSettings().then((s) => {
      this.settings = s;
      this.settingsLoaded = true;
      this.applySettings();
      void this.planReminders();
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
  private beginRun(
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
    this.revivePending = this.canRevive();
    this.reviveAsked = false;
    this.quick = quickRetryOn(this.settings.quickRetry, this.mode, this.practice !== null);
    this.settledMs = 0;
    if (!this.revivePending) this.settleCrash();
  }

  /** Record a crashed run and fill the game-over screen (after any revive offer is turned down). */
  private settleCrash(): void {
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
    credits += this.recordRank(this.state === 'finished');
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
    this.refreshTitle();
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
    const paid = this.pass.addXp(this.now(), xp);
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
    const day = dayKey(this.now());
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
  /** The weekly set shown all at once (a grid), not as a row. */
  private shopGrid = false;
  /** The whole weekly set is on the ship to try. */
  private shopTrying = false;

  /** The cards for the open shop tab, and the line, heading and buy button that go with them. */
  private shopTabView(
    now: number,
    owned: (key: string) => boolean,
  ): {
    heading: string;
    reset: string;
    info: string;
    items: LookItem[];
    cards: { price: string; premium: boolean; deal: boolean }[];
    buy: { text: string; enabled: boolean };
  } {
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
        buy: so.complete
          ? { text: 'set complete', enabled: false }
          : { text: `buy the set · ${formatScore(so.price)} cores`, enabled: this.wallet.cores >= so.price },
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
        buy: mine
          ? { text: `${v.item.name} is yours`, enabled: false }
          : { text: `buy ${v.item.name} · ${formatScore(v.price)} cores`, enabled: this.wallet.cores >= v.price },
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
    const now = this.now();
    if (tab) {
      this.shopTab = tab;
      this.shopPick = -1;
      this.shopTrying = false;
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
    const v = this.shopTabView(now, owned);
    this.econ.renderShop({
      wallet: `${formatScore(this.wallet.credits)} credits · ${formatScore(this.wallet.cores)} cores`,
      reset: v.reset,
      tabs: tabs.map((t) => ({ ...t, note: this.shopTabNote(t.id, now), on: t.id === this.shopTab })),
      store: this.storeAd(now),
      heading: v.heading,
      kicker: this.shopTab === 'vault' ? 'rare · one month only' : '',
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
      set: this.shopTab === 'set' ? { grid: this.shopGrid, trying: this.shopTrying && this.preview !== null } : null,
      buy: v.buy,
    });
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('shop');
    void this.explainWallet();
  }

  /** The first time the shop or the store opens: what credits and cores are, and where each comes from (once). */
  private async explainWallet(): Promise<void> {
    if (this.walletExplained) return;
    this.walletExplained = true;
    if ((await storage.get(WALLET_EXPLAINED_KEY)) !== null) return;
    void storage.set(WALLET_EXPLAINED_KEY, '1');
    this.ui.celebrate([
      {
        kicker: 'your wallet',
        icon: WALLET_ICON,
        name: 'credits and cores',
        lines: [
          'credits: every run pays them. for looks and upgrades',
          'cores: rarer. from daily rewards, goals, the pass and the store',
          'for premium looks, the vault, revives and the pass',
        ],
      },
    ]);
  }

  /** The store's ad on the shop: the season's countdown, the pass's hook, and the best pack of cores. */
  private storeAd(now: number): { pass: { title: string; left: string; hook: string; tier: string; fraction: number }; cores: string } {
    this.pass.turn(now);
    const s = seasonAt(now);
    const tier = this.pass.tier;
    const tiers = CONFIG.economy.pass.tiers;
    // The biggest pack, with its bonus and (in the app) its price.
    let best: { id: ProductId; cores: number; bonus: number } | null = null;
    for (const p of CONFIG.economy.store.products) if ('bonus' in p && (!best || p.cores > best.cores)) best = p;
    const price = best && this.storeProducts.find((p) => p.id === best.id)?.price;
    const cores = best ? `up to ${formatScore(best.cores)}${best.bonus ? ` · +${best.bonus}%` : ''}${price ? ` · ${price}` : ''}` : '';
    const hook = this.pass.premium
      ? 'premium · every reward is yours'
      : tier > 0
        ? `${tier} premium reward${tier === 1 ? '' : 's'} waiting`
        : 'premium rewards on every tier';
    return {
      pass: {
        title: `season ${s.season} pass`,
        left: `${s.end - now > 2 * 86_400_000 ? `${Math.ceil((s.end - now) / 86_400_000)}d` : formatWait(s.end - now)} left`,
        hook,
        tier: `${tier}/${tiers}`,
        fraction: tier / tiers,
      },
      cores,
    };
  }

  /** Under each tab: when it turns over. */
  private shopTabNote(id: ShopTab, now: number): string {
    if (id === 'set') return formatWait(Date.parse(`${weekKey(now)}T00:00:00Z`) + 7 * 86_400_000 - now);
    if (id === 'vault') return formatWait(vaultAt(now).leaves);
    return formatWait(untilTomorrow(now));
  }

  /** The looks shop's tabs (the store, for cores and the pass, is its own screen). */
  private shopTabs(): { id: ShopTab; label: string }[] {
    return [
      { id: 'today', label: 'today' },
      { id: 'set', label: 'weekly set' },
      { id: 'vault', label: 'vault' },
    ];
  }

  private onShopTab = (id: string): void => {
    if (id === 'store' || id === 'store-cores') {
      this.openStore('shop');
      // Buy cores: straight to the packs, past the pass.
      if (id === 'store-cores') requestAnimationFrame(() => document.getElementById('store-packs-head')?.scrollIntoView({ block: 'start' }));
      return;
    }
    if (!this.shopTabs().some((t) => t.id === id)) return;
    this.openShop(id as ShopTab);
  };

  /** The store: the season pass first, then cores, the starter pack and premium, swaps, and restore. */
  private openStore(from?: 'shop' | null): void {
    if (from !== undefined) this.storeFrom = from;
    const now = this.now();
    this.pass.turn(now);
    const P = CONFIG.economy.pass;
    const s = seasonAt(now);
    const tier = this.pass.tier;
    const price = new Map(this.storeProducts.map((p) => [p.id, p.price]));
    const app = this.store.available;
    // A real-money button: the store's price, or why it can't be bought here.
    const money = (id: ProductId): StoreButton => {
      const p = price.get(id);
      return p ? { act: id, text: p, enabled: true, primary: true } : { act: id, text: app ? 'unavailable' : 'in the app', enabled: false };
    };
    const owned = (text: string): StoreButton => ({ act: '', text, enabled: false });

    const passButtons: StoreButton[] = [];
    const perks: string[] = [];
    if (this.pass.premium) {
      perks.push(`season ${s.season}'s premium track is yours`, 'premium rewards are paid at every tier you reach');
      passButtons.push({ act: 'pass-open', text: 'see the tiers', enabled: true });
    } else {
      const next = Math.min(tier + 1, P.tiers);
      perks.push(
        'more at every tier, on top of the free track',
        "the season's new looks",
        `next up: ${rewardText(premiumReward(next, s.season))} at tier ${next}`,
      );
      if (tier > 0) perks.push(`the ${tier} tier${tier === 1 ? '' : 's'} you've reached pay out as you unlock`);
      passButtons.push({
        act: 'pass-cores',
        text: `unlock · ${formatScore(P.premiumCores)} cores`,
        enabled: this.wallet.cores >= P.premiumCores,
        primary: this.wallet.cores >= P.premiumCores,
      });
      const m = price.get('season_pass');
      if (m) passButtons.push({ act: 'season_pass', text: `unlock · ${m}`, enabled: true });
      passButtons.push({ act: 'pass-open', text: 'see the tiers', enabled: true });
    }

    const packs: StoreCard[] = [];
    const extras: StoreCard[] = [];
    for (const p of CONFIG.economy.store.products) {
      const img = `store/${p.id}.png`;
      if ('look' in p) {
        const mine = this.ownsProduct(p.id);
        extras.push({
          img,
          name: 'starter pack',
          sub: `${formatScore(p.cores)} cores and ${rewardText({ look: p.look })}`,
          tag: 'once',
          button: mine ? owned('owned') : money(p.id),
          owned: mine,
        });
      } else if ('premium' in p) {
        const mine = this.entitlements.has('premium');
        extras.push({
          img,
          name: 'premium',
          sub: mine ? 'yours. thank you' : 'no ads, ad rewards without the ad, three premium looks, an extra free revive a day, a badge on the boards',
          tag: '',
          button: mine ? owned('owned') : money(p.id),
          owned: mine,
        });
      } else if ('cores' in p) packs.push({ img, name: `${formatScore(p.cores)} cores`, sub: '', tag: '', button: money(p.id), owned: false });
    }
    const packsNote = !app
      ? 'packs of cores, the starter pack and premium are in the android app'
      : this.storeProducts.length === 0
        ? "the store isn't answering. check your connection and come back"
        : '';

    const S = CONFIG.economy.shop;
    const foot: { label: string; button: StoreButton }[] = [];
    if (app) foot.push({ label: 'bought on another device?', button: { act: 'restore', text: 'restore', enabled: true } });
    if (import.meta.env.DEV) {
      foot.push({ label: 'dev: add cores (purchases stand-in)', button: { act: 'dev', text: '+500', enabled: true } });
      foot.push({ label: 'dev: premium on/off', button: { act: 'dev-premium', text: 'toggle', enabled: true } });
    }
    this.econ.renderStore({
      wallet: `${formatScore(this.wallet.credits)} credits · ${formatScore(this.wallet.cores)} cores`,
      pass: {
        title: `season ${s.season}`,
        left: `ends in ${formatWait(s.end - now)}`,
        tier: `tier ${tier} of ${P.tiers}`,
        fraction: Math.min(1, (tier + (tier >= P.tiers ? 0 : this.pass.tierFraction)) / P.tiers),
        perks,
        buttons: passButtons,
      },
      packs,
      packsNote,
      extras,
      swapNote: `${formatScore(S.creditsPerCore)} credits for every core`,
      swaps: S.swaps.map((n) => ({
        act: `swap-${n}`,
        text: `${formatScore(n)} cores → ${formatScore(n * S.creditsPerCore)} credits`,
        enabled: this.wallet.cores >= n,
      })),
      foot,
    });
    if (this.state === 'title') {
      // No showroom here: the ship only shows on the screens that show it off.
      this.preview = null;
      this.shopPick = -1;
      this.applyLooks();
      this.player.setVisible(false);
      this.trail.setVisible(false);
    }
    this.openInfo('store');
    void this.explainWallet();
  }

  /** Tap a look: it goes on the ship to try (owned ones are just put on). Tap again to take it off. */
  private onShopOffer = (i: number): void => {
    const now = this.now();
    const o = this.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.looks.owns(it, o);
    };
    const item = this.shopTabView(now, owned).items[i];
    if (!item) return;
    this.shopTrying = false; // one look again, not the whole set
    if (this.shopPick === i && !owned(keyOf(item))) {
      this.shopPick = -1;
      this.preview = null;
    } else {
      this.shopPick = i;
      if (owned(keyOf(item))) {
        this.preview = null;
        this.looks.equip(item.slot, item.id);
      } else this.preview = { [item.slot]: item.id };
    }
    this.haptics.pickup();
    this.applyLooks();
    this.openShop();
  };

  /** The weekly set's buttons: every look at once or back to a row, and the whole set on the ship (tap again to take it off). */
  private onShopSet = (act: 'grid' | 'try'): void => {
    if (this.shopTab !== 'set') return;
    if (act === 'grid') this.shopGrid = !this.shopGrid;
    else if (this.shopTrying && this.preview) {
      this.shopTrying = false;
      this.preview = null;
    } else {
      const o = this.owner();
      const items = setOffer(weekKey(this.now()), (key) => {
        const it = byKey(key);
        return !!it && this.looks.owns(it, o);
      }).items;
      // One look per slot, all on at once. Nothing is put on for keeps.
      const all: Partial<Record<Slot, string>> = {};
      for (const item of items) all[item.slot] ??= item.id;
      this.preview = all;
      this.shopTrying = true;
      this.shopPick = -1;
      this.haptics.pickup();
    }
    this.applyLooks();
    this.openShop();
  };

  /** Something was bought: put it on, play the sound, and see whether it finished a goal or a set. */
  private afterBuy(items: LookItem[], notice: string): void {
    for (const item of items) this.looks.equip(item.slot, item.id);
    this.preview = null;
    this.shopTrying = false;
    this.sound.pickup();
    this.haptics.pickup();
    this.ui.showNotice(notice);
    this.applyLooks();
    this.refreshTitle();
    this.checkGoals();
  }

  private onShopBuy = (): void => {
    const now = this.now();
    const o = this.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.looks.owns(it, o);
    };
    if (this.shopTab === 'set') {
      const so = setOffer(weekKey(now), owned);
      if (so.complete || this.wallet.cores < so.price) return;
      this.confirmCores(so.price, `${so.set.name}: ${so.missing.length} look${so.missing.length === 1 ? '' : 's'}`, () => {
        if (!this.wallet.spendCores(so.price)) return;
        for (const item of so.missing) this.looks.buy(item);
        this.afterBuy(so.items, `${so.set.name} bought and on your ship`);
        this.openShop();
      });
    } else if (this.shopTab === 'vault') {
      const v = vaultAt(now);
      if (owned(keyOf(v.item)) || this.wallet.cores < v.price) return;
      this.confirmCores(v.price, `${v.item.name} from the vault`, () => {
        if (!this.wallet.spendCores(v.price)) return;
        this.looks.buy(v.item);
        this.afterBuy([v.item], `${v.item.name} from the vault is on your ship`);
        this.openShop();
      });
    } else {
      const f = this.dailyShop.offers(dayKey(now), owned)[this.shopPick];
      if (!f || owned(keyOf(f.item))) return;
      const buy = (): void => {
        const paid = f.currency === 'cores' ? this.wallet.spendCores(f.price) : this.wallet.spend(f.price);
        if (!paid) return;
        this.looks.buy(f.item);
        this.afterBuy([f.item], `${f.item.name} bought and on your ship`);
        this.openShop();
      };
      if (f.currency === 'cores') this.confirmCores(f.price, f.item.name, buy);
      else buy();
    }
  };

  /** Spend cores on `what`: straight away for small amounts, after a "spend N cores?" for larger ones (CONFIG.economy.confirmCores). */
  private confirmCores(cost: number, what: string, go: () => void): void {
    if (!asksBeforeSpending(cost)) return go();
    this.econ.offer(
      {
        kicker: '',
        name: `spend ${formatScore(cost)} cores?`,
        lines: [what, `you have ${formatScore(this.wallet.cores)} cores`],
        yes: `buy · ${formatScore(cost)} cores`,
        yesEnabled: this.wallet.cores >= cost,
        no: 'not now',
        seconds: 0,
      },
      go,
      () => undefined,
    );
  }

  /** A store button (its data-act): the pass, a real purchase, a swap, restore, or a dev stand-in. */
  private onStoreAct = (act: string): void => {
    if (act === 'dev' && import.meta.env.DEV) {
      this.devAddCores(500);
      this.openStore();
    } else if (act === 'dev-premium' && import.meta.env.DEV) {
      this.devTogglePremium();
      this.openStore();
    } else if (act === 'pass-cores') this.onPassPremium();
    else if (act === 'pass-open') this.openPass('store');
    else if (act === 'restore') void this.restorePurchases();
    else if (act.startsWith('swap-')) this.swapCores(Number(act.slice(5)));
    else if (CONFIG.economy.store.products.some((p) => p.id === act)) void this.buyProduct(act as ProductId);
  };

  /** Cores into credits, at the shop's rate. */
  private swapCores(n: number): void {
    if (this.wallet.cores < n) {
      this.ui.showNotice('not enough cores');
      return;
    }
    this.confirmCores(n, `for ${formatScore(n * CONFIG.economy.shop.creditsPerCore)} credits`, () => {
      if (!this.wallet.spendCores(n, 'swap')) return;
      const lines = this.grant({ credits: n * CONFIG.economy.shop.creditsPerCore });
      this.ui.showNotice(lines.join(' · '));
      this.sound.pickup();
      this.refreshTitle();
      if (this.infoOpen === 'store') this.openStore();
    });
  }

  /** The season pass's tiers. `from: 'store'` makes Back return to the store. */
  private openPass(from?: 'store' | null): void {
    if (from !== undefined) this.passFrom = from;
    const now = this.now();
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
    const cost = CONFIG.economy.pass.premiumCores;
    if (this.pass.premium || this.wallet.cores < cost) return;
    this.confirmCores(cost, `season ${this.pass.season} pass: the premium track`, () => this.unlockPassWithCores());
  };

  private unlockPassWithCores(): void {
    // The reason tells the server this season's premium was paid in cores (a refund never touches it).
    if (this.pass.premium || !this.wallet.spendCores(CONFIG.economy.pass.premiumCores, `pass-premium:${this.pass.season}`)) return;
    const paid = this.pass.unlockPremium('cores');
    const lines = paid.flatMap((r) => this.grant(r));
    this.ui.celebrate([
      {
        kicker: 'season pass',
        icon: PASS_ICON,
        name: 'premium unlocked',
        lines: lines.length > 0 ? mergeCredits(lines) : ['premium rewards from every tier you reach'],
      },
    ]);
    this.sound.power();
    this.refreshTitle();
    if (this.infoOpen === 'store') this.openStore();
    else this.openPass();
  }

  // --- revive ----------------------------------------------------------------

  /** A revive is offered once a run, outside ranked, where the lane is known. */
  private canRevive(): boolean {
    return this.mode !== 'ranked' && !this.dailyRunNow && !this.revived && this.world.laneAt(this.world.distance) !== null;
  }

  private offerRevive(): void {
    const day = dayKey(this.now());
    const free = this.daily.freeRevivesLeft(day, this.freeRevivesADay()) > 0;
    // Out of free ones: a rewarded ad (free with premium) or cores, the player's pick.
    const byAd = !free && this.ads.offers('revive');
    const cost = CONFIG.economy.revive.coreCost;
    const cores = `revive · ${cost} cores`;
    const byCores = (): void => {
      if (!this.wallet.spendCores(cost)) return this.settleCrash();
      this.revive();
    };
    this.econ.offer(
      {
        kicker: 'crashed',
        name: 'keep going?',
        lines: [free ? 'your free revive today' : `you have ${formatScore(this.wallet.cores)} cores`, `score so far ${formatScore(this.score)}`],
        yes: free ? 'revive · free' : byAd ? `revive · ${this.ads.label()}` : cores,
        yesEnabled: free || byAd || this.wallet.cores >= cost,
        alt: byAd ? cores : '',
        altEnabled: this.wallet.cores >= cost,
        no: 'no thanks',
        seconds: 6,
      },
      () => {
        if (free) {
          this.daily.useFreeRevive(day);
          this.revive();
        } else if (byAd) void this.reviveByAd();
        else byCores();
      },
      () => this.settleCrash(),
      byCores,
    );
  }

  /** Revive for a rewarded ad; without one the offer comes back, to try again or turn down. */
  private async reviveByAd(): Promise<void> {
    const ok = await this.watchAd('revive');
    if (this.state !== 'crashed' || !this.revivePending) return; // moved on meanwhile
    if (ok) this.revive();
    else this.offerRevive();
  }

  /**
   * Earn a reward by ad (at once for premium and on the web). Says why not:
   * no ad loaded in time, or closed early. The offer is the caller's to keep.
   */
  private async watchAd(p: RewardedPlacement): Promise<boolean> {
    if (this.ads.showsAds && !this.ads.adReady) this.ui.showNotice('loading an ad…');
    const r = await this.ads.watch(p);
    if (r === 'unavailable') this.ui.showNotice('no ad available right now. try again in a moment');
    else if (r === 'skipped') this.ui.showNotice('ad closed early, so no reward. try again any time');
    return r === 'rewarded';
  }

  /** Double the last run's credits for a rewarded ad (free with premium), once. */
  private async doubleCredits(): Promise<void> {
    const n = this.lastRunCredits;
    if (n <= 0) return;
    this.lastRunCredits = 0;
    this.ui.showDouble(null);
    if (!(await this.watchAd('doubleCredits'))) {
      // No reward (the ad didn't load or was closed early): the offer stays, unless another run has ended since.
      if (this.lastRunCredits > 0) return;
      this.lastRunCredits = n;
      this.ui.showDouble(`double +${formatScore(n)} credits · ${this.ads.label()}`);
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
    const day = dayKey(this.now());
    if (!this.daily.giftReady(day) || !(await this.watchAd('dailyGift')) || !this.daily.giftReady(day)) return;
    this.daily.takeGift(day);
    const lines = this.grant(CONFIG.ads.dailyGift, `gift:${day}`);
    this.ui.celebrate([{ kicker: 'free gift', icon: GIFT_ICON, name: 'daily gift', lines }]);
    this.refreshTitle();
  }

  /** Swap an unfinished daily goal for another (a rewarded ad, or free with premium), once a day. */
  private async onReroll(id: string): Promise<void> {
    const i = Number(id.slice(1));
    const day = dayKey(this.now());
    if (!/^q\d$/.test(id) || !this.daily.canReroll(day) || !(await this.watchAd('rerollQuest')) || !this.daily.canReroll(day)) return;
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
    const now = this.now();
    this.daily.turn(dayKey(now));
    this.weeklyGoals.turn(weekKey(now));
    this.pass.turn(now);
    this.turnWeek(now);
    void this.offerReminders();
    if (Date.now() - this.lastRecheck > 20_000) {
      // Offline: is the server back?
      this.lastRecheck = Date.now();
      void this.recheck();
    }
    if (this.turnDay(now) || Math.floor(now / 60_000) !== this.titleMinute) {
      // A new day's challenge, or the minute its time left counts down.
      this.titleMinute = Math.floor(now / 60_000);
      this.ui.renderTitleCards(this.titleCards(now));
    }
    this.refreshBar(now);
    // The season looks by the trusted clock (start-up had only the phone's); owned or worn ones stay.
    const keep = (l: LookItem) => this.looks.has(keyOf(l)) || this.looks.equipped[l.slot] === l.id;
    if (refreshSeasonLooks(now, keep) && this.infoOpen === 'hangar') this.renderHangar(true);
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
  private payLeagueWeek(now: number): void {
    const weekly = this.leagues.rollWeek(now);
    if (weekly <= 0) return;
    this.wallet.add(weekly);
    this.ui.showNotice(`weekly league reward +${formatScore(weekly)} credits`);
  }

  /** The time for rewards, streaks, days and weeks: the server's clock when known, the device's offline. */
  private now(): number {
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
      this.refreshTitle();
    }
    // What the account has bought, as the server's purchase records have it.
    const records = (await this.backend.purchases()) ?? [];
    const bought = [...new Set(records.map((r) => r.product))];
    for (const id of bought) this.grantProduct(id);
    const pass = this.restorePass(records);
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
    if (this.infoOpen === 'store') this.openStore();
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
    this.refreshTitle();
    this.queueShip();
    void this.askName();
    void this.outbox.flush(); // runs that couldn't be sent last time
    return true;
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
      this.ui.showNotice("purchase didn't go through. nothing was charged");
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
    if ('pass' in p && !this.pass.premium) lines.push(...this.pass.unlockPremium('money').flatMap((r) => this.grant(r)), 'season pass premium');
    if ('premium' in p) lines.push('premium: no ads, ad rewards free, the halo hull, regalia paint and crown flame, an extra free revive a day');
    this.grantProduct(id);
    this.ui.celebrate([{ kicker: 'thank you', icon: GIFT_ICON, name: 'purchase complete', lines: mergeCredits(lines) }]);
    this.sound.power();
    this.refreshTitle();
    if (this.infoOpen === 'shop') this.openShop();
    else if (this.infoOpen === 'store') this.openStore();
    else if (this.infoOpen === 'pass') this.openPass();
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
    else if (this.infoOpen === 'store') this.openStore();
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

  /**
   * A season pass bought for money this season (the server's records) unlocks
   * the premium track here too: a new install, or a purchase the app didn't
   * hear back about. Once only: an unlocked track is left alone. Returns the
   * lines to show, or null if nothing changed.
   */
  private restorePass(records: readonly Purchase[]): string[] | null {
    const now = this.now();
    this.pass.turn(now);
    // Refunded (and not bought again): a track bought for money closes; one unlocked with cores stays.
    if (passRefunded(records, now) && this.pass.refund()) {
      this.ui.showNotice('your season pass was refunded, so its premium track is closed');
      void this.wallet.refresh(); // the server took back the cores its premium tiers paid
      this.refreshTitle();
      if (this.infoOpen === 'pass') this.openPass();
      return null;
    }
    if (this.pass.premium || !passBought(records, now)) return null;
    const lines = this.pass.unlockPremium('money').flatMap((r) => this.grant(r));
    this.refreshTitle();
    if (this.infoOpen === 'pass') this.openPass();
    else if (this.infoOpen === 'store') this.openStore();
    return lines.length > 0 ? mergeCredits(lines) : ['premium rewards from every tier you reach'];
  }

  /** Restore one-time purchases on a new install (cores come back with the cloud save). */
  private async restorePurchases(): Promise<void> {
    this.ui.showNotice('checking your purchases…');
    // Google Play's records for the Google account on this phone, and the server's for this game account.
    // At least two seconds, so the answer doesn't flash past the "checking" note.
    const wait = new Promise((r) => window.setTimeout(r, 2000));
    const [fromStore, fromServer] = await Promise.all([this.store.restore(), this.backend.purchases(), wait]);
    const ids = [...new Set([...fromStore, ...(fromServer ?? []).map((r) => r.product)])].filter((id) => !id.startsWith('refunded:'));
    let n = 0;
    for (const id of ids) if (this.grantProduct(id)) n++;
    const pass = this.restorePass(fromServer ?? []);
    if (pass) {
      n++;
      this.ui.celebrate([{ kicker: 'season pass', icon: PASS_ICON, name: 'premium restored', lines: pass }]);
    }
    const owned = ids.some((id) => entitlementFor(id) !== null && this.ownsProduct(id)) || (this.pass.premium && passBought(fromServer ?? [], this.now()));
    if (n > 0) this.ui.showNotice(`restored ${n} purchase${n === 1 ? '' : 's'}`);
    else if (owned) this.ui.showNotice('all your purchases are here');
    else if (googleAvailable() && !this.googleEmail) this.ui.showNotice('nothing to restore. bought on another phone? sign in with google');
    else this.ui.showNotice('nothing to restore');
    if (this.infoOpen === 'shop') this.openShop();
    else if (this.infoOpen === 'store') this.openStore();
    else if (this.infoOpen === 'pass') this.openPass();
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
  private offline(): boolean {
    return this.backend.online && (!this.backend.reachable || (typeof navigator !== 'undefined' && navigator.onLine === false));
  }

  /** Offline: ask the server for the time now and then (it needs no sign-in), and pick everything up again when it answers. */
  private async recheck(): Promise<void> {
    if (!this.offline() || this.rechecking) return;
    this.rechecking = true;
    try {
      if (!(await this.backend.syncClock())) return;
      this.retime();
      if (!this.backend.userId) await this.signInAndSync();
      else {
        void this.outbox.flush();
        void errorLog.send();
        void this.wallet.refresh().then(() => this.refreshTitle());
      }
    } finally {
      this.rechecking = false;
      this.refreshBar();
    }
  }

  private refreshBar(now = this.now()): void {
    this.ui.setOffline(this.offline());
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
    const r = this.ranked.record(this.mode, score, this.level, this.seed, this.now(), ranked ? this.weekly.id : undefined);
    const promoted = r.rankAfter > r.rankBefore;
    const leagueLines: string[] = [];
    const party: Celebration[] = [];
    let bonus = r.credits;
    if (ranked) {
      this.submitToBoard('ranked', finished);
      this.beatPar = score >= leaguePar(lg.league, target);
      this.payLeagueWeek(this.now()); // a run in a new week: last week's reward first
      const res = lg.record(this.score, target, this.now());
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
    this.payLeagueWeek(this.now());
    const credits = lg.tryPromote(this.upgrades.points(), this.now());
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
      detail:
        lg.top || lg.promotionReady
          ? `par ${formatScore(parNow)} this week`
          : `${lg.lp} / ${LP_PER_DIVISION} lp · about ${runs} run${runs === 1 ? '' : 's'} at par`,
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
    const mine = this.progress.weeklyBest(this.weekly.id);
    const own: [string, string][] = mine > 0 ? [['your best', formatScore(mine)]] : [['no ranked run yet this week', '']];
    if (this.offline()) {
      this.ui.renderBoard(own, "you're offline. the board comes back with a connection");
      return;
    }
    this.ui.renderBoard([], this.backend.online ? 'loading' : '');
    const rows = await this.backend.board(boardQuery(tab, lg.league, this.now()));
    if (!this.backend.online || rows === null) {
      this.ui.renderBoard(
        own,
        !this.backend.online
          ? 'the leaderboards need the server'
          : this.offline()
            ? "you're offline. the board comes back with a connection"
            : "couldn't load the board",
      );
      this.refreshBar();
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
      this.boardNotice(board, res);
    });
  }

  /** "#4 on the endless board" once a run is on its board. */
  private boardNotice(board: BoardId, res: SubmitResult): void {
    if (res.status === 'ok' && res.rank) this.ui.showNotice(`${res.newBest ? 'new best: ' : ''}#${res.rank} on the ${boardName(board)} board`);
    else if (res.status === 'rejected' && import.meta.env.DEV) console.warn(`leaderboard turned the run down: ${res.message}`);
  }

  /** Your own best on a tab, for when the board can't be read. */
  private localBest(id: string): number {
    if (id === 'week') return this.progress.weeklyBest(this.weekly.id);
    if (id === 'daily') return this.challenge.bestOn(this.today.day);
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

  /** Your service record's summary, as others see it when they tap you on a board. */
  private pilotStats(): PilotStats {
    const s = this.progress.stats;
    return {
      rank: this.ranked.rank,
      xp: Math.floor(this.ranked.xp),
      runs: s.runs,
      seconds: Math.floor(s.seconds),
      distance: Math.floor(s.distance),
      bestLevel: s.bestLevel,
      bestChain: s.bestChain,
      nearMisses: s.nearMisses,
      pickups: s.pickups,
      rankedRuns: this.ranked.history.length,
    };
  }

  /** Send your service record's summary to the boards if it's changed since last time. */
  private async syncRecord(): Promise<void> {
    if (!this.backend.online) return;
    const stats = this.pilotStats();
    const key = JSON.stringify(stats);
    if (key === this.recordSent) return;
    if (await this.backend.setRecord(stats)) this.recordSent = key;
  }

  /** A pilot's service record for their board row: rank, lifetime stats and bests. */
  private async pilotCard(pid: string): Promise<PilotCardView | null> {
    const p = await this.backend.pilotRecord(pid);
    if (!p) return null;
    const st = p.stats;
    const rank = Math.max(0, Math.min(RANKS.length - 1, Math.floor(st.rank ?? 0)));
    const n = (v: number | undefined): string => formatScore(v ?? 0);
    const rows: [string, string][] = [];
    if (st.runs !== undefined) {
      const secs = st.seconds ?? 0;
      const hours = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      rows.push(
        ['xp', n(st.xp)],
        ['runs', n(st.runs)],
        ['ranked runs', n(st.rankedRuns)],
        ['time played', hours > 0 ? `${hours}h ${mins}m` : `${mins}m`],
        ['distance', `${((st.distance ?? 0) / 1000).toFixed(1)} km`],
      );
    }
    const best = (board: string, label: string): void => {
      if (p.bests[board]) rows.push([label, formatScore(p.bests[board])]);
    };
    best('ranked', 'best ranked week');
    best('daily', 'best daily challenge');
    best('endless', 'best endless');
    for (const e of ENVIRONMENTS) best(`solo:${e.id}`, `best solo: ${e.name}`);
    if (st.runs !== undefined)
      rows.push(
        ['furthest level', String(st.bestLevel || 1)],
        ['best chain', `x${st.bestChain ?? 0}`],
        ['near misses', n(st.nearMisses)],
        ['pickups', n(st.pickups)],
      );
    const since = p.since ? `since ${new Date(p.since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toLowerCase()}` : '';
    const note = [p.premium ? '◆ premium' : '', since, st.runs === undefined ? 'no stats shared yet' : ''].filter(Boolean).join(' · ');
    return { icon: insignia(rank), rank: st.rank === undefined ? 'rank unknown' : rankName(rank), note, rows };
  }

  /** A board row for the UI, with a picture of the pilot's ship (yours as you have it on now). */
  private boardRow(r: { rank: number; name: string; score: number; you: boolean; premium?: boolean; ship?: ShipLook | null; pid?: string }) {
    const ship = r.you ? this.shipLook() : (r.ship ?? null);
    const pid = r.pid;
    return {
      record: pid ? () => this.pilotCard(pid) : null,
      report: pid && !r.you ? (reason: ReportReason) => this.backend.reportPilot(pid, reason) : null,
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
      const note = !this.backend.online
        ? 'names come with the server'
        : this.offline()
          ? 'names can be changed with a connection'
          : generated
            ? 'pick your pilot name: 3 to 16 letters, numbers, spaces, - or _'
            : '3 to 16 letters, numbers, spaces, - or _. once an hour';
      if (this.infoOpen === 'boards') this.ui.setPilotName(name ?? '', note);
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
    const offlineNote = `you're offline. the boards come back when you're connected.${own.length > 0 ? ' this is your best on this device.' : ''}`;
    if (this.offline()) {
      this.ui.renderLeaderboard(caption, own, offlineNote);
      void this.recheck();
      return;
    }
    this.ui.renderLeaderboard(caption, [], 'loading');
    await Promise.all([this.outbox.flush(), this.syncShip(), this.syncRecord()]); // so a run you just finished, your ship and your record are on the board
    const rows = await this.backend.board(boardQuery(tab, this.leagues.league, this.now()));
    if (seq !== this.boardSeq || this.infoOpen !== 'boards') return; // moved on while it loaded
    this.refreshBar();
    if (rows === null) this.ui.renderLeaderboard(caption, own, this.offline() ? offlineNote : "couldn't load the board. try again in a moment");
    else if (rows.length === 0) this.ui.renderLeaderboard(caption, [], 'nobody yet. fly a run to be first');
    else
      this.ui.renderLeaderboard(
        caption,
        rows.map((r) => this.boardRow(r)),
        '',
      );
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
      this.ui.showNotice("tap again to delete everything. this can't be undone");
      this.deleteTimer = window.setTimeout(() => {
        this.deleteArmed = false;
        if (value) value.textContent = 'delete';
      }, 5000);
      return;
    }
    window.clearTimeout(this.deleteTimer); // a slow delete keeps saying "deleting"
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
        reportError('google link', this.backend.authError || 'unknown error');
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
        reportError('google switch', this.backend.authError || 'unknown error');
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
    const b = rk.bests(this.now());

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
        ['xp in ranked', `1 per ${formatScore(CONFIG.rank.rankedPointsPerXp)} points`],
        ['xp in other modes', `1 per ${formatScore(CONFIG.rank.pointsPerXp)} points`],
        ['xp for a goal', String(CONFIG.rank.goalXp)],
        ['double xp runs left today', String(rk.bonusRunsLeft(this.now()))],
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
    const now = new Date(this.now());
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
    this.preview = { [this.hangar.slot]: id };
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
    } else if (u.by === 'cores' || u.by === 'vault') {
      if (this.wallet.cores < u.cost || (u.by === 'vault' && keyOf(item) !== keyOf(vaultAt(this.now()).item))) return;
      this.confirmCores(u.cost, item.name, () => {
        if (!this.wallet.spendCores(u.cost)) return;
        this.looks.buy(item);
        this.afterBuy([item], `${item.name} bought and on your ship`);
        this.renderHangar(true);
      });
      return;
    } else return;
    this.looks.buy(item);
    this.afterBuy([item], `${item.name} bought and on your ship`);
    this.renderHangar(true);
  }

  // --- goals ---------------------------------------------------------------------------------------

  /** What finishing a goal gives, in words. */
  private goalRewardText(a: Achievement): string {
    const looks = rewardKeys(a.id)
      .map((k) => byKey(k))
      .filter((l): l is LookItem => !!l);
    return [`+${a.credits.toLocaleString('en-US')} credits`, ...looks.map((l) => `${l.name} ${SLOT_NAMES[l.slot]}`)].join(' · ');
  }

  /** The goals screen's three tabs. */
  private renderGoals(): void {
    const now = this.now();
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
        reward: rewardParts(r)
          .map((p) => p.replace(/^\+/, ''))
          .join(', '),
        state: i < claimedUpTo ? 'claimed' : i === step && due >= 0 ? 'today' : 'next',
      })),
      claim: due >= 0 ? { text: `claim day ${step + 1}`, enabled: true } : { text: `next reward in ${formatWait(untilTomorrow(now))}`, enabled: false },
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      rows: [
        ...taskRows(qs, 'q', Q.passXp).map((r) =>
          r.state === 'open' && this.daily.canReroll(day) && this.ads.offers('rerollQuest')
            ? { ...r, reroll: `swap for another goal · ${this.ads.label()}` }
            : r,
        ),
        bonusRow('qall', 'claim all three', Q.allDoneCores, this.daily.bonusReady, this.daily.bonusClaimed, qs),
      ],
    });
    // Weekly.
    const wg = this.weeklyGoals.goals;
    const weekEnd = Date.parse(`${weekKey(now)}T00:00:00Z`) + 7 * 86_400_000;
    this.goalsUi.renderWeekly(`new in ${formatWait(weekEnd - now)}`, [
      ...taskRows(wg, 'w', W.passXp),
      bonusRow('wall', 'claim all five', W.allDoneCores, this.weeklyGoals.bonusReady, this.weeklyGoals.bonusClaimed, wg),
    ]);
    // Achievements.
    const snap = this.snapshot();
    const groups = (Object.keys(GROUP_NAMES) as Group[]).map((g) => ({
      name: GROUP_NAMES[g],
      rows: ACHIEVEMENTS.filter((a) => a.group === g).map((a): TaskRow => {
        const p = progressOn(a, snap);
        const claimed = this.goalLog.has(a.id);
        return {
          id: `a:${a.id}`,
          name: a.name,
          text: a.text,
          progress: `${formatScore(p.have)} / ${formatScore(p.target)}`,
          fraction: p.have / p.target,
          reward: `${this.goalRewardText(a)} · +${CONFIG.rank.goalXp} xp`,
          state: claimed ? 'claimed' : p.done ? 'claim' : 'open',
        };
      }),
    }));
    const doneCount = ACHIEVEMENTS.filter((a) => progressOn(a, snap).done).length;
    this.goalsUi.renderAchievements(
      `${doneCount} of ${ACHIEVEMENTS.length} done. each pays credits and rank xp, and unlocks a look to wear. they count everything you've done, from the start.`,
      groups,
    );
    this.goalsUi.setTabNews({
      daily: due >= 0 || this.daily.claimable > 0,
      weekly: this.weeklyGoals.claimable > 0,
      achievements: this.achievementsToClaim() > 0,
    });
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
      // Named for the day or week the goals belong to (not the clock now: it may have turned since), so the server pays it once.
      const source = id === 'qall' ? `goals:${this.daily.day}` : `weekly:${this.weeklyGoals.week}`;
      const cores = id === 'qall' ? this.daily.claimBonus() : this.weeklyGoals.claimBonus();
      if (cores <= 0) return;
      this.ui.celebrate([
        { kicker: id === 'qall' ? "today's goals" : "this week's goals", icon: GOAL_ICON, name: 'all done', lines: this.grant({ cores }, source) },
      ]);
    } else if (id.startsWith('a:')) {
      const a = achievement(id.slice(2));
      if (!a || this.goalLog.has(a.id) || !progressOn(a, this.snapshot()).done) return;
      this.goalLog.add(a.id);
      this.goalLog.save();
      name = a.name;
      const promo = this.ranked.addXp(CONFIG.rank.goalXp);
      lines = [...this.grant({ credits: a.credits + promo.credits }), `+${CONFIG.rank.goalXp} xp`];
      if (promo.rankAfter > promo.rankBefore) {
        this.ui.celebrate([
          {
            kicker: 'promoted',
            icon: insignia(promo.rankAfter),
            name: rankName(promo.rankAfter),
            lines: mergeCredits(Array.from({ length: promo.rankAfter - promo.rankBefore }, (_, k) => this.rankGives(promo.rankBefore + 1 + k)).flat()),
            color: '#d4a63a',
          },
        ]);
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
        party.push({
          kicker: `${fresh.length} goals complete`,
          icon: GOAL_ICON,
          name: `${fresh.length} goals`,
          lines: [...fresh.slice(0, 5).map((a) => a.name), 'claim them in goals'],
        });
      } else {
        for (const a of fresh)
          party.push({ kicker: 'goal complete', icon: GOAL_ICON, name: a.name, lines: [a.text, ...this.goalRewardText(a).split(' · '), 'claim it in goals'] });
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
    this.turnWeek(this.now());
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
    if (f && !this.open(f)) {
      this.ui.showNotice(nextStageText(this.progress.stats.validRuns, this.onboarding.done) || 'not open yet');
      return;
    }
    if (name === 'endless') this.startEndless();
    else if (name === 'zen') this.startZen();
    else if (name === 'challenge') this.startDaily();
    else if (name === 'solo') this.openSolo();
    else if (name === 'record') this.openRecord();
    else if (name === 'goals') this.openGoals();
    else if (name === 'hangar') this.openHangar();
    else if (name === 'shop') {
      this.shopPick = -1;
      this.preview = null;
      this.openShop();
    } else if (name === 'shop-cores') this.openStore(null);
    else if (name === 'pass') this.openPass(null);
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

  /** Double-tap and hold boosts: the setting, and never with tap-sides steering (quick taps there are steering). */
  private doubleTapOn(): boolean {
    return this.settings.doubleTapBoost && this.settings.touch !== 1;
  }

  /** How the player steers now (keys: a computer, with the keys chosen over the mouse). */
  private controlsNow(): ControlId {
    if (this.settings.tilt) return 'tilt';
    if (this.settings.touch === 1) return 'sides';
    return !hasTouch() && (this.onboarding.keys ?? true) ? 'keys' : 'drag';
  }

  /** The ways to steer this device offers (tilt where the phone can tell its lean). */
  private controlChoices(): ControlId[] {
    return controlChoices({ touch: hasTouch(), tilt: typeof DeviceOrientationEvent !== 'undefined' });
  }

  /** The welcome screen, on the step onboarding is at (choosing controls, "how did that feel?", or dressing the ship). */
  private openWelcome(): void {
    const step = this.onboarding.step === 'dress' ? 'dress' : this.onboarding.step === 'feel' ? 'feel' : 'controls';
    if (!hasTouch() && this.settings.tilt) {
      this.settings.tilt = false; // no tilt without a phone
      void saveSettings(this.settings);
    }
    const c = this.controlsNow();
    const used = this.feelUsed ?? c;
    const cards = this.controlChoices().map((id) => ({ id, on: id === c, used: step === 'feel' && id === used }));
    const name = (id: ControlId) => CONTROL_CARDS[id].name;
    const feel =
      step === 'feel'
        ? {
            note:
              c === used
                ? `you flew with ${name(used)}. keep it, or tap another card to try it for ${TRIAL_SECONDS} s.`
                : `${name(c)} it is. try it for ${TRIAL_SECONDS} s first, or keep it.`,
            tryLabel: c === used ? null : `try ${name(c)} · ${TRIAL_SECONDS} s`,
            keepLabel: `keep ${name(c)}`,
          }
        : null;
    const eq = this.looks.equipped;
    const chips = (slot: 'hull' | 'paint' | 'engine'): [string, string, boolean][] =>
      STARTER[slot].map((key) => [key, byKey(key)?.name ?? key, `${slot}:${eq[slot]}` === key]);
    this.ui.renderWelcome(step, cards, { hull: chips('hull'), paint: chips('paint'), engine: chips('engine') }, feel);
    const google = document.getElementById('welcome-google');
    if (google) google.hidden = !(googleAvailable() && this.backend.online);
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('welcome');
  }

  /** A control card: saved to settings straight away. */
  private chooseControls(id: string): void {
    if (!(this.controlChoices() as string[]).includes(id)) return;
    this.settings.tilt = id === 'tilt';
    this.settings.touch = id === 'sides' ? 1 : 0;
    if (!hasTouch()) this.onboarding.setKeys(id === 'keys');
    void saveSettings(this.settings);
    this.applySettings();
    this.haptics.pickup();
    this.openWelcome();
  }

  /** The practice run: a fixed course you can't fail, one lesson at a time. */
  private startPractice(): void {
    this.onboarding.go('practice');
    this.beginPractice('lessons');
  }

  /** "try another": a short steering-only run with the controls just picked. */
  private startTrial(): void {
    this.onboarding.go('try');
    this.beginPractice('trial');
  }

  private beginPractice(kind: 'lessons' | 'trial'): void {
    this.ui.showGuide(null);
    this.infoOpen = null;
    this.practiceNext = true;
    this.beginRun(0, PRACTICE_SEED, 'endless');
    this.ui.hideBanner(); // the lesson card has the top band
    this.recorded = true; // nothing from it counts: no stats, no bests, no boards
    this.unlockable = false; // ...and no unlocks
    this.practice = { kind, lesson: 0, s: freshLesson(), control: this.controlsNow(), learned: [], item: null, coming: false, queue: [], confirmT: 0 };
    this.teach.show(true);
    this.showLesson();
  }

  /** Put the lesson (or the trial) up: the card in the top band and its indicator. */
  private showLesson(): void {
    const p = this.practice;
    if (!p) return;
    // Steering is worded for the controls chosen (keys only if the keys were); boost for the device.
    const keys = { keys: !hasTouch(), doubleTap: this.doubleTapOn(), side: this.boostSide() };
    const steerHow = { ...keys, keys: false };
    if (p.kind === 'trial') {
      this.teach.setStep(`trying ${CONTROL_CARDS[p.control].name} · ${Math.max(0, Math.ceil(TRIAL_SECONDS - p.s.t))} s`, 0, 0);
      this.teach.setItem(null);
      this.teach.setText(lessonText('steer', p.control, steerHow));
      this.teach.point(null);
      return;
    }
    const lesson = LESSONS[p.lesson];
    if (lesson === 'boost') this.boostMeter = 1; // a full meter, so boost works straight away
    if (lesson === 'pickup') p.queue = ['pickup'];
    if (lesson === 'power') p.queue = [0, 1, 2];
    p.item = null;
    this.teach.setStep(`practice · ${p.lesson + 1} of ${LESSONS.length}`, p.lesson, LESSONS.length);
    this.teach.setItem(null);
    this.teach.setText(lessonText(lesson, p.control, lesson === 'boost' ? keys : steerHow));
    this.teach.point(lesson === 'nearMiss' ? 'score' : lesson === 'boost' ? 'boost' : null);
    this.teach.setArt(lesson === 'steer' ? p.control : null);
    this.teach.setMarks([]);
  }

  /** Has the player done what the lesson asks? Then the next, and after the last, the recap and "how did that feel?". */
  private practiceTick(dt: number): void {
    const p = this.practice!;
    const s = p.s;
    s.t += dt;
    const steer = this.input.steering();
    if (steer < -0.35) s.left += dt;
    if (steer > 0.35) s.right += dt;
    if (this.boosting) s.boostT += dt;
    if (p.kind === 'trial') {
      this.teach.setArt(p.control, this.laneDir());
      this.showLesson(); // the countdown
      if (s.t >= TRIAL_SECONDS) this.endTrial();
      return;
    }
    const lesson: Lesson = LESSONS[p.lesson];
    if (lesson === 'steer') this.teach.setArt(p.control, this.laneDir());
    if (lesson === 'pickup' || lesson === 'power') this.runItems(dt);
    this.updateMarks(lesson);
    // An item's "on" line stays up for a moment before the lesson moves on.
    if (!lessonOver(lesson, s) || p.confirmT > 0) return;
    if (lessonMet(lesson, s)) {
      p.learned.push(lesson);
      this.sound.pickup();
      this.haptics.pickup();
    }
    p.lesson++;
    p.s = freshLesson();
    if (p.lesson < LESSONS.length) {
      this.showLesson();
      return;
    }
    this.finishPractice();
  }

  /** Which way the steering diagram leans: towards the safe lane a little ahead (0 when it's straight on). */
  private laneDir(): number {
    const off = this.world.laneOffset(26);
    return off === null || Math.abs(off) < 0.8 ? 0 : Math.sign(off);
  }

  /**
   * The pickup and power-up lessons: place the next one on the lane ahead, put
   * its card up as it comes, say what it did once it's picked up, and place it
   * again if it's missed.
   */
  private runItems(dt: number): void {
    const p = this.practice!;
    if (p.confirmT > 0) {
      p.confirmT -= dt;
      if (p.confirmT > 0) return;
      p.item = null;
    }
    if (p.item === null) {
      if (p.queue.length === 0) return;
      const next = p.queue[0];
      this.world.place(next, ITEM_AHEAD);
      p.item = next;
      p.coming = true;
      this.teach.setItem(next === 'pickup' ? 'pickup' : powerItem(next));
      this.teach.setText(itemCard(next === 'pickup' ? 'pickup' : powerItem(next)).does);
      return;
    }
    if (p.coming && !this.world.itemAhead(p.item, -2, ITEM_AHEAD + 40)) {
      // Flown past: another one.
      this.world.place(p.item, ITEM_AHEAD);
      this.teach.setText(`missed it. here's another. ${itemCard(p.item === 'pickup' ? 'pickup' : powerItem(p.item)).does}`);
    }
  }

  /** The practice run saw a pickup (or power-up) collected: say what it did. */
  private practiceGot(item: 'pickup' | PowerKind): void {
    const p = this.practice;
    if (!p || p.kind === 'trial' || p.item !== item || !p.coming) return;
    p.coming = false;
    p.queue.shift();
    p.confirmT = CONFIRM_SECONDS;
    const id = item === 'pickup' ? 'pickup' : powerItem(item);
    this.teach.setText(itemCard(id).on);
    if (item === 'pickup') p.s.pickups++;
    else {
      p.s.powers++;
      // The magnet pulls in pickups: a few to the side of the lane show it.
      if (item === 1) for (const [ahead, side] of MAGNET_DEMO) this.world.place('pickup', ahead, side);
    }
  }

  /** Markers on the world: the next obstacle and the gap, or the item coming up. */
  private updateMarks(lesson: Lesson): void {
    const p = this.practice!;
    const marks: Mark[] = [];
    if (lesson === 'avoid') {
      const o = this.world.obstacleAhead(12, 70, 6);
      if (o) {
        const a = this.toScreen(o.x, o.y, o.z);
        const g = this.toScreen(o.gap, 1.4, o.z);
        if (a) marks.push({ ...a, label: 'obstacle', color: '' });
        if (g && Math.abs(o.gap - o.x) > 1.2) marks.push({ ...g, label: 'gap', color: '' });
      }
    } else if ((lesson === 'pickup' || lesson === 'power') && p.item !== null && p.coming) {
      const it = this.world.itemAhead(p.item, 6, ITEM_AHEAD + 40);
      const id = p.item === 'pickup' ? 'pickup' : powerItem(p.item);
      const at = it && this.toScreen(it.x, it.y + 0.7, it.z);
      if (at) marks.push({ ...at, label: itemCard(id).name, color: itemCard(id).color });
    }
    this.teach.setMarks(marks);
  }

  /** A point in the scene, in pixels over the play area; null if it's behind the camera or off screen. */
  private toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.markV.set(x, y, z).project(this.stage.camera);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return null;
    const canvas = this.stage.renderer.domElement;
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }

  /** The last lesson done: the recap of the pickups and power-ups, then "how did that feel?". */
  private finishPractice(): void {
    const p = this.practice!;
    // The walkthrough needn't say any of it again (a lesson only timed out still showed what it's about).
    this.hints.learned(LESSONS);
    this.feelUsed = p.control;
    this.endPractice();
    this.onboarding.go('finished');
    this.openWelcome();
    this.ui.showGuide('next');
  }

  /** The trial's time is up (or skipped): back to "how did that feel?". */
  private endTrial(): void {
    const p = this.practice!;
    this.feelUsed = p.control;
    this.endPractice();
    this.onboarding.go('finished');
    this.openWelcome();
  }

  /** Off the practice course and its indicators, back to the title scene. */
  private endPractice(): void {
    this.teach.show(false);
    this.toMainMenu();
    this.practice = null;
  }

  /** "skip" during the practice run ends the tutorial; during a trial it goes back to "how did that feel?". */
  private skipPractice(): void {
    if (this.practice?.kind === 'trial') this.endTrial();
    else this.finishOnboarding();
  }

  /** "keep": on to dressing the ship. */
  private keepControls(): void {
    this.feelUsed = null;
    this.onboarding.go('keep');
    this.openWelcome();
  }

  /** The recap's button: closes it (over "how did that feel?" or settings). */
  private closeGuide(): void {
    this.ui.showGuide(null);
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
      // Skipped part way: the tips still cover what the practice run didn't get to.
      this.hints.learned(this.practice.learned);
      this.endPractice();
    }
    this.ui.showGuide(null);
    this.feelUsed = null;
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
    if (this.nameOk || this.nameLater || !this.backend.online || !this.onboarding.done || !this.open('leaderboard')) return;
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
    this.nameWords ??= import('../platform/nameWords.json').then((m) => new Set(m.default as string[]));
    const [{ nameBlocked }, words] = await Promise.all([import('../platform/nameFilter'), this.nameWords]);
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
    if (this.open('daily')) {
      // Today's challenge: your best (or a new course), the time left, the streak in the kicker.
      const best = this.challenge.bestOn(this.today.day);
      const streak = this.challenge.streakOn(this.today.day);
      cards.push({
        id: 'challenge',
        kicker: streak > 0 ? `daily · ${streak} day${streak === 1 ? '' : 's'}` : 'daily challenge',
        title: best > 0 ? `best ${formatScore(best)}` : 'new course',
        sub: `${formatWait(untilTomorrow(now))} left`,
        hot: !this.challenge.playedOn(this.today.day),
      });
    }
    const quests = this.daily.quests;
    const done = quests.filter((q) => q.done).length;
    const toClaim = this.goalsToClaim();
    cards.push({
      id: 'daily',
      kicker: "today's goals",
      title: toClaim > 0 ? `${toClaim} to claim` : done >= quests.length ? 'all done' : `${done} of ${quests.length} done`,
      fraction: quests.length ? done / quests.length : 0,
      hot: toClaim > 0,
    });
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
    this.ui.setAccent(
      this.settings.contrast ? (dark ? '#ffffff' : '#2b2824') : dark ? colour.dark : colour.accent,
      !this.settings.contrast && colour === RANK_COLOURS[RANK_COLOURS.length - 1],
    );
    const i = this.ranked.rank;
    this.applyLooks(); // the wing decal follows your rank and league
    const lg = this.leagues;
    this.ui.setTitleLeague(emblem(lg.league, lg.division), `${leagueName(lg.league, lg.division)} · ${lg.lp} lp`, lg.lp / LP_PER_DIVISION);
    const next = RANKS[i + 1];
    this.ui.setTitleRank(insignia(i), rankName(i), next ? `${formatScore(xpToRank(this.ranked.xp, i + 1))} xp to ${rankName(i + 1)}` : 'the top rank');
    const wb = this.progress.weeklyBest(this.weekly.id);
    const now = this.now();
    const runs = this.progress.stats.validRuns;
    if (this.open('ranked')) this.ui.setPrimary('ranked', wb > 0 ? `your best this week ${formatScore(wb)}` : 'the same run for everyone, all week');
    else this.ui.setPrimary('fly', this.progress.endlessBest > 0 ? `endless · best ${formatScore(this.progress.endlessBest)}` : 'endless: every area in turn');
    this.ui.setFeatures((f) =>
      f === 'endless' || f === 'zen' || f === 'league'
        ? this.open('ranked')
        : f === 'boards'
          ? this.open('leaderboard')
          : f === 'solo' || f === 'shop' || f === 'record'
            ? this.open(f)
            : true,
    );
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
      ['best today (daily)', formatScore(this.challenge.bestOn(this.today.day))],
      ['daily streak', `${this.challenge.streakOn(this.today.day)} (longest ${this.challenge.longest})`],
      ['best endless', formatScore(this.progress.endlessBest)],
      ...ENVIRONMENTS.map((e): [string, string] => [`best solo: ${e.name}`, formatScore(this.progress.envBest[e.id] ?? 0)]),
      ['furthest level', String(s.bestLevel || 1)],
      ['best chain', `x${s.bestChain}`],
      ['near misses', formatScore(s.nearMisses)],
      ['pickups', formatScore(s.pickups)],
      ['crash most in', worst ? `${worst} (${s.crashes[worst]})` : '-'],
    ]);
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
    else if (this.ui.guideOpen) this.closeGuide();
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
      if (this.state === 'title' && !this.settingsOpen && !this.infoOpen) this.startPrimary();
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
    else if (action === 'delete') void this.deleteAccount();
    else if (action === 'google') void this.keepWithGoogle(false);
    else if (action === 'google-welcome') void this.keepWithGoogle(true);
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
      this.openWelcome();
    } else if (action === 'guide') this.ui.showGuide('got it');
    else if (action === 'whats-new') this.showWhatsNew();
    else if (action === 'menu') {
      const practising = this.practice;
      this.toMainMenu();
      if (practising) {
        // Left the practice run: back to the start of onboarding (a trial: back to "how did that feel?").
        if (practising.kind === 'trial') this.feelUsed = practising.control;
        this.onboarding.go('quit');
        this.openWelcome();
      }
    } else if (action === 'share') void this.share();
    else if (action === 'details') this.ui.showDetails(!this.ui.detailsOpen);
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
    if (this.infoOpen === 'store' && this.storeFrom === 'shop') {
      this.storeFrom = null;
      this.openShop();
      return;
    }
    if (this.infoOpen === 'pass' && this.passFrom === 'store') {
      this.passFrom = null;
      this.openStore();
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
    if (key === 'reminders' && this.settings.reminders) void this.turnOnReminders();
    else if (key === 'reminders' || key === 'reminderTime') void this.planReminders();
  };

  /** Turn reminders on: Android asks for the permission now (and only now). Off again if it's refused. */
  private async turnOnReminders(): Promise<void> {
    void storage.set(REMINDERS_OFFERED_KEY, '1'); // never offered after this
    if (!(await askPermission())) {
      this.settings.reminders = false;
      this.ui.renderSettings(this.settings);
      void saveSettings(this.settings);
      this.ui.showNotice('notifications are off for endless space. turn them on in android settings first');
      return;
    }
    this.settings.reminders = true;
    this.ui.renderSettings(this.settings);
    void saveSettings(this.settings);
    const [h, m] = REMINDER_TIMES[this.settings.reminderTime];
    this.ui.showNotice(`reminders on: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}, once a day at most`);
    await this.planReminders();
  }

  /** Plan the week's reminders again (or cancel them all, when they're off). */
  private async planReminders(): Promise<void> {
    if (!remindersAvailable() || !this.economyLoaded || !this.settingsLoaded) return;
    if (!this.settings.reminders) return scheduleReminders([]);
    const day = dayKey(this.now());
    const dailyOpen = this.open('daily');
    const [h, m] = REMINDER_TIMES[this.settings.reminderTime] ?? REMINDER_TIMES[3];
    await scheduleReminders(
      planReminders(Date.now(), h, m, {
        rankedOpen: this.open('ranked'),
        dailyOpen,
        doneDay: (dailyOpen ? this.challenge.playedOn(day) : this.daily.loginDue(day) < 0) ? day : null,
      }),
    );
  }

  /** Once, gently, after the 5th valid run: would they like a daily reminder? On the title, with nothing else up. */
  private async offerReminders(): Promise<void> {
    if (this.reminderOfferChecked || !this.settingsLoaded || !remindersAvailable() || this.settings.reminders || this.progress.stats.validRuns < 5) return;
    if (this.state !== 'title' || this.infoOpen || this.settingsOpen || this.econ.offerOpen || this.ui.celebrating || this.exitAsking) return;
    this.reminderOfferChecked = true;
    if ((await storage.get(REMINDERS_OFFERED_KEY)) !== null) return;
    void storage.set(REMINDERS_OFFERED_KEY, '1');
    const [h, m] = REMINDER_TIMES[this.settings.reminderTime];
    this.econ.offer(
      {
        kicker: '',
        name: 'a daily reminder?',
        lines: [
          `a nudge at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} when there's something new to fly. once a day at most`,
          'settings can change the time or turn it off',
        ],
        yes: 'remind me',
        yesEnabled: true,
        no: 'no thanks',
        seconds: 0,
      },
      () => {
        this.settings.reminders = true;
        void this.turnOnReminders();
      },
      () => undefined,
    );
  }

  private applySettings(): void {
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
    this.refreshTitle(); // the rank colour has a light and a dark version
    this.ui.renderSettings(s);
  }

  /** Where the boost button sits: the setting, mirrored for the left hand (right and left swap; the middle stays). */
  private boostSide(): (typeof BOOST_SIDES)[number] {
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
    this.refreshAccount();
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
  private toMainMenu(): void {
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
    this.refreshTitle();
    this.lastTime = performance.now();
    void this.askName();
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
    if (this.practice) this.practiceTick(dt);
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
      if (this.practice) this.practiceGot('pickup');
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
    this.refreshTitle();
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
    this.refreshTitle();
  }

  /** The daily run as it ended: today's best and the streak, and the streak's reward on a new day. */
  private recordDaily(finished: boolean): { best: number; isNew: boolean } {
    const d = this.dailyRunNow!;
    const counts = finished || this.runTime >= CONFIG.daily.countsAfter;
    const r = this.challenge.record(d.day, this.score, counts);
    void this.planReminders(); // today's done: no reminder today
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
      this.practiceGot(kind); // the lesson card says it
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
          this.offerRevive();
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
