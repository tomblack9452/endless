import { applyAtmosphere } from './atmosphere';
import { type AudioState, Sound } from './audio/sound';
import type { MusicId } from './audio/music';
import { createBlockTextures } from './blockTextures';
import { CONFIG, PALETTES } from './config';
import { lateralSpeedAt, speedAt } from './difficulty';
import { Input } from './input';
import { LivePalette } from './palette';
import { Player, shipGeometry } from './player';
import { Stage } from './renderer';
import { Sky } from './sky';
import { SpeedLines } from './speedLines';
import { Trail } from './trail';
import { cycle, DEFAULT_SETTINGS, LEVEL_GAIN, loadSettings, saveSettings, type SettingKey, STEERING_RANGE, TEXT_SCALE, TILT_GAIN } from './settings';
import { EVENT_NOTICE, Events } from './events';
import { Weather } from './weather';
import { Ghost } from './ghost';
import { Cosmetics, describe } from './cosmetics';
import { Haptics } from './haptics';
import { Hints } from './hints';
import { Missions, type RunMetrics } from './missions';
import { Progress } from './progress';
import { creditsFor, insignia, par, promotionBonus, Ranked, rankName, RANKS, type RunMode, xpToRank } from './ranks';
import { Wallet } from './wallet';
import { Daily, questText } from './economy/daily';
import { Pass, premiumReward, freeReward, runXp, seasonAt } from './economy/pass';
import { type Reward, rewardLook, rewardParts, rewardText } from './economy/reward';
import { shopFor } from './economy/shop';
import { Tickets } from './economy/tickets';
import { dayKey, formatWait, untilTomorrow } from './economy/time';
import { EconomyView } from './economy/view';
import { createBackend } from './server/backend';
import { CloudSave } from './server/sync';
import { shareCard } from './share';
import { createStore, type ProductId, type StoreProduct } from './store/store';
import { storage } from './storage';
import { fxDistance, fxTime } from './fx';
import { type Course, COURSES, courseLength, type Environment, ENVIRONMENTS, type WeeklyRun, weeklyRun } from './courses';
import { DIVISIONS, divisionReward, emblem, LEAGUES, leagueName, leaguePar, Leagues, LP_PER_DIVISION, weekKey } from './leagues';
import { find, itemsIn, LOOKS, Looks, type Owner, type Slot, SLOT_NAMES, SLOTS, unlockText } from './looks';
import type { Fin, Marking } from './looks';
import type { ShipId } from './cosmetics';
import { MAX_TIER, type ShipStats, STANDARD, SYSTEMS, type SystemId, TIER_COST, TIER_LEAGUE, Upgrades } from './upgrades';
import { newSeed } from './rng';
import { loadNumber } from './storage';
import { type Celebration, formatScore, type LookRow, type ProgressView, type RankResultView, UI } from './ui';
import type { RoomId } from './interior';
import { biomeForLevel, type PowerKind, themeForLevel, themeName, World } from './world';
import { tintBiome } from './biomes';
import { terrain } from './terrain';

type State = 'title' | 'playing' | 'paused' | 'countdown' | 'crashed' | 'finished';

const DEG = Math.PI / 180;
const PATH_STEP = 4;
const OWNED_KEY = 'endless.purchases';

type InfoScreen = 'stats' | 'missions' | 'hangar' | 'record' | 'solo' | 'league' | 'shop' | 'pass' | 'daily';

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
/** A season pass badge. */
const PASS_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 6l22 10v16c0 13-9 22-22 26C19 54 10 45 10 32V16z"/><path d="M32 20l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z"/></svg>';

