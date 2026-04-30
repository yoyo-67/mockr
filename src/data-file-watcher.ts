import { watch, readFileSync, type FSWatcher } from 'node:fs';
import { dirname, basename } from 'node:path';

const DEBOUNCE_MS = 100;

export interface DataFileWatcher {
  /**
   * Watch `path`. On filesystem change, parse the file as JSON and call
   * `onChange(parsedValue)`. Multiple rapid events within the debounce window
   * collapse to a single call. If the file is unreadable or the JSON is
   * invalid, log an error and keep the last good copy in memory (no callback
   * is fired).
   */
  register(path: string, onChange: (data: unknown) => void): void;
  /** Stop every active watcher and clear pending debounce timers. */
  closeAll(): void;
}

export function createDataFileWatcher(): DataFileWatcher {
  const watchers: FSWatcher[] = [];
  const timers = new Map<string, NodeJS.Timeout>();

  return {
    register(path, onChange) {
      // Track the last raw content we delivered so identical re-fires (FSEvents
      // can replay events from before the watch was attached on macOS) don't
      // bubble back to the caller as duplicates.
      let lastRaw: string | undefined;
      try { lastRaw = readFileSync(path, 'utf8'); } catch { /* file missing — ok */ }

      const fire = () => {
        let raw: string;
        try {
          raw = readFileSync(path, 'utf8');
        } catch (err) {
          console.error(`mockr: failed to read ${path}:`, (err as Error).message);
          return;
        }
        if (raw === lastRaw) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          console.error(
            `mockr: invalid JSON in ${path} (keeping last good copy):`,
            (err as Error).message,
          );
          return;
        }
        lastRaw = raw;
        onChange(parsed);
      };

      // Watch the parent directory and filter by basename so atomic replaces
      // (editor saves: write tmpfile + rename over original) survive — the
      // original inode goes away but the directory entry persists. Watching
      // the file directly would lose the handle on the first such replace.
      const dir = dirname(path);
      const name = basename(path);
      const w = watch(dir, (_event, changed) => {
        if (changed !== name) return;
        const existing = timers.get(path);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          timers.delete(path);
          fire();
        }, DEBOUNCE_MS);
        timers.set(path, t);
      });
      watchers.push(w);
    },

    closeAll() {
      for (const w of watchers) w.close();
      watchers.length = 0;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
