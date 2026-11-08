# Platform evaluation (PRD §13)

The PRD asks for native wrappers and platform adapters to be *evaluated*, and requires that iOS MIDI not depend on Safari's Web MIDI. Here's where each platform stands and what's prepared.

## Summary

| Platform | Today | MIDI path | Recommendation |
| --- | --- | --- | --- |
| Desktop web (Chrome/Edge/Opera, Firefox) | ✅ Ships | Web MIDI | Primary target, done |
| Desktop web (Safari) | ✅ Plays (keyboard, mic) | ❌ no Web MIDI | Point Mac users to Chrome/Edge, or use a wrapper |
| Desktop app (Electron) | Not built | Web MIDI works in Electron's Chromium | Wrap only if distribution needs it; no code changes required |
| Desktop app (Tauri) | Not built | macOS WebKit has no Web MIDI → `NativeMidiBridge` | Use the bridge plus a small Rust MIDI plugin (e.g. `midir`) |
| iPadOS / iOS | Plays in browser (keyboard, mic) | Web MIDI unavailable in all iOS browsers | **WKWebView wrapper + CoreMIDI → `NativeMidiBridge`** (also covers Bluetooth MIDI) |
| Android | Chrome works (USB OTG Web MIDI) | Android WebView has no Web MIDI | Use Chrome/PWA, or wrapper + `android.media.midi` → bridge |

## The bridge (implemented)

`src/piano-input/NativeMidiBridge.ts` is installed at start-up as `window.PianoRushNative`. It is version 1 and unit-tested.

```js
// Raw MIDI bytes, how long ago the native layer received them (ms),
// a stable device id and a display name.
window.PianoRushNative.midi([0x90, 60, 100], ageMs, 'usb-1', 'Yamaha P-125');

// Hot-plug: the game auto-pauses on disconnect, just like Web MIDI.
window.PianoRushNative.device('usb-1', 'Yamaha P-125', false);
```

- **Same handling as Web MIDI.** Messages go through the same parser and duplicate/orphan filtering as Web MIDI, so gameplay is identical. Native events appear in calibration (per device) and in "Auto" piano-sound decisions.
- **Timestamps.** Native clocks don't share the page's time origin, so the host sends the **age** of each event. The bridge converts it into the page's `performance.now()` base, and calibration absorbs any constant bridge latency.
- **Ready signal.** On start-up the page posts `{ type: 'ready', version: 1 }` to `webkit.messageHandlers.pianoRush` when that exists, so an iOS host knows when to start forwarding.

### iOS / iPadOS wrapper sketch (not built)

1. A `WKWebView` loads the built `dist/` locally; it works offline.
2. A `MIDIClient` + `MIDIInputPortCreateWithProtocol` (CoreMIDI) receives packets from USB and Bluetooth MIDI devices. For Bluetooth, `CABTMIDICentralViewController` handles pairing.
3. For each packet, the host calls `webView.evaluateJavaScript("PianoRushNative.midi([…], ageMs, id, name)")`. `ageMs` comes from the packet's `mach_absolute_time` timestamp versus "now".
4. MIDI setup notifications map to `PianoRushNative.device(…)`.
5. Audio: WKWebView supports Web Audio. Set the `AVAudioSession` category to `.playback` so the backing plays with the mute switch on.

Capacitor is a lighter option for this: a small custom plugin does the CoreMIDI part.

### Android wrapper sketch (not built)

`MidiManager` → `MidiReceiver.onSend` → `webView.evaluateJavascript("PianoRushNative.midi(…)")`, with device callbacks mapped to `.device(…)`. Plain Chrome on Android already supports Web MIDI over USB OTG, so a wrapper is only needed for Play Store distribution.

## Latency notes

- Web Audio output latency is compensated automatically where the browser reports it (`outputLatency` / `getOutputTimestamp`). The calibration screen measures what remains for each device configuration.
- On iOS, prefer wired or built-in output. Bluetooth headphones add 150–250 ms; the app detects this and warns where the platform reports latency.
