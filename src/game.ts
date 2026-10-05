import { applyAtmosphere } from './atmosphere';
import { type AudioState, Sound } from './audio/sound';
import type { MusicId } from './audio/music';
import { createBlockTextures } from './blockTextures';
import { CONFIG, PALETTES } from './config';
import { lateralSpeedAt, speedAt } from './difficulty';
import { Input } from './input';
import { LivePalette } from './palette';
import { Player } from './player';
import { Stage } from './renderer';
import { Sky } from './sky';
import { SpeedLines } from './speedLines';
import { Trail } from './trail';
import { cycle, DEFAULT_SETTINGS, LEVEL_GAIN, loadSettings, saveSettings, type SettingKey, STEERING_RANGE, TEXT_SCALE, TILT_GAIN } from './settings';
import { EVENT_NOTICE, Events } from './events';
import { Cosmetics, describe } from './cosmetics';
import { Haptics } from './haptics';
import { Hints } from './hints';
import { Missions, type RunMetrics } from './missions';
import { chainTarget, dailySeed, Progress, sectorOf, sectorStart, STAR_CHAIN, STAR_CLEAR, STAR_NO_HITS } from './progress';
import { creditsFor, insignia, par, Ranked, rankName, RANKS, type RunMode } from './ranks';
import { Wallet } from './wallet';
import { find, itemsIn, LOOKS, Looks, type Owner, type Slot, SLOT_NAMES, SLOTS, unlockText } from './looks';
import type { Fin, Marking } from './looks';
import type { ShipId } from './cosmetics';
import { MAX_TIER, type ShipStats, STANDARD, SYSTEMS, type SystemId, TIER_COST, Upgrades } from './upgrades';
import { newSeed } from './rng';
import { loadNumber, saveNumber } from './storage';
import { formatScore, type LookRow, type RankResultView, UI } from './ui';
import type { RoomId } from './interior';
import { biomeForLevel, type PowerKind, themeForLevel, themeName, World } from './world';
import { tintBiome } from './biomes';
import { terrain } from './terrain';

type State = 'title' | 'playing' | 'paused' | 'crashed';

const DEG = Math.PI / 180;
const SOLO_BEST = 'endless.soloBest';

/** Music for a level: the theme's, or the biome's own where it has one. */
function musicFor(level: number): MusicId {
  const biome = biomeForLevel(level);
  return biome === 'ice' || biome === 'volcanic' || biome === 'asteroids' ? biome : themeForLevel(level);
}

