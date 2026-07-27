import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const htmlFiles = [
  path.join(root, "index.html"),
  path.join(root, "ar", "index.html"),
];
const requiredScreenshots = [
  "assets/screenshots/cockpit-dark-mock.webp",
  "assets/screenshots/cockpit-focus.webp",
  "assets/screenshots/assistant.webp",
  "assets/screenshots/ai-memory-management.webp",
  "assets/screenshots/all-clear-mock.webp",
];

function relative(file) {
  return path.relative(root, file);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
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
    /github\.com\/azzuwayed\/emailtasker-website\/releases\/download/i,
    /href="[^"]*\.dmg/i,
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

const english = read(htmlFiles[0]);
const arabic = read(htmlFiles[1]);
for (const expected of [
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
  "https://azzuwayed.com/ar/products/emailtasker",
  "https://azzuwayed.com/ar/account/billing/membership",
  "https://azzuwayed.com/ar/privacy",
  "https://azzuwayed.com/ar/contact",
  "https://azzuwayed.com/ar/account",
]) {
  if (!arabic.includes(expected))
    failures.push(`ar/index.html: missing ${expected}`);
}

for (const screenshot of requiredScreenshots) {
  const file = path.join(root, screenshot);
  if (!fs.existsSync(file)) {
    failures.push(`missing Abdullah-approved product screenshot ${screenshot}`);
  } else if (fs.statSync(file).size === 0) {
    failures.push(`empty screenshot ${screenshot}`);
  }
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
      if (!entry?.signature || !entry?.url) {
        failures.push(`updates.json: incomplete ${platform} entry`);
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
  "site check passed: EN/AR pages, localized Hub handoffs, product screenshots, metadata, and updater host",
);
