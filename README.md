# Piano Rush

A rhythm game you play with a **real piano**. Tiles fall toward a hit line, and each lane is one physical key. You play the key when its tile reaches the line, while the game plays a backing band around you. It's a piano learning game that feels like Piano Tiles.

The full product described in the PRD is implemented:
- **Six learning worlds, 60 levels:** from one key, through rhythm, range and black keys, then the left hand and chords, to two hands.
- **15 famous public-domain songs** for free play.
- **Three modes:** Discover, Flow and Challenge.
- **Input:** MIDI, the computer keyboard, and microphone input (beta) for acoustic pianos.
- **Audio:** synchronized, generated backing tracks and a built-in piano sound.
- **Learning tools:** practice tools, calibration and a setup guide.
- **Offline and installable** as an app.

See [docs/PRD_COVERAGE.md](docs/PRD_COVERAGE.md) for a section-by-section mapping, including what is intentionally left for later.

![Level select](docs/screenshot-home.png)

![Gameplay](docs/screenshot-gameplay.png)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Open the URL in **desktop Chrome or Edge**. On first launch a short **setup guide** walks you through it:
1. Choose how you'll play: MIDI piano, computer keyboard or microphone.
2. Connect.
3. **Find your keys:** the game asks for middle C, then D, E, F and G, and explains mistakes, e.g. "That was E4. C4 is 2 white keys to the left".
4. Pick the piano sound.
5. Optionally calibrate.
6. Start level 1.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | All Vitest tests: deterministic, no browser |
| `npm run typecheck` | TypeScript strict check (app and build tooling) |
| `npm run build` | Type check + production build into `dist/` (includes the offline service worker) |
| `npm run preview` | Serve the production build |

Add `?debug` to the URL for an FPS and song-time readout during play.

## Playing

- **Hitting notes:** a tile's **bottom edge** is the moment to press. Tall tiles with a stripe are **long notes**: hold them until they drain into the line.
- **Chords:** tiles joined by a bar are a **chord**; press those keys together.
- **Timing:** **Perfect** ≤ 60 ms, **Great** ≤ 130 ms, **Good** ≤ 220 ms. Relaxed and Strict presets are in Settings, and Challenge mode is always Strict.
- **Pausing:** **Esc** pauses (or use the ❚❚ button). On the pause screen, **R** restarts.
- **Modes:**
  - **Discover:** the song waits for the right key.
  - **Flow:** full tempo; earns stars.
  - **Challenge:** strict timing; earns a 🏆.
- **👂 Listen:** the game plays the whole song for you on the built-in piano while the tiles fall and the keys light up. No score is kept; it works at any practice speed.
- **🎹 Melody guide:** the built-in piano softly plays your part along with you. In Discover it plays each note the song stops to wait for. Guided runs are practice (no stars).
- **Practice speed:** 50% / 75% / Full. **Practice a section** loops any 4-bar phrase three times and points out repeated phrases ("Phrase A appears 4×"). Practice runs never give stars.
- **Stars per level:** ★ for completing (≥ 50% of notes), ★★ for ≥ 80%, ★★★ for ≥ 95%. Completing a level unlocks the next, and the unlock order continues across worlds.

### Computer keyboard

| Row | Keys | Notes |
| --- | --- | --- |
| Home row | `A S D F G H J K L ; '` | C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 |
| Row above | `W E · T Y U · O P` | C#4 D#4 · F#4 G#4 A#4 · C#5 D#5 |
| Bottom row (left hand) | `Z X C V B N M` | C3 D3 E3 F3 G3 A3 B3 |

## Worlds

