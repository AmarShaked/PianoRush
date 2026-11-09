import type { LevelDefinition, WorldDefinition } from '../song-content/level';
import type { SongDefinition } from '../song-content/schema';

/*
 * "My Songs": songs the player imported from their own licensed MIDI files.
 * Stored only in this browser (IndexedDB) together with an optional recorded
 * backing track and the licence reference. Nothing is uploaded anywhere.
 */

export interface StoredSong {
  readonly id: string;
  readonly song: SongDefinition;
  /** Recorded backing (licensed recording), if attached. */
  readonly audio?: Blob;
  readonly addedAt: number;
}

const DB = 'piano-rush';
const STORE = 'my-songs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listMySongs(): Promise<StoredSong[]> {
  try {
    const all = await tx<StoredSong[]>('readonly', (s) => s.getAll() as IDBRequest<StoredSong[]>);
    return all.sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    return []; // storage unavailable (private mode, blocked): no imported songs
  }
}

export function saveMySong(song: StoredSong): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(song));
}

export function deleteMySong(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

/** Turn stored songs into a playable free-play collection (recordings become blob URLs). */
export function mySongsCollection(stored: readonly StoredSong[]): WorldDefinition {
  const levels: LevelDefinition[] = stored.map((st, i) => {
    const audio = st.audio && st.song.backing?.audio ? { url: URL.createObjectURL(st.audio), offsetMs: st.song.backing.audio.offsetMs } : undefined;
    const song: SongDefinition = {
      ...st.song,
      backing: st.song.backing ? { ...st.song.backing, ...(audio ? { audio } : { audio: undefined }) } : undefined,
    };
    return {
      id: st.id,
      world: 0,
      number: i + 1,
      title: st.song.title,
      objective: st.song.license ? `Licensed: ${st.song.license.holder} ${st.song.license.reference}` : 'Imported song',
      hand: st.song.notes.every((n) => n.hand === 'left') ? 'left' : 'right',
      song,
      modes: ['discover', 'flow', 'challenge'],
      completion: { minNoteAccuracy: 0.5 },
      stars: { two: 0.8, three: 0.95 },
    };
  });
  return { id: -1, kind: 'freeplay', title: 'My Songs', subtitle: 'Songs you imported from your own licensed MIDI files', levels };
}
