/**
 * Public API: built-in middleware factories.
 *
 * `auth` is already exercised end-to-end in level-5-middleware.test.ts; this
 * file pins the *direct* shape of every published middleware factory so a
 * silent rename, signature change, or timing regression is caught before
 * release.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { delay, logger, errorInjection, auth } from '../src/index.js';
import type { MockrRequest, HandlerResult, Middleware } from '../src/index.js';

function makeReq(over: Partial<MockrRequest> = {}): MockrRequest {
  return {
    method: 'GET',
    path: '/x',
    params: {},
    query: {},
    headers: {},
    body: undefined,
    ...over,
  } as MockrRequest;
}

describe('delay()', () => {
  it('returns a Middleware with name "delay" and only a pre hook', () => {
    const mw: Middleware = delay({ min: 0, max: 0 });
    expect(mw.name).toBe('delay');
    expect(typeof mw.pre).toBe('function');
    expect(mw.post).toBeUndefined();
  });

  it('pre() resolves to undefined (does not short-circuit the request)', async () => {
    const mw = delay({ min: 0, max: 0 });
    const result = await mw.pre!(makeReq());
    expect(result).toBeUndefined();
  });

  it('pre() honours the min/max window', async () => {
    const mw = delay({ min: 30, max: 30 });
    const start = Date.now();
    await mw.pre!(makeReq());
    const elapsed = Date.now() - start;
    // Allow generous slack for CI jitter; lower bound is what matters.
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });
});

describe('logger()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('returns a Middleware with name "logger" and both pre and post hooks', () => {
    const mw = logger();
    expect(mw.name).toBe('logger');
    expect(typeof mw.pre).toBe('function');
    expect(typeof mw.post).toBe('function');
  });

  it('pre() logs "[mockr] METHOD path"', () => {
    const mw = logger();
    mw.pre!(makeReq({ method: 'POST', path: '/api/users' }));
    expect(logSpy).toHaveBeenCalledWith('[mockr] POST /api/users');
  });

  it('post() logs status from HandlerResult, defaulting to 200', () => {
    const mw = logger();
    const req = makeReq({ method: 'GET', path: '/api/items' });
    mw.post!(req, { body: {}, status: 201 } as HandlerResult);
    mw.post!(req, { body: {} } as HandlerResult);
    expect(logSpy).toHaveBeenCalledWith('[mockr] GET /api/items → 201');
    expect(logSpy).toHaveBeenCalledWith('[mockr] GET /api/items → 200');
  });
});

describe('errorInjection()', () => {
  let randSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randSpy.mockRestore();
  });

  it('returns a Middleware with name "errorInjection" and only a pre hook', () => {
    const mw = errorInjection({ rate: 0 });
    expect(mw.name).toBe('errorInjection');
    expect(typeof mw.pre).toBe('function');
    expect(mw.post).toBeUndefined();
  });

  it('returns 500 with { error: "Injected error" } when rate fires (default status)', () => {
    randSpy.mockReturnValue(0); // Math.random() < rate is true
    const mw = errorInjection({ rate: 1 });
    const result = mw.pre!(makeReq());
    expect(result).toEqual({ status: 500, body: { error: 'Injected error' } });
  });

  it('respects custom status override', () => {
    randSpy.mockReturnValue(0);
    const mw = errorInjection({ rate: 1, status: 503 });
    const result = mw.pre!(makeReq());
    expect(result).toEqual({ status: 503, body: { error: 'Injected error' } });
  });

  it('returns undefined (passes through) when rate does not fire', () => {
    randSpy.mockReturnValue(0.99);
    const mw = errorInjection({ rate: 0 });
    const result = mw.pre!(makeReq());
    expect(result).toBeUndefined();
  });
});

describe('auth()', () => {
  it('returns a Middleware with name "auth" and only a pre hook', () => {
    const mw = auth({ type: 'bearer', validate: () => true });
    expect(mw.name).toBe('auth');
    expect(typeof mw.pre).toBe('function');
    expect(mw.post).toBeUndefined();
  });

  it('returns 401 when authorization header is missing', () => {
    const mw = auth({ type: 'bearer', validate: () => true });
    const result = mw.pre!(makeReq());
    expect(result).toEqual({ status: 401, body: { error: 'Unauthorized' } });
  });

  it('returns 403 when validate() rejects the token', () => {
    const mw = auth({ type: 'bearer', validate: () => false });
    const result = mw.pre!(makeReq({ headers: { authorization: 'Bearer abc' } }));
    expect(result).toEqual({ status: 403, body: { error: 'Forbidden' } });
  });

  it('passes through (undefined) when validate() accepts the token, stripping the Bearer prefix', () => {
    const seen: string[] = [];
    const mw = auth({
      type: 'bearer',
      validate: (token) => {
        seen.push(token);
        return true;
      },
    });
    const result = mw.pre!(makeReq({ headers: { authorization: 'Bearer my-token' } }));
    expect(result).toBeUndefined();
    expect(seen).toEqual(['my-token']);
  });

  it('skips paths listed in `exclude`', () => {
    const mw = auth({ type: 'bearer', validate: () => false, exclude: ['/health'] });
    const result = mw.pre!(makeReq({ path: '/health' }));
    expect(result).toBeUndefined();
  });
});