| World | Skill | Famous songs inside |
| --- | --- | --- |
| **1 · First Touch** | one key → five keys (C–G), long notes, jumps, rhythm, memory | Au Clair de la Lune, Ode to Joy, When the Saints, Jingle Bells |
| **2 · Rhythm Road** | steady pulse, halves and wholes, rests, eighths, **3/4**, dotted notes, syncopation | Lightly Row, Hot Cross Buns, Go Tell Aunt Rhody |
| **3 · Melody Mountain** | 6 keys, full octave, leaps, hand shift, **black keys** (B♭, F♯, G♯, D♯) | Twinkle, Joy to the World, Brahms' Lullaby, Amazing Grace, Greensleeves, **Für Elise** |
| **4 · Left Hand Land** | left hand C3–G3 (fingers 5-4-3-2-1), walking bass | known melodies, now in the left hand |
| **5 · Chord City** | thirds, open pairs, the C triad, C/F/G chords, pop rhythm, broken chords, Alberti bass; **the band plays the tune while you accompany** | Au Clair, Mary, Twinkle, Lightly Row, Ode to Joy, Hot Cross Buns, Jingle Bells |
| **6 · Two Hands Festival** | call and response, left-hand bass under right-hand melody (whole, half, waltz, root-fifth), octave unison | Ode to Joy, Lightly Row, Saints, Jingle Bells, Mary, Hot Cross Buns |

**🔥 Hits** is open from the start. It has two licensed hits converted from MIDI by the importer, **Dance Monkey** and **Can You Feel the Love Tonight**, plus 15 famous public-domain songs, all with full-energy arrangements. Hits keeps its own scores and never affects unlocks.

**Songs and rights.** The learning worlds use original or public-domain melodies with Piano Rush's own harmonies. The licensed hits (`src/song-content/songs/licensed/`) were converted from MIDI files the project owner licensed through ACUM. Every backing track is generated by the game.

### Licensed songs (My Songs and licensed packs)

**🎵 My Songs → Import a song (MIDI)** turns a MIDI file into a playable level, stored only in your browser. Rights to imported material are the importing user's responsibility.

1. **Pick the part to play.** Format-0 files are split per channel. **▶ listen** plays a track on the built-in piano, the melody is guessed automatically, and you can tick several tracks.
2. **Make it playable:**
   - **Hand:** right, left, or both (split at middle C).
   - **Rhythm grid:** quarter notes, eighths or sixteenths.
   - **Top line or chords:** keep only the melody's top note, or up to 3 notes per hand.
   - **Bar range.**
   - **Transpose:** automatic best octave, or by semitones.
   - **Backing style.**
3. The game estimates the key (so it can spell ♯ or ♭) and infers chords from the accompaniment, so the generated band plays along.
4. **Optionally** attach the licensed recording as the backing, and set where bar 1 starts. Recordings are used at full speed and for the whole song; practice runs use the generated band.

**Export pack file** writes the song as JSON. Drop it in `content/licensed/` (git-ignored) to bundle it into **your own builds** as a 🎬 collection; see [content/licensed/README.md](content/licensed/README.md).

Check that your license covers this use. ACUM mainly licenses performance of the composition; a game usually also needs the publisher's interactive/synchronization rights, recordings need the label's master rights, and the MIDI arrangement may carry its own terms.

**Finger guidance.** Finger numbers appear on the key strip (Settings → Finger numbers on keys). The game also marks **middle C**, or **LOW C** in left-hand songs, and labels the LEFT HAND / RIGHT HAND groups in two-hand songs.

## Sound

- **Backing band.** Drums, bass and chords are generated from each song's chord progression and style (dance, pop, groove, waltz, gentle), with fills and crashes every 4-bar phrase.
  - It never plays your part (unless you turn on the melody guide or Listen), and it moves out of whatever register you're playing in.
  - In Chord City it plays the melody instead (you play the harmony); in two-hand songs it leaves the bass to you.
- **Sync.** The music follows the same song timeline as the tiles and the scoring, and is scheduled ahead. Speaker latency is compensated by mapping the browser's audio clock to the game clock (re-measured continuously), so there is no drift. Pause, resume, restart and Discover waits all stop and resume cleanly.
- **Piano sound.**
  - **My piano:** your instrument makes the sound.
  - **Built-in piano:** velocity-sensitive.
  - **Auto:** built-in only when nothing else makes sound.
- **Volumes.** Backing, built-in piano, clicks and **sound effects** each have a slider. There are 4 count-in clicks, plus an optional metronome.
- **Calibration** (Settings → Timing & display):
  - Tap along to 12 clicks; the median offset becomes the input offset, **saved per device configuration** (input device × wired/wireless audio).
  - It also shows the latency your device reports.
  - Bluetooth-level latency (≥ 100 ms) gets a warning.

