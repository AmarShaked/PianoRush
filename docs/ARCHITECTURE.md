# Piano Rush — Architecture (Milestone 1)

## Goals that shaped the design

1. **Musical time is authoritative.** Scoring and tile positions come from timestamps, never from frame counts or timers.
2. **The engine is pure and deterministic.** It has no React, PixiJS, DOM or audio dependencies, so it can be tested with exact millisecond inputs.
3. **Input is normalized at the boundary.** Every device produces the same `PianoEvent`.
4. **Extension points exist, but no speculative systems.** Audio, microphone input, native MIDI and level progression plug into seams that already exist.

## Module map and dependencies

```
            ┌──────────────────────── app/ (React) ────────────────────────┐
            │ App · StartScreen · GameScreen · ResultsScreen · Diagnostics │
            │ GameSession (framework-free orchestration, unit-tested)      │
            └──────┬───────────────┬───────────────┬──────────────┬────────┘
                   │               │               │              │
            game-renderer/    game-engine/    piano-input/   song-content/
            (PixiJS view)     (pure logic)    (adapters)     (data + schema)
                   │               │   ▲            │
                   └── reads ──────┘   └── PianoEvent type ┘
```

- `game-engine` imports only **types** from `piano-input` (`PianoEvent`) and `song-content` (`CompiledSong`).
- `game-renderer` reads `GameSnapshot`s. It never changes engine state.
- `app` is the only layer that knows about all the others.

## Time model

```
performance.now()  ──►  PianoEvent.time        (MIDI: MIDIMessageEvent.timeStamp, keyboard: KeyboardEvent.timeStamp)
        │
        ▼
   Transport.songTime(clock)  =  clock − start − Σ(pause intervals before clock) − countIn
        │                                   (negative during the count-in, ms from beat 0)
        ▼
   judgments (event time)  ·  tile Y (frame time)  ·  progress
```

- **One clock.** Everything uses the `performance.now()` time base. Web MIDI and DOM event timestamps already use it. Adapters fall back to `now()` when a device reports `0` or a timestamp from another time base.
- **`Transport` keeps a full pause history**, so `songTime(clock)` is a pure function. An event that is *delivered* late but *timestamped* before a pause is still mapped and judged correctly.
- **Resume uses a frozen countdown.** `resume()` schedules the end of the pause interval `resumeCountdownBeats` into the future. Song time stays frozen until then, and the renderer shows 3-2-1.
- **Future audio clock:** the `Clock` interface (`game-engine/clock.ts`) is the seam. M3 can supply a clock derived from `AudioContext.getOutputTimestamp()` without engine changes.

## Game engine

`GameEngine` (`src/game-engine/GameEngine.ts`)

| Method | Purpose |
| ------ | ------- |
| `start(clock)` | `ready → countdown` |
| `pause(clock)` / `resume(clock)` | Settles state up to the pause moment, then freezes song time. Resume goes `paused → resuming → playing` (or `countdown`). |
| `restart()` | Back to `ready`, with all notes, score and combo reset |
| `update(clock)` | State transitions, miss detection, completion. Safe at any call rate. |
| `handleInput(event)` | Match and judge using the **event's own timestamp** |
| `getSnapshot(clock)` / `getResults()` | Read models for the renderer and results screen |
| `on(listener)` | `judgment`, `wrongNote` and `state` events (drive visual effects) |

**Matching rules**

- A noteOn matches the **earliest pending note of the same pitch** whose Good window contains the event time. This is the standard rhythm-game choice, and it keeps rapid repeated notes in order when a player is consistently late.
- Window edges are inclusive (`|offset| ≤ 60` is Perfect). The windows are configurable and validated (`perfect ≤ great ≤ good`).
- Each note can be judged once (`status` goes `pending → hit | missed` only once).
- A noteOn for a held key within `duplicateWindowMs` (30 ms) is dropped as a duplicate. A later one counts as a re-strike, which covers devices that lose noteOffs.
- Unmatched presses count as **wrong notes**. By default they reset the combo (configurable). They are not penalized during the count-in.
- **Miss detection** runs in two places:
  - Inside `handleInput`, up to the event time exactly. This keeps combo order musical: a skipped note breaks the combo *before* the next hit.
  - Inside `update()`, up to `now − missGraceMs` (40 ms). This lets a slightly delayed event still be judged by its timestamp.

  Because of this split, results are identical at any frame rate. A test replays the same performance at 1000/144/60/30/10 FPS, with jittery frames, with no frames at all, and with 0–25 ms delivery delay.

**Scoring**

