# EmailTasker Website

Public product microsite and release repository for EmailTasker.

- Product site: [emailtasker.azzuwayed.com](https://emailtasker.azzuwayed.com)
- Membership and access:
  [azzuwayed.com/en/products/emailtasker](https://azzuwayed.com/en/products/emailtasker)
- Arabic:
  [azzuwayed.com/ar/products/emailtasker](https://azzuwayed.com/ar/products/emailtasker)

The static site describes the product and links to the latest signed macOS installer. Pricing,
membership, accounts, support, and privacy live on azzuwayed.com, whose product page exposes the same
public download. Public GitHub Releases hold the installer and updater artifacts; EmailTasker still
requires membership activation after installation.

## Development

```bash
pnpm install
pnpm check
```

GitHub Pages serves `main` with the custom domain in `CNAME`. `updates.json` is frozen at 1.2.0 for
legacy sandboxed installs. EmailTasker's local release workflow generates the signed active
`updates-v2.json` feed and the schema-1 `downloads.json` installer pointer, publishes the plain
customer-facing release notes, and publishes then re-download-verifies the five-asset GitHub Release
before either pointer advances. The website promotion uses two commits: `downloads.json` and product
metadata first while the prior v2 bytes remain live, then `updates-v2.json` only after that state is
verified. `pnpm sync:product` renders the marked English and Arabic copy from
`../emailtasker/product/manifest.json` and writes `product.json` with the exact content revision.
The outer `product.json` publication envelope remains schema 1 and embeds manifest schemas 1–3.
Manifest v3 supplies each locale's public name and SEO copy, social card, and optional App Store
link. Product media is copied into `assets/product/<content-revision>/` so every publication uses
immutable URLs, and the sync deletes the revision directories no page still points at.
The embedded product manifest points both the Hub and microsite at `/downloads.json`, while retaining
the public latest-release fallback and GitHub download allowlist. Every production deployment keeps
both product pages aligned with the features customers can use.

## iOS authentication return host

The assets-only Cloudflare Worker in `infra/mobile-auth-worker` owns the dedicated
`emailtasker-auth.azzuwayed.com` Custom Domain. It serves only the exact Apple association document
and the production and development recovery pages:

- `/.well-known/apple-app-site-association`
- `/mobile-auth/callback/`
- `/mobile-auth/dev/callback/`

Unknown paths return 404. The callback pages immediately remove OAuth parameters, load no external
resources, and are not application sign-in endpoints. Their real edge headers are declared in the
Worker asset directory's `_headers` file, including `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and a CSP pinned to the fixed inline scripts and style. The
association document is served as `application/json` without a redirect.

The `routes[].custom_domain` entry in `wrangler.jsonc` is the DNS/TLS source of truth. A manual
deployment provisions the hostname and certificate through Cloudflare; do not duplicate that binding
as an unrelated dashboard-managed route.

```bash
pnpm auth-worker:deploy:dry
pnpm auth-worker:deploy # manual production deployment; never run from CI
```

`pnpm check` includes the dry-run. The GitHub Pages origin remains exclusively the product, updater,
and download host: its `CNAME`, release process, and published file tree do not include these auth
assets.
