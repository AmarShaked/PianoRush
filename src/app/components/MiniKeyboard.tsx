import { isBlackKey, MIDDLE_C, midiToNoteName } from '../../piano-input/noteNames';
import { laneColor } from '../../game-renderer/theme';

interface MiniKeyboardProps {
  /** First and last MIDI note to draw (inclusive). Should start on a white key. */
  from: number;
  to: number;
  /** Lane pitches to colour-code. */
  lanes?: readonly number[];
  /** Currently held notes. */
  pressed?: ReadonlySet<number> | readonly number[];
  /** Label lane keys with their computer-keyboard shortcut. */
  keyHints?: Readonly<Record<number, string>>;
  className?: string;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * SVG piano diagram used to show the player where the game's keys are on a
 * real keyboard (with middle C marked), and to visualise held notes in
 * diagnostics.
 */
export function MiniKeyboard({ from, to, lanes = [], pressed = [], keyHints = {}, className }: MiniKeyboardProps) {
  const pressedSet = pressed instanceof Set ? pressed : new Set(pressed as readonly number[]);
  const whites: number[] = [];
  for (let m = from; m <= to; m++) if (!isBlackKey(m)) whites.push(m);
  const W = 24;
  const H = 96;
  const width = whites.length * W;
  const laneIndex = (m: number) => lanes.indexOf(m);

  const whiteX = new Map(whites.map((m, i) => [m, i * W]));
  const blacks: number[] = [];
  for (let m = from; m <= to; m++) if (isBlackKey(m) && whiteX.has(m - 1)) blacks.push(m);

  return (
    <svg
      className={className}
      viewBox={`0 -26 ${width} ${H + 30}`}
      role="img"
      aria-label={`Piano keyboard from ${midiToNoteName(from)} to ${midiToNoteName(to)}${
        lanes.length ? `; game keys: ${lanes.map((m) => midiToNoteName(m)).join(', ')}` : ''
      }`}
    >
      {whites.map((m) => {
        const x = whiteX.get(m)!;
        const lane = laneIndex(m);
        const isPressed = pressedSet.has(m);
        const fill = isPressed ? (lane >= 0 ? hex(laneColor(lane)) : '#8fd3ff') : lane >= 0 ? '#ffffff' : '#c9c9d9';
        return (
          <g key={m}>
            <rect x={x + 1} y={0} width={W - 2} height={H} rx={3} fill={fill} />
            {lane >= 0 && <rect x={x + 1} y={0} width={W - 2} height={6} fill={hex(laneColor(lane))} />}
            {lane >= 0 && (
              <text x={x + W / 2} y={H - 8} textAnchor="middle" className="mk-label">
                {midiToNoteName(m).replace(/\d/, '')}
              </text>
            )}
            {lane >= 0 && keyHints[m] && (
              <text x={x + W / 2} y={H - 24} textAnchor="middle" className="mk-hint">
                {keyHints[m]}
              </text>
            )}
          </g>
        );
      })}
      {blacks.map((m) => {
        const x = whiteX.get(m - 1)! + W * 0.68;
        return (
          <rect
            key={m}
            x={x}
            y={0}
            width={W * 0.64}
            height={H * 0.6}
            rx={2}
            fill={pressedSet.has(m) ? '#8fd3ff' : '#141420'}
          />
        );
      })}
      {whiteX.has(MIDDLE_C) && (
        <g>
          <text x={whiteX.get(MIDDLE_C)! + W / 2} y={-12} textAnchor="middle" className="mk-middle-c">
            MIDDLE C
          </text>
          <path
            d={`M ${whiteX.get(MIDDLE_C)! + W / 2 - 5} -7 L ${whiteX.get(MIDDLE_C)! + W / 2 + 5} -7 L ${
              whiteX.get(MIDDLE_C)! + W / 2
            } -1 Z`}
            fill="#ff4d6d"
          />
        </g>
      )}
    </svg>
  );
}
