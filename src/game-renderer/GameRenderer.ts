import { Application, Container, FillGradient, Graphics, Text } from 'pixi.js';
import type { Judgment } from '../game-engine/config';
import type { GameSnapshot, NoteState } from '../game-engine/GameEngine';
import { computeLayout, noteBottomY, type PlayfieldLayout } from './layout';
import { COLORS, FONT_FAMILY, JUDGMENT_STYLE, laneColor, shade } from './theme';

export interface LaneInfo {
  readonly midi: number;
  /** e.g. "C4" */
  readonly noteName: string;
  /** e.g. "C" */
  readonly pitchClass: string;
  /** Computer-keyboard key for the simulator, e.g. "A". */
  readonly keyHint?: string;
  readonly isMiddleC: boolean;
}

export interface GameRendererOptions {
  readonly lanes: readonly LaneInfo[];
  readonly msPerBeat: number;
  readonly totalBeats: number;
  readonly beatsPerBar: number;
  /** Beats of music visible above the hit line. */
  readonly lookaheadBeats?: number;
  readonly reducedMotion?: boolean;
  readonly showKeyHints?: boolean;
  /** Pixels at the top covered by the DOM HUD. */
  readonly topInset?: number;
}

type Effect =
  | { kind: 'hit'; lane: number; start: number; judgment: Judgment; seed: number }
  | { kind: 'miss'; lane: number; start: number }
  | { kind: 'wrong'; lane: number | null; start: number };

const HIT_FX_MS = 420;
const MISS_FX_MS = 320;
const WRONG_FX_MS = 260;

/**
 * PixiJS presentation of the play field.
 *
 * Purely a view: each animation frame it pulls a GameSnapshot (via the frame
 * source callback) and draws it. Tile positions derive from the snapshot's
 * song time, so visuals stay locked to musical time whatever the frame rate.
 * Cosmetic effects (bursts, pops) use wall-clock time and never influence
 * gameplay.
 */
export class GameRenderer {
  private readonly app: Application;
  private readonly opts: Required<Omit<GameRendererOptions, 'lanes'>> & { lanes: readonly LaneInfo[] };
  private layout: PlayfieldLayout | null = null;
  private frameSource: (() => GameSnapshot | null) | null = null;

  private readonly root = new Container();
  private readonly background = new Graphics();
  private readonly laneGlows: Graphics[] = [];
  private readonly grid = new Graphics();
  private readonly tiles = new Graphics();
  private readonly tileLabels = new Container();
  private readonly labelPool: Text[] = [];
  private readonly hitLine = new Graphics();
  private readonly receptors = new Graphics();
  private readonly effectsGfx = new Graphics();
  private readonly keys = new Graphics();
  private readonly keyLabels = new Container();
  private readonly comboText: Text;
  private readonly judgmentText: Text;
  private readonly timingText: Text;
  private readonly countdownText: Text;
  private readonly hintText: Text;
  private readonly hintBg = new Graphics();

  private readonly glowLevels: number[];
  private effects: Effect[] = [];
  private judgmentShownAt = -Infinity;
  private lastCombo = 0;
  private comboBumpAt = -Infinity;
  private lastPressedKey = '';
  /** Whether the "MIDDLE C" marker fits beside the keyboard (else it sits on the key). */
  private middleCOutside = false;
  private middleCBadge: { x: number; y: number; w: number } | null = null;
  private lastFrameAt = performance.now();
  private destroyed = false;

