# Piano Rush

A rhythm game you play with a **real piano**. Tiles fall toward a hit line in fixed lanes, and each lane is one physical key. You play the key when its tile reaches the line.

Current state: **Milestone 2: World 1 learning path**, built on the M1 playable prototype.

- **M1** added Web MIDI input, a keyboard simulator, a frame-rate-independent scoring engine and a PixiJS renderer.
- **M2** adds:
  - ten original World 1 levels with stars and unlocks;
  - Discover, Flow and Challenge modes;
  - scoring for long-note releases;
  - chord scoring.

![Level select with World 1 levels, stars and mode picker](docs/screenshot-home.png)

![Lanes C4–G4 with falling tiles, a hit line and a piano-key strip](docs/screenshot-gameplay.png)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Open the URL in **desktop Chrome or Edge**. Then either:

- click **Connect MIDI piano** and choose your keyboard, or
- leave **Play with keyboard simulator** on and use `A S D F G`.

Pick a level (only level 1 is open at first), choose a mode, and press **Play**.

## Commands

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                      |
| `npm test`          | Run all Vitest unit tests once (deterministic, no browser) |
| `npm run test:watch`| Vitest in watch mode                                 |
| `npm run typecheck` | TypeScript strict type check                         |
| `npm run build`     | Type check + production build into `dist/`           |
| `npm run preview`   | Serve the production build locally                   |

Add `?debug` to the URL (e.g. `http://localhost:5173/?debug`) to show an FPS / song-time readout during play.

## How to play

| Lane | Piano key | MIDI | Simulator key |
| ---- | --------- | ---- | ------------- |
| 1    | C4 (middle C) | 60 | `A` |
| 2    | D4        | 62   | `S`           |
| 3    | E4        | 64   | `D`           |
| 4    | F4        | 65   | `F`           |
| 5    | G4        | 67   | `G`           |

- Put your right thumb on **middle C**. The home screen shows where it is, and in the game it is marked on the key strip. Your five fingers rest on C D E F G.
- A tile's **bottom edge** is the moment to press. Tall tiles are long notes, so keep holding them.
- Judgments: **Perfect** ≤ 60 ms, **Great** ≤ 130 ms, **Good** ≤ 220 ms, otherwise **Miss**. You can switch to Relaxed or Strict in Settings.
- **Esc** or **P** pauses the game. On the pause screen, **R** restarts. When you resume, there is a 3-beat countdown first.

## Levels, modes and progress

**World 1, First Touch.** All ten pieces are original, for the right hand, in five-finger position from middle C. Each level adds one idea.

| # | Level | New skill | Keys |
|---|-------|-----------|------|
| 1 | First Note | play middle C in time | C |
| 2 | Up & Down | move between two keys | C D |
| 3 | Three Steps | stepwise up and down | C–E |
| 4 | Little Melody | first tune shape | C–F |
| 5 | Five Fingers | full five-finger position | C–G |
| 6 | Hold It | long notes (release is scored) | C–G |
| 7 | Jump! | thirds and fifths | C–G |
| 8 | Rhythm Run | eighths, dotted rhythms, rests | C–G |
| 9 | Memory Challenge | each phrase repeats with fading tiles | C–G |
| 10 | First Concert | full performance piece | C–G |

**Modes** (all use the same song data):

- **Discover**: the song stops when a note reaches the line and waits until you play it. A pill names the key, and that key is highlighted. This is practice only: no stars, no unlocks.
- **Flow**: full tempo, and the music keeps going through mistakes. Earns stars.
- **Challenge**: strict timing windows (±40/90/150 ms). Completing it earns the level's 🏆.

**Stars and unlocks** (per level):

| Result | Note accuracy |
| ------ | ------------- |
| Complete (★) | ≥ 50 % |
| ★★ | ≥ 80 % |
| ★★★ | ≥ 95 % |

Completing a level unlocks the next one. Progress, best scores and the chosen mode are saved in your browser. Returning players start on their next unfinished level.

