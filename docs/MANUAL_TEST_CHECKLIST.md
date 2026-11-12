# Manual test checklist

Record the browser, OS, piano model and connection type for each run. Tick only what you actually tested.

## Setup
- [ ] `npm install && npm run dev` starts without errors
- [ ] `npm test` passes and `npm run build` succeeds

## First launch (M4)
- [ ] A fresh browser profile opens the setup guide. "Skip setup" goes to level select and isn't shown again
- [ ] **MIDI path:** Continue stays disabled until the piano is listening
- [ ] **Find your keys:** a wrong key gives correct guidance (white keys left or right, or "one octave too high/low"), and all five keys must be found to continue
- [ ] **Sound step:** "Built-in piano" and "Hear the band" both make sound, and the chosen option is saved
- [ ] "Calibrate timing first" returns to the guide's last step. "Start Level 1" starts the level

## World 2 — Rhythm Road
- [ ] The World 2 tab is locked until World 1 level 10 is completed, then level 1 opens. "Next" from World 1's finale goes to World 2 level 1
- [ ] Waltz Time: the count-in has 6 clicks (two bars of 3), the bar lines on screen fall every 3 beats, and the backing goes oom-pah-pah
- [ ] Off the Beat: the syncopated notes (starting between beats) feel natural with the beat
- [ ] Rhythm Memory: the repeated phrases fade before the line
- [ ] The harmonies under Lightly Row, Hot Cross Buns and Go Tell Aunt Rhody sound right

## Worlds 3–6
- [ ] World 3: black-key lanes look like black keys, B♭ is spelled as a flat in level 6, and Für Elise's D♯ and G♯ fall where they are on the piano
- [ ] The hand-shift level (W3-5) moves comfortably from C to G position
- [ ] World 4: everything is played with the left hand from C3. Finger numbers read 5-4-3-2-1, LOW C is marked, and the band doesn't crowd the low register
- [ ] World 5: chord tiles are joined by a bar. In Discover, the song waits until all keys of a chord are down. From level 4 the band plays the tune (you play the chords), and it sounds right together
- [ ] World 6: LEFT HAND / RIGHT HAND labels and a divider appear, both hands are playable at once on a real piano, and there is no band bass under your left hand

## Microphone (beta), practice, effects, calibration
- [ ] Microphone with an acoustic (or digital, through speakers) piano: single notes are recognized with the right names in Diagnostics. Repeated notes on one key register each time. Wear headphones while playing
- [ ] After calibrating with the mic, World 1 plays fairly
- [ ] Practice a section loops the chosen bars 3×, the repeated-phrase hint makes sense, and the results say "Section practice" with no stars
- [ ] Sound effects are audible but subtle, and the slider at 0 silences them
- [ ] Visual effects Minimal removes bursts and combo, but keeps judgments and wrong-key flashes
- [ ] Calibrating with two different devices stores two entries under Settings → Calibrated devices, and each is used with its own device

## Licensed songs (import)
- [ ] My Songs → Import: a format-1 file lists named tracks, and a format-0 file lists one entry per channel. ▶ listen plays the right part
- [ ] The preview shows the key, the bars, the number of keys and sensible chords
- [ ] Hits: Dance Monkey and Can You Feel the Love Tonight sound recognisable, and the band's chords fit (they were inferred from the MIDI accompaniment)
- [ ] The imported song plays with the generated band in the right key. Changing the grid, hand, bar range or transpose changes the preview
- [ ] With a recorded backing attached and the bar-1 offset set: the recording lines up with the tiles, pause/resume stays in sync, and 75% speed uses the band instead
- [ ] Export pack file → put it in `content/licensed/` → `npm run dev`: a 🎬 collection appears. `git status` shows nothing to commit

