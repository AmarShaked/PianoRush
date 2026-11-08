import type {
  MidiAccessLike,
  MidiConnectionEventLike,
  MidiInputLike,
  MidiMessageEventLike,
} from '../piano-input/WebMidiManager';
import type { KeyboardEventLike, KeyboardTargetLike } from '../piano-input/KeyboardSimulator';

/** In-memory Web MIDI input for tests. */
export class FakeMidiInput implements MidiInputLike {
  readonly type = 'input';
  readonly manufacturer = 'Fake Co';
  state = 'connected';
  readonly listeners = new Set<(e: MidiMessageEventLike) => void>();
  constructor(readonly id: string, readonly name: string) {}
  addEventListener(_: 'midimessage', l: (e: MidiMessageEventLike) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_: 'midimessage', l: (e: MidiMessageEventLike) => void) {
    this.listeners.delete(l);
  }
  send(bytes: number[], timeStamp: number) {
    for (const l of [...this.listeners]) l({ data: new Uint8Array(bytes), timeStamp });
  }
}

export class FakeMidiAccess implements MidiAccessLike {
  readonly map = new Map<string, FakeMidiInput>();
  readonly stateListeners = new Set<(e: MidiConnectionEventLike) => void>();
  readonly inputs = {
    forEach: (cb: (i: MidiInputLike) => void) => this.map.forEach((i) => cb(i)),
    get: (id: string) => this.map.get(id),
  };
  constructor(inputs: FakeMidiInput[] = []) {
    for (const i of inputs) this.map.set(i.id, i);
  }
  addEventListener(_: 'statechange', l: (e: MidiConnectionEventLike) => void) {
    this.stateListeners.add(l);
  }
  removeEventListener(_: 'statechange', l: (e: MidiConnectionEventLike) => void) {
    this.stateListeners.delete(l);
  }
  setState(input: FakeMidiInput, state: 'connected' | 'disconnected') {
    input.state = state;
    if (!this.map.has(input.id)) this.map.set(input.id, input);
    for (const l of [...this.stateListeners]) l({ port: input });
  }
}

type KeyListener = (e: KeyboardEventLike) => void;

export class FakeKeyboardTarget implements KeyboardTargetLike {
  readonly listeners = { keydown: new Set<KeyListener>(), keyup: new Set<KeyListener>(), blur: new Set<() => void>() };
  addEventListener(type: 'keydown' | 'keyup' | 'blur', l: KeyListener | (() => void)): void {
    (this.listeners[type] as Set<unknown>).add(l);
  }
  removeEventListener(type: 'keydown' | 'keyup' | 'blur', l: KeyListener | (() => void)): void {
    (this.listeners[type] as Set<unknown>).delete(l);
  }
  key(type: 'keydown' | 'keyup', code: string, timeStamp: number, extra: Partial<KeyboardEventLike> = {}) {
    let prevented = false;
    const e: KeyboardEventLike = {
      code, timeStamp, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null,
      preventDefault: () => { prevented = true; },
      ...extra,
    };
    for (const l of [...this.listeners[type]]) l(e);
    return prevented;
  }
  blur() {
    for (const l of [...this.listeners.blur]) l();
  }
  get listenerCount() {
    return this.listeners.keydown.size + this.listeners.keyup.size + this.listeners.blur.size;
  }
}
