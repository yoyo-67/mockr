/**
 * Renders the `/__mockr/swagger` page: a pure-HTML shell that loads Swagger UI
 * from a CDN and points it at the live `/__mockr/openapi.json` export. The page
 * holds no spec of its own — Swagger UI fetches the openapi doc at view time, so
 * the docs always reflect the served surface. CDN-hosted (no bundled
 * dependency); needs internet reachability when opened. See CONTEXT.md.
 */

/** Floating-latest swagger-ui-dist on jsDelivr (see CONTEXT.md — version pin). */
const CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@latest';

export function renderSwaggerPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mockr — Swagger UI</title>
<link rel="stylesheet" href="${CDN}/swagger-ui.css">
<style>
  body { margin: 0; background: #fafafa; }
</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="${CDN}/swagger-ui-bundle.js" crossorigin></script>
<script>
  window.ui = SwaggerUIBundle({
    url: '/__mockr/openapi.json',
    dom_id: '#swagger-ui',
  });
</script>
</body>
</html>
`;
}