const POWER_NOTICE = ['shield. takes one hit', 'magnet. pulls in boost', 'slow-mo'];

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
  // Run mode. Ranked and daily use the standard ship from level 1; solo can
  // start from an unlocked sector (with half the points it skips) and uses upgrades.
  private mode: RunMode = 'ranked';
  private fromLevel = 1; // solo start level (a sector's first level)
  private scoreBase = 0; // solo starts: score begins at half the skipped points
  private readonly ranked = new Ranked();
  private readonly wallet = new Wallet();
  private soloBest = 0;
  private readonly upgrades = new Upgrades();
  /** This run's ship systems: the standard ship unless it's a solo run. */
  private ship: ShipStats = STANDARD;
  private hangarTab: 'ship' | 'upgrades' = 'ship';
  private readonly looks = new Looks();
  /** A locked look being tried on in the hangar (not yet owned). */
  private preview: { slot: Slot; id: string } | null = null;
  private pickupCount = 0;
  private recorded = false; // this run's stats are saved
  private assisted = false; // assist mode was on at some point this run
  private readonly cosmetics = new Cosmetics();
  private readonly missions = new Missions();
  /** Which info screen is open from the title (stats, missions, hangar), if any. */
  private infoOpen: 'stats' | 'missions' | 'hangar' | 'record' | 'sectors' | null = null;
  // The sector the ship is in and how it's going there (for stars).
  private sector = 0;
  private sectorFromStart = false; // entered at its start (not a dev skip mid-sector)
  private sectorHit = false;
  private sectorChain = 0;
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
  private best = 0;
  /** Seed of the current (or last) run: the same seed rebuilds the same course. */
  seed = 0;

  /** Dev-only switches, set from the dev panel (never shown in production builds). */
  readonly dev = { invincible: false, fullBoost: false };

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
    this.trail = new Trail(this.stage.scene, this.palette);
    this.events = new Events(this.stage.scene);
    this.sky = new Sky(this.stage.scene);
    this.input = new Input(document.body);
    this.input.bindBoostControl(this.ui.boostControl);
    this.input.onTiltDenied = () => this.ui.showNotice('motion access off. drag to steer');
    this.sound.attachUnlock();
    this.ui.bindMenus(this.onMenu, this.onSetting);
    this.applySettings();
    this.applyLook(0);

    this.world.reset(0, false);
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

    this.ui.bindTitleLinks(this.onTitleLink);
    void Promise.all([this.progress.load(), this.ranked.load(), this.wallet.load()]).then(() => this.refreshTitle());
    void loadNumber(SOLO_BEST, 0).then((b) => (this.soloBest = b));
    this.ui.bindLooks(this.onLookRow, this.onLookBuy);
    this.ui.bindSectors(this.onSectorPick);
    this.ui.bindHangarTabs((tab) => {
      this.hangarTab = tab;
      this.openHangar();
    });
    this.ui.bindUpgrades(this.onBuyUpgrade);
    void this.upgrades.load();
    void this.missions.load();
    void Promise.all([this.cosmetics.load(), this.looks.load()]).then(() => {
      // Saves from before the hangar had looks: carry the mission hull across.
      if (this.looks.equipped.hull === 'dart' && this.cosmetics.ship !== 'dart') this.looks.equip('hull', this.cosmetics.ship);
      this.applyCosmetics();
    });
    void loadSettings().then((s) => {
      this.settings = s;
      this.applySettings();
    });
    void loadNumber(CONFIG.storageKeys.best, 0).then((b) => {
      this.best = b;
      this.ui.setBest(b);
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
  private beginRun(startScore = 0, seed = newSeed(), mode: RunMode = 'solo'): void {
    this.seed = seed;
    this.mode = mode;
    // Solo starts part-way along begin with half the points they skipped.
    this.scoreBase = mode === 'solo' ? startScore / 2 : 0;
    this.world.assist = this.assistOn();
    this.ship = mode === 'solo' ? this.upgrades.stats() : STANDARD;
    this.world.collectScale = this.ship.collect;
    this.world.powerRate = this.ship.powerRate;
    this.ui.setMode(mode === 'solo' ? 'solo' : mode === 'daily' ? 'daily run' : 'ranked');
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
    this.sound.setTheme(musicFor(level));
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
    this.trail.reset();
    this.trail.setVisible(true);
    this.events.clear();
    this.input.releaseAll();
    this.input.calibrate(); // however you're holding the phone now is straight ahead
    this.input.enabled = true;
    this.level = level;
    this.sector = sectorOf(level);
    this.sectorFromStart = startScore === (sectorStart(this.sector) - 1) * CONFIG.score.levelLength;
    this.sectorHit = false;
    this.sectorChain = 0;
    const progress = startScore / CONFIG.score.levelLength;
    this.ui.setScore(this.score);
    this.progress.reachedLevel(level);
    this.ui.setLevel(level);
    this.ui.setProgress(progress - (level - 1));
    this.applyLook(progress);
    this.ui.announceLevel(level, themeName(level));
    this.ui.show(null);
    this.ui.showHud(true);
    this.state = 'playing';
    this.runTime = 0;
  }

  /** `fell` = dropped into a pit (falls away) rather than hitting something (shatters). */
  private crash(fell = false): void {
    if (this.state === 'crashed') return;
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
    // Each mode keeps its own best: ranked, solo, and the daily run (in progress).
    let isNewBest = false;
    let shownBest = this.best;
    if (this.mode === 'ranked') {
      isNewBest = this.score > this.best;
      if (isNewBest) {
        this.best = Math.floor(this.score);
        void saveNumber(CONFIG.storageKeys.best, this.best);
        this.ui.setBest(this.best);
      }
      shownBest = this.best;
    } else if (this.mode === 'solo') {
      isNewBest = !this.assisted && this.score > this.soloBest;
      if (isNewBest) {
        this.soloBest = Math.floor(this.score);
        void saveNumber(SOLO_BEST, this.soloBest);
      }
      shownBest = this.soloBest;
    } else {
      isNewBest = this.score > this.progress.dailyBest;
      shownBest = Math.max(this.progress.dailyBest, Math.floor(this.score));
    }
    this.ui.setGameOver(this.score, shownBest, isNewBest, this.nearMissCount, this.bestChain, this.seed);
    const where = themeForLevel(this.level) === 'interior' ? this.world.roomName || 'corridor' : themeName(this.level);
    this.ui.setGameOverExtra(this.finishRun(where));
    this.ui.setGameOverMissions(this.missions.lines());
  }

  /** Save this run into the lifetime stats (once). Returns a line for the game-over screen. */
  private finishRun(crashedIn: string | null): string {
    if (this.recorded) return '';
    this.recorded = true;
    const newDaily = this.progress.recordRun(
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
      this.mode === 'daily',
    );
    for (const done of this.missions.endRun(this.metrics())) this.missionDone(done);
    const lines: string[] = [];
    let credits = creditsFor(this.assisted ? 0 : this.score, this.mode !== 'solo');
    if (this.mode === 'solo') {
      this.ui.setGameOverRank(null);
      if (this.assisted) lines.push('assist mode. not counted as a best');
      if (this.scoreBase > 0) lines.push(`started at the ${themeName(this.fromLevel)}`);
    } else {
      credits += this.recordRanked();
      if (this.mode === 'daily' && newDaily) lines.push('new daily best');
    }
    this.wallet.add(credits);
    lines.push(`+${formatScore(credits)} credits`);
    this.refreshTitle();
    return lines.join(' · ');
  }

  /** Fold a ranked or daily run into the rank; fills the game-over rank block. Returns promotion credits. */
  private recordRanked(): number {
    const r = this.ranked.record(this.mode, this.score, this.level, this.seed);
    const promoted = r.rankAfter > r.rankBefore;
    const lines = [
      `+${r.xp} xp${r.doubled ? ' (double)' : ''}`,
      r.skillAfter === r.skillBefore ? `skill ${r.skillAfter}` : `skill ${r.skillBefore} → ${r.skillAfter}`,
      `par for skill ${r.skillAfter}: ${formatScore(par(r.skillAfter))}`,
    ];
    if (promoted) lines.unshift(`+${formatScore(r.credits)} promotion credits`);
    const view: RankResultView = {
      icon: insignia(r.rankAfter),
      rank: rankName(r.rankAfter),
      promoted,
      xpFraction: this.xpFraction(),
      lines,
    };
    this.ui.setGameOverRank(view);
    if (promoted) {
      this.sound.level(true, musicFor(this.level));
      this.haptics.level(true);
      if (this.state !== 'crashed') this.ui.showNotice(`promoted to ${rankName(r.rankAfter)}`);
    }
    return r.credits;
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
    const needs: string[] = [];
    if (next) {
      if (rk.xp < next.xp) needs.push(`${formatScore(next.xp - rk.xp)} xp`);
      if (rk.highestSkill < next.skill) needs.push(`skill ${next.skill}`);
    }
    const b = rk.bests();
    const runs = rk.history
      .slice(-10)
      .reverse()
      .map((h): [string, string] => {
        const d = new Date(h.at);
        const when = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return [`${when}  ${h.mode === 'daily' ? 'daily' : 'ranked'}`, `${formatScore(h.score)}  +${h.xp} xp`];
      });
    this.ui.renderRecord({
      icon: insignia(i),
      rank: rankName(i),
      next: next ? `next: ${rankName(i + 1)}. needs ${needs.join(' and ') || 'one more run'}` : 'top rank',
      xpFraction: this.xpFraction(),
      rows: [
        ['xp', formatScore(rk.xp)],
        ['skill', `${rk.skill} (highest ${rk.highestSkill})`],
        ['par at your skill', formatScore(par(rk.skill))],
        ['double xp runs left today', String(rk.bonusRunsLeft())],
        ['credits', formatScore(this.wallet.credits)],
        ['best today', formatScore(b.today)],
        ['best this week', formatScore(b.week)],
        ['best ever', formatScore(Math.max(b.all, this.best))],
        ['ranked runs', formatScore(rk.history.length)],
      ],
      runs: runs.length ? runs : [['no ranked runs yet', '']],
      ladder: RANKS.map((r, k) => ({
        icon: insignia(k),
        name: rankName(k),
        needs: r.skill > 0 ? `${formatScore(r.xp)} xp · skill ${r.skill}` : `${formatScore(r.xp)} xp`,
        state: k < i ? 'done' : k === i ? 'current' : 'locked',
      })),
    });
    this.openInfo('record');
  }

  /** Assist mode only applies to solo runs: ranked and daily use the standard rules. */
  private assistOn(): boolean {
    return this.settings.assist && this.mode === 'solo';
  }

  private metrics(): RunMetrics {
    return {
      // Checkpoint runs start part-way, so they don't count towards level missions.
      level: this.scoreBase > 0 ? 0 : this.level,
      score: this.assisted ? 0 : this.score,
      nearMisses: this.nearMissCount,
      bestChain: this.bestChain,
      pickups: this.pickupCount,
      boostSeconds: this.boostSeconds,
      rooms: this.roomsEntered,
      boosted: this.boosted,
      daily: this.mode === 'daily',
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
    return { rank: this.ranked.rank, stars: this.progress.totalStars(), missionHulls: this.cosmetics.ships() };
  }

  /** Put the equipped looks (plus any preview) on the ship. */
  private applyLooks(): void {
    const eq = { ...this.looks.equipped };
    if (this.preview) eq[this.preview.slot] = this.preview.id;
    this.player.setShape(eq.hull as ShipId);
    this.player.setPaint(find('paint', eq.paint).colors ?? null);
    this.player.setDressing(eq.markings as Marking, eq.fins as Fin, eq.decal === 'rank' ? insignia(this.ranked.rank) : null);
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
    if (item.unlock.by !== 'credits' || !this.wallet.spend(item.unlock.cost)) return;
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
      if (item.unlock.by === 'credits') {
        const cost = item.unlock.cost;
        buy = { text: `buy ${item.name} · ${formatScore(cost)} credits`, enabled: this.wallet.credits >= cost };
      }
    }
    const owned = LOOKS.filter((l) => this.looks.owns(l, o)).length;
    this.ui.renderLooks(rows, buy, `${owned} of ${LOOKS.length} looks unlocked · missions unlock trails, hulls and world colours`);
  }

  private onBuyUpgrade = (id: string): void => {
    const sys = id as SystemId;
    const check = this.upgrades.check(sys, this.wallet.credits, this.ranked.rank);
    if (!check.ok || !this.wallet.spend(check.cost)) return;
    this.upgrades.raise(sys);
    this.sound.pickup();
    this.haptics.pickup();
    this.refreshTitle();
    this.openHangar();
  };

  private renderUpgrades(): void {
    this.ui.renderUpgrades(
      SYSTEMS.map((s) => {
        const tier = this.upgrades.tier(s.id);
        const check = this.upgrades.check(s.id, this.wallet.credits, this.ranked.rank);
        const next = Math.min(MAX_TIER, tier + 1);
        return {
          id: s.id,
          name: s.name,
          effect: tier >= MAX_TIER ? s.effect(tier) : `next: ${s.effect(next)}`,
          tier,
          max: MAX_TIER,
          button: check.ok ? formatScore(TIER_COST[tier]) : check.reason,
          canBuy: check.ok,
        };
      }),
    );
  }

  private openHangar(): void {
    this.renderUpgrades();
    this.ui.setHangarTab(this.hangarTab, `${formatScore(this.wallet.credits)} credits`);
    this.renderLooks();
    // Show the ship over the title scene while choosing.
    this.player.reset();
    this.player.setVisible(true);
    this.openInfo('hangar');
  }

  private openMissions(): void {
    const next = this.cosmetics.next();
    this.ui.renderMissions(this.missions.lines(), next ? `next unlock: ${describe(next)}` : 'everything unlocked');
    this.openInfo('missions');
  }

  private openInfo(which: 'stats' | 'missions' | 'hangar' | 'record' | 'sectors'): void {
    this.infoOpen = which;
    this.ui.show(which);
  }

  /** Crossing into sector `next`: award the stars for the one just finished. */
  private leaveSector(next: number): void {
    const done = this.sector;
    if (this.sectorFromStart) {
      let bits = STAR_CLEAR;
      if (!this.sectorHit && !this.assisted) bits |= STAR_NO_HITS;
      if (this.sectorChain >= chainTarget(done)) bits |= STAR_CHAIN;
      const earned = this.progress.addStars(done, bits);
      if (earned > 0) {
        const credits = earned * CONFIG.sectors.starCredits;
        this.wallet.add(credits);
        const all = this.progress.starsIn(done);
        const stars = [STAR_CLEAR, STAR_NO_HITS, STAR_CHAIN].map((b) => (all & b ? '★' : '☆')).join('');
        this.ui.showNotice(`${themeName(sectorStart(done))} ${stars}  +${credits} credits`);
      }
    }
    this.sector = next;
    this.sectorFromStart = true;
    this.sectorHit = false;
    this.sectorChain = 0;
  }

  /** Solo: the sector map. */
  private openSectors(): void {
    const reached = this.progress.sector;
    // Every loop row up to the one after your furthest sector.
    const shown = (Math.floor((reached + 1) / 3) + 1) * 3;
    const tiles = [];
    for (let s = 0; s < shown; s++) {
      const first = sectorStart(s);
      tiles.push({
        index: s,
        name: themeName(first),
        levels: `levels ${first}-${first + 2}`,
        stars: this.progress.starsIn(s),
        locked: s > reached,
      });
    }
    this.ui.renderSectors(tiles, `${this.progress.totalStars()} stars · third star needs a x${chainTarget(0)} chain in loop 1, rising each loop`);
    this.openInfo('sectors');
  }

  private onSectorPick = (s: number): void => {
    this.fromLevel = sectorStart(s);
    this.startSolo();
  };

  /** Ranked: level 1, standard ship, fresh course. */
  private startRanked(): void {
    this.beginRun(0, newSeed(), 'ranked');
  }

  /** Solo from the chosen start level. */
  private startSolo(): void {
    this.beginRun((this.fromLevel - 1) * CONFIG.score.levelLength, newSeed(), 'solo');
  }

  private startDaily(): void {
    this.beginRun(0, dailySeed(), 'daily');
  }

  /** Retry in the same mode (and solo start) as the run that just ended. */
  private retry(): void {
    if (this.mode === 'daily') this.startDaily();
    else if (this.mode === 'solo') this.startSolo();
    else this.startRanked();
  }

  private onTitleLink = (name: string): void => {
    if (name === 'daily') this.startDaily();
    else if (name === 'solo') this.openSectors();
    else if (name === 'record') this.openRecord();
    else if (name === 'stats') this.openStats();
    else if (name === 'missions') this.openMissions();
    else if (name === 'hangar') this.openHangar();
  };

  private refreshTitle(): void {
    const i = this.ranked.rank;
    this.applyLooks(); // the wing decal follows your rank
    this.ui.setTitleRank(insignia(i), rankName(i), `${formatScore(this.wallet.credits)} credits`);
    const db = this.progress.dailyBest;
    this.ui.setTitleLink('daily', db > 0 ? `daily run (best ${formatScore(db)})` : 'daily run');
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
      ['best ranked', formatScore(this.best)],
      ['best solo', formatScore(this.soloBest)],
      ['furthest level', String(s.bestLevel || 1)],
      ['best chain', `x${s.bestChain}`],
      ['near misses', formatScore(s.nearMisses)],
      ['pickups', formatScore(s.pickups)],
      ['crash most in', worst ? `${worst} (${s.crashes[worst]})` : '-'],
    ]);
    this.openInfo('stats');
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseAll();
    this.sound.suspend();
    this.ui.show('paused');
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.releaseAll();
    this.lastTime = performance.now();
    this.input.calibrate();
    this.sound.resume();
    this.ui.show(null);
  }

  private onTap = (): void => {
    if (this.settingsOpen || this.infoOpen) return;
    switch (this.state) {
      case 'title':
        break; // pick a mode with the buttons
      case 'crashed':
        if (this.crashMs >= CONFIG.crash.retryLockMs) this.retry();
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
    else if (action === 'back') {
      if (this.infoOpen) this.closeInfo();
      else this.closeSettings();
    }
  };

  private closeInfo(): void {
    if (this.infoOpen === 'hangar') {
      // Leaving the hangar takes off anything only being tried on.
      this.preview = null;
      this.applyLooks();
      if (this.state === 'title') this.player.setVisible(false);
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
    this.haptics.enabled = s.haptics;
    this.world.assist = this.assistOn();
    if (this.assistOn() && this.state !== 'title') this.assisted = true;
    this.ui.setDisplay(TEXT_SCALE[s.textSize], s.boostSide === 1, s.reduceMotion);
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
    if (!this.assisted && this.score > this.best) {
      this.best = Math.floor(this.score);
      void saveNumber(CONFIG.storageKeys.best, this.best);
      this.ui.setBest(this.best);
    }
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

  /** Dev: unlock everything: top rank, every sector and star, all looks and upgrades, plenty of credits. */
  devUnlockAll(): void {
    this.ranked.xp = Math.max(this.ranked.xp, RANKS[RANKS.length - 1].xp);
    this.ranked.skill = this.ranked.highestSkill = 50;
    this.ranked.save();
    this.progress.reachedLevel(sectorStart(26)); // loop 9
    for (let s = 0; s <= 26; s++) this.progress.addStars(s, STAR_CLEAR | STAR_NO_HITS | STAR_CHAIN);
    while (this.cosmetics.unlockNext()) {
      // every mission unlock
    }
    this.looks.buyAll();
    for (const s of SYSTEMS) while (this.upgrades.tier(s.id) < MAX_TIER) this.upgrades.raise(s.id);
    this.wallet.add(100000);
    this.refreshTitle();
    this.ui.showNotice('dev: everything unlocked');
  }

  /** Dev: replay the last run's course from the start. */
  devReplay(): void {
    this.beginRun(0, this.seed);
  }

  /** Dev: start a run a little before `level` begins. */
  devStartAt(level: number): void {
    const lead = 60; // points before the level starts, so you see the change
    this.beginRun(Math.max(0, (level - 1) * CONFIG.score.levelLength - lead));
  }

  // --- loop ----------------------------------------------------------------

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    this.stage.setTerrain(this.world.distance);
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
      case 'paused':
        break;
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
    }
    this.stage.fog.density = CONFIG.fog.density * this.events.fogScale();
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
    const target = speedAt(this.distanceScore);
    this.speed += (target - this.speed) * (1 - Math.exp(-CONFIG.speed.ease * dt));
    this.updateBoost(dt);
    const speed = this.currentSpeed();
    // Nose up and down with the hills ahead.
    const dist = this.world.distance;
    const slope = (terrain.heightAt(dist + 6) - terrain.heightAt(dist)) / 6;
    // Positive pitch dips the nose, so climbing subtracts.
    const pitch = this.boostLevel * CONFIG.boost.shipPitchDeg * DEG - Math.atan(slope) * CONFIG.terrain.shipPitch;
    this.player.update(dt, this.input.steering(), lateralSpeedAt(speed) * this.ship.steer, pitch);
    this.speedLines.update(dt, speed, this.settings.reduceMotion ? 0 : this.boostLevel);
    this.trail.update(this.player.lateral * dt, speed * dt, -this.player.steer * CONFIG.ship.maxBankDeg * DEG);
    if (this.boosting) {
      this.boostSeconds += dt;
      this.boosted = true;
    }

    const prev = this.world.distance;
    this.world.advance(dt, speed, this.player.lateral);
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
    if (level !== this.level) {
      const themeChange = themeName(level) !== themeName(this.level);
      this.level = level;
      this.ui.setLevel(level);
      this.progress.reachedLevel(level);
      if (sectorOf(level) !== this.sector) this.leaveSector(sectorOf(level));
      this.ui.announceLevel(level, themeName(level));
      this.sound.level(themeChange, musicFor(level));
      this.haptics.level(themeChange);
      this.maybeStartEvent(level);
      const loop = Math.floor((level - 1) / (CONFIG.themes.levelsPerTheme * 3));
      if (loop !== this.paletteLoop) {
        this.paletteLoop = loop;
        this.startPaletteFade(loop);
      }
    }
    this.ui.setProgress(progress - (level - 1));
    this.applyLook(progress);

    const fell = this.world.overPit();
    const hit = !fell && this.graceT <= 0 && this.world.hitTest(prev);
    if (hit && this.shield && !this.dev.invincible) {
      // The shield takes the hit; pass through for a moment.
      this.shield = false;
      this.player.setShield(false);
      this.graceT = CONFIG.powers.shield.graceSeconds + this.ship.graceExtra;
      this.sectorHit = true; // a shield save still counts as a hit for stars
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
      for (const done of this.missions.check(this.metrics())) this.missionDone(done);
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
      if (this.chain > this.sectorChain) this.sectorChain = this.chain;
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
    const kind = Events.forBiome(biomeForLevel(level));
    this.events.start(kind);
    this.ui.showNotice(EVENT_NOTICE[kind]);
  }

  private updateEvents(dt: number, dz: number): void {
    const ev = this.events;
    // An event ends early if the theme changes under it.
    const allowed = ev.kind === 'none' || Events.forBiome(biomeForLevel(this.level)) === ev.kind;
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
      this.overShown = true;
      this.ui.showHud(false);
      this.ui.hideBanner();
      this.ui.show('over');
    }
  }
}
