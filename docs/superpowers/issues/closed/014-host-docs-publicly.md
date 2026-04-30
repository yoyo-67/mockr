# 014 — Host docs publicly on a free static host

**Type:** HITL
**Discovered during:** controller request after issue 010

## What to build

Pick a free static-hosting target and publish the contents of `docs/superpowers/` (specs, plans, issues) plus the README and API reference to a public URL. Junior devs adopting mockr should be able to link to a single hosted page rather than cloning the repo to read context.

## Free options to evaluate

| Option | Free tier | Custom domain | Build pipeline | Best for |
|---|---|---|---|---|
| **GitHub Pages** | unlimited public repos | yes | actions or `/docs` folder | minimal Markdown sites; native to repo; zero extra account |
| **Vercel** | hobby plan, 100GB bandwidth/mo | yes | git push deploys | rich SSR/Next.js; overkill for static MD |
| **Netlify** | 100GB/mo, 300 build min | yes | git push deploys | static sites with redirects/forms |
| **Cloudflare Pages** | unlimited bandwidth | yes | git push deploys | best free tier; fastest CDN; zero cold start |
| **Read the Docs** | unlimited public | yes | sphinx/mkdocs | technical docs with versioning + search |
| **MkDocs + GH Pages** | as GH Pages | yes | mkdocs build | nice Material theme, search, navigation |
| **Docusaurus + GH Pages** | as GH Pages | yes | yarn build | versioned docs, blog, react components |
| **VitePress + GH Pages** | as GH Pages | yes | npm build | fast, minimal, vue-flavored |

**Recommendation: GitHub Pages with VitePress or MkDocs Material.** Both are free, fast, integrate with the existing repo, render Markdown nicely, give search out of the box, and require zero extra accounts.

## Acceptance criteria

- [ ] Pick a static-site generator (VitePress / MkDocs Material / Docusaurus / plain GH Pages).
- [ ] Configure it to render `README.md`, the spec, the plan, and every file under `docs/superpowers/issues/{open,done,closed}/` as a navigable site.
- [ ] Add a GitHub Actions workflow that builds + publishes on every push to `main` (or `experiments` while pre-1.0).
- [ ] Public URL works and is added to the project README ("Docs: https://...").
- [ ] Site search works (most generators bundle this).
- [ ] Live URL surfaces:
  - landing → README
  - "Spec" → `docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`
  - "Plan" → `docs/superpowers/plans/2026-04-30-mock-writing-api-redesign.md`
  - "Issues" → folder index (open / done / closed)
- [ ] Cost: $0/mo, no payment method required, no per-month free quota that will surprise the user.

## Open question (for the human)

- Which generator? Default recommendation: **VitePress + GitHub Pages** — minimal config, fast build, modern look, plays well with monorepos.
- Custom domain or `*.github.io` subdomain? `*.github.io` is fine for v0.3.0; custom can land later.
- Branch deploy (preview per PR) or just main? Main is enough until external contributors arrive.

## Blocked by

None. Can ship in parallel with code slices, but probably best deferred until 012 (README rewrite) is done so the hosted README is the final shape.

## Notes

- HITL because design choices (theme, nav structure, custom domain) need a human eye.
- All listed options are free for public-repo usage at the scale mockr will hit; no service has a hidden quota that would break a small OSS project.
- If GitHub-Pages-only is acceptable: enabling `Settings → Pages → Source: docs/` on a public repo gets you a working site with zero extra tooling — useful as a stopgap.
