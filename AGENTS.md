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
- Send pricing, membership, account, support, privacy, and download discovery to the localized
  `azzuwayed.com` routes.
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

- Add pricing, checkout, account, support, privacy, or direct-download UI to this site.
- Put secrets, private source, or unsigned release artifacts in this repository.
- Hand-edit `updates.json`; EmailTasker's local release workflow owns it.

## Layout

| Path                     | Role                                                  |
| ------------------------ | ----------------------------------------------------- |
| `index.html`, `ar/`      | English and Arabic product pages                      |
| `assets/`                | Public icon and Abdullah-approved product screenshots |
| `scripts/check-site.mjs` | Static contract checks                                |
| `CHANGELOG.md`           | Plain customer-facing release notes                   |
| `updates.json`           | Generated signed-updater manifest after first release |

## Commands

```bash
pnpm install
pnpm check
```

## Key invariants

- GitHub Releases contain the public signed artifacts; the microsite never links directly to them.
- The Hub catalog is the advertised membership and download surface.
- `updates.json` is public update infrastructure, not an authorization boundary.

## Source-of-truth docs

- Website and release ownership: `README.md`
- Public release notes: `CHANGELOG.md`
- EmailTasker product/security truth:
  `../emailtasker/docs/product/direction.md` and `../emailtasker/docs/reference/security.md`