**Long notes** are tall tiles with a stripe. Keep the key down until the tile has drained into the line. Releasing early loses the hold bonus, but keeps the hit and the combo.

## Connecting a real MIDI piano

1. Connect the piano to the computer, either over USB ("USB to Host" port) or through a USB-MIDI interface. Turn the piano on.
2. Open the game in **Chrome, Edge or Opera** on desktop. Firefox 108+ also works, but it asks you to install a site permission add-on. The page must come from `https://` or `http://localhost`.
3. Click **Connect MIDI piano**, then allow MIDI access in the browser prompt.
4. Pick your device from **Input device**. If only one device is connected, it is selected for you. The game remembers your choice and reconnects to it next time.
5. Open **MIDI diagnostics** and press a few keys. You should see Note On / Note Off events with pitch, velocity and timestamps, and the held keys light up.
6. If hits are always judged LATE even when they feel on time, raise **Settings → Input offset**. Results also show your average early/late tendency.

If the piano is unplugged during a level, the game pauses and shows a notice. Plug it back in and press Resume. The device is re-attached automatically.

**Bluetooth MIDI** works if the operating system exposes it as a MIDI port. Bluetooth adds latency, so you will probably need an input offset.

## Browser compatibility

| Browser | Gameplay | Web MIDI |
| ------- | -------- | -------- |
| Chrome / Edge / Opera (desktop) | ✅ | ✅ |
| Firefox (desktop) 108+ | ✅ | ✅ (needs site permission add-on) |
| Safari (macOS) | ✅ | ❌ No Web MIDI. Use the keyboard simulator. |
| Safari / any browser on iOS & iPadOS | ✅ | ❌ No Web MIDI. A native adapter is planned. |
| Chrome on Android | ✅ | ✅ (USB OTG), not yet tested |

The app detects Web MIDI support at runtime. It never assumes Safari supports it, and it shows guidance when MIDI is unavailable. Rendering needs WebGL or WebGPU.

## Project layout

```
src/
  game-engine/    Pure game logic: transport, matching, chords, holds, Discover waits, scoring, state machine, progression
  piano-input/    PianoEvent contract, Web MIDI manager, keyboard simulator, held-note tracking
  song-content/   Versioned beat-based song schema, validation, compilation, level definitions, World 1
  game-renderer/  PixiJS presentation (reads engine snapshots, never drives time)
  app/            React screens, GameSession orchestration, settings persistence
  test/           Shared test helpers and fakes
docs/
  ARCHITECTURE.md
  MANUAL_TEST_CHECKLIST.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, and [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md) for testing on real hardware.

## Known limitations

- **No audio yet.** There is no backing track, metronome click or virtual piano sound. With a physical piano, you hear your piano. With the simulator, play is silent. The count-in and beat pulse are visual only. Audio is M3.
- **Chords are engine-only.** Chord scoring (one musical event, with a rule for partly played chords) is implemented and tested, but World 1 is single-note right-hand content, so no level uses chords yet (PRD: World 5).
- **Only World 1 exists.** Worlds 2–6 are not authored.
- **Discover does not slow the tempo.** It stops at each note, but between notes it moves at the song tempo.
- **No calibration flow.** There is only a manual input offset. Output latency (audio/display) is not measured.
- **Progress is per browser.** It lives in `localStorage`, with no sync (by design for the MVP).
- **Safari / iOS have no MIDI input.** This needs a native wrapper or adapter.
- **Not yet verified on a physical MIDI piano or a real GPU.** The MIDI path is covered by unit tests against a faked Web MIDI API and was exercised in headless Chromium with the keyboard simulator. 60 FPS has not been measured on real hardware. The headless test container has no GPU, so software rendering reached only about 13 FPS there. Scoring was identical regardless of frame rate. Use `?debug` and the manual checklist on real devices.
- Phones are supported in landscape at a basic level. Portrait shows a "rotate your device" prompt.
