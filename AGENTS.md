# EmailTasker Website — Agent Context

Static bilingual product microsite and public macOS release home for EmailTasker, deployed with
GitHub Pages at `emailtasker.azzuwayed.com`.

## Boundaries

**Always**

- Work on `main`.
- Keep the English root and RTL Arabic `/ar/` page equivalent.
- Treat this repository as part of every EmailTasker production deployment. Before publication,
  align both product pages and public release metadata with the customer-visible features that
  actually shipped.
- Run `pnpm check` before requesting a commit.
- Send pricing, membership, account, support, and privacy to the localized `azzuwayed.com` routes.
- Keep public download discovery on both the microsite and the localized Hub product page. Resolve
  the direct installer from `updates.json`; the native app remains the Pro access boundary.
- Write copy in plain, benefit-first language. Never introduce technical or security jargon
  (encrypted, cache, boundary, extraction, sensitive, documented, local-first) or defensive
  privacy/security caveats into visible marketing copy — that detail lives on the
  `azzuwayed.com/privacy` page linked from the footer. This site's only job is to attract, not
  reassure.
- Keep `CHANGELOG.md` and the release notes inside `updates.json` short and marketing-only: name the
  customer benefit in plain language and omit implementation details, internal architecture,
  security controls, engineering terminology, and development-only work. Prepare the source release
  notes to this standard before EmailTasker's release workflow generates these files.

**Ask first**

- Adding dependencies, analytics, forms, storage, network destinations, or deployment systems.
- Publishing a release or changing the custom domain.

**Never**

- Add pricing, checkout, account, support, or privacy UI to this site.
- Put secrets, private source, or unsigned release artifacts in this repository.
- Hand-edit `updates.json`; EmailTasker's local release workflow owns it.

## Layout

| Path                        | Role                                                  |
| --------------------------- | ----------------------------------------------------- |
| `index.html`, `ar/`         | English and Arabic product pages                      |
| `download.js`               | Validated latest-DMG link hydration                   |
| `assets/`                   | Public icon plus revisioned manifest-owned media      |
| `scripts/check-site.mjs`    | Static contract checks                                |
| `CHANGELOG.md`              | Plain customer-facing release notes                   |
| `updates.json`              | Generated signed-updater manifest after first release |
| `product.json`              | Exact app-owned marketing revision                    |
| `scripts/sync-product.mjs`  | Manifest-to-microsite renderer and parity gate        |
| `scripts/product-model.mjs` | One owner of the manifest-to-page directives          |

## Commands

```bash
pnpm install
pnpm sync:product
pnpm check
pnpm format:release
```

`pnpm format:release` formats everything the release checkpoint regenerates — the updater manifest,
public changelog, product manifest, and both product pages — before the checkpoint gate. `pnpm
sync:product` rewrites the pages unformatted, so anything it touches must be listed here or the gate
fails on style alone.

## Key invariants

- GitHub Releases contain the public signed artifacts; both the microsite and Hub product page link
  to the latest signed DMG.
- The Hub catalog is the advertised membership surface, while download discovery is public.
- `updates.json` is public update infrastructure, not an authorization boundary.
- Visible product copy and `product.json` are generated from the source repo's bilingual manifest;
  edit the manifest, then sync this repo.
- Keep the outer `product.json` envelope at schema 1. Its embedded manifest accepts schemas 1–3;
  schema 3 owns localized public names, SEO fields, social cards, and the optional App Store link.
- `assets/product/<content-revision>/` is script-owned. Page media and social metadata must resolve
  through that immutable revision path. A revision directory is immutable but not cumulative: only
  the current publication is reachable from a page, so `sync:product` deletes every other one. Never
  hand-add a file there.
- `scripts/product-model.mjs` owns the manifest-to-page directives. `sync:product` writes a page from
  them and `check:site` verifies the page against the same ones, so a field added to one is added to
  both. The check compares parsed values, not bytes, because `sync:product` writes unformatted and
  `format:release` rewraps.
- Render the localized App Store CTA only when `links.appStore` exists. **The Ready-for-Sale rule
  binds the push, not the commit**: the link may sit in a committed manifest while the iOS version is
  still in review, because nothing reaches the live site until this repository is pushed. Do not push
  a publication carrying `links.appStore` until the iOS version is Ready for Sale, and confirm the
  link resolves as part of that deployment.

## Source-of-truth docs

- Website and release ownership: `README.md`
- Public release notes: `CHANGELOG.md`
- EmailTasker product/security truth:
  `../emailtasker/docs/product/direction.md` and `../emailtasker/docs/reference/security.md`
