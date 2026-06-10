/**
 * The default-CRUD verb matrix for `data` endpoints — the single source of
 * truth shared by the request dispatcher (`server.ts` `handleListCrud` /
 * `handleRecordCrud` / `crudOnPartition`) and the OpenAPI generator
 * (`openapi-generator.ts`).
 *
 * IMPORTANT: if the dispatcher's served verbs change, change them HERE — never
 * re-type the matrix in the generator. `tests/crud-matrix.test.ts` asserts the
 * running server actually serves exactly this matrix, so drift fails CI.
 */

export type CrudVerb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CrudOp {
  verb: CrudVerb;
  /** `collection` = the endpoint URL itself; `item` = the `/{id}` sub-path. */
  scope: 'collection' | 'item';
  status: number;
}

/** List (`data: T[]`) default CRUD. */
export const LIST_CRUD: readonly CrudOp[] = [
  { verb: 'GET', scope: 'collection', status: 200 },
  { verb: 'POST', scope: 'collection', status: 201 },
  { verb: 'GET', scope: 'item', status: 200 },
  { verb: 'PUT', scope: 'item', status: 200 },
  { verb: 'PATCH', scope: 'item', status: 200 },
  { verb: 'DELETE', scope: 'item', status: 200 },
];

/** Record (`data: T` object) default CRUD — no item sub-path. */
export const RECORD_CRUD: readonly CrudOp[] = [
  { verb: 'GET', scope: 'collection', status: 200 },
  { verb: 'PATCH', scope: 'collection', status: 200 },
  { verb: 'PUT', scope: 'collection', status: 200 },
  { verb: 'DELETE', scope: 'collection', status: 200 },
];
