import { describe, it, expect } from 'vitest';
import { endpoints } from '../src/endpoints-helper.js';
import type { EndpointDef } from '../src/types.js';

describe('endpoints<T>() helper', () => {
  it('returns the same array reference for an empty array', () => {
    const input: ReadonlyArray<EndpointDef<{}>> = [];
    const result = endpoints<{}>(input);
    expect(result).toBe(input);
  });

  it('returns the same array reference for a non-empty array (identity)', () => {
    interface Item {
      id: number;
      name: string;
    }
    type Endpoints = { '/api/items': Item[] };

    const def1: EndpointDef<Endpoints> = {
      url: '/api/items',
      data: [{ id: 1, name: 'one' }] as Item[],
    };
    const def2: EndpointDef<Endpoints> = {
      url: '/api/items',
      method: 'GET',
      handler: () => ({ status: 200, body: {} }),
    };

    const input: ReadonlyArray<EndpointDef<Endpoints>> = [def1, def2];
    const result = endpoints<Endpoints>(input);
    expect(result).toBe(input);
    expect(result[0]).toBe(def1);
    expect(result[1]).toBe(def2);
  });
});