- Base points: Perfect 100, Great 75, Good 40, Miss 0.
- The combo multiplier is based on the combo before the hit. It is +0.1 every 10 hits, capped at ×1.5.
- **Note accuracy** = hits / notes. **Timing accuracy** is weighted (Perfect 1, Great 0.75, Good 0.4).
- Stars follow the PRD: 1 for completing, 2 at ≥80% note accuracy, 3 at ≥95%.

## Input layer

- `PianoEvent` (`piano-input/types.ts`) has `type`, `note`, `velocity`, `time`, `channel`, `source` and `deviceId`.
- `PianoInputSource` has `subscribe()` and an optional `subscribeStatus()` for connect/disconnect.
- `parseMidiMessage` handles Note On, Note Off, and Note On with velocity 0 (treated as Note Off). It ignores CC, pitch bend, aftertouch, clock, active sensing, SysEx and malformed data.
- `HeldNotesTracker` keeps streams well-formed: it drops duplicate noteOns and orphan noteOffs, and can release all held keys.
- `WebMidiManager`:
  - requests access (from a click), lists devices, selects one input, and listens only to that input;
  - hot-plug: when the selected device disconnects it emits synthetic noteOffs for held keys plus a `disconnected` status, and when the same device returns it re-attaches and emits `connected`;
  - `dispose()` removes every listener;
  - depends only on structural `MidiAccessLike` types, so tests use plain fakes and a future native bridge can match the same shape.
- `KeyboardSimulator` maps `A S D F G` (by `KeyboardEvent.code`, so it works on any keyboard layout). It suppresses auto-repeat, ignores modifier chords and form fields, and releases all keys on window blur.

## Song content

- `SongDefinition` (schema v1) is beat-based: `bpm`, `timeSignature`, `countInBeats`, `lanes` (a fixed lane → MIDI map), and `notes` (`midi`, `startBeat`, `durationBeats`, `hand`). There are optional `difficulty` and reserved `backing` fields for later milestones.
- `validateSong` checks schema version, ranges, the lane mapping, and same-pitch overlaps. `compileSong` validates and converts beats to milliseconds. Invalid songs throw before gameplay.
- `sequence()` is an authoring helper that writes melodies as `[pitch, beats]` steps, with `null` for rests.
- **Starlight Steps** is the M1 song. It is an original melody in C–G five-finger position: 100 BPM, 16 bars, A A′ B A″ form, 55 notes, about 38 s plus the count-in.

## Renderer

`GameRenderer` (PixiJS v8):

- Pulls one `GameSnapshot` per animation frame through a frame-source callback, which is `GameSession.frame()`. Tile Y is `hitY − (noteTime − songTime) × pxPerMs`, so motion is locked to musical time.
- The visible window is 3 beats, so note density stays the same at any tempo.
- Layers:
  - a static backdrop, flattened with `cacheAsTexture`;
  - lane press-glows, hidden when idle;
  - a beat/bar grid and a beat-pulsed hit line;
  - tiles (tap tiles, and hold tiles that drain while held);
  - pooled labels;
  - additive hit bursts;
  - a piano-key strip with black-key stubs and a MIDDLE C marker;
  - judgment, combo and countdown text.
- Cosmetic effects use wall-clock time and never affect gameplay. **Reduced motion** removes particles and pulses.
- Lanes are told apart by text labels on tiles and keys, not by color alone.
- PixiJS is loaded on demand when a level starts.

## App layer

- `GameSession` connects the inputs to the engine. It auto-pauses on device disconnect, exposes `frame()`, and handles `restart()` without reloading. It is unit-tested with a `ManualClock`.
- `GameScreen` updates the HUD (score, combo, progress) through refs instead of per-frame React renders. It pauses when the tab is hidden, and its hotkeys are Esc/P and R.
- `storage.ts` persists settings, the last MIDI device and best scores in `localStorage`, and tolerates storage being unavailable.

## Extension points (not implemented)

| Future system | Seam |
| ------------- | ---- |
| Audio engine / backing tracks (M3) | `Clock` interface; `SongDefinition.backing`; engine `judgment` events for SFX |
| Microphone recognition | A `PianoInputSource` with `kind: 'microphone'` that emits `PianoEvent`s |
| Native MIDI (iOS, desktop wrappers) | A `PianoInputSource` with `kind: 'native-midi'`, or a `MidiAccessLike` bridge |
| Multiple songs / levels | The `SONGS` catalog; `GameScreen` takes any `CompiledSong`; lanes come from song data |
| Learning progression | `GameResults` (stars, accuracies, mean offset); `difficulty` metadata |
| Calibration | `EngineConfig.inputOffsetMs`; results report the mean signed offset |
| Hold-release / chord scoring | `NoteState.releasedAt` is already tracked; the engine matches simultaneous notes |
