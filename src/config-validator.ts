import type { MockrConfig, EndpointDef } from './types.js';
import { isHandlerSpec } from './handler.js';
import { isFileRef } from './file.js';
import { isWsSpec } from './ws.js';

const KNOWN_KEYS = new Set([
  'url',
  'method',
  'data',
  'dataFile',
  'handler',
  'methods',
  'idKey',
  'ws',
]);

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
  const defs = config.endpoints ?? [];

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i] as Record<string, unknown> & EndpointDef;
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

    if (hasData && hasHandler) push("cannot set both 'data' and 'handler'");
    if (hasData && hasFile) push("cannot set both 'data' and 'dataFile'");
    if (hasFile && hasHandler) push("cannot set both 'dataFile' and 'handler'");
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
