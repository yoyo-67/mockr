import { z } from 'zod';
import type { ParseableSchema } from './types.js';

/**
 * Zod schema for a query param carrying a JSON-encoded value. Parses the string
 * with `JSON.parse`, then (optionally) validates the result with `inner` — which
 * may be any `ParseableSchema` (a zod schema or a hand-rolled `{ safeParse }`),
 * so no nested `z.object` is required. Composes inside `z.object({...})` and
 * supports `.optional()` / `.array()` like any zod type.
 *
 * ```ts
 * z.object({ filter: jsonParam(z.object({ min: z.number() })).optional() })
 * ```
 */
export function jsonParam<T = unknown>(inner?: ParseableSchema<T>) {
  return z.string().transform((raw, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid JSON' });
      return z.NEVER;
    }
    if (!inner) {
      return parsed as T;
    }
    const result = inner.safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: 'JSON did not match schema' });
      return z.NEVER;
    }
    return result.data;
  });
}

/**
 * Zod schema for a repeatable query param carrying JSON-encoded values
 * (`?range={...}&range={...}`). Accepts a single string, a string array, or
 * absence; parses each entry and drops malformed ones (lenient — never fails);
 * returns `T[]`. `inner` may be any `ParseableSchema`.
 *
 * ```ts
 * z.object({ size: jsonArrayParam(sizeRange) }) // req.query.size: SizeRange[]
 * ```
 */
export function jsonArrayParam<T = unknown>(inner?: ParseableSchema<T>) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value): T[] => {
      const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
      const out: T[] = [];
      for (const entry of raw) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(entry);
        } catch {
          continue;
        }
        if (!inner) {
          out.push(parsed as T);
          continue;
        }
        const result = inner.safeParse(parsed);
        if (result.success) {
          out.push(result.data);
        }
      }
      return out;
    });
}
