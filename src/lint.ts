import type { EndpointDef } from './types.js';
import { createMatcher } from './router.js';

/** Methods an endpoint claims. `*` = all verbs (data CRUD, or a method-less handler). */
function methodsOf(def: EndpointDef<any>): Set<string> {
  if ('methods' in def && def.methods) return new Set(Object.keys(def.methods));
  if ('data' in def && def.data !== undefined) return new Set(['*']);
  const method = (def as { method?: string }).method;
  if (method) return new Set([method.toUpperCase()]);
  return new Set(['*']);
}

function methodsOverlap(a: Set<string>, b: Set<string>): boolean {
  if (a.has('*') || b.has('*')) return true;
  for (const m of a) {
    if (b.has(m)) return true;
  }
  return false;
}

/** A concrete path standing in for a URL pattern (`:param` / `*` → a segment). */
function samplePath(pattern: string): string {
  return pattern.replace(/:[^/]+/g, 'x').replace(/\*+/g, 'x');
}

/**
 * Startup lint: find endpoints that can never match because an earlier endpoint
 * with a broader pattern already claims the same path and an overlapping method.
 * Returns human-readable warnings (empty when clean). Endpoints match in
 * registration order, so an earlier catch-all shadows later specific routes.
 */
export function lintEndpoints<TEndpoints = Record<string, unknown>>(
  defs: ReadonlyArray<EndpointDef<TEndpoints>>,
): string[] {
  const warnings: string[] = [];

  for (let j = 0; j < defs.length; j += 1) {
    const later = defs[j];
    if (typeof later.url !== 'string' || ('ws' in later && later.ws)) continue;

    for (let i = 0; i < j; i += 1) {
      const earlier = defs[i];
      if (typeof earlier.url !== 'string' || ('ws' in earlier && earlier.ws)) continue;
      if (earlier.url === later.url) continue;
      if (!createMatcher(earlier.url)(samplePath(later.url))) continue;
      if (!methodsOverlap(methodsOf(earlier), methodsOf(later))) continue;

      warnings.push(
        `endpoint '${later.url}' is shadowed by earlier '${earlier.url}' (overlapping method) — it will never match`,
      );
      break;
    }
  }

  return warnings;
}
