import { Project, SyntaxKind, type SourceFile, type TypeLiteralNode, type ArrayLiteralExpression } from 'ts-morph';
import { relative, dirname } from 'node:path';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'node:fs/promises';

const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });

async function formatFile(filePath: string): Promise<void> {
  try {
    // Use prettier's programmatic API (no process spawn, instant)
    const prettier = await import('prettier');
    const source = await readFileAsync(filePath, 'utf-8');
    const options = await prettier.resolveConfig(filePath) ?? {};
    const formatted = await prettier.format(source, { ...options, filepath: filePath });
    await writeFileAsync(filePath, formatted, 'utf-8');
  } catch {
    // Prettier not available — skip silently
  }
}

function getSourceFile(filePath: string): SourceFile {
  const existing = project.getSourceFile(filePath);
  if (existing) {
    existing.refreshFromFileSystemSync();
    return existing;
  }
  return project.addSourceFileAtPath(filePath);
}

function findEndpointsArray(src: SourceFile): ArrayLiteralExpression | undefined {
  const props = src.getDescendantsOfKind(SyntaxKind.PropertyAssignment);
  for (const prop of props) {
    if (prop.getName() === 'endpoints') {
      const init = prop.getInitializer();
      if (init?.isKind(SyntaxKind.ArrayLiteralExpression)) return init;
    }
  }
  return undefined;
}

function findEndpointsType(src: SourceFile): TypeLiteralNode | undefined {
  for (const alias of src.getTypeAliases()) {
    if (alias.getName() === 'Endpoints') {
      const typeNode = alias.getTypeNode();
      if (typeNode?.isKind(SyntaxKind.TypeLiteral)) return typeNode;
    }
  }
  return undefined;
}

function urlToTypeName(pathname: string): string {
  return pathname
    .replace(/^\//, '')
    .replace(/\/+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s/g, '');
}

/**
 * Computes the relative import path from the server file to the types file.
 * e.g. serverFile = "src/server.ts", typesFile = "mocks/api-v1-projects.d.ts"
 * → "../mocks/api-v1-projects.js"
 */
function computeTypeImportPath(serverFile: string, typesAbsPath: string): string {
  const rel = relative(dirname(serverFile), typesAbsPath);
  // Replace .d.ts with .js for TypeScript module resolution
  const importPath = rel.replace(/\.d\.ts$/, '.js');
  return importPath.startsWith('.') ? importPath : './' + importPath;
}

/**
 * Adds a bodyFile endpoint to the server file with type import and Endpoints type entry.
 */
export async function addEndpointToServerFile(
  serverFile: string,
  entry: { url: string; method: string; filePath: string; typesFile?: string },
): Promise<void> {
  const src = getSourceFile(serverFile);

  // Skip if URL already exists
  const fullText = src.getFullText();
  if (fullText.includes(`'${entry.url}'`) || fullText.includes(`"${entry.url}"`)) return;

  // 1. Add type import and Endpoints type entry if typesFile is provided
  if (entry.typesFile) {
    const typeName = urlToTypeName(entry.url);
    const importPath = computeTypeImportPath(serverFile, entry.typesFile);

    if (!fullText.includes(typeName)) {
      src.addImportDeclaration({
        namedImports: [typeName],
        moduleSpecifier: importPath,
        isTypeOnly: true,
      });
    }

    const endpointsType = findEndpointsType(src);
    if (endpointsType) {
      endpointsType.addProperty({
        name: `'${entry.url}'`,
        type: typeName,
      });
    }
  }

  // 2. Add dataFile entry to endpoints array
  const endpointsArray = findEndpointsArray(src);
  if (endpointsArray) {
    endpointsArray.addElement(
      `{ url: '${entry.url}', dataFile: '${entry.filePath}' }`,
    );
  }

  await src.save();
  await formatFile(serverFile);
}

/**
 * Removes an endpoint entry from the server file by URL.
 */
export async function removeEndpointFromServerFile(serverFile: string, url: string): Promise<void> {
  const src = getSourceFile(serverFile);
  const typeName = urlToTypeName(url);

  // 1. Remove from endpoints array
  const endpointsArray = findEndpointsArray(src);
  if (endpointsArray) {
    for (const element of endpointsArray.getElements()) {
      const text = element.getText();
      if (text.includes(`'${url}'`) || text.includes(`"${url}"`)) {
        const idx = endpointsArray.getElements().indexOf(element);
        endpointsArray.removeElement(idx);
        break;
      }
    }
  }

  // 2. Remove from Endpoints type
  const endpointsType = findEndpointsType(src);
  if (endpointsType) {
    for (const prop of endpointsType.getProperties()) {
      if (prop.isKind(SyntaxKind.PropertySignature) && (prop.getName() === `'${url}'` || prop.getName() === `"${url}"`)) {
        prop.remove();
        break;
      }
    }
  }

  // 3. Remove the type import if no longer referenced
  if (typeName && !src.getFullText().includes(typeName)) {
    // Already removed by type property removal — check again after save
  }
  for (const imp of src.getImportDeclarations()) {
    const named = imp.getNamedImports();
    if (named.some(n => n.getName() === typeName)) {
      if (named.length === 1) imp.remove();
      else named.find(n => n.getName() === typeName)?.remove();
      break;
    }
  }

  await src.save();
  await formatFile(serverFile);
}

/**
 * Replaces a URL string in the server file.
 */
export async function updateUrlInServerFile(serverFile: string, oldUrl: string, newUrl: string): Promise<void> {
  const src = getSourceFile(serverFile);

  for (const s of src.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (s.getLiteralValue() === oldUrl) {
      s.setLiteralValue(newUrl);
    }
  }

  await src.save();
  await formatFile(serverFile);
}

/**
 * Changes bodyFile to handler in the server file for a given URL.
 */
export async function changeToHandlerInServerFile(serverFile: string, url: string): Promise<void> {
  const src = getSourceFile(serverFile);
  const endpointsArray = findEndpointsArray(src);
  if (!endpointsArray) return;

  for (const element of endpointsArray.getElements()) {
    if (!element.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

    const urlProp = element.getProperty('url');
    if (!urlProp?.isKind(SyntaxKind.PropertyAssignment)) continue;
    const urlValue = urlProp.getInitializer();
    if (!urlValue?.isKind(SyntaxKind.StringLiteral) || urlValue.getLiteralValue() !== url) continue;

    const dataFileProp = element.getProperty('dataFile');
    if (dataFileProp) dataFileProp.remove();

    if (!element.getProperty('handler')) {
      element.addPropertyAssignment({
        name: 'handler',
        initializer: '(req) => ({ body: {} })',
      });
    }
    break;
  }

  await src.save();
  await formatFile(serverFile);
}
