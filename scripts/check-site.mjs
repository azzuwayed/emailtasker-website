import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  contentRevisionInput,
  imageDimensions,
  localePages,
  mediaPaths,
  mimeType,
  pageDirectives,
  publishedMediaPath,
  validateManifest,
  verifyPage,
} from "./product-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const htmlFiles = Object.values(localePages).map((config) =>
  path.join(root, config.page),
);

function relative(file) {
  return path.relative(root, file);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

/** Runs a unit of the shared model, turning its throw into one failure line. */
function collect(label, run) {
  try {
    return run();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    return undefined;
  }
}

/** Reads the published bytes each revisioned path must resolve to. */
function productMedia(product) {
  const paths = collect("product.json", () => mediaPaths(product.manifest));
  const media = [];
  for (const sourcePath of paths ?? []) {
    const relativePath = publishedMediaPath(
      product.contentRevision,
      sourcePath,
    );
    const file = path.join(root, relativePath);
    if (!fs.existsSync(file)) {
      failures.push(`missing revisioned product media ${relativePath}`);
      continue;
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length === 0) {
      failures.push(`empty revisioned product media ${relativePath}`);
      continue;
    }
    const shape = collect(`product.json: ${sourcePath}`, () => ({
      mimeType: mimeType(sourcePath),
      ...imageDimensions(bytes, sourcePath),
    }));
    if (!shape) continue;
    media.push({
      path: sourcePath,
      relativePath,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...shape,
    });
  }
  return media;
}

async function resolvedDownloadHref(script, manifest) {
  const fallback =
    "https://github.com/azzuwayed/emailtasker-website/releases/latest";
  const link = {
    dataset: { manifestUrl: "updates.json" },
    href: fallback,
  };
  new vm.Script(script, { filename: "download.js" }).runInNewContext({
    document: {
      querySelectorAll: () => [link],
    },
    fetch: async () => ({
      ok: true,
      json: async () => manifest,
    }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  return link.href;
}

function localTarget(file, value) {
  if (/^(?:https?:|mailto:|#|data:)/.test(value)) return;
  const localValue = value.split("#")[0].split("?")[0];
  if (!localValue) return;
  const target = path.resolve(path.dirname(file), localValue);
  const resolved = localValue.endsWith("/")
    ? path.join(target, "index.html")
    : target;
  if (!fs.existsSync(resolved)) {
    failures.push(`${relative(file)}: missing local target ${value}`);
  }
}

let product;
try {
  product = JSON.parse(read(path.join(root, "product.json")));
  if (
    product.schemaVersion !== 1 ||
    product.productId !== "emailtasker" ||
    !/^[a-f0-9]{64}$/.test(product.contentRevision) ||
    product.manifest?.productId !== product.productId
  ) {
    failures.push("product.json: invalid publication envelope");
  }
} catch (error) {
  failures.push(`product.json: invalid JSON: ${error.message}`);
}

const media = product?.manifest ? productMedia(product) : [];
if (product?.manifest && media.length > 0) {
  const revision = createHash("sha256")
    .update(contentRevisionInput(product.manifest, media))
    .digest("hex");
  if (revision !== product.contentRevision) {
    failures.push(
      "product.json: revision does not match the manifest and published media",
    );
  }
}

if (product?.manifest) {
  for (const problem of collect("product.json", () =>
    validateManifest(product.manifest, media),
  ) ?? []) {
    failures.push(`product.json: ${problem}`);
  }
}

for (const file of htmlFiles) {
  if (!fs.existsSync(file)) {
    failures.push(`missing page ${relative(file)}`);
    continue;
  }

  const html = read(file);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    localTarget(file, match[1]);
  }

  for (const match of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      failures.push(`${relative(file)}: invalid JSON-LD: ${error.message}`);
    }
  }

  const inlineScripts = [
    ...html.matchAll(
      /<script(?![^>]+type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const match of inlineScripts) {
    try {
      new vm.Script(match[1], { filename: relative(file) });
    } catch (error) {
      failures.push(
        `${relative(file)}: inline script does not parse: ${error.message}`,
      );
    }
  }

  for (const forbidden of [
    /href="[^"]*updates\.json/i,
    /href="[^"]*\/pricing/i,
    /\$\s*\d/,
    /\bpricing\b/i,
    /الأسعار/,
  ]) {
    if (forbidden.test(html)) {
      failures.push(
        `${relative(file)}: contains pricing or a direct release download link`,
      );
    }
  }
}

if (product?.manifest) {
  for (const [locale, config] of Object.entries(localePages)) {
    const problems = collect(config.page, () =>
      verifyPage(
        read(path.join(root, config.page)),
        pageDirectives(product, media, locale),
      ),
    );
    failures.push(...(problems ?? []));
  }
}

const english = read(htmlFiles[0]);
const arabic = read(htmlFiles[1]);
for (const expected of [
  "Download for macOS",
  "data-emailtasker-download",
  'data-manifest-url="updates.json"',
  'src="download.js"',
  "https://github.com/azzuwayed/emailtasker-website/releases/latest",
  "https://azzuwayed.com/en/products/emailtasker",
  "https://azzuwayed.com/en/account/billing/membership",
  "https://azzuwayed.com/en/privacy",
  "https://azzuwayed.com/en/contact",
  "https://azzuwayed.com/en/account",
]) {
  if (!english.includes(expected))
    failures.push(`index.html: missing ${expected}`);
}
for (const expected of [
  'lang="ar" dir="rtl"',
  "تحميل لنظام macOS",
  "data-emailtasker-download",
  'data-manifest-url="../updates.json"',
  'src="../download.js"',
  "https://github.com/azzuwayed/emailtasker-website/releases/latest",
  "https://azzuwayed.com/ar/products/emailtasker",
  "https://azzuwayed.com/ar/account/billing/membership",
  "https://azzuwayed.com/ar/privacy",
  "https://azzuwayed.com/ar/contact",
  "https://azzuwayed.com/ar/account",
]) {
  if (!arabic.includes(expected))
    failures.push(`ar/index.html: missing ${expected}`);
}

for (const expected of [
  ["CNAME", "emailtasker.azzuwayed.com"],
  ["robots.txt", "https://emailtasker.azzuwayed.com/sitemap.xml"],
  ["sitemap.xml", "https://emailtasker.azzuwayed.com/ar/"],
]) {
  const [file, content] = expected;
  if (!read(path.join(root, file)).includes(content)) {
    failures.push(`${file}: missing ${content}`);
  }
}

const manifestPath = path.join(root, "updates.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(read(manifestPath));
    for (const platform of ["darwin-aarch64", "darwin-x86_64"]) {
      const entry = manifest.platforms?.[platform];
      if (!entry?.signature || !entry?.url || !entry?.dmg?.url) {
        failures.push(`updates.json: incomplete ${platform} entry`);
      } else if (
        !entry.dmg.url.startsWith(
          "https://github.com/azzuwayed/emailtasker-website/releases/download/",
        ) ||
        !entry.dmg.url.endsWith(".dmg")
      ) {
        failures.push(`updates.json: invalid ${platform} DMG URL`);
      }
    }

    const downloadScriptPath = path.join(root, "download.js");
    if (!fs.existsSync(downloadScriptPath)) {
      failures.push("missing download.js");
    } else {
      const script = read(downloadScriptPath);
      const expectedDmg = manifest.platforms?.["darwin-aarch64"]?.dmg?.url;
      if ((await resolvedDownloadHref(script, manifest)) !== expectedDmg) {
        failures.push("download.js: did not resolve the approved manifest DMG");
      }
      const rejectedHref = await resolvedDownloadHref(script, {
        platforms: {
          "darwin-aarch64": {
            dmg: { url: "https://example.test/EmailTasker.dmg" },
          },
        },
      });
      if (
        rejectedHref !==
        "https://github.com/azzuwayed/emailtasker-website/releases/latest"
      ) {
        failures.push(
          "download.js: did not retain the fallback for an unapproved URL",
        );
      }
    }
  } catch (error) {
    failures.push(`updates.json: invalid JSON: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "site check passed: EN/AR pages, manifest-derived SEO and media, public downloads, localized Hub handoffs, and updater host",
);