export class Game {
  private readonly basePalette = new LivePalette(); // the level's palette
  private readonly palette = new LivePalette(); // after time of day, read by materials
  // Palette cross-fade between theme loops.
  private readonly fadeFrom = new LivePalette();
  private readonly fadeTo = new LivePalette();
  private fadeT = 1; // 1 = done
  private paletteLoop = 0;
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
  private readonly tickets = new Tickets();
  private readonly daily = new Daily();
  private readonly pass = new Pass();
  private readonly econ = new EconomyView();
  private readonly backend = createBackend();
  private readonly cloud = new CloudSave(this.backend);
  private readonly store = createStore();
  private storeProducts: StoreProduct[] = [];
  /** Shop rows for real-money products, in the order shown ('dev' adds cores in the dev build). */
  private shopPacks: (ProductId | 'dev' | 'restore')[] = [];
  /** One-time products already bought. */
  private ownedProducts = new Set<string>();
  /** The shop card tapped (on the ship to try), or -1. */
  private shopPick = -1;
  // Ranked: the ship's sideways position every PATH_STEP units (the leaderboard check, and later the ghost).
  private path: number[] = [];
  private pathTimes: number[] = [];
  private pathNext = 0;
  private economyTimer = 0;
  private showroomTime = 0; // turns the showroom camera
  // Revive (not in ranked): once a run. While the offer is up the run isn't recorded yet.
  private revived = false;
  private revivePending = false;
  private reviveAsked = false;
  private countdownT = 0; // seconds of 3-2-1 left
  // A set level (courses.ts) being played, if any.
  private course: Course | null = null;
  private sectionIdx = -1;
  private hitThisRun = false; // anything hit, even a shield save (course stars)
  private beatPar = false; // ranked: scored at least the league par (missions)
  private finishedRun = false; // crossed a finish line (missions)
  private finishMs = 0;
  private readonly upgrades = new Upgrades();
  private readonly leagues = new Leagues();
  /** This run's ship systems (your switched-on upgrades). */
  private ship: ShipStats = STANDARD;
  private hangarTab: 'ship' | 'upgrades' = 'ship';
  private readonly looks = new Looks();
  /** A locked look being tried on in the hangar (not yet owned). */
  private preview: { slot: Slot; id: string } | null = null;
  private pickupCount = 0;
  private recorded = false; // this run's stats are saved
  private assisted = false; // assist mode was on at some point this run
  private readonly cosmetics = new Cosmetics();
  private readonly rankedMissions = new Missions('ranked', 'endless.missions.ranked');
  private readonly soloMissions = new Missions('solo', 'endless.missions');
  /** Which info screen is open from the title (stats, missions, hangar), if any. */
  private infoOpen: InfoScreen | null = null;
  // Run metrics for missions.
  private boostSeconds = 0;
  private boosted = false;
  private roomsEntered = 0;
  private missionTimer = 0;
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
  readonly dev = { invincible: false, fullBoost: false, autopilot: false, unlockedAll: false };

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
    this.basePalette.set(PALETTES[0]);
    this.palette.set(PALETTES[0]);
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
      if (this.state === 'title') this.startRanked();
    });
    this.ui.titleRank.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleRank.addEventListener('click', () => this.openRecord());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => this.pause());

    this.ui.bindCelebration();
    this.ui.bindTitleLinks(this.onTitleLink);
    const now = Date.now();
    // Looks load once; a login reward can give one, so it waits for them.
    const looksReady = Promise.all([this.cosmetics.load(), this.looks.load()]);
    void Promise.all([
      this.progress.load(),
      this.ranked.load(),
      this.wallet.load(),
      this.leagues.load(),
      this.upgrades.load(),
      this.tickets.load(now),
      this.daily.load(dayKey(now)),
      this.pass.load(now),
      looksReady,
    ]).then(() => {
      // A new week: pay last week's league reward.
      const weekly = this.leagues.rollWeek();
      if (weekly > 0) {
        this.wallet.add(weekly);
        this.ui.showNotice(`weekly league reward +${formatScore(weekly)} credits`);
      }
      this.refreshTitle();
      this.claimLogin();
      void this.connect();
    });
    this.econ.bindShop(this.onShopOffer, this.onShopBuy, this.onShopTicket, this.onShopCores);
    this.econ.bindPass(this.onPassPremium, () => void this.buyProduct('season_pass'));
    this.econ.bindDaily(() => this.claimLogin());
    this.ui.titleLeague.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.titleLeague.addEventListener('click', () => this.openLeague());
    this.ui.bindLooks(this.onLookRow, this.onLookBuy);
    this.ui.bindSolo((i) => this.startCourse(i), (i) => this.startSolo(i));
    this.ui.bindHangarTabs((tab) => {
      this.hangarTab = tab;
      this.openHangar();
    });
    this.ui.bindUpgrades(this.onBuyUpgrade, (id) => {
      this.upgrades.toggle(id as SystemId);
      this.haptics.pickup();
      this.openHangar();
    });
    void this.rankedMissions.load();
    void this.soloMissions.load();
    void looksReady.then(() => {
      // Saves from before the hangar had looks: carry the mission hull across.
      if (this.looks.equipped.hull === 'dart' && this.cosmetics.ship !== 'dart') this.looks.equip('hull', this.cosmetics.ship);
      this.applyCosmetics();
    });
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
    this.path = [];
    this.pathTimes = [];
    this.pathNext = 0;
    this.ghost.start(mode === 'ranked' ? this.weekly.id : null, this.settings.ghost);
    this.ui.showShare(false);
    this.preview = null;
    this.seed = seed;
    this.mode = mode;
    this.course = course;
    this.environment = env;
    this.world.setCourse(course);
    this.world.setEnvironment(env);
    this.sectionIdx = -1;
    this.hitThisRun = false;
    this.beatPar = false;
    this.finishedRun = false;
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
    this.boostSeconds = this.roomsEntered = this.missionTimer = 0;
    this.boosted = false;
    this.infoOpen = null;
    this.paletteLoop = 0;
    this.fadeT = 1;
    this.applyCosmetics();
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
    this.progress.reachedLevel(level);
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
    this.ui.setGameOverMissions(this.poolMissions().lines());
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
    this.progress.recordRun(
      {
        score: this.assisted ? 0 : this.score,
        level: this.level,
        distance: this.world.distance,
        seconds: this.runTime,
        nearMisses: this.nearMissCount,
        bestChain: this.bestChain,
        pickups: this.pickupCount,
        crashedIn,
      },
      false,
    );
    for (const done of this.poolMissions().endRun(this.metrics())) this.missionDone(done);
    const lines: string[] = [];
    // Ranked pays full rate; solo, set levels and endless half.
    let credits = creditsFor(this.assisted ? 0 : this.score, this.mode === 'ranked');
    if (this.mode === 'ranked') credits += this.recordRanked(this.state === 'finished');
    else {
      this.ui.setGameOverRank(null);
      if (this.assisted) lines.push('assist mode. not counted as a best');
    }
    this.wallet.add(credits);
    lines.push(`+${formatScore(credits)} credits`);
    this.econ.setOverRewards(this.runRewards());
    this.refreshTitle();
    return lines.join(' · ');
  }

  /** Daily quests and season pass XP for the run just recorded; lines for the end screen. */
  private runRewards(): string[] {
    const now = Date.now();
    const score = this.assisted ? 0 : this.score;
    const out: string[] = [];
    const q = this.daily.recordRun(dayKey(now), {
      ranked: this.mode === 'ranked',
      score,
      level: this.level,
      nearMisses: this.nearMissCount,
      pickups: this.pickupCount,
      boostSeconds: this.boostSeconds,
      rooms: this.roomsEntered,
    });
    let xp = runXp(score);
    for (const done of q.done) {
      this.wallet.add(done.credits);
      xp += CONFIG.economy.quests.passXp;
      out.push(`quest done: ${questText(done)} · +${formatScore(done.credits)} credits`);
    }
    if (q.allDone > 0) {
      this.wallet.addCores(q.allDone);
      out.push(`all daily quests done · +${q.allDone} cores`);
    }
    const before = this.pass.tier;
    const paid = this.pass.addXp(now, xp);
    for (const r of paid) this.grant(r);
    const tier = this.pass.tier;
    if (tier > before) out.push(`season pass: tier ${tier} reached`);
    else if (xp > 0) out.push(`season pass +${xp} xp · tier ${tier}`);
    if (paid.length > 0) out.push(paid.map(rewardText).join(' · '));
    return out;
  }

  /** Pay a reward into the wallet, tickets or looks; returns it in words. */
  private grant(r: Reward): string[] {
    if (r.credits) {
      this.wallet.add(r.credits);
      this.econ.bump('credits');
    }
    if (r.cores) {
      this.wallet.addCores(r.cores);
      this.econ.bump('cores');
    }
    if (r.tickets) {
      this.tickets.add(r.tickets);
      this.econ.bump('tickets');
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
    const lines = this.grant(r);
    this.ui.celebrate([{ kicker: `day ${step + 1} of ${CONFIG.economy.login.length}`, icon: GIFT_ICON, name: 'daily reward', lines }]);
    this.sound.power();
    this.haptics.pickup();
    this.refreshTitle();
    if (this.infoOpen === 'daily') this.openDaily();
  }

  private openDaily(): void {
    const now = Date.now();
    const day = dayKey(now);
    this.daily.turn(day);
    const due = this.daily.loginDue(day);
    const step = this.daily.loginStep;
    const login = CONFIG.economy.login as readonly Reward[];
    const claimedUpTo = due >= 0 ? step : step === 0 ? login.length : step;
    const qs = this.daily.quests;
    const allDone = qs.every((q) => q.done);
    this.econ.renderDaily({
      calendar: login.map((r, i) => ({
        day: i + 1,
        reward: rewardParts(r).map((p) => p.replace(/^\+/, '')).join(', '),
        state: i < claimedUpTo ? 'claimed' : i === step && due >= 0 ? 'today' : 'next',
      })),
      claim: due >= 0 ? { text: `claim day ${step + 1}`, enabled: true } : { text: `next reward in ${formatWait(untilTomorrow(now))}`, enabled: false },
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      quests: qs.map((q) => ({
        text: questText(q),
        reward: `+${formatScore(q.credits)} credits · +${CONFIG.economy.quests.passXp} pass xp`,
        progress: `${formatScore(q.progress)} / ${formatScore(q.target)}`,
        fraction: q.progress / q.target,
        done: q.done,
      })),
      bonus: allDone ? `all done: +${CONFIG.economy.quests.allDoneCores} cores collected` : `finish all three for +${CONFIG.economy.quests.allDoneCores} cores`,
    });
    this.openInfo('daily');
  }

  private openShop(): void {
    const now = Date.now();
    const o = this.owner();
    const T = CONFIG.economy.tickets;
    const offers = shopFor(dayKey(now));
    this.tickets.refill(now);
    this.econ.renderShop({
      wallet: `${formatScore(this.wallet.credits)} credits · ${formatScore(this.wallet.cores)} cores · ${this.tickets.count} tickets`,
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      offers: offers.map((f, i) => {
        const colors = f.item.colors;
        return {
          name: f.item.name,
          slot: f.item.slot,
          slotName: SLOT_NAMES[f.item.slot],
          swatch: colors ? `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)` : null,
          price: `${formatScore(f.price)} ${f.currency}`,
          premium: f.currency === 'cores',
          deal: f.deal,
          owned: this.looks.owns(f.item, o),
          picked: i === this.shopPick,
        };
      }),
      buy: this.shopBuyButton(offers),
      tickets: {
        label: `one ranked ticket · ${this.tickets.count} left · ${T.perWeek} new in ${formatWait(this.tickets.nextIn(now))}`,
        button: `${T.coreCost} cores`,
        enabled: this.wallet.cores >= T.coreCost,
      },
      cores: this.coreRows(),
    });
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('shop');
  }

  /** The shop's real-money rows: store products in the apps, a note on the web. */
  private coreRows(): { label: string; button: string; enabled: boolean }[] {
    const rows: { label: string; button: string; enabled: boolean }[] = [];
    this.shopPacks = [];
    const price = new Map(this.storeProducts.map((p) => [p.id, p.price]));
    for (const p of CONFIG.economy.store.products) {
      const cost = price.get(p.id);
      if (!cost || 'pass' in p || ('once' in p && this.ownedProducts.has(p.id))) continue;
      const label = 'once' in p ? `starter pack · ${formatScore(p.cores)} cores, ${p.tickets} tickets and ${rewardText({ look: p.look })}` : `${formatScore(p.cores)} cores`;
      rows.push({ label, button: cost, enabled: true });
      this.shopPacks.push(p.id);
    }
    if (this.store.available) {
      rows.push({ label: 'bought on another device?', button: 'restore', enabled: true });
      this.shopPacks.push('restore');
    }
    if (import.meta.env.DEV) {
      rows.push({ label: 'dev: add cores (purchases stand-in)', button: '+500', enabled: true });
      this.shopPacks.push('dev');
    }
    if (rows.length === 0) rows.push({ label: 'packs of cores come with the iOS and Android apps', button: 'soon', enabled: false });
    return rows;
  }

  /** Tap a shop look: try it on the ship (tap again to take it off). */
  /** The buy button under the cards: for the picked look, or a prompt to pick one. */
  private shopBuyButton(offers: ReturnType<typeof shopFor>): { text: string; enabled: boolean } {
    const f = offers[this.shopPick];
    if (!f) return { text: 'tap a look to try it on', enabled: false };
    if (this.looks.owns(f.item, this.owner())) return { text: `${f.item.name} is on your ship`, enabled: false };
    const have = f.currency === 'cores' ? this.wallet.cores : this.wallet.credits;
    const price = `${formatScore(f.price)} ${f.currency}`;
    return have >= f.price ? { text: `buy ${f.item.name} · ${price}`, enabled: true } : { text: `${price} · you have ${formatScore(have)}`, enabled: false };
  }

  /** Tap a look: it goes on the ship to try (owned ones are just put on). Tap again to take it off. */
  private onShopOffer = (i: number): void => {
    const f = shopFor(dayKey(Date.now()))[i];
    if (!f) return;
    if (this.shopPick === i && !this.looks.owns(f.item, this.owner())) {
      this.shopPick = -1;
      this.preview = null;
    } else {
      this.shopPick = i;
      if (this.looks.owns(f.item, this.owner())) {
        this.preview = null;
        this.looks.equip(f.item.slot, f.item.id);
      } else this.preview = { slot: f.item.slot, id: f.item.id };
    }
    this.haptics.pickup();
    this.applyLooks();
    this.openShop();
  };

  private onShopBuy = (): void => {
    const f = shopFor(dayKey(Date.now()))[this.shopPick];
    if (!f || this.looks.owns(f.item, this.owner())) return;
    const paid = f.currency === 'cores' ? this.wallet.spendCores(f.price) : this.wallet.spend(f.price);
    if (!paid) return;
    this.looks.buy(f.item);
    this.looks.equip(f.item.slot, f.item.id);
    this.preview = null;
    this.sound.pickup();
    this.haptics.pickup();
    this.ui.showNotice(`${f.item.name} bought and on your ship`);
    this.applyLooks();
    this.refreshTitle();
    this.openShop();
  };

  private onShopTicket = (): void => {
    if (!this.buyTicket()) return;
    this.openShop();
  };

  /** One ranked ticket for cores; false if there aren't enough. */
  private buyTicket(): boolean {
    if (!this.wallet.spendCores(CONFIG.economy.tickets.coreCost)) return false;
    this.tickets.add(1);
    this.econ.bump('tickets');
    this.sound.pickup();
    this.haptics.pickup();
    this.refreshTitle();
    return true;
  }

  /** Cores packs: real purchases come with the store (stage D); the dev build adds them free. */
  private onShopCores = (i: number): void => {
    const pack = this.shopPacks[i];
    if (pack === 'dev') {
      this.devAddCores(500);
      this.openShop();
    } else if (pack === 'restore') void this.restorePurchases();
    else if (pack) void this.buyProduct(pack);
  };

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
        free: rewardText(freeReward(i + 1)),
        premium: rewardText(premiumReward(i + 1)),
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

  /** Ranked with no tickets left: offer one for cores, or the wait. */
  private offerTicket(): void {
    const now = Date.now();
    const cost = CONFIG.economy.tickets.coreCost;
    this.econ.offer(
      {
        kicker: 'out of tickets',
        name: 'ranked tickets',
        lines: [`${CONFIG.economy.tickets.perWeek} new tickets in ${formatWait(this.tickets.nextIn(now))}`, `you have ${formatScore(this.wallet.cores)} cores`],
        yes: `buy one · ${cost} cores`,
        yesEnabled: this.wallet.cores >= cost,
        no: 'not now',
        seconds: 0,
      },
      () => {
        if (this.buyTicket()) this.startRanked();
      },
      () => {},
    );
  }

  // --- revive ----------------------------------------------------------------

  /** A revive is offered once a run, outside ranked, where the lane is known. */
  private canRevive(): boolean {
    return this.mode !== 'ranked' && !this.revived && this.world.laneAt(this.world.distance) !== null;
  }

  private offerRevive(): void {
    const day = dayKey(Date.now());
    const free = this.daily.freeRevive(day);
    const cost = CONFIG.economy.revive.coreCost;
    this.econ.offer(
      {
        kicker: 'crashed',
        name: 'keep going?',
        lines: [free ? 'your free revive today' : `you have ${formatScore(this.wallet.cores)} cores`, `score so far ${formatScore(this.score)}`],
        yes: free ? 'revive · free' : `revive · ${cost} cores`,
        yesEnabled: free || this.wallet.cores >= cost,
        no: 'no thanks',
        seconds: 6,
      },
      () => {
        if (free) this.daily.useFreeRevive(day);
        else if (!this.wallet.spendCores(cost)) return this.settleCrash();
        this.revive();
      },
      () => this.settleCrash(),
    );
  }

  /** Back on the lane with the way ahead cleared, a shield on, and a 3-2-1. */
  private revive(): void {
    const R = CONFIG.economy.revive;
    this.revivePending = false;
    this.revived = true;
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

  /** The wallet bar, ticket refills and the day turning, about once a second on the title. */
  private tickEconomy(dt: number): void {
    this.economyTimer -= dt;
    if (this.economyTimer > 0) return;
    this.economyTimer = 1;
    const now = Date.now();
    const before = this.tickets.count;
    this.tickets.refill(now);
    this.daily.turn(dayKey(now));
    this.pass.turn(now);
    if (this.tickets.count !== before) this.refreshTitle();
    else this.refreshBar(now);
  }

  /** Sign in and sync with the server, if there is one (see src/server). */
  private async connect(): Promise<void> {
    if (await this.backend.signIn()) {
      if (await this.cloud.start()) {
        location.reload(); // the cloud save is newer: start again from it
        return;
      }
      await this.wallet.link(this.backend);
      this.refreshTitle();
    }
    this.ownedProducts = new Set(JSON.parse((await storage.get(OWNED_KEY)) ?? '[]') as string[]);
    await this.store.start(this.backend.userId);
    this.storeProducts = await this.store.products();
    if (this.infoOpen === 'shop') this.openShop();
  }

  /** Buy a real-money product through the app store, then deliver it. */
  private async buyProduct(id: ProductId): Promise<void> {
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
        window.setTimeout(() => void this.wallet.link(this.backend).then(() => this.refreshTitle()), 2500);
      } else lines.push(...this.grant({ cores: p.cores }));
    }
    if ('tickets' in p) lines.push(...this.grant({ tickets: p.tickets, look: p.look }));
    if ('pass' in p && !this.pass.premium) lines.push(...this.pass.unlockPremium().flatMap((r) => this.grant(r)), 'season pass premium');
    if ('once' in p) {
      this.ownedProducts.add(id);
      void storage.set(OWNED_KEY, JSON.stringify([...this.ownedProducts]));
    }
    this.ui.celebrate([{ kicker: 'thank you', icon: GIFT_ICON, name: 'purchase complete', lines: mergeCredits(lines) }]);
    this.sound.power();
    this.refreshTitle();
    if (this.infoOpen === 'shop') this.openShop();
    if (this.infoOpen === 'pass') this.openPass();
  }

  /** Restore one-time purchases on a new install (cores come back with the cloud save). */
  private async restorePurchases(): Promise<void> {
    const ids = await this.store.restore();
    let n = 0;
    for (const id of ids) {
      const p = CONFIG.economy.store.products.find((x) => x.id === id);
      if (!p || !('once' in p) || this.ownedProducts.has(id)) continue;
      this.ownedProducts.add(id);
      if ('look' in p) this.grant({ look: p.look });
      n++;
    }
    void storage.set(OWNED_KEY, JSON.stringify([...this.ownedProducts]));
    this.ui.showNotice(n > 0 ? `restored ${n} purchase${n === 1 ? '' : 's'}` : 'nothing to restore');
    this.openShop();
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
    const wait = this.tickets.count === 0 ? formatWait(this.tickets.nextIn(now)) : '';
    this.econ.setBar(this.wallet.credits, this.wallet.cores, this.tickets.count, wait);
    this.econ.setNews('daily', this.daily.loginDue(dayKey(now)) >= 0);
  }

  /** Fold a ranked run into the rank and league; fills the game-over block. Returns bonus credits. */
  private recordRanked(finished: boolean): number {
    const lg = this.leagues;
    if (!this.assisted)
      void this.backend.submitRun({
        week: weekKey(Date.now()),
        league: lg.league,
        score: Math.floor(this.score),
        seconds: this.runTime,
        distance: this.world.distance - this.runStart,
        finished,
        path: this.path,
      });
    this.ui.showShare(true);
    const target = this.weekly.target;
    this.beatPar = this.score >= leaguePar(lg.league, target);
    this.finishedRun = finished;
    const r = this.ranked.record(this.mode, this.score, this.level, this.seed, Date.now(), target, this.weekly.id);
    const promoted = r.rankAfter > r.rankBefore;
    const leagueLines: string[] = [];
    const party: Celebration[] = [];
    let bonus = r.credits;
    {
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
      party.unshift({ kicker: 'promoted', icon: insignia(r.rankAfter), name: rankName(r.rankAfter), lines: mergeCredits(gives), color: '#d4a63a' });
    }
    const lines = [
      ...leagueLines,
      `+${r.xp} xp${r.doubled ? ' (double)' : ''}`,
      r.skillAfter === r.skillBefore ? `skill ${r.skillAfter}` : `skill ${r.skillBefore} → ${r.skillAfter}`,
      `par for skill ${r.skillAfter}: ${formatScore(par(r.skillAfter, target))}`,
    ];
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
    this.ui.renderBoard([], this.backend.online ? 'loading' : '');
    const rows = await this.backend.board(weekKey(Date.now()), lg.league);
    const mine = this.progress.weeklyBest(this.weekly.id);
    const view: [string, string][] = rows.map((r, i) => [`${i + 1}. ${r.you ? 'you' : r.name}`, formatScore(r.score)]);
    if (!this.backend.online) {
      this.ui.renderBoard(mine > 0 ? [['your best', formatScore(mine)]] : [['no ranked run yet this week', '']], 'online leaderboards come with accounts');
      return;
    }
    this.ui.renderBoard(view.length > 0 ? view : [['no runs yet this week', '']], LEAGUES[lg.league].name);
  }

  /** How far through the current rank's XP band the player is (0..1). */
  private xpFraction(): number {
    const i = this.ranked.rank;
    if (i >= RANKS.length - 1) return 1;
    const lo = RANKS[i].xp;
    const hi = RANKS[i + 1].xp;
    return Math.max(0, Math.min(1, (this.ranked.xp - lo) / (hi - lo)));
  }

  private openRecord(): void {
    const rk = this.ranked;
    const i = rk.rank;
    const next = RANKS[i + 1];
    const xpLeft = next ? xpToRank(rk.xp, i + 1) : 0;
    const checks: ProgressView['checks'] = [];
    if (next) {
      checks.push({ label: `${formatScore(next.xp)} xp`, value: `${formatScore(rk.xp)} now`, met: xpLeft === 0 });
      if (next.skill > 0) checks.push({ label: `skill ${next.skill}`, value: `best ${rk.highestSkill} · now ${rk.skill}`, met: rk.highestSkill >= next.skill });
    }
    let big = formatScore(xpLeft);
    let goal = next ? `xp to ${rankName(i + 1)}` : 'xp. top rank reached';
    // Enough XP but not the skill: the skill is the headline.
    if (next && xpLeft === 0 && rk.highestSkill < next.skill) {
      big = `skill ${next.skill}`;
      goal = `needed for ${rankName(i + 1)}`;
    }
    if (!next) big = formatScore(rk.xp);

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
        ['skill par this week', `${formatScore(par(rk.skill, this.weekly.target))} to climb`],
        ['double xp runs left today', String(rk.bonusRunsLeft())],
        ['best this week', formatScore(b.week)],
        ['best ever', formatScore(b.all)],
        ['ranked runs', formatScore(rk.history.length)],
      ],
      ladder: RANKS.map((r, k) => ({
        icon: insignia(k),
        name: rankName(k),
        needs: r.skill > 0 ? `${formatScore(r.xp)} xp · skill ${r.skill}` : `${formatScore(r.xp)} xp`,
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

  /** The mission pool this run counts towards. */
  private poolMissions(): Missions {
    return this.mode === 'ranked' ? this.rankedMissions : this.soloMissions;
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

  private metrics(): RunMetrics {
    let levelStars = 0;
    for (const c of COURSES) levelStars += [1, 2, 4].filter((b) => this.progress.course(c.id).stars & b).length;
    return {
      ranked: this.mode === 'ranked',
      // Set levels have no level numbers to reach.
      level: this.course ? 0 : this.level,
      score: this.assisted ? 0 : this.score,
      nearMisses: this.nearMissCount,
      bestChain: this.bestChain,
      pickups: this.pickupCount,
      boostSeconds: this.boostSeconds,
      rooms: this.roomsEntered,
      boosted: this.boosted,
      finished: this.finishedRun,
      clean: !this.hitThisRun,
      beatPar: this.beatPar,
      levelStars,
    };
  }

  /** A mission is complete: say so and unlock the next cosmetic. */
  private missionDone(text: string): void {
    const u = this.cosmetics.unlockNext();
    this.ui.showNotice(u ? `done: ${text}. unlocked ${describe(u)}` : `done: ${text}`);
    this.sound.pickup();
    this.haptics.level(false);
  }

  /** Ship shape, trail and the chosen palette (outside a run's later loops). */
  private applyCosmetics(): void {
    const c = this.cosmetics;
    this.applyLooks();
    this.trail.setStyle(c.trail);
    this.basePalette.set(PALETTES.find((p) => p.name === c.palette) ?? PALETTES[0]);
    this.applyLook(this.distanceScore / CONFIG.score.levelLength);
  }

  /** Each loop of the themes fades the world to the next unlocked palette. */
  private startPaletteFade(loop: number): void {
    const list = this.cosmetics.palettes();
    if (list.length < 2) return;
    const name = list[(list.indexOf(this.cosmetics.palette) + loop) % list.length];
    this.fadeFrom.copy(this.basePalette);
    this.fadeTo.set(PALETTES.find((p) => p.name === name) ?? PALETTES[0]);
    this.fadeT = 0;
  }

  /** What the player has, for unlocking looks. */
  private owner(): Owner {
    return { rank: this.ranked.rank, stars: this.progress.totalStars(), league: this.leagues.league, missionHulls: this.cosmetics.ships() };
  }

  /** Put the equipped looks (plus any preview) on the ship. */
  private applyLooks(): void {
    const eq = { ...this.looks.equipped };
    if (this.preview) eq[this.preview.slot] = this.preview.id;
    this.player.setShape(eq.hull as ShipId);
    this.player.setPaint(find('paint', eq.paint).colors ?? null);
    const decal = eq.decal === 'rank' ? insignia(this.ranked.rank) : eq.decal === 'league' ? emblem(this.leagues.league, this.leagues.division) : null;
    this.player.setDressing(eq.markings as Marking, eq.fins as Fin, decal);
    this.trail.setTint(find('engine', eq.engine).colors?.[0] ?? null);
  }

  /** Ship tab rows: the looks slots, then trail style and world colours (from missions). */
  private onLookRow = (key: string): void => {
    if (key === 'trail' || key === 'palette') {
      this.preview = null;
      this.cosmetics.cycle(key);
      this.applyCosmetics();
      this.openHangar();
      return;
    }
    const slot = key as Slot;
    const items = itemsIn(slot);
    const current = this.preview?.slot === slot ? this.preview.id : this.looks.equipped[slot];
    const next = items[(items.findIndex((i) => i.id === current) + 1) % items.length];
    if (this.looks.owns(next, this.owner())) {
      this.preview = null;
      this.looks.equip(slot, next.id);
    } else {
      this.preview = { slot, id: next.id };
    }
    this.applyLooks();
    this.openHangar();
  };

  private onLookBuy = (): void => {
    if (!this.preview) return;
    const item = find(this.preview.slot, this.preview.id);
    const u = item.unlock;
    if (u.by === 'credits' ? !this.wallet.spend(u.cost) : u.by === 'cores' ? !this.wallet.spendCores(u.cost) : true) return;
    this.looks.buy(item);
    this.looks.equip(item.slot, item.id);
    this.preview = null;
    this.sound.pickup();
    this.haptics.pickup();
    this.refreshTitle();
    this.applyLooks();
    this.openHangar();
  };

  private renderLooks(): void {
    const o = this.owner();
    const rows = SLOTS.map((slot): LookRow => {
      const id = this.preview?.slot === slot ? this.preview.id : this.looks.equipped[slot];
      const item = find(slot, id);
      const owned = this.looks.owns(item, o);
      const count = itemsIn(slot).filter((i) => this.looks.owns(i, o)).length;
      return {
        key: slot,
        label: SLOT_NAMES[slot],
        value: owned ? `${item.name} (${count}/${itemsIn(slot).length})` : item.name,
        locked: !owned,
        note: unlockText(item.unlock),
      };
    });
    const c = this.cosmetics;
    rows.push(
      { key: 'trail', label: 'trail', value: `${c.trail} (${c.trails().length})`, locked: false, note: '' },
      { key: 'palette', label: 'world colours', value: `${c.palette} (${c.palettes().length})`, locked: false, note: '' },
    );
    let buy: { text: string; enabled: boolean } | null = null;
    if (this.preview) {
      const item = find(this.preview.slot, this.preview.id);
      const u = item.unlock;
      if (u.by === 'credits') buy = { text: `buy ${item.name} · ${formatScore(u.cost)} credits`, enabled: this.wallet.credits >= u.cost };
      else if (u.by === 'cores') buy = { text: `buy ${item.name} · ${formatScore(u.cost)} cores`, enabled: this.wallet.cores >= u.cost };
    }
    const owned = LOOKS.filter((l) => this.looks.owns(l, o)).length;
    this.ui.renderLooks(rows, buy, `${owned} of ${LOOKS.length} looks unlocked · missions unlock trails, hulls and world colours`);
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
    this.openHangar();
  };

  private renderUpgrades(): void {
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

  private openHangar(): void {
    this.renderUpgrades();
    const lg = this.leagues.current;
    const active = this.upgrades.activePoints();
    this.ui.setUpgradeNote(
      `${active} of ${this.upgrades.points()} points on · ${lg.name} league cap ${lg.max}${active > lg.max ? ' (over: switch some off for ranked)' : ''}. solo, levels and endless have no cap.`,
    );
    this.ui.setHangarTab(this.hangarTab, `${formatScore(this.wallet.credits)} credits`);
    this.renderLooks();
    // Show the ship (and its engine) over the title scene while choosing.
    this.player.reset();
    this.player.setVisible(true);
    this.trail.setVisible(true);
    this.openInfo('hangar');
  }

  private openMissions(): void {
    const next = this.cosmetics.next();
    const rows: [string, string][] = [['RANKED', ''], ...this.rankedMissions.lines(), ['SOLO, LEVELS AND ENDLESS', ''], ...this.soloMissions.lines()];
    this.ui.renderMissions(rows, next ? `next unlock: ${describe(next)}` : 'everything unlocked');
    this.openInfo('missions');
  }

  private openInfo(which: InfoScreen): void {
    this.infoOpen = which;
    this.ui.show(which);
  }

  /** Solo: pick an environment (endless in it, with a high score each) or a set level. */
  private openSolo(): void {
    this.ui.renderEnvironments(
      ENVIRONMENTS.map((e, i) => ({ index: i, name: e.name, best: this.progress.envBest[e.id] ?? 0 })),
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
      this.hangarTab = 'upgrades';
      if (this.state === 'crashed') this.toMainMenu();
      this.openHangar();
      return;
    }
    // One ticket per attempt.
    if (!this.tickets.use(Date.now())) {
      this.offerTicket();
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
    if (env) this.beginRun(0, newSeed(), 'solo', null, env);
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
    if (name === 'endless') this.startEndless();
    else if (name === 'solo') this.openSolo();
    else if (name === 'record') this.openRecord();
    else if (name === 'stats') this.openStats();
    else if (name === 'missions') this.openMissions();
    else if (name === 'hangar') this.openHangar();
    else if (name === 'shop') {
      this.shopPick = -1;
      this.preview = null;
      this.openShop();
    }
    else if (name === 'pass') this.openPass();
    else if (name === 'daily') this.openDaily();
  };

  private refreshTitle(): void {
    const i = this.ranked.rank;
    this.applyLooks(); // the wing decal follows your rank and league
    const lg = this.leagues;
    this.ui.setTitleLeague(emblem(lg.league, lg.division), `${leagueName(lg.league, lg.division)} · ${lg.lp} lp`, lg.lp / LP_PER_DIVISION);
    this.ui.setTitleRank(insignia(i), rankName(i), `${formatScore(this.wallet.credits)} credits`);
    const wb = this.progress.weeklyBest(this.weekly.id);
    const now = Date.now();
    this.tickets.refill(now);
    const t = this.tickets.count;
    const tickets = t > 0 ? `${t} ${t === 1 ? 'try' : 'tries'} left` : `no tries left · ${CONFIG.economy.tickets.perWeek} more in ${formatWait(this.tickets.nextIn(now))}`;
    this.ui.setRankedSub(`${wb > 0 ? `best this week ${formatScore(wb)}` : 'new run every week'} · ${tickets}`);
    this.refreshBar(now);
    this.cloud.push(); // most changes end here: keep the cloud save current
    this.ui.setBests([['endless', this.progress.endlessBest]]);
  }

  private openStats(): void {
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
    this.openInfo('stats');
  }

  private pause(): void {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.econ.setCountdown(0);
    this.state = 'paused';
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
    if (e.repeat) return;
    if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'paused') {
      if (this.state === 'title' && !this.settingsOpen && !this.infoOpen) this.startRanked();
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
    else if (action === 'menu') this.toMainMenu();
    else if (action === 'share') void this.share();
    else if (action === 'back') {
      if (this.infoOpen) this.closeInfo();
      else this.closeSettings();
    }
  };

  private closeInfo(): void {
    if (this.infoOpen === 'hangar' || this.infoOpen === 'shop') {
      // Leaving the hangar takes off anything only being tried on.
      this.preview = null;
      this.applyLooks();
      if (this.state === 'title') {
        this.player.setVisible(false);
        this.trail.setVisible(false);
      }
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
    this.ui.renderSettings(s);
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.ui.show('settings');
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.ui.show(this.state === 'paused' ? 'paused' : 'title');
  }

  /** Abandon the run and go back to the live title scene. Best score still counts. */
  private toMainMenu(): void {
    if (this.state === 'paused') this.finishRun(null); // abandoned mid-run: still counts for stats
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
    this.fadeT = 1;
    this.paletteLoop = 0;
    this.applyCosmetics();
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
    this.ranked.xp = Math.max(this.ranked.xp, RANKS[RANKS.length - 1].xp);
    this.ranked.skill = this.ranked.highestSkill = 50;
    this.ranked.save();
    while (this.cosmetics.unlockNext()) {
      // every mission unlock
    }
    this.looks.buyAll();
    this.leagues.devTop();
    this.dev.unlockedAll = true;
    for (const s of SYSTEMS) while (this.upgrades.tier(s.id) < MAX_TIER) this.upgrades.raise(s.id);
    this.wallet.add(100000);
    this.refreshTitle();
    this.ui.showNotice('dev: everything unlocked');
  }

  /** Dev: cores, standing in for purchases until the store is in. */
  devAddCores(n: number): void {
    this.wallet.addCores(n);
    this.econ.bump('cores');
    this.refreshTitle();
  }

  /** Dev: ranked tickets. */
  devAddTickets(n: number): void {
    this.tickets.add(n);
    this.econ.bump('tickets');
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
    if (this.fadeT < 1) {
      this.fadeT = Math.min(1, this.fadeT + 1 / 60 / CONFIG.ui.paletteFadeSeconds);
      this.basePalette.mix(this.fadeFrom, this.fadeTo, this.fadeT * this.fadeT * (3 - 2 * this.fadeT));
    }
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
    const showroom = this.infoOpen === 'hangar' || this.infoOpen === 'shop';
    const S = CONFIG.camera.showroom;
    if (showroom) {
      this.trail.update(dt, 0, this.player.engineHalfSpan);
      this.showroomTime += dt;
      this.stage.showroomY = this.infoOpen === 'shop' ? S.shopY : S.hangarY;
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
    this.offerHints();
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
    this.speedLines.update(dt, speed, this.settings.reduceMotion ? 0 : this.boostLevel);
    this.trail.update(dt, this.boostLevel, this.player.engineHalfSpan);
    if (this.boosting) {
      this.boostSeconds += dt;
      this.boosted = true;
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
      this.progress.reachedLevel(level);
      this.ui.announceLevel(level, this.areaName(level));
      this.sound.level(themeChange, this.areaMusic(level));
      this.haptics.level(themeChange);
      this.maybeStartEvent(level);
      const loop = Math.floor((level - 1) / (CONFIG.themes.levelsPerTheme * 3));
      if (loop !== this.paletteLoop) {
        this.paletteLoop = loop;
        this.startPaletteFade(loop);
      }
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
    if (this.world.inLava() && !this.dev.invincible) {
      this.crash(false);
      this.world.sync();
      return;
    }
    const fell = this.world.overPit();
    // Shielded (or just saved by a shield), the walls still hold you in: steer
    // into one and you slide along it instead of out of the course. Touching
    // one with a shield up uses the shield, like any other hit.
    let scraped = false;
    if (!fell && (this.shield || this.graceT > 0) && !this.dev.invincible) scraped = this.world.clampToWalls(CONFIG.ship.hitHalfWidth + 0.15);
    const hit = !fell && this.graceT <= 0 && (scraped || this.world.hitTest(prev));
    if (hit && this.shield && !this.dev.invincible) {
      // The shield takes the hit; pass through for a moment.
      this.shield = false;
      this.player.setShield(false);
      this.graceT = CONFIG.powers.shield.graceSeconds + this.ship.graceExtra;
      this.hitThisRun = true;
      this.sound.shieldHit();
      this.haptics.crash();
      this.nudgeMs = CONFIG.score.nearMiss.nudgeMs * 2;
    } else if ((fell || hit) && !this.dev.invincible) {
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
    this.missionTimer += dt;
    if (this.missionTimer > 0.5) {
      this.missionTimer = 0;
      for (const done of this.poolMissions().check(this.metrics())) this.missionDone(done);
    }

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
    this.finishedRun = true;
    const extra = this.finishRun(null);
    this.wallet.add(starCredits);
    const starText = [1, 2, 4].map((b) => (stars & b ? '★' : '☆')).join('');
    const lines = [`${starText}  ${formatTime(time)}${res.bestTime ? ' (best)' : ` · best ${formatTime(best.time)}`}`];
    if (starCredits > 0) lines.push(`+${starCredits} credits for new stars`);
    if (!(stars & 2)) lines.push('hit something: no second star');
    if (!(stars & 4)) lines.push(`score ${formatScore(c.target)} for the third star`);
    lines.push(extra);
    this.ui.setGameOverExtra(lines.join(' · '));
    this.ui.setGameOverMissions(this.poolMissions().lines());
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
      return {
        index: i,
        name: c.name,
        stars: r.stars,
        time: r.time > 0 ? formatTime(r.time) : '',
        locked: !(i === 0 || (prev && prev.stars & 1)) && !this.dev.unlockedAll,
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