## Practice speed, labels, offline (M4)
- [ ] The 50% and 75% speeds slow the tiles, judging and backing together. The results say "Practice", with no stars and no unlocks
- [ ] "Note letters on tiles" hides the tile letters, while the key strip keeps its labels
- [ ] After `npm run build && npm run preview` and one visit: go offline (DevTools → Network → Offline), reload, and a level still plays with its backing
- [ ] Chrome offers to install the app. The installed app opens fullscreen in landscape

## Start screen
- [ ] The title, song card (tempo, length, notes, best) and the "Find your keys" keyboard with MIDDLE C appear
- [ ] Safari: the "Web MIDI isn't available" guidance appears and the keyboard simulator still works
- [ ] Play is disabled when the simulator is off and no MIDI device is listening
- [ ] Settings (timing preset, input offset, hints, reduced motion) persist after a reload

## Keyboard simulator
- [ ] `A S D F G` light the matching lanes and keys
- [ ] Holding a key does not auto-repeat (check in Diagnostics: one Note On only)
- [ ] Switching to another window while holding a key releases it (no stuck lane glow)

## Real MIDI piano (USB)
- [ ] **Connect MIDI piano** shows the permission prompt, and the device appears in the list
- [ ] Diagnostics show the correct note names (middle C = C4 = 60), velocity changes with how hard you play, and there is a Note Off on release
- [ ] The sustain pedal and other controllers produce **no** events
- [ ] Pianos that send Note On with velocity 0 for release show "Note Off"
- [ ] Held notes are listed correctly with chords and overlapping keys
- [ ] Unplug the piano during **Diagnostics**: the device shows as disconnected and no keys stay held. Plug it back in and it reconnects automatically
- [ ] Unplug the piano **during a level**: the game pauses with a "disconnected" notice. Replug it, see "reconnected", then Resume and keep playing
- [ ] Reload the page: the last device is selected automatically (when permission was already granted)
- [ ] With two MIDI devices, only the selected one drives the game

## Gameplay
- [ ] The 4-beat count-in (4-3-2-1, GO!) and the beat pulse on the hit line are visible
- [ ] Pressing in time with a tile's bottom edge gives PERFECT/GREAT with a burst effect. EARLY/LATE appears for non-perfect hits
- [ ] A wrong key flashes red and resets the combo. Pressing keys during the count-in is not penalized
- [ ] An ignored tile turns grey, shows MISS and falls under the keyboard
- [ ] Long tiles drain into the hit line while held
- [ ] Score, combo and the progress bar update
- [ ] Pause (button, Esc, P) freezes tiles. Resume shows a 3-2-1 countdown first. Restart (button or R) starts a fresh count-in with score 0
- [ ] Switching browser tabs pauses the game
- [ ] The level ends on its own and the results screen appears

## Levels, modes and progression (M2)
- [ ] On a fresh profile only level 1 is playable. Other stops on the map show 🔒; their card says which level to finish first and has no Learn/Play buttons (Listen still works)
- [ ] Finishing level 1 in Play with ≥50% accuracy shows stars, "New level: …!" and **Next level ▶**
- [ ] Finishing below 50% shows "Almost there!" and does not unlock anything
- [ ] Stars appear under the stops on the map, the path is coloured up to the next level, and the ⭐ total in the top bar adds up
- [ ] Reloading the page keeps the progress and selects the next unfinished level
- [ ] **🐢 Learn** (discover): the song stops with each tile on the line, shows "PLAY C4", and highlights the key. A wrong key flashes red and the song keeps waiting. The right key continues the song. The results show no stars
- [ ] Pausing during a Learn wait and resuming goes straight back to waiting
- [ ] **Challenge:** noticeably stricter (±40 ms Perfect). Completing it shows "🏆 Challenge cleared!" and a trophy on the stop
- [ ] **Hold It (6):** holding long notes to the end shows "HOLD!". Releasing early shows "RELEASED EARLY" and the rest of the tile greys out. The results show "Long notes held x / y"
- [ ] **Memory Challenge (9):** the second statement of each phrase disappears before the line. The first statement is fully visible
- [ ] One-key and two-key levels (1, 2) lay out correctly with the MIDDLE C marker