  private constructor(app: Application, options: GameRendererOptions) {
    this.app = app;
    this.opts = {
      lookaheadBeats: 3,
      reducedMotion: false,
      showKeyHints: true,
      topInset: 0,
      ...options,
    };
    this.glowLevels = options.lanes.map(() => 0);

    const bigText = (size: number, weight: '700' | '800' | '900' = '900') =>
      new Text({
        text: '',
        style: { fontFamily: FONT_FAMILY, fontSize: size, fontWeight: weight, fill: 0xffffff, align: 'center', letterSpacing: 2 },
        anchor: 0.5,
      });
    this.comboText = bigText(96);
    this.judgmentText = bigText(40);
    this.timingText = bigText(16, '700');
    this.countdownText = bigText(160);
    this.hintText = bigText(26, '800');

    for (let i = 0; i < options.lanes.length; i++) {
      const g = new Graphics();
      g.blendMode = 'add';
      this.laneGlows.push(g);
    }
    this.effectsGfx.blendMode = 'add';

    this.root.addChild(
      this.background,
      ...this.laneGlows,
      this.grid,
      this.comboText,
      this.receptors,
      this.hitLine,
      this.tiles,
      this.tileLabels,
      this.effectsGfx,
      this.keys,
      this.keyLabels,
      this.judgmentText,
      this.timingText,
      this.countdownText,
      this.hintBg,
      this.hintText,
    );
    app.stage.addChild(this.root);
    // The static backdrop is flattened into one texture: far less overdraw on
    // fill-rate-limited devices (integrated GPUs, older tablets).
    this.background.cacheAsTexture(true);
    app.ticker.add(this.tick);
  }

  /** Create a renderer whose canvas fills `host` and follows its size. */
  static async create(host: HTMLElement, options: GameRendererOptions): Promise<GameRenderer> {
    const app = new Application();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    await app.init({
      resizeTo: host,
      background: COLORS.background,
      // MSAA only where it is visible: on high-DPI screens the extra pixels
      // already smooth edges and MSAA would multiply the fill cost.
      antialias: dpr < 2,
      autoDensity: true,
      resolution: dpr,
      powerPreference: 'high-performance',
    });
    app.canvas.style.display = 'block';
    app.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(app.canvas);
    return new GameRenderer(app, options);
  }

  setFrameSource(source: (() => GameSnapshot | null) | null): void {
    this.frameSource = source;
  }

  /** Per-key feedback in a lane (one call per key, also for each key of a chord). */
  triggerNote(lane: number, judgment: Judgment): void {
    const now = performance.now();
    if (judgment === 'miss') this.effects.push({ kind: 'miss', lane, start: now });
    else this.effects.push({ kind: 'hit', lane, start: now, judgment, seed: Math.random() * Math.PI * 2 });
  }

  /** The judgment popup for a whole musical event (note or chord). */
  showJudgment(judgment: Judgment, offsetMs: number | null, partialChord = false): void {
    const style = JUDGMENT_STYLE[judgment];
    this.judgmentText.text = partialChord ? 'PARTIAL' : style.label;
    this.judgmentText.tint = partialChord ? JUDGMENT_STYLE.good.color : style.color;
    this.judgmentShownAt = performance.now();
    if (judgment === 'perfect' || judgment === 'miss' || offsetMs === null) {
      this.setSubText('', 0);
    } else {
      this.setSubText(offsetMs < 0 ? 'EARLY' : 'LATE', offsetMs < 0 ? 0x9ecbff : 0xffb38a);
    }
  }

  /** Result of a hold note's release. */
  triggerHold(lane: number, result: 'full' | 'early'): void {
    const now = performance.now();
    if (result === 'full') {
      this.effects.push({ kind: 'hit', lane, start: now, judgment: 'great', seed: Math.random() * Math.PI * 2 });
      this.setSubText('HOLD!', 0x8dff8a);
    } else {
      this.effects.push({ kind: 'miss', lane, start: now });
      this.setSubText('RELEASED EARLY', 0xffb38a);
    }
    this.judgmentShownAt = Math.max(this.judgmentShownAt, now - 300);
  }

  triggerWrongNote(lane: number | null): void {
    this.effects.push({ kind: 'wrong', lane, start: performance.now() });
  }

  private setSubText(text: string, color: number): void {
    this.timingText.text = text;
    if (text) this.timingText.tint = color;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  }

  // -------------------------------------------------------------------------

