import type { MockrConfig, EndpointDef } from './types.js';
import { isHandlerSpec } from './handler.js';
import { isFileRef } from './file.js';
import { isWsSpec } from './ws.js';

const KNOWN_KEYS = new Set([
  'url',
  'method',
  'data',
  'load',
  'dataFile',
  'file',
  'handler',
  'methods',
  'idKey',
  'ws',
  'delay',
  'responseSchemas',
]);

/**
 * Pure check for a `delay` value. Returns the first error message, or `null`
 * if the value is acceptable. Used by both boot-time config validation and
 * runtime `setDelay()` so the rules stay in lockstep.
 */
export function checkDelayValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'delay must be a finite number';
    if (value < 0) return `delay must be >= 0 (got ${value})`;
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const hasMin = 'min' in obj;
    const hasMax = 'max' in obj;
    const extraKey = keys.find((k) => k !== 'min' && k !== 'max');
    if (extraKey || (!hasMin && !hasMax)) {
      return 'delay must be a number or { min, max }';
    }
    if (!hasMin || !hasMax) return "delay requires both 'min' and 'max'";
    const { min, max } = obj as { min: unknown; max: unknown };
    if (typeof min !== 'number' || !Number.isFinite(min)) {
      return 'delay.min must be a finite number';
    }
    if (typeof max !== 'number' || !Number.isFinite(max)) {
      return 'delay.max must be a finite number';
    }
    if (min < 0) return `delay.min must be >= 0 (got ${min})`;
    if (max < 0) return `delay.max must be >= 0 (got ${max})`;
    if (min > max) return `delay.min (${min}) must be <= delay.max (${max})`;
    return null;
  }
  return 'delay must be a number or { min, max }';
}

function validateDelay(
  value: unknown,
  push: (msg: string) => void,
  hasWs: boolean,
): void {
  if (value === undefined) return;
  if (hasWs) {
    push("'delay' is not allowed on WS endpoints");
    return;
  }
  const err = checkDelayValue(value);
  if (err) push(err);
}

const VALID_VERBS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
]);

export interface ConfigError {
  index: number;
  url: string;
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ConfigError[] };

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function suggest(key: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const known of KNOWN_KEYS) {
    const d = levenshtein(key, known);
    if (d < bestDist && d <= 2) {
      bestDist = d;
      best = known;
    }
  }
  return best;
}

export function validateConfig(config: MockrConfig<any>): ValidationResult {
  const errors: ConfigError[] = [];
  const seenKeys = new Set<string>();
  if (config === null || typeof config !== 'object') {
    return { valid: false, errors: [{ index: -1, url: '<config>', message: 'config must be an object' }] };
  }
  const defs = Array.isArray(config.endpoints) ? config.endpoints : [];

  for (let i = 0; i < defs.length; i++) {
    const rawDef = defs[i];
    if (rawDef === null || typeof rawDef !== 'object') {
      errors.push({ index: i, url: '<unknown>', message: 'endpoint must be an object' });
      continue;
    }
    const def = rawDef as Record<string, unknown> & EndpointDef;
    const urlStr =
      typeof def.url === 'string' ? def.url : def.url?.toString() ?? '<unknown>';
    const push = (msg: string) =>
      errors.push({ index: i, url: urlStr, message: msg });

    // Unknown keys
    for (const key of Object.keys(def)) {
      if (!KNOWN_KEYS.has(key)) {
        const hint = suggest(key);
        push(
          `'${key}' is not a known key${hint ? ` (did you mean '${hint}'?)` : ''}`,
        );
      }
    }

    // Form conflicts
    const hasData = 'data' in def && def.data !== undefined;
    const hasFile = 'dataFile' in def && def.dataFile !== undefined;
    const hasHandler = 'handler' in def && def.handler !== undefined;
    const hasMethods = 'methods' in def && def.methods !== undefined;
    const hasMethod = 'method' in def && def.method !== undefined;
    const hasWs = 'ws' in def && (def as { ws?: unknown }).ws !== undefined;
    const hasFileServe = 'file' in def && (def as { file?: unknown }).file !== undefined;

    if (hasData && hasHandler) push("cannot set both 'data' and 'handler'");
    if (hasData && hasFile) push("cannot set both 'data' and 'dataFile'");
    if (hasFile && hasHandler) push("cannot set both 'dataFile' and 'handler'");
    if (hasFileServe && (hasData || hasFile || hasHandler || hasMethods || hasWs)) {
      push("cannot set 'file' together with data/dataFile/handler/methods/ws");
    }
    if (hasFileServe && typeof (def as { file?: unknown }).file !== 'string') {
      push("'file' must be a string path");
    }
    if (hasHandler && hasMethods)
      push("cannot set both 'handler' and 'methods' (use methods alone)");
    if (hasMethod && hasMethods)
      push("cannot set both 'method' and 'methods'");
    if (hasWs && (hasData || hasFile || hasHandler || hasMethods)) {
      push("cannot set 'ws' together with data/dataFile/handler/methods");
    }
    if (hasWs && !isWsSpec((def as { ws?: unknown }).ws)) {
      push("'ws' must be created by ws({...})");
    }

    // Handler must be factory result
    if (hasHandler && !isHandlerSpec(def.handler)) {
      push(
        "'handler' must be created by handler({...}) — raw functions are not allowed",
      );
    }

    // Methods map shape
    if (hasMethods) {
      const m = def.methods as Record<string, unknown>;
      for (const verb of Object.keys(m)) {
        if (!VALID_VERBS.has(verb)) {
          push(
            `methods keys must be uppercase HTTP verbs (got '${verb}')`,
          );
        } else if (!isHandlerSpec(m[verb])) {
          push(
            `methods.${verb} must be created by handler({...})`,
          );
        }
      }
    }

    // dataFile shape
    if (hasFile) {
      const f = def.dataFile;
      if (typeof f !== 'string' && !isFileRef(f)) {
        push("'dataFile' must be a string path or file<T>('./path')");
      }
    }

    // Delay validation
    if ('delay' in def) {
      validateDelay((def as { delay?: unknown }).delay, push, hasWs);
    }

    // Duplicate URL+method
    if (typeof def.url === 'string') {
      const verb = (def.method ?? 'GET').toUpperCase();
      const key = `${verb}::${def.url}`;
      if (seenKeys.has(key)) {
        push(`duplicate URL+method`);
      } else {
        seenKeys.add(key);
      }
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

export function formatErrors(errors: ConfigError[]): string {
  const lines = errors.map(
    (e) => `  [${e.index}] ${e.url}: ${e.message}`,
  );
  const noun =
    errors.length === 1
      ? '1 endpoint definition invalid'
      : `${errors.length} endpoint definitions invalid`;
  return `mockr: ${noun}:\n${lines.join('\n')}`;
}
