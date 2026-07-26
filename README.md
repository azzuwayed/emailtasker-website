# EmailTasker Website

Public product microsite and release repository for EmailTasker.

- Product site: [emailtasker.azzuwayed.com](https://emailtasker.azzuwayed.com)
- Membership and access:
  [azzuwayed.com/en/products/emailtasker](https://azzuwayed.com/en/products/emailtasker)
- Arabic:
  [azzuwayed.com/ar/products/emailtasker](https://azzuwayed.com/ar/products/emailtasker)

The static site describes the product. Pricing, membership, accounts, support, privacy, and download
discovery live on azzuwayed.com. Public GitHub Releases hold the signed macOS installer and updater
artifacts; EmailTasker still requires membership activation.

## Development

```bash
pnpm install
pnpm check
```

GitHub Pages serves `main` with the custom domain in `CNAME`. EmailTasker's local release workflow
generates `updates.json`, mirrors the released changelog section, and publishes the GitHub Release.
