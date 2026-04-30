import { describe, it, expectTypeOf } from 'vitest';
import { mockr } from '../src/index.js';
import { file, type FileRef } from '../src/file.js';
import type { ListHandle } from '../src/list-handle.js';
import type { RecordHandle } from '../src/record-handle.js';

interface Alert {
  id: number;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

interface Config {
  theme: string;
  lang: string;
}

describe('file<T>() factory types', () => {
  it('file<Alert[]>() produces FileRef<Alert[]>', () => {
    const ref = file<Alert[]>('./alerts.json');
    expectTypeOf(ref).toEqualTypeOf<FileRef<Alert[]>>();
  });

  it('file<Config>() produces FileRef<Config>', () => {
    const ref = file<Config>('./config.json');
    expectTypeOf(ref).toEqualTypeOf<FileRef<Config>>();
  });

  it('file() with no generic produces FileRef<unknown>', () => {
    const ref = file('./anything.json');
    expectTypeOf(ref).toEqualTypeOf<FileRef<unknown>>();
  });

  it('FileRef<T> exposes .path as string', () => {
    const ref = file<Alert[]>('./alerts.json');
    expectTypeOf(ref.path).toEqualTypeOf<string>();
  });

  it('using file<Alert[]>() in dataFile makes server.endpoint() return ListHandle<Alert>', async () => {
    type Endpoints = { '/api/alerts': Alert[] };
    const server = await mockr<Endpoints>({
      endpoints: [{ url: '/api/alerts', dataFile: file<Alert[]>('./alerts.json') }],
    });

    const handle = server.endpoint('/api/alerts');
    expectTypeOf<typeof handle>().toExtend<ListHandle<Alert>>();
    expectTypeOf(handle.findById(1)).toEqualTypeOf<Alert | undefined>();
    expectTypeOf(handle.data).toEqualTypeOf<Alert[]>();

    await server.close();
  });

  it('using file<Config>() in dataFile makes server.endpoint() return RecordHandle<Config>', async () => {
    type Endpoints = { '/api/config': Config };
    const server = await mockr<Endpoints>({
      endpoints: [{ url: '/api/config', dataFile: file<Config>('./config.json') }],
    });

    const handle = server.endpoint('/api/config');
    expectTypeOf<typeof handle>().toExtend<RecordHandle<Config>>();
    expectTypeOf(handle.data).toEqualTypeOf<Config>();

    await server.close();
  });

  it('plain string dataFile still works (untyped fallback)', async () => {
    const server = await mockr({
      endpoints: [{ url: '/api/anything', dataFile: './anything.json' }],
    });

    // Untyped — handle still callable through AnyEndpointHandle.
    const handle = server.endpoint('/api/anything');
    handle;

    await server.close();
  });

  it('rejects mismatched FileRef shape at the call site', () => {
    // Negative case: file<Alert[]>() is not assignable where FileRef<{ x: 1 }> is expected.
    // @ts-expect-error Alert[] is not assignable to { x: 1 }
    const ref: FileRef<{ x: 1 }> = file<Alert[]>('./x.json');
    ref;
  });
});
