import { describe, it, expect } from 'vitest';
import { validateConfig, formatErrors } from '../src/config-validator.js';
import { handler } from '../src/handler.js';
import { file } from '../src/file.js';

describe('validateConfig', () => {
  it('passes valid config', () => {
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', data: [{ id: 1 }] },
        { url: '/api/y', dataFile: file('./y.json') },
        { url: '/api/z', handler: handler({ fn: () => ({ body: {} }) }) },
        { url: '/api/m', methods: { GET: handler({ fn: () => ({ body: {} }) }) } },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown key with did-you-mean suggestion', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', dataFiel: './x.json' } as any],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0]).toMatchObject({
      index: 0,
      url: '/api/x',
    });
    expect(result.errors[0].message).toContain("'dataFiel' is not a known key");
    expect(result.errors[0].message).toContain('dataFile');
  });

  it('rejects data + handler together', () => {
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', data: [], handler: handler({ fn: () => ({ body: {} }) }) } as any,
      ],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain("cannot set both 'data' and 'handler'");
  });

  it('rejects data + dataFile together', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', data: [], dataFile: './x.json' } as any],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain("cannot set both 'data' and 'dataFile'");
  });

  it('rejects dataFile + handler together', () => {
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', dataFile: './x.json', handler: handler({ fn: () => ({ body: {} }) }) } as any,
      ],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain("cannot set both 'dataFile' and 'handler'");
  });

  it('rejects handler + methods together', () => {
    const h = handler({ fn: () => ({ body: {} }) });
    const result = validateConfig({
      endpoints: [{ url: '/api/x', handler: h, methods: { GET: h } } as any],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain("cannot set both 'handler' and 'methods'");
  });

  it('rejects method + methods together', () => {
    const h = handler({ fn: () => ({ body: {} }) });
    const result = validateConfig({
      endpoints: [{ url: '/api/x', method: 'GET', methods: { GET: h } } as any],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain("cannot set both 'method' and 'methods'");
  });

  it('rejects duplicate URL+method', () => {
    const h = handler({ fn: () => ({ body: {} }) });
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', method: 'GET', handler: h },
        { url: '/api/x', method: 'GET', handler: h },
      ],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.message.includes('duplicate URL+method'))).toBe(true);
  });

  it('rejects raw function as handler', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', handler: ((_req: any) => ({ body: {} })) as any }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain('must be created by handler({');
  });

  it('rejects malformed methods map (lowercase verb)', () => {
    const h = handler({ fn: () => ({ body: {} }) });
    const result = validateConfig({
      endpoints: [{ url: '/api/x', methods: { get: h } as any }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain('uppercase HTTP verbs');
  });

  it('rejects non-HandlerSpec methods value', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', methods: { GET: (() => ({ body: {} })) as any } }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain('handler({');
  });

  it('rejects dataFile that is neither string nor FileRef', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', dataFile: 42 as any }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0].message).toContain("'dataFile' must be");
  });

  it('aggregates multiple errors across endpoints', () => {
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', dataFiel: './x.json' } as any,
        { url: '/api/y', data: [], handler: handler({ fn: () => ({ body: {} }) }) } as any,
      ],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.length).toBe(2);
  });
});

describe('formatErrors', () => {
  it('formats aggregated errors with index and URL', () => {
    const formatted = formatErrors([
      { index: 0, url: '/a', message: "'foo' is not a known key" },
      { index: 2, url: '/b', message: "cannot set both 'data' and 'handler'" },
    ]);
    expect(formatted).toContain('mockr: 2 endpoint definitions invalid');
    expect(formatted).toContain('[0] /a');
    expect(formatted).toContain('[2] /b');
  });

  it('singularizes for one error', () => {
    const formatted = formatErrors([
      { index: 0, url: '/a', message: 'foo' },
    ]);
    expect(formatted).toContain('1 endpoint definition invalid');
  });
});
