# PRD coverage

How each section of the Piano Rush PRD (v1.0) maps to the implementation.

**Status key**
- ✅ implemented and covered by automated tests (unit tests and/or headless-browser checks)
- 🟡 implemented, but needs validation on real hardware or by ear
- ⏭ intentionally not done (out of scope, or evaluation only)

| PRD § | Requirement | Status | Where |
| --- | --- | --- | --- |
| 1 | Product principles: fun, real skill, instant feedback, low friction, progressive, musical, offline, forgiving | ✅ | Whole app. Discover mode, practice speed and section loops make mistakes a learning step |
| 3.1 | Fixed lanes = physical keys, constant per level; first levels on white keys from middle C | ✅ | `SongDefinition.lanes`, World 1 |
| 3.2 | Tap, hold, chord tiles; rests as empty space | ✅ | `NoteState.hold`, `EventState` (chords), the renderer's hold tiles and chord bars |
| 3.3 | Pitch, note-on, note-off for holds, chord completeness, extra/wrong notes, misses; 60/130/220 ms windows (configurable); each note scored once; no duplicates | ✅ | `game-engine/GameEngine.ts` and its tests |
| 3.4 | Score per judgment, combo with a capped bonus, chords as one event with a partial-success policy | ✅ | `scoring.ts`, `GameEngine.resolveEvent` |
| 3.5 | Discover / Flow / Challenge on the same data | ✅ | `waitForNotes` (Discover), Flow, strict windows (Challenge) |
| 4 | Landscape screen: top bar (name, score, combo, progress, pause), lanes, hit line, feedback, key labels, active keys, finger guidance, keyboard reference; dark polished style | ✅ / 🟡 (60 FPS on a real GPU not measured) | `GameScreen`, `GameRenderer` |
| 5.1 | MIDI note on/off, velocity, connect/disconnect, velocity 0 = off, device selection and reconnection | ✅ / 🟡 (real devices) | `WebMidiManager` |
| 5.2 | Microphone recognition, monophonic first, no engine changes | 🟡 beta | `pitch.ts`, `PitchTracker`, `MicrophoneInput`; tested with synthetic audio and a WAV fed as the mic |
| 5.3 | Input abstraction, normalized events, one monotonic time base | ✅ | `PianoEvent`, `PianoInputSource` |
| 6.1 | Physical vs virtual piano output, no doubling of the melody | ✅ | Piano sound setting, arranger register rules |
| 6.2 | Backing with drums, bass, harmony and extra instruments, excluding the player's part; original/licensed/PD | ✅ / 🟡 (by ear) | `arranger.ts`, `synth.ts`; all content is original or public domain |
| 6.3 | Audio clock as the timing reference; music, tiles, scoring and progress synchronized; frame rate never sets musical time; scheduled start, pause, resume, seek, cleanup | ✅ / 🟡 (by ear) | `ClockSync`, `BackingPlayer`, `Transport` |
| 6.4 | Calibration flow saved per device configuration; device latency separate from human tap offset; manual adjustment; Bluetooth guidance | ✅ / 🟡 | `CalibrationScreen`, `calibration.ts`, `calibrationKeys.ts` |
| 7.1 | Worlds 1–6 | ✅ | `song-content/levels/world1.ts` … `world6.ts` (60 levels) |
| 7.2 | Per level: objective, range, hand, piece, tempo, modes, completion, star thresholds | ✅ | `LevelDefinition` |
| 7.3 | Stars (complete, ≥80%, ≥95%), accuracy and timing tracked separately, unlock without perfection | ✅ | `progression.ts` |
| 7.4 | Slow playback, section practice, repeated-pattern detection, reduced visual hints, memory challenges, finger guidance | ✅ | Practice speed, `practice.ts`, memory fades, note-label and finger settings |
| 8 | World 1: ten levels, musically coherent, 30–60 s | ✅ | Content tests check length, consonance and skills |
| 9 | Versioned, beat-based song data with ids, BPM, meter, notes, hands, lanes, backing, objectives, difficulty; validated before play | ✅ | `schema.ts`, `validate.ts`, `compile.ts` |
| 10 | First launch: welcome → input → connect → test notes → sound → calibration → level 1. Returning player: restore, reconnect, continue. Results: score, stars, accuracies, max combo, best, retry/next | ✅ | `SetupScreen`, `useMidi` auto-reconnect, `ResultsScreen` |
| 11 | Settings: device, input method, output mode, backing/piano/effects volumes, metronome, input offset, calibration, visual-effects intensity, note labels, difficulty | ✅ | Home screen Settings panels, `storage.ts` |
| 12 | Accessibility: colour not the only cue, labels, adjustable effects, reduced motion, adjustable timing, large targets, keyboard-accessible menus, no account | ✅ | Text labels on tiles and keys; effects Full/Reduced/Minimal; timing presets |
| 13 | React, TypeScript, Vite, PixiJS; game-engine / piano-input / audio-engine / song-content / ui modules | ✅ | `src/` layout |
| 13 | Native wrappers to be evaluated; iOS MIDI must not depend on Safari | ⏭ evaluation + bridge | [PLATFORMS.md](PLATFORMS.md), `NativeMidiBridge` |
| 14 | 60 FPS target, stable audio, low latency, no drift, backgrounding/disconnect handling, no duplicate scoring, frame-rate-independent scoring | ✅ / 🟡 (60 FPS and latency on real devices) | Frame-rate-independence tests; auto-pause on tab hide or device loss |
| 15 | No backend; local progress, bests, settings, device preference, calibration; offline assets | ✅ | `localStorage`, service worker |
| 16 | Out of scope: accounts, cloud, multiplayer, leaderboards, payments, AI songs, uploads, marketplace, social, polyphonic mic, AI coaching | ⏭ | Not built, as specified |
| 17 | Success criteria 1–8 | ✅ / 🟡 | Covered end to end in headless Chromium with simulated input; real-piano validation pending |

## What still needs a human with hardware

See [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md):
- a physical MIDI piano;
- an acoustic piano through a microphone;
- 60 FPS on a real GPU;
- audio sync and the mix, by ear;
- Bluetooth latency;
- whether the music sounds good to a musician (harmonies, arrangements).
