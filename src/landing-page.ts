import type { InternalEndpoint } from './control-routes.js';

/**
 * Renders the `/__mockr/` landing page: a bare-minimum pure-HTML index linking
 * the internal control APIs and every registered mock route. GET routes are
 * clickable; other verbs are listed (can't be followed from an anchor).
 */

interface RouteRow {
  url: string;
  verbs: string[];
  kind: 'data' | 'handler' | 'static' | 'ws';
  enabled: boolean;
}

const CONTROL_APIS: Array<{ path: string; desc: string }> = [
  { path: '/__mockr/openapi.json', desc: 'OpenAPI 3.1 export (import into Postman/Insomnia/Bruno)' },
  { path: '/__mockr/swagger', desc: 'Swagger UI — interactive API docs for the served surface' },
  { path: '/__mockr/endpoints', desc: 'Registered endpoints as JSON' },
  { path: '/__mockr/target', desc: 'Current proxy target' },
  { path: '/__mockr/sessions', desc: 'Recorded sessions' },
  { path: '/__mockr/mem-sessions', desc: 'In-memory replay sessions' },
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function routeRows(endpoints: InternalEndpoint[]): RouteRow[] {
  const rows: RouteRow[] = [];
  for (const ep of endpoints) {
    const url = typeof ep.url === 'string' ? ep.url : ep.url.source;
    if (url.startsWith('/__mockr')) continue;
    let verbs: string[];
    let kind: RouteRow['kind'];
    if (ep.wsRuntime) { verbs = ['WS']; kind = 'ws'; }
    else if (ep.methods) { verbs = Object.keys(ep.methods).map((v) => v.toUpperCase()); kind = 'handler'; }
    else if (ep.isData) { verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']; kind = 'data'; }
    else if (ep.isHandler && ep.method) { verbs = [ep.method.toUpperCase()]; kind = 'handler'; }
    else { verbs = [(ep.method || 'GET').toUpperCase()]; kind = 'static'; }
    rows.push({ url, verbs, kind, enabled: !ep.disabled });
  }
  return rows;
}

/**
 * A followable href: `:param` filled with the param name as a sample value
 * (path-to-regexp matches any segment) and `*` wildcards with `_`. The link
 * text still shows the original pattern. Non-GET routes are linked too — a
 * click does a GET, but the href is handy to copy / open in the browser.
 */
function hrefFor(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '$1').replace(/\*+/g, '_');
}

function renderRouteRow(row: RouteRow): string {
  const verbs = row.verbs.map((v) => `<span class="verb">${esc(v)}</span>`).join(' ');
  const title = row.verbs.includes('GET') ? '' : ` title="${esc(row.verbs.join(', '))} — link opens as GET"`;
  const url = `<a href="${esc(hrefFor(row.url))}"${title}>${esc(row.url)}</a>`;
  const off = row.enabled ? '' : ' <span class="off">(disabled)</span>';
  return `<li>${verbs} ${url}<span class="kind">${row.kind}</span>${off}</li>`;
}

export function renderLandingPage(endpoints: InternalEndpoint[]): string {
  const rows = routeRows(endpoints);
  const controlList = CONTROL_APIS.map(
    (a) => `<li><a href="${esc(a.path)}">${esc(a.path)}</a> <span class="desc">${esc(a.desc)}</span></li>`,
  ).join('\n');
  const routeList = rows.length
    ? rows.map(renderRouteRow).join('\n')
    : '<li class="desc">No mock routes registered — every request is proxied.</li>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>mockr</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { margin: 0 0 .25rem; }
  h2 { margin: 2rem 0 .5rem; font-size: 1rem; border-bottom: 1px solid #ddd; padding-bottom: .25rem; }
  ul { list-style: none; padding: 0; }
  li { padding: .25rem 0; }
  a { color: #0357; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #f4f4f4; padding: .05rem .35rem; border-radius: 3px; }
  .verb { display: inline-block; min-width: 3.5rem; font: 11px monospace; color: #fff; background: #567; padding: .05rem .3rem; border-radius: 3px; text-align: center; }
  .kind { color: #999; font-size: 11px; margin-left: .5rem; }
  .desc { color: #777; }
  .off { color: #b00; }
</style>
</head>
<body>
<h1>mockr</h1>
<p class="desc">Local mock server. Unmocked requests are proxied upstream.</p>

<h2>Internal APIs</h2>
<ul>
${controlList}
</ul>

<h2>Mocked routes (${rows.length})</h2>
<ul>
${routeList}
</ul>
</body>
</html>
`;
}
