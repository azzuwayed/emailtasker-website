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

GitHub Pages serves `main` with the custom domain in `CNAME`. EmailTasker's local release workflow
generates `updates.json`, publishes the plain customer-facing release notes, and stages the GitHub
Release. `pnpm sync:product` renders the marked English and Arabic copy from
`../emailtasker/product/manifest.json` and writes `product.json` with the exact content revision.
The outer `product.json` publication envelope remains schema 1 and embeds manifest schemas 1–3.
Manifest v3 supplies each locale's public name and SEO copy, social card, and optional App Store
link. Product media is copied into `assets/product/<content-revision>/` so every publication uses
immutable URLs, and the sync deletes the revision directories no page still points at.
The release stays drafted until this microsite and the Hub expose that revision. Every production
deployment keeps both product pages aligned with the features customers can use.
