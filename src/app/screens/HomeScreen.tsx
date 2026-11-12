import { useState } from 'react';
import { isPlayable, songFor, type PracticeSection } from '../catalog';
import type { GameMode, LevelDefinition, WorldDefinition } from '../../song-content/level';
import { totalStars, type ProgressMap } from '../../game-engine/progression';
import { LevelMap } from '../components/LevelMap';
import { LevelSheet } from '../components/LevelSheet';
import { Stars } from '../components/Stars';
import { lookStyle, worldLook } from '../components/worldLook';
import type { Settings } from '../storage';
import type { useMidi } from '../useMidi';
import type { MicState } from '../useMic';

interface HomeScreenProps {
  mic: MicState;
  /** Devices connected through a native app wrapper. */
  nativeDevices: readonly string[];
  collections: readonly WorldDefinition[];
  world: WorldDefinition;
  progress: ProgressMap;
  selected: LevelDefinition;
  onSelect: (level: LevelDefinition) => void;
  midi: ReturnType<typeof useMidi>;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onPlay: (mode: GameMode) => void;
  /** Listen mode: watch and hear the song played for you. */
  onListen: () => void;
  onPracticeSection: (section: PracticeSection) => void;
  onSettings: () => void;
  onImport: () => void;
  onDeleteSong: (level: LevelDefinition) => void;
}

/**
 * Level select, made for kids: pick a world at the top, tap a stop on the
 * path (or a song card), then Listen / Learn / Play in the card that opens.
 * Everything else lives behind the ⚙️ button.
 */