## Sound (M3) — check by ear
- [ ] Pressing Play gives 4 count-in clicks (the first one accented) in time with the 4-3-2-1 countdown
- [ ] The backing (drums, bass, chords) starts on beat 1 and stays locked to the tiles to the very end, with no audible drift
- [ ] A note played exactly as its tile touches the line sounds *with* the backing beat (not flamming before or after)
- [ ] The backing never plays the melody. With **My piano**, only your piano plays the tune
- [ ] **Built-in piano:** each key sounds, louder when played harder (MIDI velocity), and it stops when released
- [ ] **Auto:** the keyboard simulator gets the built-in piano, and a connected MIDI piano does not (no doubled sound)
- [ ] Pause silences everything. Resume (after 3-2-1) comes back in time, and the current chord re-enters
- [ ] Discover: the chord sustains softly while waiting, and the groove resumes on the right note
- [ ] Restart and quitting to the menu stop all audio immediately. The level end fades the last chord
- [ ] The volume sliders and metronome toggle work and are remembered
- [ ] **Calibration:** taps on the clicks give a small offset and good consistency, and "Use … ms" updates the input offset
- [ ] **Bluetooth headphones:** a high-latency warning is shown (where the browser reports latency). After calibration, play feels in time

## Songs & Hits
- [ ] World 1 levels 3, 5, 6 and 8 are recognisable (Au Clair de la Lune, Ode to Joy, When the Saints, Jingle Bells) and show ★ HIT
- [ ] Level 1 has the dance beat and feels lively at 100 BPM
- [ ] The **Hits** tab lists 6 songs, all playable on a fresh profile. Playing them doesn't unlock World 1 levels
- [ ] Twinkle uses six lanes. `H` (or A4 on the piano) plays the sixth lane
- [ ] The backing harmonies sound right under each melody (no sour chords)

## Results
- [ ] A big cheer (Amazing! / Great job! / Well done! / Almost there! / Nice practice!), the stars and "You played X of Y notes right!" are shown
- [ ] *See details* opens the score, note accuracy, timing accuracy, Perfect/Great/Good/Miss counts, wrong notes and max combo
- [ ] "New best score" appears for a new best, and the previous best is in the details later
- [ ] **↻ Again** starts a new run without reloading. **🏠 Home** returns to the map

## Performance and timing (real hardware)
- [ ] With `?debug`, the FPS readout stays around 60 during play
- [ ] There is no drift: the last notes feel as aligned as the first ones
- [ ] The average offset hint on the results screen roughly matches how the timing felt. Adjust the input offset if needed

## Layout
- [ ] 1920×1080, 1366×768 and 1024×768 (tablet) look correct in landscape
- [ ] Resizing the window while playing re-lays out the lanes correctly
- [ ] Phone portrait shows the "rotate your device" prompt

## Kid-friendly menus
- [ ] Home shows the world strip, the level map (or song cards for Hits / My Songs) and nothing else. The next level bounces with a **▶ Play** flag
- [ ] Tapping a stop opens its card with the mini keyboard and the big **Listen / Learn / Play** buttons. ✕, Esc or tapping outside closes it
- [ ] **⚙️ More** shows speed (Slow / Medium / Normal), the play-along helper and practice-a-part. Picking Slow or the helper makes Play say "Practice"
- [ ] The top-bar chip shows the current input (piano name, computer keys, microphone) or a pulsing "Connect a piano"; tapping it or ⚙️ opens Settings, and **← Back** returns
- [ ] With no input, the card shows "Connect your piano first — tap here" and Learn/Play are disabled
- [ ] Calibration and MIDI diagnostics opened from Settings return to Settings
- [ ] A phone in landscape (about 740×390): the map scrolls, and the level card fits with all three big buttons visible
- [ ] My Songs shows an "Add a song" card that opens the importer
- [ ] **Desktop** (≥ 1100 px wide, mouse): worlds are a sidebar with Hits and My Songs always visible, and the level card is docked on the right with its options open. Clicking a stop or song only updates the card (no pop-up); the selected one has a yellow ring. **← →** move between levels and **↑ ↓** between worlds
- [ ] An iPad or phone still gets the world strip and the pop-up card
- [ ] Connecting a MIDI keyboard for the first time (Sound on Auto) asks "Can you hear it?". **No sound** makes your keys play the game's piano on the home and Settings screens and in songs; **Yes** keeps the game's piano silent. The question doesn't come back after reloading
- [ ] The **🔊 Game piano** button in the top bar (only while a MIDI keyboard is connected) switches the game's piano on and off, and Settings → Sound shows the same choice

