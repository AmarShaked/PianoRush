# Manual test checklist (M1)

Record the browser, OS, piano model and connection type for each run. Tick only what you actually tested.

## Setup
- [ ] `npm install && npm run dev` starts without errors
- [ ] `npm test` passes and `npm run build` succeeds

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

## Results
- [ ] Score, stars, note accuracy, timing accuracy, Perfect/Great/Good/Miss counts, wrong notes and max combo are shown
- [ ] "New best!" appears the first time, and the personal best appears later
- [ ] **Play again** starts a new run without reloading. **Main menu** returns to the start screen

## Performance and timing (real hardware)
- [ ] With `?debug`, the FPS readout stays around 60 during play
- [ ] There is no drift: the last notes feel as aligned as the first ones
- [ ] The average offset hint on the results screen roughly matches how the timing felt. Adjust the input offset if needed

## Layout
- [ ] 1920×1080, 1366×768 and 1024×768 (tablet) look correct in landscape
- [ ] Resizing the window while playing re-lays out the lanes correctly
- [ ] Phone portrait shows the "rotate your device" prompt
