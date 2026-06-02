# Query params & fixtures

Helpers for typed query parsing and fixture building. Import from `@yoyo-org/mockr`.

## `jsonParam(inner?)`

A zod schema for a query param carrying a JSON-encoded value. Parses the string with `JSON.parse`, then optionally validates the result with `inner` — which is **any** `ParseableSchema` (a zod schema or a hand-rolled `{ safeParse }`), so no nested `z.object` is required. Composes inside `z.object({...})` and supports `.optional()` / `.array()`.

```ts
import { jsonParam } from '@yoyo-org/mockr';

const query = z.object({
  filter: jsonParam(z.object({ min: z.number() })).optional(),
});
// GET /x?filter=%7B%22min%22%3A3%7D  →  req.query.filter = { min: 3 }
```

Invalid JSON or a failed `inner` check fails validation (the request 400s).

## `jsonArrayParam(inner?)`

A zod schema for a **repeatable** JSON query param (`?range={...}&range={...}`). Accepts a single string, a string array, or absence; parses each entry, **drops malformed ones** (lenient — never fails), and returns `T[]`.

```ts
import { jsonArrayParam } from '@yoyo-org/mockr';

// inner may be a hand-rolled validator — no zod needed for the shape
const sizeRange = {
  safeParse: (v: unknown) =>
    typeof (v as { min?: unknown })?.min === 'number'
      ? { success: true as const, data: v as { min: number; max: number } }
      : { success: false as const, error: { message: 'bad range' } },
};

const query = z.object({ size: jsonArrayParam(sizeRange) });
// GET /x?size={"min":1,"max":5}&size=garbage  →  req.query.size = [{ min: 1, max: 5 }]
```

Replaces hand-rolled `z.union([z.string(), z.array(z.string())])` + `JSON.parse` + normalize loops.

## `factory<T>(defaults)`

Fixture builder. `factory(defaults)(overrides?)` shallow-merges overrides over a fresh copy of the defaults and returns a `T`.

```ts
import { factory } from '@yoyo-org/mockr';

const aUser = factory<User>({ id: '', name: '', role: 'viewer', tags: [] });
aUser({ name: 'Dana' });            // { id: '', name: 'Dana', role: 'viewer', tags: [] }
```

Pass a **thunk** to regenerate the defaults per call — e.g. fresh values from faker:

```ts
const aUser = factory<User>(() => ({ id: faker.string.uuid(), name: faker.person.fullName(), role: 'viewer', tags: [] }));
aUser();   // fresh id + name each call
```

Merging is shallow; use the thunk form when nested objects must not be shared across builds.
