# Piano Rush — Architecture (Milestones 1–2)

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
- **There are two kinds of pause interval.**
  - `user`: input is ignored.
  - `wait`: Discover mode; input is accepted, and the tile sits on the line, so any press is on time.

  If the player pauses during a wait, the wait is split into a user pause. After resuming, the engine waits again.
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

**Events (notes and chords)**

- `compileSong` groups every note that starts on the same beat into a `SongEvent`. A single note is an event of size 1.
- **Events are the unit of scoring.** Combo, the Perfect/Great/Good/Miss counts and note accuracy are per event, not per key.
- Each key is still matched individually, so each lane gets its own feedback (`note` engine event). The scoring `judgment` event fires when the event's last key is judged.
- **Chord policy:**

  | Outcome | Judgment | Points | Combo |
  | ------- | -------- | ------ | ----- |
  | All keys hit | Worst key's judgment, one step lower if the keys spread over more than `chordWindowMs` (100 ms) | base × number of keys | Continues |
  | Some keys hit (partial) | Miss (tallied as a partial chord) | `partialChordFactor` (½) × the hit keys' base points | Breaks |
  | No keys hit | Miss | 0 | Breaks |

**Holds**

- A note is a hold when it is at least `holdMinBeats` long (default 1.5; the song can override it per note).
- After the note is hit, the hold is `holding` until one of these happens:
  - **released at or after `end − releaseToleranceMs` (220 ms):** `full`. Also `full` if the note's end passes while the key is still down. Earns `holdBonus` (50) × the combo multiplier.
  - **released earlier:** `early`. No bonus, but the hit and the combo stand (the learning-friendly choice).
- Pausing credits running holds as `full`.
- A lost noteOff followed by a re-strike ends the hold at the re-strike.
- The level does not finish while a hold is running.

**Discover (`waitForNotes`)**

- When the next unresolved event reaches the line, the transport opens a `wait` interval at exactly the moment `songTime == event.time`, even if the frame overshot.
- Nothing can be missed while waiting. Wrong keys are counted.
- When the event resolves, the wait closes at the press's timestamp.
- A press that arrives before any frame noticed the wait still triggers it first, so the result doesn't depend on frame rate.

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
- The combo multiplier is based on the combo before the event. It is +0.1 every 10 events, capped at ×1.5.
- **Note accuracy** = events played / events. **Timing accuracy** is weighted (Perfect 1, Great 0.75, Good 0.4).

**Progression** (`game-engine/progression.ts`, pure)

- `evaluateRun(level, results, mode)`:
  - Flow or Challenge: completed when note accuracy is at least the level's `completion.minNoteAccuracy` (0.5). Stars are 1 for completed, 2 at ≥80%, 3 at ≥95% (PRD §7.3).
  - Discover: practice only, so it is unranked.
- `applyRun` merges a run into the saved `ProgressMap`:
  - bests never go down;
  - a Challenge completion sets `challengeCleared`;
  - it reports `unlockedNext` and `newBestScore`.
- `isLevelUnlocked`: level 1 is always open; level *n* opens once *n − 1* is completed.
- `nextLevelToPlay` is where a returning player continues.

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
- **Song schema additions:** `holdMinBeats`, a per-note `hold` override, and `assist.fadeRanges`. Fade ranges are beat ranges whose tiles disappear before the line; the memory level uses them.
- **Levels:** `LevelDefinition` (`song-content/level.ts`) carries the PRD §7.2 fields: objective, hand, song (range and tempo), modes, completion condition and star thresholds. `levels/world1.ts` defines World 1, ten original pieces of 30–60 s.
- **Content tests** check every level:
  - it is valid and 30–60 s long;
  - it starts and ends on C;
  - levels 1–5 add exactly one key each;
  - holds and eighths appear only where planned;
  - the faded repeat matches the shown phrase.
- **Starlight Steps** (the M1 song) is level 10, "First Concert".

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
| More worlds | Append a `WorldDefinition` to `app/catalog.ts`; lanes, holds and assists come from data |
| Practice tools (slow playback, section loop) | `Transport` (a rate factor fits next to the pause history) |
| Calibration | `EngineConfig.inputOffsetMs`; results report the mean signed offset |