## Loop Studio
- [ ] **🔁 Loop Studio** opens from the home screen's world list; **← Home** returns
- [ ] With a MIDI keyboard: every instrument sounds when you play, and keys released stop sustained sounds (bass, pad, lead). The piano responds to the sustain pedal
- [ ] Drums: C kick, D snare, F♯ hi-hat etc. in any octave. Pads on channel 10 play drums while the keys are set to Bass
- [ ] Tap slot 1 (stopped): one bar of count-in clicks, "● Rec", then the loop plays back after 2 bars, in time with the click. The pass you played isn't doubled
- [ ] Tap slot 2 while slot 1 plays: it waits for the next bar ("Starts in 3…"), records, and plays in step with slot 1
- [ ] ∞ Free: tap again to finish; the loop length rounds to the nearest bar. Tapping another slot while recording chains straight into it
- [ ] Tap a playing loop: muted / unmuted. ➕ adds a layer for one pass, ↶ removes it, 🗑 deletes the loop
- [ ] Changing the tempo while playing doesn't jump; tap tempo works after 3 taps. Snap 1/16 tidies sloppy timing; Off keeps it as played
- [ ] Keys 1–8 tap the slots and Enter plays/stops (computer keyboard)
- [ ] Leaving and coming back (or reloading) keeps the loops; ▶ plays them from the top

## Listen and melody guide
- [ ] **👂 Listen** on Dance Monkey: the built-in piano plays the tune in time with the tiles reaching the line (no audible lag on your speakers), the keys light up, and the song returns to the menu at the end
- [ ] Listen at 50% speed is slower and still in sync; pausing and resuming carries on cleanly
- [ ] **🎹 Play-along helper** (melody guide) in Play: the guide is clearly softer than your own playing, sits in time with the band, and the results say to try it without the helper, with no stars
- [ ] The helper in Learn: when the song stops to wait, the waited-for note sounds once, softly
- [ ] On the level card, black-key lanes (e.g. Dance Monkey's F♯, G♯, C♯) are coloured on the mini keyboard

## Grand piano (sampled)
- [ ] ⚙️ Settings → Sound → **▶ Try it** plays a grand piano chord. The note under it says "Downloading…", then "Grand piano ready"
- [ ] Soft and hard key presses on a MIDI keyboard sound different in tone (brighter when harder) as well as loudness, with no jumps between neighbouring velocities
- [ ] Neighbouring keys across the whole range sound even in level and in tune
- [ ] Repeated fast notes (trills) don't click, and releasing a key damps the note quickly
- [ ] After one use, the grand piano still plays with the network off
- [ ] Switching to "Light synth piano" plays the synth immediately

## Sustain pedal (built-in piano)
- [ ] With a MIDI piano on "Built-in piano sound", pressing the sustain pedal keeps released notes ringing, and lifting it damps them. MIDI diagnostics shows the pedal as down / up
- [ ] Half-pedalling or a continuous pedal doesn't flicker the sound on and off
- [ ] Re-striking a key with the pedal down re-plays that note cleanly (no doubled or stuck note)
- [ ] Holding Space with the keyboard simulator acts as the pedal and doesn't press buttons or scroll
- [ ] Unplugging the piano while the pedal is down doesn't leave notes ringing
- [ ] Hold tiles still need the key held down, even with the pedal on
