import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/server.js';
import type { MockrServer } from '../src/types.js';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Recorder integration (server routes)', () => {
  let server: MockrServer;
  let sessionsDir: string;
  let mocksDir: string;

  afterEach(async () => {
    if (server) await server.close();
    if (sessionsDir) await rm(sessionsDir, { recursive: true, force: true });
    if (mocksDir) await rm(mocksDir, { recursive: true, force: true });
  });

  async function setup() {
    sessionsDir = await mkdtemp(join(tmpdir(), 'mockr-rec-'));
    mocksDir = await mkdtemp(join(tmpdir(), 'mockr-mocks-'));
    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir },
      endpoints: [
        { url: '/api/existing', body: { hello: 'world' } },
      ],
    });
  }

  async function recordSession(
    name: string,
    entries: {
      url: string;
      method: string;
      status: number;
      contentType: string;
      body: string;
    }[],
  ) {
    const startRes = await fetch(`${server.url}/__mockr/record/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const { sessionId } = (await startRes.json()) as any;

    const entryIds: string[] = [];
    for (const entry of entries) {
      const res = await fetch(`${server.url}/__mockr/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...entry, responseHeaders: {} }),
      });
      const recorded = (await res.json()) as any;
      entryIds.push(recorded.id);
    }

    await fetch(`${server.url}/__mockr/record/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    return { sessionId, entryIds };
  }

  it("starts and stops a recording session via HTTP", async () => {
    await setup();

    const startRes = await fetch(`${server.url}/__mockr/record/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-session",
        baseUrl: "http://example.com",
      }),
    });
    expect(startRes.status).toBe(200);
    const startBody = (await startRes.json()) as any;
    expect(startBody.sessionId).toBeTruthy();

    const sessionId = startBody.sessionId;

    const recordRes = await fetch(`${server.url}/__mockr/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        url: "http://example.com/api/users",
        method: "GET",
        status: 200,
        contentType: "application/json",
        responseHeaders: {},
        body: JSON.stringify([{ id: 1, name: "Alice" }]),
      }),
    });
    expect(recordRes.status).toBe(200);

    const stopRes = await fetch(`${server.url}/__mockr/record/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    expect(stopRes.status).toBe(200);
    const stopBody = (await stopRes.json()) as any;
    expect(stopBody.entryCount).toBe(1);
  });

  it("lists and deletes sessions", async () => {
    await setup();
    const { sessionId } = await recordSession("list-test", [
      {
        url: "http://example.com/api/data",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: "[]",
      },
    ]);

    const listRes = await fetch(`${server.url}/__mockr/sessions`);
    const sessions = (await listRes.json()) as any[];
    expect(sessions.some((s: any) => s.name === "list-test")).toBe(true);

    await fetch(`${server.url}/__mockr/sessions/${sessionId}`, {
      method: "DELETE",
    });
    const listRes2 = await fetch(`${server.url}/__mockr/sessions`);
    const sessions2 = (await listRes2.json()) as any[];
    expect(sessions2.some((s: any) => s.id === sessionId)).toBe(false);
  });

  it("returns CORS headers on recorder routes", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/sessions`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("handles OPTIONS preflight on recorder routes", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/record/start`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns error when recorder is not enabled", async () => {
    server = await mockr({ port: 0 });
    const res = await fetch(`${server.url}/__mockr/sessions`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toContain("not enabled");
  });

  it("unknown __mockr/* routes return 404, not fall through to proxy", async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), "mockr-rec-"));
    mocksDir = await mkdtemp(join(tmpdir(), "mockr-mocks-"));
    const target = await mockr({
      port: 0,
      endpoints: [{ url: "/api/target", body: "from-proxy" }],
    });
    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir },
      proxy: { target: target.url },
    });

    const res = await fetch(`${server.url}/__mockr/record/start`); // GET, not POST
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toContain("Unknown recorder route");

    await target.close();
  });

  // Map to file tests

  it("maps recorded entries to JSON files and creates handler endpoints", async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession("map-test", [
      {
        url: "http://example.com/api/users",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, name: "Alice" }]),
      },
    ]);

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, entryIds }),
    });
    expect(mapRes.status).toBe(200);
    const mapBody = (await mapRes.json()) as any;
    expect(mapBody.mapped).toHaveLength(1);
    expect(mapBody.mapped[0].url).toBe("/api/users");
    expect(mapBody.mapped[0].bodyFile).toContain("api-users.json");

    // Verify JSON file was written
    const content = await readFile(join(mocksDir, "api-users.json"), "utf-8");
    expect(JSON.parse(content)).toEqual([{ id: 1, name: "Alice" }]);

    // Mapped endpoint should be a handler (not static)
    const eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    const mapped = eps.find((e: any) => e.url === "/api/users");
    expect(mapped.type).toBe("data");

    // Verify endpoint serves the data
    const dataRes = await fetch(`${server.url}/api/users`);
    expect(dataRes.status).toBe(200);
    expect(await dataRes.json()).toEqual([{ id: 1, name: "Alice" }]);
  });

  it("maps array body as data endpoint with CRUD", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/items",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '[{"id":1,"name":"A"}]',
          },
        ],
      }),
    });

    // GET list
    const r1 = await fetch(`${server.url}/api/items`);
    expect(await r1.json()).toEqual([{ id: 1, name: "A" }]);

    // POST to add
    const r2 = await fetch(`${server.url}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 2, name: "B" }),
    });
    expect(r2.status).toBe(201);

    // GET by id
    const r3 = await fetch(`${server.url}/api/items/1`);
    expect(((await r3.json()) as any).name).toBe("A");
  });

  it("maps object body as static endpoint", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/config",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '{"theme":"dark"}',
          },
        ],
      }),
    });

    const eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    expect(eps.find((e: any) => e.url === "/api/config").type).toBe("static");

    const res = await fetch(`${server.url}/api/config`);
    expect(await res.json()).toEqual({ theme: "dark" });
  });

  it("generates TypeScript interface files", async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession("types-test", [
      {
        url: "http://example.com/api/config",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ theme: "dark", lang: "en" }),
      },
    ]);

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, entryIds, generateTypes: true }),
    });
    const mapBody = (await mapRes.json()) as any;
    expect(mapBody.mapped[0].typesFile).toContain("api-config.d.ts");

    // Verify .d.ts file was written
    const typesContent = await readFile(
      join(mocksDir, "api-config.d.ts"),
      "utf-8",
    );
    expect(typesContent).toContain("export interface");
    expect(typesContent).toContain("theme");
    expect(typesContent).toContain("lang");
  });

  it("skips type generation when generateTypes is false", async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession("no-types-test", [
      {
        url: "http://example.com/api/data",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: "{}",
      },
    ]);

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, entryIds, generateTypes: false }),
    });
    const mapBody = (await mapRes.json()) as any;
    expect(mapBody.mapped[0].typesFile).toBeUndefined();

    // Verify no .d.ts file
    await expect(stat(join(mocksDir, "api-data.d.ts"))).rejects.toThrow();
  });

  it("mapped array endpoints show as data in listEndpoints", async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession("list-ep-test", [
      {
        url: "http://example.com/api/mapped",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: '[{"id":1}]',
      },
    ]);

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, entryIds }),
    });

    const eps = server.listEndpoints();
    const ep = eps.find((e) => e.url === "/api/mapped");
    expect(ep).toBeTruthy();
    expect(ep!.type).toBe("data");
  });

  it("updates existing endpoint when mapping same URL twice", async () => {
    await setup();

    // First map
    const { sessionId: s1, entryIds: e1 } = await recordSession("map-1", [
      {
        url: "http://example.com/api/items",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: '"v1"',
      },
    ]);
    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s1, entryIds: e1 }),
    });

    // Second map with different body
    const { sessionId: s2, entryIds: e2 } = await recordSession("map-2", [
      {
        url: "http://example.com/api/items",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: '"v2"',
      },
    ]);
    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s2, entryIds: e2 }),
    });

    // Should serve updated value
    const res = await fetch(`${server.url}/api/items`);
    expect(await res.json()).toBe("v2");

    // Should not duplicate endpoints
    const eps = server.listEndpoints().filter((e) => e.url === "/api/items");
    expect(eps).toHaveLength(1);
  });

  it("serves 304 entries as 200", async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession("304-test", [
      {
        url: "http://example.com/api/cached",
        method: "GET",
        status: 304,
        contentType: "application/json",
        body: '{"cached":true}',
      },
    ]);

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, entryIds }),
    });

    const res = await fetch(`${server.url}/api/cached`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cached: true });
  });

  it("GET /__mockr/map/endpoints lists mapped endpoints", async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession("map-list-test", [
      {
        url: "http://example.com/api/listed",
        method: "GET",
        status: 200,
        contentType: "application/json",
        body: "{}",
      },
    ]);

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, entryIds }),
    });

    const res = await fetch(`${server.url}/__mockr/map/endpoints`);
    expect(res.status).toBe(200);
    const endpoints = (await res.json()) as any[];
    expect(endpoints.some((e: any) => e.url === "/api/listed")).toBe(true);
  });

  it("server.recorder API exposes mapToFile", async () => {
    await setup();
    expect(server.recorder).not.toBeNull();

    const s = await server.recorder!.startSession(
      "api-test",
      "http://test.com",
    );
    expect(s.id).toBeTruthy();
    await server.recorder!.stopSession(s.id);

    const sessions = await server.recorder!.listSessions();
    expect(sessions.some((x) => x.name === "api-test")).toBe(true);
  });

  it("server.recorder is null when recorder not configured", async () => {
    server = await mockr({ port: 0 });
    expect(server.recorder).toBeNull();
  });

  // Inline entries (in-memory recording, no session)

  it("maps inline entries as handlers (no session needed)", async () => {
    await setup();

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/inline",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '{"inline":true}',
          },
        ],
      }),
    });
    expect(mapRes.status).toBe(200);
    const mapBody = (await mapRes.json()) as any;
    expect(mapBody.mapped).toHaveLength(1);
    expect(mapBody.mapped[0].url).toBe("/api/inline");

    // Should be a handler, not static
    const eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    // Object body → static (array body would be data)
    expect(eps.find((e: any) => e.url === "/api/inline").type).toBe("static");

    const res = await fetch(`${server.url}/api/inline`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inline: true });
  });

  it("maps inline entries with multiple items", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/a",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '"aaa"',
          },
          {
            url: "http://example.com/api/b",
            method: "POST",
            status: 201,
            contentType: "application/json",
            body: '"bbb"',
          },
        ],
      }),
    });

    const a = await fetch(`${server.url}/api/a`);
    expect(await a.json()).toBe("aaa");

    const b = await fetch(`${server.url}/api/b`, { method: "POST" });
    expect(await b.json()).toBe("bbb");
  });

  it("returns 400 when neither entries nor sessionId provided", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // GET /__mockr/endpoints

  it("GET /__mockr/endpoints lists all endpoints with type", async () => {
    await setup();

    const res = await fetch(`${server.url}/__mockr/endpoints`);
    expect(res.status).toBe(200);
    const eps = (await res.json()) as any[];
    const existing = eps.find((e: any) => e.url === "/api/existing");
    expect(existing).toBeTruthy();
    expect(existing.type).toBe("static");
    expect(existing.enabled).toBe(true);
  });

  // PATCH /__mockr/endpoints — update URL

  it("PATCH /__mockr/endpoints updates endpoint URL", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/original",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '"orig"',
          },
        ],
      }),
    });

    // Rename URL
    const patchRes = await fetch(`${server.url}/__mockr/endpoints`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldUrl: '/api/original', newUrl: '/api/renamed' }),
    });
    expect(patchRes.status).toBe(200);

    // Old URL should 404
    const oldRes = await fetch(`${server.url}/api/original`);
    expect(oldRes.status).toBe(404);

    // New URL should work
    const newRes = await fetch(`${server.url}/api/renamed`);
    expect(newRes.status).toBe(200);
    expect(await newRes.json()).toBe("orig");
  });

  it("PATCH /__mockr/endpoints returns 404 for unknown URL", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/endpoints`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldUrl: "/nonexistent", newUrl: "/new" }),
    });
    expect(res.status).toBe(404);
  });

  // POST /__mockr/endpoints/toggle

  it("POST /__mockr/endpoints/toggle disables and re-enables endpoint", async () => {
    await setup();

    // Disable
    await fetch(`${server.url}/__mockr/endpoints/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/existing", enabled: false }),
    });

    const disabledRes = await fetch(`${server.url}/api/existing`);
    expect(disabledRes.status).toBe(404);

    // Re-enable
    await fetch(`${server.url}/__mockr/endpoints/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/existing", enabled: true }),
    });

    const enabledRes = await fetch(`${server.url}/api/existing`);
    expect(enabledRes.status).toBe(200);
  });

  // PATCH /__mockr/endpoints/type

  it("changes static endpoint to handler (preserves data)", async () => {
    await setup();
    // /api/existing is a config-defined static endpoint
    let eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    expect(eps.find((e: any) => e.url === "/api/existing").type).toBe("static");

    const typeRes = await fetch(`${server.url}/__mockr/endpoints/type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/existing", type: "handler" }),
    });
    expect(typeRes.status).toBe(200);

    eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    expect(eps.find((e: any) => e.url === "/api/existing").type).toBe(
      "handler",
    );

    // Should still serve the original body
    const dataRes = await fetch(`${server.url}/api/existing`);
    expect(dataRes.status).toBe(200);
    expect(await dataRes.json()).toEqual({ hello: "world" });
  });

  it("changes mapped handler back to static (preserves data)", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/back-static",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '{"x":2}',
          },
        ],
      }),
    });

    // Mapped as handler, now convert to static
    await fetch(`${server.url}/__mockr/endpoints/type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/back-static", type: "static" }),
    });

    const eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    expect(eps.find((e: any) => e.url === "/api/back-static").type).toBe(
      "static",
    );

    // Should still serve the data
    const res = await fetch(`${server.url}/api/back-static`);
    expect(await res.json()).toEqual({ x: 2 });
  });

  it("changes handler endpoint to data when body is array", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/to-data",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '[{"id":1},{"id":2}]',
          },
        ],
      }),
    });

    // Change from handler to data
    await fetch(`${server.url}/__mockr/endpoints/type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/to-data", type: "data" }),
    });

    const eps = (await (
      await fetch(`${server.url}/__mockr/endpoints`)
    ).json()) as any[];
    const ep = eps.find((e: any) => e.url === "/api/to-data");
    expect(ep.type).toBe("data");
    expect(ep.itemCount).toBe(2);

    // Should support CRUD
    const listRes = await fetch(`${server.url}/api/to-data`);
    expect(await listRes.json()).toEqual([{ id: 1 }, { id: 2 }]);

    const postRes = await fetch(`${server.url}/api/to-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 3, name: "new" }),
    });
    expect(postRes.status).toBe(201);
  });

  it("returns 404 when changing type of nonexistent endpoint", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/endpoints/type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/nope", type: "handler" }),
    });
    expect(res.status).toBe(404);
  });

  // DELETE /__mockr/endpoints

  it("DELETE /__mockr/endpoints removes an endpoint", async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/deleteme",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '"bye"',
          },
        ],
      }),
    });

    // Verify it exists
    const before = await fetch(`${server.url}/api/deleteme`);
    expect(before.status).toBe(200);

    // Delete it
    const delRes = await fetch(`${server.url}/__mockr/endpoints`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/deleteme" }),
    });
    expect(delRes.status).toBe(200);

    // Should be gone
    const after = await fetch(`${server.url}/api/deleteme`);
    expect(after.status).toBe(404);
  });

  it("DELETE /__mockr/endpoints returns 404 for unknown", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/endpoints`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/nope" }),
    });
    expect(res.status).toBe(404);
  });

  // Server file patching

  it("patches server file with handler (not bodyFile) when mapping", async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), "mockr-rec-"));
    mocksDir = await mkdtemp(join(tmpdir(), "mockr-mocks-"));
    const serverFilePath = join(sessionsDir, "server.ts");
    // Write a minimal server file template
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(
      serverFilePath,
      `import { mockr } from 'mockr'

type Endpoints = {
  '/api/existing': { hello: string }
}

const server = await mockr<Endpoints>({
  port: 0,
  endpoints: [
    { url: '/api/existing', body: { hello: 'world' } },
  ],
})
`,
      "utf-8",
    );

    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir, serverFile: serverFilePath },
    });

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/items",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '[{"id":1}]',
          },
        ],
      }),
    });

    const src = await readFile(serverFilePath, "utf-8");

    const norm = src.replace(/['"]/g, "");

    // Array body → should use dataFile
    expect(norm).toContain("dataFile");
    expect(norm).toContain("api-items.json");
    expect(norm).not.toContain("readFileSync");

    // Should have updated Endpoints type and import
    expect(norm).toContain("ApiItems");
    expect(norm).toContain("/api/items");
    expect(norm).toContain("import type");
  });

  it("patches server file with dataFile for object responses too", async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), "mockr-rec-"));
    mocksDir = await mkdtemp(join(tmpdir(), "mockr-mocks-"));
    const serverFilePath = join(sessionsDir, "server.ts");
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(
      serverFilePath,
      `import { mockr } from 'mockr'
const server = await mockr({
  port: 0,
  endpoints: [],
})
`,
      "utf-8",
    );

    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir, serverFile: serverFilePath },
    });

    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/config",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '{"theme":"dark"}',
          },
        ],
      }),
    });

    const src = await readFile(serverFilePath, "utf-8");

    // Always uses dataFile (unified)
    expect(src).toContain("dataFile");
    expect(src).not.toContain("bodyFile");
  });

  it("data endpoint .data is typed as element array", async () => {
    await setup();

    // Map an array response
    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/typed-items",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '[{"id":1,"name":"A"},{"id":2,"name":"B"}]',
          },
        ],
      }),
    });

    // .data should be the array
    const handle = server.endpoint("/api/typed-items");
    expect(handle.data).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
    expect(handle.findById(1)).toEqual({ id: 1, name: "A" });
    expect(handle.count()).toBe(2);
  });

  it('object endpoint supports GET, PATCH, PUT, DELETE', async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [{ url: 'http://example.com/api/settings', method: 'GET', status: 200, contentType: 'application/json', body: '{"theme":"dark","lang":"en"}' }],
      }),
    });

    // GET returns the object
    const r1 = await fetch(`${server.url}/api/settings`);
    expect(await r1.json()).toEqual({ theme: 'dark', lang: 'en' });

    // PATCH merges fields
    const r2 = await fetch(`${server.url}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'light' }),
    });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ theme: 'light', lang: 'en' });

    // GET reflects the patch
    const r3 = await fetch(`${server.url}/api/settings`);
    expect(await r3.json()).toEqual({ theme: 'light', lang: 'en' });

    // PUT replaces entirely
    const r4 = await fetch(`${server.url}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'blue' }),
    });
    expect(r4.status).toBe(200);
    expect(await r4.json()).toEqual({ theme: 'blue' });

    // DELETE resets to empty
    const r5 = await fetch(`${server.url}/api/settings`, { method: 'DELETE' });
    expect(r5.status).toBe(200);

    const r6 = await fetch(`${server.url}/api/settings`);
    expect(await r6.json()).toEqual({});
  });

  it('object endpoint body is accessible via handle', async () => {
    await setup();

    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [{ url: 'http://example.com/api/obj-resp', method: 'GET', status: 200, contentType: 'application/json', body: '{"projects":[{"id":1}]}' }],
      }),
    });

    const handle = server.endpoint('/api/obj-resp');
    expect(handle.body).toEqual({ projects: [{ id: 1 }] });
  });

  it("delete removes endpoint from server file including type", async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), "mockr-rec-"));
    mocksDir = await mkdtemp(join(tmpdir(), "mockr-mocks-"));
    const serverFilePath = join(sessionsDir, "server.ts");
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(
      serverFilePath,
      `import { mockr } from 'mockr'

type Endpoints = {
  '/api/existing': { hello: string }
}

const server = await mockr<Endpoints>({
  port: 0,
  endpoints: [
    { url: '/api/existing', body: { hello: 'world' } },
  ],
})
`,
      "utf-8",
    );

    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir, serverFile: serverFilePath },
    });

    // Map an endpoint
    await fetch(`${server.url}/__mockr/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            url: "http://example.com/api/removeme",
            method: "GET",
            status: 200,
            contentType: "application/json",
            body: '[{"id":1}]',
          },
        ],
      }),
    });

    let src = await readFile(serverFilePath, "utf-8");
    let norm = src.replace(/['"]/g, "");
    expect(norm).toContain("/api/removeme");
    expect(norm).toContain("ApiRemoveme");

    // Delete it
    await fetch(`${server.url}/__mockr/endpoints`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/api/removeme" }),
    });

    src = await readFile(serverFilePath, "utf-8");
    norm = src.replace(/['"]/g, "");
    // Endpoint entry, type, and import should all be removed
    expect(norm).not.toContain("/api/removeme");
    expect(norm).not.toContain("ApiRemoveme");
  });

  // OPTIONS preflight on recorder routes

  it("OPTIONS returns CORS headers on /__mockr routes", async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/endpoints`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  // Unknown routes catch-all

  it("unknown /__mockr routes return 404 not proxy", async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), "mockr-rec-"));
    mocksDir = await mkdtemp(join(tmpdir(), "mockr-mocks-"));
    const target = await mockr({
      port: 0,
      endpoints: [{ url: "/x", body: "proxy" }],
    });
    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir },
      proxy: { target: target.url },
    });

    const res = await fetch(`${server.url}/__mockr/unknown-route`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toContain("Unknown recorder route");
    await target.close();
  });
});
