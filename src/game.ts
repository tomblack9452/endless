import { applyAtmosphere } from './atmosphere';
import { type AudioState, Sound } from './audio/sound';
import { createBlockTextures } from './blockTextures';
import { CONFIG, PALETTES } from './config';
import { lateralSpeedAt, speedAt } from './difficulty';
import { Input } from './input';
import { LivePalette } from './palette';
import { Player } from './player';
import { Stage } from './renderer';
import { SpeedLines } from './speedLines';
import { cycle, DEFAULT_SETTINGS, LEVEL_GAIN, loadSettings, saveSettings, type SettingKey, STEERING_RANGE } from './settings';
import { loadNumber, saveNumber } from './storage';
import { UI } from './ui';
import type { RoomId } from './interior';
import { themeForLevel, themeName, World } from './world';

type State = 'title' | 'playing' | 'paused' | 'crashed';

const DEG = Math.PI / 180;

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
  };
  private settings = { ...DEFAULT_SETTINGS };
  private settingsOpen = false; // settings screen showing (from the title or pause)
  private readonly ui = new UI();

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
  private runs = 0;

  /** Dev-only switches, set from the dev panel (never shown in production builds). */
  readonly dev = { invincible: false, fullBoost: false };

  private boostMeter = 0; // 0..1
  private boosting = false;
  private boostLevel = 0; // eased 0..1, scales the speed boost

  private crashMs = 0;
  private shattered = false;
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
    this.input = new Input(document.body);
    this.input.bindBoostControl(this.ui.boostControl);
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
      if (this.state === 'title') this.beginRun();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => this.pause());

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

  /** `startScore` > 0 starts part-way along (dev skip); otherwise a normal run. */
  private beginRun(startScore = 0): void {
    // From the title the open ground already ahead is kept; a retry starts clean.
    if (this.runs++ === 0 && startScore === 0) this.world.beginRun(CONFIG.field.startClearance);
    else this.world.reset(CONFIG.field.startClearance, true, startScore);
    const level = Math.floor(startScore / CONFIG.score.levelLength) + 1;
    this.sound.ignite();
    this.sound.setTheme(themeForLevel(level));
    this.runStart = this.world.distance - startScore / CONFIG.score.pointsPerUnit;
    this.score = this.distanceScore = startScore;
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
    this.input.releaseAll();
    this.input.enabled = true;
    this.level = level;
    const progress = startScore / CONFIG.score.levelLength;
    this.ui.setScore(startScore);
    this.ui.setLevel(level);
    this.ui.setProgress(progress - (level - 1));
    this.applyLook(progress);
    this.ui.announceLevel(level, themeName(level));
    this.ui.show(null);
    this.ui.showHud(true);
    this.state = 'playing';
  }

  private crash(): void {
    this.state = 'crashed';
    this.crashMs = 0;
    this.input.enabled = false;
    this.speedLines.update(0, 0, 0);
    this.sound.crash();
    this.ui.hideCombo();
    const isNewBest = this.score > this.best;
    if (isNewBest) {
      this.best = Math.floor(this.score);
      void saveNumber(CONFIG.storageKeys.best, this.best);
      this.ui.setBest(this.best);
    }
    this.ui.setGameOver(this.score, this.best, isNewBest, this.nearMissCount, this.bestChain);
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
    this.sound.resume();
    this.ui.show(null);
  }

  private onTap = (): void => {
    if (this.settingsOpen) return;
    switch (this.state) {
      case 'title':
        this.beginRun();
        break;
      case 'crashed':
        if (this.crashMs >= CONFIG.crash.retryLockMs) this.beginRun();
        break;
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'paused') this.onTap();
    else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.settingsOpen) this.closeSettings();
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
    else if (action === 'back') this.closeSettings();
  };

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
    this.player.setVisible(false);
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

  /** Dev: force every interior room to be `id` (null = random). */
  devSetRoom(id: RoomId | null): void {
    this.world.devRoom = id;
  }

  /** Dev: start a run a little before `level` begins. */
  devStartAt(level: number): void {
    const lead = 60; // points before the level starts, so you see the change
    this.beginRun(Math.max(0, (level - 1) * CONFIG.score.levelLength - lead));
  }

  // --- loop ----------------------------------------------------------------

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
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
    applyAtmosphere(this.basePalette, this.palette, levelProgress, this.world.canyonMix, this.world.interiorMix);
    this.stage.setPlanetVisible(1 - this.world.interiorMix);
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
    const target = speedAt(this.distanceScore);
    this.speed += (target - this.speed) * (1 - Math.exp(-CONFIG.speed.ease * dt));
    this.updateBoost(dt);
    const speed = this.currentSpeed();
    this.player.update(dt, this.input.steering(), lateralSpeedAt(speed), this.boostLevel * CONFIG.boost.shipPitchDeg * DEG);
    this.speedLines.update(dt, speed, this.boostLevel);

    const prev = this.world.distance;
    this.world.advance(dt, speed, this.player.lateral);
    this.world.spinPickups(dt);
    const got = this.world.collect(prev);
    if (got > 0) {
      this.boostMeter = Math.min(1, this.boostMeter + got * CONFIG.boost.pickup.amount);
      this.bonus += got * CONFIG.score.pickupPoints;
      this.ui.flashBoost();
      this.sound.pickup();
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
      this.ui.announceLevel(level, themeName(level));
      this.sound.level(themeChange, themeForLevel(level));
    }
    this.ui.setProgress(progress - (level - 1));
    this.applyLook(progress);

    if (this.world.hitTest(prev) && !this.dev.invincible) {
      this.crash();
      this.world.sync();
      return;
    }
    this.updateNearMisses(dt, prev);
    if (this.world.roomName !== this.shownRoom) {
      // A doorway: name the room (corridors have no name) and hiss.
      if (this.world.roomName) this.ui.showRoom(this.world.roomName);
      if (this.world.interiorMix > 0.5) this.sound.door();
      this.shownRoom = this.world.roomName;
    }
    this.score = this.distanceScore + this.bonus;
    this.ui.setScore(this.score);

    this.updateCamera(dt);
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
    this.stage.fovBoost =
      Math.min(c.maxFovBoost, Math.max(0, (this.speed - CONFIG.speed.base) * c.fovPerSpeed)) +
      this.boostLevel * CONFIG.boost.fovKick;
    const b = CONFIG.boost;
    this.stage.pullBack = this.boostLevel * b.cameraPullBack;
    this.stage.drop = this.boostLevel * b.cameraDrop;
    const v = this.boostLevel * b.vibration;
    this.stage.shakeX = (Math.random() * 2 - 1) * v;
    this.stage.shakeY = (Math.random() * 2 - 1) * v;
    if (this.nudgeMs > 0) {
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

    if (!this.shattered) {
      this.shattered = true;
      this.player.shatter();
    }
    this.player.updateFragments(dt);

    const t = (this.crashMs - c.freezeMs) / c.shakeMs;
    if (t < 1) {
      const amp = c.shakeAmount * (1 - t) * (1 - t);
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
