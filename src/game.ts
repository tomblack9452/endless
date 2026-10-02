import { applyAtmosphere } from './atmosphere';
import { type AudioState, Sound } from './audio/sound';
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
import { Cosmetics, describe, UNLOCK_ORDER } from './cosmetics';
import { Haptics } from './haptics';
import { Hints } from './hints';
import { Missions, type RunMetrics } from './missions';
import { dailySeed, Progress } from './progress';
import { newSeed } from './rng';
import { loadNumber, saveNumber } from './storage';
import { formatScore, UI } from './ui';
import type { RoomId } from './interior';
import { themeForLevel, themeName, World } from './world';

type State = 'title' | 'playing' | 'paused' | 'crashed';

const DEG = Math.PI / 180;

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
  // Run mode: daily (fixed seed) or normal from a checkpoint.
  private daily = false;
  private fromLevel = 1; // checkpoint chosen on the title screen
  private scoreBase = 0; // checkpoint runs score from zero
  private pickupCount = 0;
  private recorded = false; // this run's stats are saved
  private readonly cosmetics = new Cosmetics();
  private readonly missions = new Missions();
  /** Which info screen is open from the title (stats, missions, hangar), if any. */
  private infoOpen: 'stats' | 'missions' | 'hangar' | null = null;
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
      if (this.state === 'title') this.startNormal();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => this.pause());

    this.ui.bindTitleLinks(this.onTitleLink);
    void this.progress.load().then(() => this.refreshTitle());
    this.ui.bindHangar(this.onHangar);
    void this.missions.load();
    void this.cosmetics.load().then(() => this.applyCosmetics());
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
  private beginRun(startScore = 0, seed = newSeed(), opts: { daily?: boolean; countFrom?: boolean } = {}): void {
    this.seed = seed;
    this.daily = opts.daily ?? false;
    this.scoreBase = opts.countFrom ? startScore : 0;
    this.pickupCount = 0;
    this.recorded = false;
    this.boostSeconds = this.roomsEntered = this.missionTimer = 0;
    this.boosted = false;
    this.infoOpen = null;
    this.paletteLoop = 0;
    this.fadeT = 1;
    this.applyCosmetics();
    this.world.reset(CONFIG.field.startClearance, true, startScore, seed);
    const level = Math.floor(startScore / CONFIG.score.levelLength) + 1;
    this.sound.ignite();
    this.sound.setTheme(themeForLevel(level));
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
    this.stage.pullBack = this.stage.drop = 0;
    this.speedLines.update(0, 0, 0);
    this.player.reset();
    this.player.setVisible(true);
    this.trail.reset();
    this.trail.setVisible(true);
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
    const isNewBest = this.score > this.best;
    if (isNewBest) {
      this.best = Math.floor(this.score);
      void saveNumber(CONFIG.storageKeys.best, this.best);
      this.ui.setBest(this.best);
    }
    this.ui.setGameOver(this.score, this.best, isNewBest, this.nearMissCount, this.bestChain, this.seed);
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
        score: this.score,
        level: this.level,
        distance: this.world.distance,
        seconds: this.runTime,
        nearMisses: this.nearMissCount,
        bestChain: this.bestChain,
        pickups: this.pickupCount,
        crashedIn,
      },
      this.daily,
    );
    for (const done of this.missions.endRun(this.metrics())) this.missionDone(done);
    this.refreshTitle();
    if (this.daily) return newDaily ? 'new daily best' : `daily best ${formatScore(this.progress.dailyBest)}`;
    if (this.scoreBase > 0) return `started at the ${themeName(this.fromLevel)}`;
    return '';
  }

  private metrics(): RunMetrics {
    return {
      level: this.level,
      score: this.score,
      nearMisses: this.nearMissCount,
      bestChain: this.bestChain,
      pickups: this.pickupCount,
      boostSeconds: this.boostSeconds,
      rooms: this.roomsEntered,
      boosted: this.boosted,
      daily: this.daily,
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
    this.player.setShape(c.ship);
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

  private onHangar = (kind: 'ship' | 'trail' | 'palette'): void => {
    this.cosmetics.cycle(kind);
    this.applyCosmetics();
    this.openHangar();
  };

  private openHangar(): void {
    const c = this.cosmetics;
    this.ui.renderHangar(
      {
        ship: [c.ship, c.ships().length],
        trail: [c.trail, c.trails().length],
        palette: [c.palette, c.palettes().length],
      },
      c.next() ? `missions unlock more (${c.unlocked} of ${UNLOCK_ORDER.length})` : 'everything unlocked',
    );
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

  private openInfo(which: 'stats' | 'missions' | 'hangar'): void {
    this.infoOpen = which;
    this.ui.show(which);
  }

  /** Start a normal run from the chosen checkpoint (scoring from zero). */
  private startNormal(): void {
    this.beginRun((this.fromLevel - 1) * CONFIG.score.levelLength, newSeed(), { countFrom: true });
  }

  private startDaily(): void {
    this.beginRun(0, dailySeed(), { daily: true });
  }

  /** Retry in the same mode as the run that just ended. */
  private retry(): void {
    if (this.daily) this.startDaily();
    else this.startNormal();
  }

  private onTitleLink = (name: string): void => {
    if (name === 'daily') this.startDaily();
    else if (name === 'stats') this.openStats();
    else if (name === 'missions') this.openMissions();
    else if (name === 'hangar') this.openHangar();
    else if (name === 'from') {
      const cps = this.progress.checkpoints();
      this.fromLevel = cps[(cps.indexOf(this.fromLevel) + 1) % cps.length];
      this.refreshTitle();
    }
  };

  private refreshTitle(): void {
    const cps = this.progress.checkpoints();
    if (!cps.includes(this.fromLevel)) this.fromLevel = 1;
    // Only offer a choice once there's somewhere other than the start to begin.
    this.ui.setTitleLink('from', cps.length > 1 ? `start: ${themeName(this.fromLevel)}` : '');
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
      ['best score', formatScore(Math.max(s.bestScore, this.best))],
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
        this.startNormal();
        break;
      case 'crashed':
        if (this.crashMs >= CONFIG.crash.retryLockMs) this.retry();
        break;
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'paused') this.onTap();
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
    if (this.infoOpen === 'hangar' && this.state === 'title') this.player.setVisible(false);
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
    if (this.score > this.best) {
      this.best = Math.floor(this.score);
      void saveNumber(CONFIG.storageKeys.best, this.best);
      this.ui.setBest(this.best);
    }
    this.state = 'title';
    this.input.enabled = false;
    this.input.releaseAll();
    this.boosting = false;
    this.boostLevel = 0;
    this.chain = 0;
    this.speed = CONFIG.speed.titleDrift;
    this.stage.pullBack = this.stage.drop = 0;
    this.stage.shakeX = this.stage.shakeY = 0;
    this.speedLines.update(0, 0, 0);
    this.player.reset(); // clears any crash pieces or fall
    this.player.setVisible(false);
    this.trail.setVisible(false);
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
    applyAtmosphere(this.basePalette, this.palette, levelProgress, w.canyonMix, w.interiorMix, w.deckMix, this.settings.contrast);
    // Stars: full over the deck, faint outside at night.
    const sky = this.palette.sky;
    const daylight = Math.pow(0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b, 1 / 2.2);
    const night = Math.max(0, Math.min(1, (0.55 - daylight) / 0.35)) * CONFIG.space.nightStars * (1 - w.interiorMix);
    this.sky.setAmount(Math.max(w.deckMix, night));
    this.stage.setPlanetVisible(1 - this.world.interiorMix);
    this.stage.setUnderfloor(this.world.insideMix);
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
    this.player.update(dt, this.input.steering(), lateralSpeedAt(speed), this.boostLevel * CONFIG.boost.shipPitchDeg * DEG);
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
      this.ui.announceLevel(level, themeName(level));
      this.sound.level(themeChange, themeForLevel(level));
      this.haptics.level(themeChange);
      const loop = Math.floor((level - 1) / (CONFIG.themes.levelsPerTheme * 3));
      if (loop !== this.paletteLoop) {
        this.paletteLoop = loop;
        this.startPaletteFade(loop);
      }
    }
    this.ui.setProgress(progress - (level - 1));
    this.applyLook(progress);

    const fell = this.world.overPit();
    if ((fell || this.world.hitTest(prev)) && !this.dev.invincible) {
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
    if (this.boosting) this.boostMeter = Math.max(0, this.boostMeter - dt / b.drainSeconds);
    else this.boostMeter = Math.min(1, this.boostMeter + dt / b.fillSeconds);
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

  /** Forward speed including boost. */
  private currentSpeed(): number {
    return this.speed * (1 + (CONFIG.boost.speedMultiplier - 1) * this.boostLevel);
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
