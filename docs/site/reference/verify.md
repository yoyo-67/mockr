# Verify — contract-drift checks

Attach a `responseSchema` to an endpoint, run with `verify`, and mockr validates
every served response body against it — reporting any mismatch. Run it against
the real backend (via proxy / `ctx.forward()`) to catch when the API drifts from
your declared contract, or against your mocks to catch when the mocks drift.

## Declare a contract

```ts
mockGroup<Endpoints>()
  .get('/api/projects/:projectId/stats/', {
    responseSchema: z.object({ project_id: z.string(), progress: z.number() }),
    fn: (req) => ({ project_id: req.params.projectId, progress: 87 }),
  })
  .done();
```

`responseSchema` is any `safeParse` schema. It's independent of the response's TypeScript type — typically the real BE's full contract.

## Turn on verification

```ts
await mockr({
  verify: true,                 // or run with the --verify CLI flag
  onDrift: ({ url, method, issues }) => {
    // e.g. fail CI, collect a report
    console.error('drift', method, url, issues);
  },
  groups: [mocks],
});
```

| Option | Description |
|---|---|
| `verify` | `boolean`. Also enabled by `--verify` on the CLI. |
| `onDrift` | `(info: { url, method, issues }) => void`. Called once per response whose body fails its `responseSchema`. |

When `verify` is on, every served body that has a matching `responseSchema` is checked. Failures call `onDrift` and log a `drift` line; the response is still sent. Endpoints without a `responseSchema`, and raw responses, are skipped.

## Checking the real backend

Point a route at the upstream — proxy passthrough, or a handler that returns `ctx.forward()` — and keep its `responseSchema`. The served body is then the real response, so `verify` reports when upstream no longer matches your contract:

```bash
npx tsx serverMocker.ts --verify
```
