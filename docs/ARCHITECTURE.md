# Piano Rush — Architecture

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
- **Audio follows the same timeline.** The transport's song time places tiles, judges input and drives the backing (see *Audio engine*).
  - `ClockSync` maps gameplay time to `AudioContext` time from `getOutputTimestamp()` pairs.
  - A sound scheduled at `toContextTime(t)` is **heard** at gameplay time `t`, which compensates output latency.
  - The mapping is re-measured every 100 ms as the median of the last ~1.5 s of samples. That makes it immune to stale timestamps, and the two clocks can't drift apart over a song.

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
- **World 2** (`levels/world2.ts`) teaches rhythm in the same C–G position.
  - Level 5 is in 3/4: `timeSignature [3, 4]`, a 6-beat count-in, and the arranger's `waltz` style.
  - The consonance test is meter-aware: in 3/4 only the downbeat is strong.
  - Content tests check that each level really contains its skill (halves and wholes, inner rests, eighths, 3/4, dotted, syncopation, memory fades).
- **Path unlocking crosses worlds.** `LEVELS` is the concatenation of all path worlds, and `isPlayable`/`nextInOrder` in `app/catalog.ts` use that single order. World 2 level 1 opens when World 1 level 10 is completed, and "Next" on the results screen continues into the next world.
- **Public-domain tunes** (`songs/publicDomain.ts`): Au Clair de la Lune, Ode to Joy, When the Saints, Jingle Bells, Mary Had a Little Lamb, Twinkle Twinkle, Lightly Row, Hot Cross Buns, Go Tell Aunt Rhody and London Bridge.
  - Each has its melody, lanes, a credit, and a chord progression written for Piano Rush.
  - World 1 uses four of them where the keys fit the skill ladder.
  - `levels/hits.ts` builds the **Hits** free-play collection from them (`WorldDefinition.kind = 'freeplay'`: all open, separate ids so progress never unlocks World 1).
  - Only original or public-domain melodies are allowed; licensed songs would need publisher and label rights.

## Audio engine (`src/audio-engine/`)

| Piece | Role | Tested |
| ----- | ---- | ------ |
| `arranger.ts` | Pure: `CompiledSong` + `backing` spec → `BackingNote[]` (drums, bass, pads/keys, clicks) per style (gentle / straight / groove / pop / dance; the energetic styles add phrase crashes and snare-roll fills). Includes the count-in clicks and an optional metronome. The band never plays the player's part and stays out of their register; the player's part is added (as `melody`, on the piano bus) only for the melody guide and Listen. | Unit tests: determinism, patterns, register, ending, bass coverage per level |
| `schedule.ts` | Pure: `notesInWindow` (consecutive windows never repeat or skip a note); `notesSoundingAt` (re-enter held harmony after a resume) | Unit tests |
| `ClockSync.ts` | Gameplay ms ↔ audio-context s, using a sliding median of output-timestamp offsets | Unit tests: outliers, drift, device change, fallback |
| `calibration.ts` | Tap analysis: nearest-click matching, median offset, consistency, reliability, suggested offset; high-latency check | Unit tests |
| `sampler.ts` | Note → sample mapping for the sampled grand: nearest minor-third sample (re-pitched ≤ ±1 semitone), velocity layer, in-layer gain, attack-onset detection (decoders pad MP3s differently) | Unit tests: every key, continuous loudness, onset |
| `SampledPiano.ts` | Downloads the Salamander samples on first use (most-used layer first, 6 at a time), falls back per note to a neighbouring layer and to the synth piano | Unit tests with a fake context; prod build: lazy download, offline cache |
| `synth.ts` | Instruments built from oscillators, filters and noise (kick, snare, hat, bass, pad, keys, click, piano). Work on any `BaseAudioContext`. | Offline render in Chromium: onsets within 0.1 ms |
| `AudioEngine.ts` | The `AudioContext`, buses (backing / piano / metronome → master → limiter), unlock-on-gesture, precise `playBacking`, `sustainChord`, built-in piano note on/off, latency info | Headless Chromium checks |
| `BackingPlayer.ts` | Glue between the engine and the audio. A 25 ms timer queues notes about 120 ms ahead (plus device latency) at exact context times. | Headless Chromium: beat period exact, jitter < 0.1 ms |

