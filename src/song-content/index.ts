export * from './schema';
export * from './validate';
export * from './compile';
export * from './notation';
export { starlightSteps } from './songs/starlightSteps';

import { starlightSteps } from './songs/starlightSteps';
import type { SongDefinition } from './schema';

/** Song catalog. M1 ships one song; the learning system will extend this. */
export const SONGS: readonly SongDefinition[] = [starlightSteps];
