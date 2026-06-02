import { HANDLER_SPEC_BRAND, type HandlerSpec } from './handler.js';
import type {
  EndpointDef,
  EndpointDelay,
  HandlerContext,
  HandlerResult,
  MockrRequest,
  ParseableSchema,
} from './types.js';

/**
 * Response body the lib expects for a given URL. Array maps stay arrays;
 * everything else is the declared type as-is. Mirrors `CurrentEndpointBody`.
 */
export type GroupBody<TEndpoints, U extends keyof TEndpoints> =
  TEndpoints[U] extends readonly (infer T)[] ? T[] : TEndpoints[U];

/**
 * Extract `:name` path-param names from a URL pattern into a `{ name: string }`
 * map. Wildcard (`*`) segments capture nothing, so a pure-`*` URL yields `{}`.
 */
export type PathParams<U extends string> =
  U extends `${string}:${infer P}/${infer Rest}`
    ? { [K in P]: string } & PathParams<`/${Rest}`>
    : U extends `${string}:${infer P}`
      ? { [K in P]: string }
      : {};

/**
 * Handler return for a builder verb. The bare form returns the URL's declared
 * body directly; the `{ body }` form adds status/headers; the `raw` form is the
 * escape hatch for non-JSON payloads. All three keep `.body` checked against
 * the URL type.
 */
export type TypedResult<TEndpoints, U extends keyof TEndpoints> =
  | GroupBody<TEndpoints, U>
  | { body: GroupBody<TEndpoints, U>; status?: number; headers?: Record<string, string | string[]> }
  // Explicit-status escape: error responses, 204s, and `ctx.error/created/noContent`
  // opt out of body-shape checking (a 404 body isn't the success body).
  | { status: number; body?: unknown; headers?: Record<string, string | string[]> }
  | { raw: true; body: string | Buffer; status: number; headers: Record<string, string | string[]> };

type ParamsOf<TParams extends ParseableSchema | undefined, U extends string> =
  TParams extends ParseableSchema<infer P extends Record<string, string>> ? P : PathParams<U>;

type QueryOf<TQuery extends ParseableSchema | undefined> =
  TQuery extends ParseableSchema<infer Q extends Record<string, unknown>> ? Q : Record<string, string | string[]>;

type BodyOf<TBody extends ParseableSchema | undefined> =
  TBody extends ParseableSchema<infer B> ? B : unknown;

/** Bare handler function — no request schemas, params inferred from the URL. */
export type VerbFn<TEndpoints, U extends keyof TEndpoints> = (
  req: MockrRequest<{ params: PathParams<U & string> }>,
  ctx: HandlerContext<TEndpoints, U>,
) => TypedResult<TEndpoints, U> | Promise<TypedResult<TEndpoints, U>>;

/** Full handler spec — optional request schemas flow into `req`. */
export interface VerbSpec<
  TEndpoints,
  U extends keyof TEndpoints,
  TBody extends ParseableSchema | undefined = undefined,
  TQuery extends ParseableSchema | undefined = undefined,
  TParams extends ParseableSchema | undefined = undefined,
> {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
  delay?: EndpointDelay;
  fn: (
    req: MockrRequest<{ body: BodyOf<TBody>; params: ParamsOf<TParams, U & string>; query: QueryOf<TQuery> }>,
    ctx: HandlerContext<TEndpoints, U>,
  ) => TypedResult<TEndpoints, U> | Promise<TypedResult<TEndpoints, U>>;
}

type VerbArg<
  TEndpoints,
  U extends keyof TEndpoints,
  TBody extends ParseableSchema | undefined,
  TQuery extends ParseableSchema | undefined,
  TParams extends ParseableSchema | undefined,
> = VerbFn<TEndpoints, U> | VerbSpec<TEndpoints, U, TBody, TQuery, TParams>;

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Verb = (typeof HTTP_VERBS)[number];

interface VerbEntry {
  verb: Verb;
  spec: HandlerSpec<any, any, any, any>;
  delay?: EndpointDelay;
}

interface UrlEntry {
  url: string;
  data?: unknown;
  verbs: VerbEntry[];
}

/**
 * Coerce a handler's return into a `HandlerResult`. A value carrying a `body`
 * key (or `raw: true`) is already a result; anything else is treated as the
 * response body. Lets handlers `return data` instead of `return { body: data }`.
 */
function normalizeResult(out: unknown): HandlerResult {
  if (out !== null && typeof out === 'object' && ('body' in out || (out as { raw?: unknown }).raw === true)) {
    return out as HandlerResult;
  }
  return { body: out };
}

function wrapFn(fn: (...args: never[]) => unknown): HandlerSpec['fn'] {
  return ((req, ctx) => {
    const out = (fn as (req: unknown, ctx: unknown) => unknown)(req, ctx);
    return out instanceof Promise ? out.then(normalizeResult) : normalizeResult(out);
  }) as HandlerSpec['fn'];
}

function toSpec(def: VerbFn<any, any> | VerbSpec<any, any, any, any, any>): HandlerSpec<any, any, any, any> {
  if (typeof def === 'function') {
    return { [HANDLER_SPEC_BRAND]: true, fn: wrapFn(def) };
  }

  return {
    [HANDLER_SPEC_BRAND]: true,
    body: def.body,
    query: def.query,
    params: def.params,
    fn: wrapFn(def.fn),
  };
}