**How `BackingPlayer` handles playback:**
- **Pause, wait, resume and restart:** any state other than `countdown`/`playing` stops queued audio. Restart, resume and the end of a Discover wait carry on from the current song position, re-entering any chord that is still sounding, so the harmony isn't silent.
- **Discover:** the current chord is held softly while the song waits.
- **Finish:** the final chord fades out over 1.2 s.

**Mixing and piano output:**
- The player's piano is the loudest bus, and the backing sits under it.
- Piano output can be physical, virtual or auto (decided when a level starts). Since the backing never contains the melody, neither mode doubles it.
- The level starts `250 ms + device latency` after the click, so the first count-in click is queued in time.

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

## MVP completion (M4)

- **Setup guide** (`app/screens/SetupScreen.tsx`, PRD §10): welcome → input method → connect → find your keys → sound → ready. The ready step offers optional calibration, then starts level 1.
  - It is shown on first launch, controlled by `settings.onboarded`, and can be reopened any time.
  - The "find your keys" guidance comes from `piano-input/keyFinding.ts` (pure and tested). It works in white keys left/right and octaves up/down.
- **Practice speed** (PRD §7.4): `songFor(level, speed)` compiles the song at `bpm × speed`.
  - Beats, lanes and the arrangement are unchanged, so tiles, judgments and the backing all scale together.
  - `evaluateRun(…, speed)` makes slowed-down runs unranked: no stars, no unlocks.
- **Offline / installable** (PRD §15): `pwa/serviceWorker.ts` generates `sw.js` at build time through a small Vite plugin in `vite.config.ts`.
  - **Install:** pre-caches every bundle and public file.
  - **Hashed assets:** served cache-first, matched with `ignoreVary` because module scripts carry an `Origin` header.
  - **Page loads:** network-first, falling back to the cached shell.
  - **Cache versioning:** the cache name comes from the file list, and old caches are deleted on activation.
  - Registered in production only. The build uses `base: './'`, so it runs from any path.
- **TypeScript projects:** `tsconfig.app.json` (browser code, no Node types) and `tsconfig.node.json` (build tooling), tied together by `tsc -b`.

## Worlds 3–6, practice, microphone and platforms

**Content generation (`song-content/parts.ts`, `levels/derived.ts`)**
- `chordPart` makes chord parts from a progression in block, beats, pop, broken or Alberti patterns. `bassPart` makes left-hand bass in whole, half, beats, waltz or root-fifth patterns.
- Every generated note is a chord tone by construction, and same-pitch notes never overlap.
- Worlds 4–6 derive their levels from melodies the player already knows:
  - `leftHandVersion`: one octave down, fingering 5-4-3-2-1;
  - `accompanimentVersion`: the player plays the chords and the band plays the tune as `backing.lead`;
  - `twoHandVersion`: right-hand melody plus a generated left-hand bass, with `backing.omit: ['bass']`.
- `fiveFingerFingering` provides finger guidance.
- `transposeChord` / `transposeSteps` reuse tunes in new keys (Ode to Joy in F for B♭).

**Arranger registers**
- `registersFor(lanes)` keeps every pitched band part outside the player's range: chords move above a left-hand part, and the bass stays below the lowest lane.
- A test checks this for left-hand, two-hand and chord lane sets.
- With a `lead`, pads are dropped; `omit` removes parts the player covers.

