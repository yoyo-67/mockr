/**
 * Generates TypeScript interface declarations from a JSON value.
 */

export function urlToTypeName(pathname: string): string {
  return pathname
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s/g, '');
}

export function urlToFileName(pathname: string): string {
  return pathname
    .replace(/^\//, '')
    .replace(/\/+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-');
}

/**
 * Generates a TypeScript interface/type from a JSON value.
 * For arrays, exports the ELEMENT type (not the array) — matches mockr's
 * Endpoints type convention where `EndpointHandle<T>` has `.data: T[]`.
 */
export function generateInterface(name: string, value: unknown): string {
  // For arrays, generate the element type with the given name
  if (Array.isArray(value) && value.length > 0) {
    if (value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
      const interfaces: string[] = [];
      const merged = mergeObjectShapes(value as Record<string, unknown>[]);
      emitInterface(name, merged, interfaces);
      return interfaces.join('\n\n') + '\n';
    }
  }

  const interfaces: string[] = [];
  const rootType = inferType(name, value, interfaces);

  if (interfaces.length === 0) {
    return `export type ${name} = ${rootType};\n`;
  }

  return interfaces.join('\n\n') + '\n';
}

function inferType(name: string, value: unknown, interfaces: string[]): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';

    // Check if all elements are the same primitive type
    const types = new Set(value.map((v) => typeof v));
    if (types.size === 1 && !types.has('object')) {
      return `${[...types][0]}[]`;
    }

    // For object arrays, merge all element shapes into one interface
    if (value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
      const itemName = name.endsWith('s') ? name.slice(0, -1) : `${name}Item`;
      const merged = mergeObjectShapes(value as Record<string, unknown>[]);
      emitInterface(itemName, merged, interfaces);
      return `${itemName}[]`;
    }

    // Mixed array
    const elementTypes = [...new Set(value.map((v) => inferType(name, v, [])))];
    return `(${elementTypes.join(' | ')})[]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [key, val] of Object.entries(obj)) {
      const fieldTypeName = name + capitalize(key);
      fields[key] = inferType(fieldTypeName, val, interfaces);
    }
    emitInterface(name, fields, interfaces);
    return name;
  }

  return 'unknown';
}

function mergeObjectShapes(objects: Record<string, unknown>[]): Record<string, string> {
  const allKeys = new Set<string>();
  for (const obj of objects) {
    for (const key of Object.keys(obj)) allKeys.add(key);
  }

  const fields: Record<string, string> = {};
  for (const key of allKeys) {
    const values = objects.filter((o) => key in o).map((o) => o[key]);
    const types = new Set<string>();
    for (const val of values) {
      types.add(inferPrimitiveType(val));
    }
    // If key is not present in all objects, it's optional (handled by ? below)
    const isOptional = objects.some((o) => !(key in o));
    const typeStr = [...types].join(' | ');
    fields[key] = isOptional ? `(${typeStr}) | undefined` : typeStr;
  }

  return fields;
}

function inferPrimitiveType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'unknown[]';
  if (typeof value === 'object') return 'Record<string, unknown>';
  return typeof value;
}

function emitInterface(
  name: string,
  fields: Record<string, string>,
  interfaces: string[],
): void {
  const lines = Object.entries(fields).map(([key, type]) => {
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
    return `  ${safeKey}: ${type};`;
  });
  interfaces.push(`export interface ${name} {\n${lines.join('\n')}\n}`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