export function HomeScreen(props: HomeScreenProps) {
  const { mic, nativeDevices, collections, world: selectedWorld, progress, selected, onSelect, midi, settings, onSettingsChange } = props;
  const { onPlay, onListen, onPracticeSection, onSettings, onImport, onDeleteSong } = props;
  // A collection with no songs yet (an empty "My Songs") can still be opened.
  const [emptyTab, setEmptyTab] = useState<WorldDefinition | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const world = emptyTab ?? selectedWorld;
  const look = worldLook(world);
  const levels = world.levels;
  const mySongs = world.id === -1;
  const open = (l: LevelDefinition) => isPlayable(l, progress);
  const current = world.kind === 'path' ? (levels.find((l) => open(l) && !progress[l.id]?.completed) ?? null) : null;

  const pathLevels = collections.filter((c) => c.kind === 'path').flatMap((c) => c.levels);
  const earned = totalStars(pathLevels, progress);
  const hasInput = midi.listening || settings.keyboardSimulator || mic.status === 'listening' || nativeDevices.length > 0;
  const pick = (level: LevelDefinition) => {
    setEmptyTab(null);
    onSelect(level);
    setSheetOpen(true);
  };

  const selectedIndex = levels.indexOf(selected);
  const previous = selectedIndex > 0 ? levels[selectedIndex - 1] : null;
  const lockedText =
    world.kind === 'path' && selected.number === 1
      ? `Finish the last level of the world before to open this one!`
      : `Finish “${previous?.title ?? 'the level before'}” to open this level!`;

  return (
    <main className="screen home-screen">
      <header className="top-bar">
        <h1 className="logo">
          Piano<span>Rush</span>
        </h1>
        <div className="top-bar-right">
          <InputChip midi={midi} mic={mic} nativeDevices={nativeDevices} keyboard={settings.keyboardSimulator} onClick={onSettings} />
          <div className="star-total" aria-label={`${earned} of ${pathLevels.length * 3} stars collected`}>
            ⭐ {earned}
          </div>
          <button className="round-btn" onClick={onSettings} aria-label="Settings" title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      <nav className="world-strip" aria-label="Worlds">
        {collections.map((c) => {
          const cl = worldLook(c);
          const active = c === world;
          const stars = c.kind === 'path' ? totalStars(c.levels, progress) : null;
          const lockedWorld = c.kind === 'path' && c.levels.length > 0 && !open(c.levels[0]!);
          return (
            <button
              key={c.id}
              className={`world-chip${active ? ' active' : ''}${lockedWorld ? ' locked' : ''}`}
              style={lookStyle(cl)}
              aria-pressed={active}
              onClick={() => {
                if (active) return;
                if (c.levels.length === 0) {
                  setEmptyTab(c);
                  return;
                }
                setEmptyTab(null);
                // Jump to the first open, unfinished entry of that collection.
                const first = c.levels.find((l) => open(l) && !progress[l.id]?.completed);
                onSelect(first ?? c.levels[0]!);
              }}
            >
              <span className="world-emoji" aria-hidden>
                {lockedWorld ? '🔒' : cl.emoji}
              </span>
              <span className="world-name">{c.title}</span>
              {stars !== null && <span className="world-stars">⭐ {stars}/{c.levels.length * 3}</span>}
            </button>
          );
        })}
      </nav>

      <section className="world-stage" style={lookStyle(look)} aria-label={world.title}>
        {world.kind === 'path' ? (
          <LevelMap levels={levels} progress={progress} isOpen={open} current={current} onPick={pick} />
        ) : (
          <ul className="song-grid">
            {mySongs && (
              <li>
                <button className="song-card add-song" onClick={onImport}>
                  <span className="song-art" aria-hidden>
                    ＋
                  </span>
                  <span className="song-title">Add a song</span>
                  <span className="song-artist">from a MIDI file</span>
                </button>
              </li>
            )}
            {levels.map((level, i) => {
              const lp = progress[level.id];
              const art = SONG_ART[i % SONG_ART.length]!;
              return (
                <li key={level.id}>
                  <button className="song-card" onClick={() => pick(level)}>
                    <span className="song-art" aria-hidden style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
                      {art.emoji}
                    </span>
                    <span className="song-title">{level.title}</span>
                    <span className="song-artist">{songArtist(level)}</span>
                    <Stars count={lp?.bestStars ?? 0} small />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sheetOpen && levels.includes(selected) && (
        <LevelSheet
          level={selected}
          look={look}
          label={world.kind === 'path' ? `Level ${selected.number} · ${world.title}` : world.title}
          progress={progress[selected.id]}
          unlocked={open(selected)}
          lockedText={lockedText}
          hasInput={hasInput}
          chordWarning={mic.status === 'listening' && !midi.listening && songFor(selected).events.some((e) => e.noteIds.length > 1)}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onListen={onListen}
          onPlay={onPlay}
          onPracticeSection={onPracticeSection}
          onConnect={onSettings}
          onClose={() => setSheetOpen(false)}
          onDelete={
            mySongs
              ? () => {
                  setSheetOpen(false);
                  onDeleteSong(selected);
                }
              : undefined
          }
        />
      )}
    </main>
  );
}

/** Colourful cover art for song cards, so a list of songs isn't a wall of one colour. */
const SONG_ART: ReadonlyArray<{ emoji: string; from: string; to: string }> = [
  { emoji: '🎤', from: '#ff6b3d', to: '#ff3d77' },
  { emoji: '🦁', from: '#ffc93d', to: '#ff8a3d' },
  { emoji: '🎶', from: '#4cc9f0', to: '#4361ee' },
  { emoji: '🔔', from: '#3ddc84', to: '#1f9e8f' },
  { emoji: '🎺', from: '#c86bfa', to: '#7b6cff' },
  { emoji: '🌙', from: '#5e60ce', to: '#2a1d6e' },
  { emoji: '🐑', from: '#ff8fab', to: '#f15bb5' },
  { emoji: '⭐', from: '#ffd93d', to: '#f5a623' },
  { emoji: '🌉', from: '#48cae4', to: '#0077b6' },
  { emoji: '🎻', from: '#ff9f1c', to: '#e85d04' },
  { emoji: '🎸', from: '#06d6a0', to: '#118ab2' },
  { emoji: '🥁', from: '#ef476f', to: '#b5179e' },
];

/** "Artist" line for a song card: the composer credit, without boilerplate. */
function songArtist(level: LevelDefinition): string {
  return level.song.composer.replace(/^Music by /i, '');
}

/** What the game will listen to, as one friendly chip (tap → settings). */
function InputChip({
  midi,
  mic,
  nativeDevices,
  keyboard,
  onClick,
}: {
  midi: ReturnType<typeof useMidi>;
  mic: MicState;
  nativeDevices: readonly string[];
  keyboard: boolean;
  onClick: () => void;
}) {
  const device = midi.devices.find((d) => d.id === midi.selectedId);
  const [icon, text, ok] = midi.listening
    ? ['🎹', device?.name ?? 'Piano', true]
    : nativeDevices.length > 0
      ? ['🎹', nativeDevices[0]!, true]
      : mic.status === 'listening'
        ? ['🎤', 'Microphone', true]
        : keyboard
          ? ['⌨️', 'Computer keys', true]
          : ['🔌', 'Connect a piano', false];
  return (
    <button className={`input-chip${ok ? '' : ' warn'}`} onClick={onClick} title="Change how you play">
      <span aria-hidden>{icon}</span> <span className="input-chip-text">{text}</span>
    </button>
  );
}