**Renderer**
- Black-key lanes and keys, flat spelling (`preferFlats`).
- Hand divider and labels (each lane's hand comes from the majority of its notes).
- Finger numbers, a LOW C landmark, and connecting bars for chord tiles.
- A minimal-effects mode.

**Practice (`song-content/practice.ts`)**
- `findPhrases` labels 4-bar phrases by content (same letter = same notes and rhythm).
- `repeatedPatterns` reports the phrases that repeat.
- `sliceSong(from, to, repeats)` builds a looped section with matching chords and lead; it is validated and unranked (`evaluateRun(…, practice=true)`).

**Microphone (`piano-input/pitch.ts`, `PitchTracker.ts`, `MicrophoneInput.ts`)**
- YIN detection on 2048-sample windows every 20 ms. The tracker debounces onsets (timestamped at the first frame) and turns them into PianoEvents.
- Releases are decays to 18% of the peak. A sudden level rise on the same pitch counts as a re-strike, and pitches outside the range (bass bleed) are ignored.
- Event times are the middle of the analysis window minus the reported input latency.

**Native bridge (`piano-input/NativeMidiBridge.ts`)**
- `window.PianoRushNative` receives raw MIDI bytes plus the event's age from iOS/Android wrappers.
- Events go through the same parser and filtering as Web MIDI. See PLATFORMS.md.

**Calibration per device (`app/calibrationKeys.ts`)**
- Offsets are stored under `"<input>|<wired|wireless>"`, where the input is a named MIDI device, the keyboard or the microphone. The wireless/wired flag comes from the reported output latency.
- `inputOffsetMs` is the default for configurations that haven't been calibrated.

**Sound effects** go through their own `effects` bus in `AudioEngine.playEffect`, triggered by engine judgment, hold and wrong-note events.

## Licensed songs (MIDI import)

- **`song-content/midi/smf.ts`:** a dependency-free Standard MIDI File reader.
  - Formats 0 and 1, PPQ timing, running status, tempo / time-signature / track-name meta events.
  - Note on/off pairing per channel.
  - Multi-channel tracks are split per channel.
- **`midi/smfWriter.ts`:** builds test fixtures.
- **`midi/convert.ts`** (`midiToSong`):
  1. Chooses the player tracks (`suggestMelodyTrack` uses names, then pitch, single-line-ness and note count).
  2. Cuts the bar range and trims leading silence.
  3. Snaps to a grid.
  4. Finds the octave that best fits the hand's comfortable window.
  5. Splits hands at middle C.
  6. Reduces each hand to a top/bottom line, or up to 3-note chords.
  7. Removes same-key overlaps.
  8. Estimates the key (Krumhansl–Schmuckler) for sharp/flat spelling.
  9. Infers one triad per half bar from duration-weighted pitch classes of the accompaniment, with the melody at half weight and a bass-root bonus.

  The result is validated like any song, with warnings for tempo/meter changes, range and lane count.
- **`app/library.ts` ("My Songs"):** IndexedDB records of `{ song, audio?: Blob, license }`, exposed as a free-play collection. Recordings become blob URLs.
- **Licensed packs:** `catalog.ts` bundles `content/licensed/*.json` via `import.meta.glob`; the folder is git-ignored.
- **Recorded backing:** `backing.audio = { url, offsetMs }`. `BackingPlayer` keeps only the clicks from the arrangement and starts the recording so that `offsetMs` lines up with beat 0 on the same timeline (latency-compensated). Pauses, waits and restarts stop it, and it resumes from the current position. Slowed-down or section runs use the generated band.
- **Licence data:** `SongDefinition.license` (holder, reference, territory) is shown on the level.

## Extension points (not implemented)

| Future system | Seam |
| ------------- | ---- |
| Recorded backing tracks | `BackingSpec` can gain an audio-file reference; `BackingPlayer` already follows the transport |
| Sound effects | Engine `note`/`judgment`/`hold` events; add an `effects` bus to `AudioEngine` |
| Microphone recognition | A `PianoInputSource` with `kind: 'microphone'` that emits `PianoEvent`s |
| Native MIDI (iOS, desktop wrappers) | A `PianoInputSource` with `kind: 'native-midi'`, or a `MidiAccessLike` bridge |
| More worlds (3–6) | Append a `WorldDefinition` to `WORLDS` in `app/catalog.ts`; unlocking continues automatically. Lanes, meter, holds and assists come from data. Left-hand and two-hand worlds need the song's `hand` and lanes below middle C (the arranger's bass register will need moving down) |
| Practice tools (slow playback, section loop) | `Transport` (a rate factor fits next to the pause history) |
| Calibration | `EngineConfig.inputOffsetMs`; results report the mean signed offset |