/**
 * URL-first builder for a group of mocks, typed against a single `Endpoints`
 * map. Each `.get/.post/...` call infers its response body from the URL's
 * declared type, its path params from the URL pattern, and types `ctx` against
 * the whole map. `.done()` collapses the registrations into `EndpointDef[]`,
 * merging multiple verbs on one URL into a single `methods` def.
 */
/**
 * Sub-paths registerable under prefix `P`: every key of the map that starts
 * with `P`, prefix stripped. `P = ''` yields every key unchanged.
 */
export type SubUrl<TEndpoints, P extends string> = {
  [K in keyof TEndpoints]: K extends `${P}${infer S}` ? S : never;
}[keyof TEndpoints];

/** The full map key a `(prefix, sub)` pair resolves to. */
export type FullKey<TEndpoints, P extends string, S extends string> = Extract<`${P}${S}`, keyof TEndpoints>;

/** Shared call signature for every verb method, resolving the URL through `P`. */
export interface VerbMethod<TEndpoints, P extends string, TSelf> {
  <
    S extends SubUrl<TEndpoints, P> & string,
    TBody extends ParseableSchema | undefined = undefined,
    TQuery extends ParseableSchema | undefined = undefined,
    TParams extends ParseableSchema | undefined = undefined,
  >(
    url: S,
    def: VerbArg<TEndpoints, FullKey<TEndpoints, P, S>, TBody, TQuery, TParams>,
  ): TSelf;
}

export interface MockGroup<TEndpoints, P extends string = ''> {
  get: VerbMethod<TEndpoints, P, MockGroup<TEndpoints, P>>;
  post: VerbMethod<TEndpoints, P, MockGroup<TEndpoints, P>>;
  put: VerbMethod<TEndpoints, P, MockGroup<TEndpoints, P>>;
  patch: VerbMethod<TEndpoints, P, MockGroup<TEndpoints, P>>;
  delete: VerbMethod<TEndpoints, P, MockGroup<TEndpoints, P>>;
  /** Register an in-memory store with default CRUD, seeded and typed by the map. */
  data<S extends SubUrl<TEndpoints, P> & string>(
    url: S,
    seed: TEndpoints[FullKey<TEndpoints, P, S>],
  ): MockGroup<TEndpoints, P>;
  /** Scope every later registration under an additional URL prefix. */
  prefix<P2 extends string>(prefix: P2): MockGroup<TEndpoints, `${P}${P2}`>;
  /** Collapse registrations into `EndpointDef[]` for `mockr({ endpoints })`. */
  done(): EndpointDef<TEndpoints>[];
}

export function mockGroup<TEndpoints = Record<string, unknown>>(): MockGroup<TEndpoints, ''> {
  const order: string[] = [];
  const byUrl = new Map<string, UrlEntry>();
  let pfx = '';

  function entryFor(url: string): UrlEntry {
    let entry = byUrl.get(url);
    if (!entry) {
      entry = { url, verbs: [] };
      byUrl.set(url, entry);
      order.push(url);
    }
    return entry;
  }

  function addVerb(verb: Verb, url: string, def: VerbFn<any, any> | VerbSpec<any, any, any, any, any>): void {
    const entry = entryFor(url);
    if (entry.verbs.some((v) => v.verb === verb)) {
      throw new Error(`mockGroup: duplicate ${verb} ${url}`);
    }
    const delay = typeof def === 'function' ? undefined : def.delay;
    entry.verbs.push({ verb, spec: toSpec(def), delay });
  }

  const group: MockGroup<TEndpoints, string> = {
    get(url, def) {
      addVerb('GET', pfx + (url as string), def as never);
      return group;
    },
    post(url, def) {
      addVerb('POST', pfx + (url as string), def as never);
      return group;
    },
    put(url, def) {
      addVerb('PUT', pfx + (url as string), def as never);
      return group;
    },
    patch(url, def) {
      addVerb('PATCH', pfx + (url as string), def as never);
      return group;
    },
    delete(url, def) {
      addVerb('DELETE', pfx + (url as string), def as never);
      return group;
    },
    data(url, seed) {
      const fullUrl = pfx + (url as string);
      const entry = entryFor(fullUrl);
      if (entry.data !== undefined) {
        throw new Error(`mockGroup: duplicate data store ${fullUrl}`);
      }
      entry.data = seed;
      return group;
    },
    prefix(p) {
      pfx += p as string;
      return group as never;
    },
    done() {
      const defs: EndpointDef<TEndpoints>[] = [];

      for (const url of order) {
        const entry = byUrl.get(url)!;
        const hasData = entry.data !== undefined;
        const { verbs } = entry;

        if (hasData) {
          const def: Record<string, unknown> = { url, data: entry.data };
          if (verbs.length > 0) {
            def.methods = Object.fromEntries(verbs.map((v) => [v.verb, v.spec]));
          }
          defs.push(def as EndpointDef<TEndpoints>);
          continue;
        }

        if (verbs.length === 1) {
          const [only] = verbs;
          const def: Record<string, unknown> = { url, method: only.verb, handler: only.spec };
          if (only.delay !== undefined) def.delay = only.delay;
          defs.push(def as EndpointDef<TEndpoints>);
          continue;
        }

        const methods = Object.fromEntries(verbs.map((v) => [v.verb, v.spec]));
        defs.push({ url, methods } as EndpointDef<TEndpoints>);
      }

      return defs;
    },
  };

  return group as MockGroup<TEndpoints, ''>;
}