  private readonly tick = (): void => {
    const snapshot = this.frameSource?.();
    if (!snapshot) return;
    const now = performance.now();
    const dt = Math.min(100, now - this.lastFrameAt);
    this.lastFrameAt = now;

    const { width, height } = this.app.screen;
    if (!this.layout || this.layout.width !== width || this.layout.height !== height) {
      this.relayout(width, height);
    }
    const layout = this.layout!;

    this.drawLaneGlows(snapshot, dt);
    this.drawGrid(layout, snapshot);
    this.drawReceptorsAndHitLine(layout, snapshot);
    this.drawTiles(layout, snapshot);
    this.drawEffects(layout, now);
    this.drawKeys(layout, snapshot);
    this.drawTexts(layout, snapshot, now);
  };

  private relayout(width: number, height: number): void {
    const layout = computeLayout(width, height, {
      laneCount: this.opts.lanes.length,
      lookaheadMs: this.opts.lookaheadBeats * this.opts.msPerBeat,
      topInset: this.opts.topInset,
    });
    this.layout = layout;
    this.lastPressedKey = '';
    const { left, laneWidth, lanes } = { ...layout, lanes: this.opts.lanes };

    // Background + lanes
    const bg = this.background;
    bg.clear();
    const sideGradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x0b0b18 },
        { offset: 1, color: 0x1a1236 },
      ],
      textureSpace: 'local',
    });
    bg.rect(0, 0, width, layout.keysTop).fill(sideGradient);
    lanes.forEach((_, i) => {
      const x = left + i * laneWidth;
      bg.rect(x, 0, laneWidth, layout.keysTop).fill({ color: i % 2 ? COLORS.laneB : COLORS.laneA, alpha: 0.92 });
      // faint lane-coloured wash near the hit line
      const wash = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: 'rgba(0,0,0,0)' },
          { offset: 1, color: hexToRgba(laneColor(i), 0.16) },
        ],
        textureSpace: 'local',
      });
      bg.rect(x, layout.hitY - 220, laneWidth, 220).fill(wash);
    });
    for (let i = 0; i <= lanes.length; i++) {
      const x = left + i * laneWidth;
      bg.rect(x - 1, 0, 2, layout.keysTop).fill({ color: COLORS.separator, alpha: i === 0 || i === lanes.length ? 0.9 : 0.6 });
    }
    // keyboard bed
    bg.rect(0, layout.keysTop, width, layout.keysHeight).fill(0x07070f);
    bg.rect(left - 8, layout.keysTop, layout.right - left + 16, layout.keysHeight).fill(0x1b1b2b);
    bg.updateCacheTexture();

    // Lane press glows (static shapes, animated via alpha)
    this.laneGlows.forEach((g, i) => {
      g.clear();
      const glow = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: 'rgba(0,0,0,0)' },
          { offset: 1, color: hexToRgba(laneColor(i), 0.55) },
        ],
        textureSpace: 'local',
      });
      g.rect(left + i * laneWidth + 2, 0, laneWidth - 4, layout.keysTop).fill(glow);
      g.alpha = 0;
      g.visible = false;
    });

    // Key labels (static text)
    for (const child of this.keyLabels.removeChildren()) child.destroy();
    const kh = layout.keysHeight;
    lanes.forEach((lane, i) => {
      const cx = left + (i + 0.5) * laneWidth;
      const name = new Text({
        text: lane.noteName,
        style: { fontFamily: FONT_FAMILY, fontSize: Math.round(clamp(kh * 0.2, 13, 22)), fontWeight: '800', fill: 0x1b1b2b },
        anchor: { x: 0.5, y: 1 },
      });
      name.position.set(cx, layout.height - kh * 0.1);
      this.keyLabels.addChild(name);
      if (this.opts.showKeyHints && lane.keyHint) {
        const hint = new Text({
          text: lane.keyHint,
          style: { fontFamily: FONT_FAMILY, fontSize: Math.round(clamp(kh * 0.15, 11, 16)), fontWeight: '700', fill: 0x5a5a7a },
          anchor: { x: 0.5, y: 1 },
        });
        hint.position.set(cx, layout.height - kh * 0.1 - name.height - 2);
        this.keyLabels.addChild(hint);
      }
      if (lane.isMiddleC) {
        this.middleCOutside = i === 0 && left >= 120;
        const badge = new Text({
          text: 'MIDDLE C',
          style: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '800', fill: 0xffffff, letterSpacing: 1.5 },
          anchor: this.middleCOutside ? { x: 1, y: 0.5 } : { x: 0.5, y: 0.5 },
        });
        badge.tint = 0xff4d6d;
        this.middleCBadge = null;
        if (this.middleCOutside) {
          badge.position.set(left - 26, layout.keysTop + kh * 0.62);
        } else {
          // On the C key's free top-left area (left of the C# black key).
          const freeW = laneWidth * 0.8 - 6;
          badge.scale.set(Math.min(1, (freeW - 10) / badge.width));
          const bx = left + i * laneWidth + 4 + freeW / 2;
          const by = layout.keysTop + kh * 0.22 + 4;
          badge.position.set(bx, by);
          this.middleCBadge = { x: bx, y: by, w: badge.width + 10 };
        }
        this.keyLabels.addChild(badge);
      }
    });

    this.comboText.style.fontSize = Math.round(clamp(laneWidth * 0.75, 48, 120));
    this.countdownText.style.fontSize = Math.round(clamp(height * 0.22, 80, 200));
    this.judgmentText.style.fontSize = Math.round(clamp(laneWidth * 0.32, 24, 44));
  }

  private drawLaneGlows(s: GameSnapshot, dt: number): void {
    const k = Math.min(1, dt / 70);
    this.opts.lanes.forEach((lane, i) => {
      const target = s.heldNotes.has(lane.midi) ? 1 : 0;
      const cur = this.glowLevels[i] ?? 0;
      const next = target > cur ? target : cur + (target - cur) * k; // instant on, eased off
      this.glowLevels[i] = next;
      const glow = this.laneGlows[i]!;
      glow.alpha = next * 0.9;
      glow.visible = next > 0.01; // skip the full-height draw entirely when idle
    });
  }

  private drawGrid(layout: PlayfieldLayout, s: GameSnapshot): void {
    const g = this.grid;
    g.clear();
    const msPerBeat = this.opts.msPerBeat;
    const first = Math.max(0, Math.floor(s.beat));
    const last = Math.min(this.opts.totalBeats, Math.ceil(s.beat + this.opts.lookaheadBeats + 1));
    for (let b = first; b <= last; b++) {
      const y = noteBottomY(layout, b * msPerBeat, s.songTime);
      if (y < 0 || y > layout.hitY) continue;
      const bar = b % this.opts.beatsPerBar === 0;
      g.rect(layout.left, y - (bar ? 1 : 0.5), layout.right - layout.left, bar ? 2 : 1).fill({
        color: 0xffffff,
        alpha: bar ? 0.12 : 0.045,
      });
    }
  }

  private drawReceptorsAndHitLine(layout: PlayfieldLayout, s: GameSnapshot): void {
    const running = s.state === 'playing' || s.state === 'countdown';
    const frac = s.beat - Math.floor(s.beat);
    const pulse = running && !this.opts.reducedMotion ? Math.exp(-frac * 5) : 0;
    const downbeat = running && Math.floor(s.beat) % this.opts.beatsPerBar === 0;

    const h = this.hitLine;
    h.clear();
    const w = layout.right - layout.left;
    h.rect(layout.left, layout.hitY - 10, w, 20).fill({ color: 0xffffff, alpha: 0.04 + pulse * (downbeat ? 0.12 : 0.07) });
    h.rect(layout.left, layout.hitY - 1.5, w, 3).fill({ color: COLORS.hitLine, alpha: 0.75 + pulse * 0.25 });

    const r = this.receptors;
    r.clear();
    const wait = this.opts.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(performance.now() / 160);
    this.opts.lanes.forEach((lane, i) => {
      const held = s.heldNotes.has(lane.midi);
      const wanted = s.waitingFor.includes(lane.midi);
      const x = layout.left + i * layout.laneWidth + 6;
      const color = laneColor(i);
      if (wanted) {
        // Discover: show exactly which key the song is waiting for.
        r.roundRect(x - 4, layout.hitY - 20, layout.laneWidth - 4, 40, 12).fill({ color, alpha: 0.15 + 0.25 * wait });
      }
      r.roundRect(x, layout.hitY - 14, layout.laneWidth - 12, 28, 8)
        .fill({ color, alpha: held ? 0.45 : wanted ? 0.25 : 0.08 })
        .stroke({ width: wanted ? 3 : 2, color, alpha: held || wanted ? 1 : 0.45 });
    });
  }

  private drawTiles(layout: PlayfieldLayout, s: GameSnapshot): void {
    const g = this.tiles;
    g.clear();
    const msPerBeat = this.opts.msPerBeat;
    const pad = Math.max(4, layout.laneWidth * 0.06);
    const gap = 3;
    const radius = Math.min(12, layout.laneWidth * 0.1);
    let labelIndex = 0;

    for (const n of s.notes) {
      // Notes are time-sorted: once one is above the screen, all later ones are too.
      if (noteBottomY(layout, n.timeMs, s.songTime) < -40) break;
      const endTime = n.timeMs + n.durationMs;
      if (n.status === 'hit' && n.hold !== 'early' && s.songTime > Math.max(endTime, (n.judgedAt ?? 0) + 150)) continue;
      if (n.status === 'missed' && s.songTime - n.timeMs > 1500) continue;

      const color = laneColor(n.lane);
      const x = layout.left + n.lane * layout.laneWidth + pad;
      const w = layout.laneWidth - pad * 2;
      let bottom = noteBottomY(layout, n.timeMs, s.songTime);
      let top = bottom - n.durationMs * layout.pxPerMs + gap;
      const isHold = n.isHold;

      if (n.status === 'hit') {
        if (n.hold === 'early') {
          // Released too soon: the unplayed rest of the note greys out and fades.
          const t = (s.songTime - (n.releasedAt ?? s.songTime)) / 300;
          if (t >= 1 || t < 0) continue;
          bottom = Math.min(bottom, layout.hitY);
          if (bottom - top < 2) continue;
          g.roundRect(x, top, w, bottom - top, radius).fill({ color: COLORS.missed, alpha: 0.6 * (1 - t) });
          continue;
        }
        if (n.hold === 'holding') {
          // The remaining part of the held note drains into the hit line.
          bottom = Math.min(bottom, layout.hitY);
          if (bottom - top < 2) continue;
          g.roundRect(x - 2, top, w + 4, bottom - top, radius).fill({ color: shade(color, 0.35), alpha: 0.95 });
          g.roundRect(x + w * 0.3, top + 4, w * 0.4, Math.max(0, bottom - top - 8), radius / 2).fill({ color: 0xffffff, alpha: 0.7 });
          continue;
        }
        // Short pop-out right after the hit.
        const t = (s.songTime - (n.judgedAt ?? n.timeMs)) / 150;
        if (t >= 1 || t < 0) continue;
        const grow = 1 + t * 0.25;
        const h = Math.min(bottom - top, 60);
        const cx = x + w / 2;
        const cy = Math.min(bottom, layout.hitY) - h / 2;
        g.roundRect(cx - (w * grow) / 2, cy - (h * grow) / 2, w * grow, h * grow, radius).fill({ color: 0xffffff, alpha: (1 - t) * 0.8 });
        continue;
      }

      if (top > layout.keysTop || bottom < -20) continue;
      bottom = Math.min(bottom, layout.keysTop);
      top = Math.max(top, -40);
      const h = bottom - top;
      if (h <= 1) continue;

      if (n.status === 'missed') {
        g.roundRect(x, top, w, h, radius).fill({ color: COLORS.missed, alpha: 0.55 }).stroke({ width: 2, color: 0xff5470, alpha: 0.5 });
        continue;
      }

      // Pending tile. Memory assistance fades it out over the last beats before the line.
      const beatsAway = (n.timeMs - s.songTime) / msPerBeat;
      // Hidden for the last 1.5 beats: the player must remember which key comes next.
      const a = n.assistFade ? clamp((beatsAway - 1.5) / 0.75, 0, 1) : 1;
      if (a <= 0) continue;
      const proximity = clamp(1 - beatsAway, 0, 1);
      if (proximity > 0) {
        g.roundRect(x - 4, top - 4, w + 8, h + 8, radius + 4).fill({ color, alpha: 0.18 * proximity * a });
      }
      if (isHold) {
        g.roundRect(x, top, w, h, radius).fill({ color: shade(color, -0.35), alpha: 0.9 * a }).stroke({ width: 2, color, alpha: 0.95 * a });
        g.roundRect(x + w * 0.38, top + 6, w * 0.24, Math.max(0, h - 12 - 26), 3).fill({ color, alpha: 0.85 * a });
        const headH = Math.min(h, 26);
        g.roundRect(x, bottom - headH, w, headH, radius).fill({ color, alpha: a });
      } else {
        g.roundRect(x, top, w, h, radius).fill({ color, alpha: a });
        g.roundRect(x + 3, top + 3, w - 6, Math.min(h * 0.35, 18), radius * 0.7).fill({ color: 0xffffff, alpha: 0.22 * a });
      }
      g.roundRect(x, top, w, h, radius).stroke({ width: 2, color: shade(color, 0.55), alpha: 0.9 * a });

      if (h >= 24 && a >= 0.6) this.placeLabel(labelIndex++, n, x + w / 2, bottom - Math.min(h, 26) / 2 - 1, layout);
    }
    for (let i = labelIndex; i < this.labelPool.length; i++) this.labelPool[i]!.visible = false;
  }

  private placeLabel(index: number, n: Readonly<NoteState>, x: number, y: number, layout: PlayfieldLayout): void {
    let label = this.labelPool[index];
    if (!label) {
      label = new Text({
        text: '',
        style: { fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: '900', fill: 0x14142a },
        anchor: 0.5,
      });
      this.labelPool.push(label);
      this.tileLabels.addChild(label);
    }
    const lane = this.opts.lanes[n.lane];
    label.text = lane ? lane.pitchClass : '';
    label.style.fontSize = Math.round(clamp(layout.laneWidth * 0.18, 13, 22));
    label.position.set(x, y);
    label.visible = true;
  }

  private drawEffects(layout: PlayfieldLayout, now: number): void {
    const g = this.effectsGfx;
    g.clear();
    const reduced = this.opts.reducedMotion;
    this.effects = this.effects.filter((e) => {
      const age = now - e.start;
      if (e.kind === 'hit') {
        if (age > HIT_FX_MS) return false;
        const t = age / HIT_FX_MS;
        const ease = 1 - (1 - t) ** 3;
        const cx = layout.left + (e.lane + 0.5) * layout.laneWidth;
        const cy = layout.hitY;
        const color = laneColor(e.lane);
        const jColor = JUDGMENT_STYLE[e.judgment].color;
        const strength = e.judgment === 'perfect' ? 1 : e.judgment === 'great' ? 0.8 : 0.55;
        // light beam up the lane
        const beamH = (reduced ? 90 : 220) * (1 - t * 0.5);
        g.rect(cx - layout.laneWidth * 0.42, cy - beamH, layout.laneWidth * 0.84, beamH).fill({
          color,
          alpha: 0.28 * (1 - t) * strength,
        });
        // flash at the line
        g.roundRect(cx - layout.laneWidth * 0.45, cy - 12, layout.laneWidth * 0.9, 24, 10).fill({
          color: 0xffffff,
          alpha: 0.5 * (1 - t) * strength,
        });
        if (!reduced) {
          g.circle(cx, cy, layout.laneWidth * (0.25 + ease * 0.45)).stroke({ width: 4 * (1 - t) + 1, color: jColor, alpha: 1 - t });
          const count = e.judgment === 'perfect' ? 12 : 8;
          for (let i = 0; i < count; i++) {
            const a = e.seed + (i / count) * Math.PI * 2;
            const dist = ease * (50 + (i % 3) * 22);
            const px = cx + Math.cos(a) * dist;
            const py = cy + Math.sin(a) * dist * 0.75 - ease * 30;
            g.circle(px, py, 3.2 * (1 - t) + 0.5).fill({ color: i % 2 ? jColor : color, alpha: 1 - t });
          }
        }
        return true;
      }
      if (e.kind === 'miss') {
        if (age > MISS_FX_MS) return false;
        const t = age / MISS_FX_MS;
        g.rect(layout.left + e.lane * layout.laneWidth, layout.hitY - 120, layout.laneWidth, 132).fill({
          color: COLORS.wrong,
          alpha: 0.16 * (1 - t),
        });
        return true;
      }
      if (age > WRONG_FX_MS) return false;
      const t = age / WRONG_FX_MS;
      if (e.lane === null) {
        const w = layout.right - layout.left;
        g.rect(layout.left, 0, 6, layout.keysTop).fill({ color: COLORS.wrong, alpha: 0.6 * (1 - t) });
        g.rect(layout.left + w - 6, 0, 6, layout.keysTop).fill({ color: COLORS.wrong, alpha: 0.6 * (1 - t) });
      } else {
        const x = layout.left + e.lane * layout.laneWidth;
        g.rect(x, 0, layout.laneWidth, layout.keysTop).fill({ color: COLORS.wrong, alpha: 0.14 * (1 - t) });
        g.roundRect(x + 6, layout.hitY - 14, layout.laneWidth - 12, 28, 8).stroke({ width: 3, color: COLORS.wrong, alpha: 1 - t });
      }
      return true;
    });
  }

  private drawKeys(layout: PlayfieldLayout, s: GameSnapshot): void {
    const pressedKey = this.opts.lanes
      .map((l) => (s.heldNotes.has(l.midi) ? 1 : 0) + (s.waitingFor.includes(l.midi) ? 2 : 0))
      .join('');
    if (pressedKey === this.lastPressedKey) return;
    this.lastPressedKey = pressedKey;

    const g = this.keys;
    g.clear();
    const { left, laneWidth, keysTop, keysHeight } = layout;
    const lanes = this.opts.lanes;
    lanes.forEach((lane, i) => {
      const pressed = s.heldNotes.has(lane.midi);
      const x = left + i * laneWidth + 2;
      const y = keysTop + 4 + (pressed ? 3 : 0);
      const w = laneWidth - 4;
      const h = keysHeight - 10;
      const color = laneColor(i);
      g.roundRect(x, y + 4, w, h, 8).fill({ color: COLORS.keyShadow, alpha: pressed ? 0 : 1 });
      g.roundRect(x, y, w, h, 8).fill(pressed ? shade(color, 0.45) : COLORS.keyWhite);
      g.rect(x, y, w, 5).fill(color);
      if (!pressed && s.waitingFor.includes(lane.midi)) {
        g.roundRect(x + 2, y + 2, w - 4, h - 4, 7).stroke({ width: 4, color });
      }
      if (lane.isMiddleC) {
        if (this.middleCOutside) {
          const ty = keysTop + keysHeight * 0.62;
          g.poly([left - 20, ty - 7, left - 8, ty, left - 20, ty + 7]).fill(0xff4d6d);
        } else if (this.middleCBadge) {
          const b = this.middleCBadge;
          g.roundRect(b.x - b.w / 2, b.y - 10 + (pressed ? 3 : 0), b.w, 20, 10).fill({ color: 0x14142a, alpha: 0.9 });
        }
      }
    });
    // Black-key stubs between whole-tone neighbours, mirroring a real keyboard
    // (there is none between E and F) to help locate the physical keys.
    for (let i = 0; i < lanes.length - 1; i++) {
      const a = lanes[i]!;
      const b = lanes[i + 1]!;
      if (b.midi - a.midi !== 2) continue;
      const bx = left + (i + 1) * laneWidth;
      const bw = laneWidth * 0.34;
      g.roundRect(bx - bw / 2, keysTop + 2, bw, keysHeight * 0.4, 5).fill(COLORS.keyBlack).stroke({ width: 1, color: 0x33334a });
    }
  }

  private drawTexts(layout: PlayfieldLayout, s: GameSnapshot, now: number): void {
    const cx = (layout.left + layout.right) / 2;

    // Combo (big, subtle, behind the tiles)
    if (s.combo !== this.lastCombo) {
      if (s.combo > this.lastCombo) this.comboBumpAt = now;
      this.lastCombo = s.combo;
      this.comboText.text = s.combo >= 5 ? String(s.combo) : '';
    }
    const bump = this.opts.reducedMotion ? 0 : Math.max(0, 1 - (now - this.comboBumpAt) / 160);
    this.comboText.position.set(cx, layout.hitY * 0.42);
    this.comboText.scale.set(1 + bump * 0.12);
    this.comboText.alpha = 0.13 + bump * 0.12;

    // Judgment pop
    const jAge = now - this.judgmentShownAt;
    const jy = layout.hitY - Math.min(220, layout.hitY * 0.33);
    if (jAge < 700) {
      const pop = this.opts.reducedMotion ? 0 : Math.max(0, 1 - jAge / 120);
      this.judgmentText.alpha = jAge < 450 ? 1 : 1 - (jAge - 450) / 250;
      this.judgmentText.scale.set(1 + pop * 0.3);
      this.judgmentText.position.set(cx, jy);
      this.timingText.alpha = this.judgmentText.alpha;
      this.timingText.position.set(cx, jy + this.judgmentText.height * 0.75);
    } else {
      this.judgmentText.alpha = 0;
      this.timingText.alpha = 0;
    }

    // Count-in / resume countdown
    let count = '';
    let frac = 0;
    if (s.state === 'countdown') {
      count = String(Math.max(1, Math.ceil(-s.beat)));
      frac = s.beat - Math.floor(s.beat);
    } else if (s.state === 'resuming' && s.resumeRemainingMs !== null) {
      const beats = s.resumeRemainingMs / this.opts.msPerBeat;
      count = String(Math.max(1, Math.ceil(beats)));
      frac = 1 - (beats - Math.floor(beats));
    } else if (s.state === 'playing' && s.beat >= 0 && s.beat < 1) {
      count = 'GO!';
      frac = s.beat;
    }
    this.countdownText.text = count;
    this.countdownText.position.set(cx, layout.hitY * 0.45);

    // Discover: name the key(s) the song is waiting for.
    if (s.state === 'waiting' && s.waitingFor.length) {
      const names = s.waitingFor.map((m) => this.opts.lanes.find((l) => l.midi === m)?.noteName ?? '').join(' + ');
      this.hintText.text = `PLAY  ${names}`;
      this.hintText.position.set(cx, layout.hitY * 0.62);
      this.hintText.alpha = this.opts.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(now / 160);
      const bw = this.hintText.width + 40;
      const bh = this.hintText.height + 16;
      this.hintBg.clear();
      this.hintBg.roundRect(cx - bw / 2, layout.hitY * 0.62 - bh / 2, bw, bh, bh / 2).fill({ color: 0x0b0b18, alpha: 0.85 }).stroke({ width: 2, color: 0xffffff, alpha: 0.25 });
      this.hintBg.visible = true;
    } else {
      this.hintText.alpha = 0;
      this.hintBg.visible = false;
    }
    this.countdownText.alpha = count ? 1 - frac * 0.75 : 0;
    this.countdownText.scale.set(this.opts.reducedMotion ? 1 : 1 + (1 - frac) * 0.25);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function hexToRgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${alpha})`;
}
