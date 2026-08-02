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
  "site check passed: EN/AR pages, public downloads, localized Hub handoffs, product screenshots, metadata, and updater host",
);