## Inputs

| Input | Notes |
| --- | --- |
| **MIDI piano** (Web MIDI) | Device list, hot-plug, auto-reconnect to the last device, auto-pause when unplugged mid-song |
| **Computer keyboard** | See the table above |
| **Microphone (beta)** | Acoustic pianos, **one note at a time** (YIN pitch detection). Use headphones so the band doesn't leak into the mic, and calibrate once. Chord levels warn that MIDI works best |
| **Native app bridge** | `window.PianoRushNative.midi(bytes, ageMs, deviceId, name)` lets an iOS/Android wrapper feed CoreMIDI / android.media.midi events (Safari has no Web MIDI). See [docs/PLATFORMS.md](docs/PLATFORMS.md) |

**MIDI diagnostics** (home screen) shows the device, last note, pitch, velocity, event type, timestamp, held notes and a log of filtered events.

### Connecting a real MIDI piano

1. Connect the piano by USB ("USB to Host") or through a USB-MIDI interface, and switch it on.
2. Use desktop **Chrome, Edge or Opera** (Firefox 108+ needs a site-permission add-on), served from `https://` or `localhost`.
3. Click **Connect MIDI piano**, allow access, and pick your device.
4. Check **MIDI diagnostics**, then calibrate once.

## Offline and install

The production build is **offline-first**: after one visit, the code, songs and backing (synthesized) work with no network. It is also installable (manifest, icons, fullscreen landscape). Updates arrive the next time you're online.

## Browser compatibility

| Browser | Gameplay | Web MIDI | Microphone |
| --- | --- | --- | --- |
| Chrome / Edge / Opera (desktop) | ✅ | ✅ | ✅ |
| Firefox (desktop) 108+ | ✅ | ✅ (add-on prompt) | ✅ |
| Safari (macOS) | ✅ | ❌ (keyboard, mic, or native wrapper) | ✅ |
| iOS / iPadOS (any browser) | ✅ | ❌ (native wrapper planned, bridge ready) | ✅ |
| Chrome on Android | ✅ | ✅ (USB OTG), not tested | ✅ |

Rendering needs WebGL or WebGPU.

## Project layout

```
src/
  game-engine/    Transport (pauses, waits), matching, chords, holds, Discover, scoring, progression
  piano-input/    PianoEvent contract · Web MIDI · keyboard · microphone (YIN + tracker) · native bridge
  song-content/   Schema, validation, chords, part generators, practice tools, World 1–6 + Hits, MIDI import (midi/)
  audio-engine/   Clock sync, arranger, scheduler, synths, built-in piano, calibration analysis
  game-renderer/  PixiJS view (lanes, black keys, hands, fingers, chord bars, effects)
  pwa/            Build-time service-worker generator
  app/            React screens and orchestration (setup, home, game, results, calibration, diagnostics, import), My Songs library
content/licensed/ Your licensed song packs (git-ignored; README only)
docs/
  ARCHITECTURE.md · PRD_COVERAGE.md · PLATFORMS.md · MANUAL_TEST_CHECKLIST.md
```

## Testing and known limitations

- **Automated:** Vitest unit tests cover the engine, input layers, every song's content and harmony, the arranger, the practice tools and calibration. Headless-Chromium end-to-end checks covered:
  - gameplay and progression, offline play, audio scheduling and sync;
  - microphone recognition, fed a synthesized WAV as the mic;
  - the native bridge.
- **Not verified on real hardware.** Nobody has tested with a physical MIDI piano, a real acoustic piano through a microphone, a real GPU (60 FPS), or by ear on real speakers. Use [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md).
- **Microphone** is monophonic and beta. A loud backing on speakers can leak into the mic, so use headphones.
- **No native iOS/Android apps are built.** The bridge and the evaluation are in place (see PLATFORMS.md).
- **Synthesized audio:** pleasant, but not a sampled grand piano or a recorded band.
- **Progress lives in the browser:** no accounts or sync, by design (PRD §16).
