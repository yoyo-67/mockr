import { readFile, writeFile } from 'node:fs/promises';
import { urlToTypeName } from './type-generator.js';

/**
 * Adds a bodyFile endpoint entry to the server file, along with
 * the generated type import and Endpoints type entry.
 */
export async function addEndpointToServerFile(
  serverFile: string,
  entry: { url: string; method: string; bodyFile: string },
): Promise<void> {
  let src = await readFile(serverFile, 'utf-8');

  // Skip if this URL is already in the server file
  if (src.includes(`'${entry.url}'`) || src.includes(`"${entry.url}"`)) return;

  const typeName = urlToTypeName(entry.url);

  // 1. Add import for the generated type
  if (entry.bodyFile.endsWith('.json')) {
    const typeImportPath = entry.bodyFile.replace('.json', '.js');
    const importLine = `import type { ${typeName} } from '${typeImportPath}'`;
    if (!src.includes(typeName)) {
      const lastImportIdx = src.lastIndexOf('\nimport ');
      if (lastImportIdx !== -1) {
        const lineEnd = src.indexOf('\n', lastImportIdx + 1);
        src = src.slice(0, lineEnd + 1) + importLine + '\n' + src.slice(lineEnd + 1);
      }
    }
  }

  // 2. Add to Endpoints type (if it exists)
  const endpointsTypeMatch = src.match(/type\s+Endpoints\s*=\s*\{/);
  if (endpointsTypeMatch && endpointsTypeMatch.index !== undefined) {
    const typeStart = endpointsTypeMatch.index + endpointsTypeMatch[0].length;
    let depth = 1;
    let typeEnd = typeStart;
    for (let i = typeStart; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      if (src[i] === '}') depth--;
      if (depth === 0) typeEnd = i;
    }
    const newTypeLine = `  '${entry.url}': ${typeName}`;
    src = src.slice(0, typeEnd) + newTypeLine + '\n' + src.slice(typeEnd);
  }

  // 3. Add bodyFile entry to endpoints array
  const methodPart = entry.method !== 'GET' ? ` method: '${entry.method}',` : '';
  const newLine = `    { url: '${entry.url}',${methodPart} bodyFile: '${entry.bodyFile}' },`;

  const endpointsMatch = src.match(/endpoints:\s*\[/);
  if (endpointsMatch && endpointsMatch.index !== undefined) {
    const startIdx = endpointsMatch.index + endpointsMatch[0].length;
    let depth = 1;
    let insertIdx = startIdx;
    for (let i = startIdx; i < src.length && depth > 0; i++) {
      if (src[i] === '[') depth++;
      if (src[i] === ']') depth--;
      if (depth === 0) insertIdx = i;
    }
    src = src.slice(0, insertIdx) + newLine + '\n  ' + src.slice(insertIdx);
  }

  await writeFile(serverFile, src, 'utf-8');
}

/**
 * Removes an endpoint entry from the server file by URL.
 */
export async function removeEndpointFromServerFile(serverFile: string, url: string): Promise<void> {
  let src = await readFile(serverFile, 'utf-8');
  const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  src = src.replace(new RegExp(`\\s*\\{[^}]*url:\\s*['"]${urlEscaped}['"][^}]*\\},?\\n?`), '\n');
  await writeFile(serverFile, src, 'utf-8');
}

/**
 * Replaces a URL string in the server file.
 */
export async function updateUrlInServerFile(serverFile: string, oldUrl: string, newUrl: string): Promise<void> {
  let src = await readFile(serverFile, 'utf-8');
  src = src.replace(
    new RegExp(`(['"])${oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`),
    `'${newUrl}'`,
  );
  await writeFile(serverFile, src, 'utf-8');
}

/**
 * Changes bodyFile to handler in the server file for a given URL.
 */
export async function changeToHandlerInServerFile(serverFile: string, url: string): Promise<void> {
  let src = await readFile(serverFile, 'utf-8');
  const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodyFileRegex = new RegExp(
    `(\\{[^}]*url:\\s*['"]${urlEscaped}['"][^}]*)bodyFile:\\s*['"][^'"]+['"]`,
  );
  src = src.replace(bodyFileRegex, `$1handler: (req) => ({ body: {} })`);
  await writeFile(serverFile, src, 'utf-8');
}
