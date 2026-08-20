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
const authWorkerRoot = path.join(root, "infra/mobile-auth-worker");
const authAssetsRoot = path.join(authWorkerRoot, "public");
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

function walkFiles(directory, base = directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, absolute));
    }
  }
  return files.sort();
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

async function resolvedDownloadHref(script, downloads) {
  const fallback =
    "https://github.com/azzuwayed/emailtasker-website/releases/latest";
  const link = {
    dataset: { downloadsUrl: "downloads.json" },
    href: fallback,
  };
  new vm.Script(script, { filename: "download.js" }).runInNewContext({
    document: {
      querySelectorAll: () => [link],
    },
    fetch: async () => ({
      ok: true,
      json: async () => downloads,
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
  const download = product.manifest.links?.download;
  if (
    download?.manifestUrl !==
      "https://emailtasker.azzuwayed.com/downloads.json" ||
    download?.fallbackUrl !==
      "https://github.com/azzuwayed/emailtasker-website/releases/latest" ||
    !download?.allowedUrlPrefixes?.includes(
      "https://github.com/azzuwayed/emailtasker-website/releases/download/",
    )
  ) {
    failures.push(
      "product.json: download discovery, fallback, or URL allowlist is invalid",
    );
  }
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
  'data-downloads-url="downloads.json"',
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
  'data-downloads-url="../downloads.json"',
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

for (const legacyPath of [
  ".well-known/apple-app-site-association",
  "mobile-auth/callback/index.html",
  "mobile-auth/dev/callback/index.html",
]) {
  if (fs.existsSync(path.join(root, legacyPath))) {
    failures.push(
      `${legacyPath}: mobile auth assets must not ship from the GitHub Pages origin`,
    );
  }
}

const workerConfigPath = path.join(authWorkerRoot, "wrangler.jsonc");
const expectedWorkerFiles = [
  "public/.well-known/apple-app-site-association",
  "public/_headers",
  "public/mobile-auth/callback/index.html",
  "public/mobile-auth/dev/callback/index.html",
  "wrangler.jsonc",
];
if (
  !fs.existsSync(authWorkerRoot) ||
  JSON.stringify(walkFiles(authWorkerRoot)) !==
    JSON.stringify(expectedWorkerFiles)
) {
  failures.push(
    "infra/mobile-auth-worker: asset inventory must contain only the config, AASA, headers, and two callback pages",
  );
}
const expectedWorkerConfig = {
  $schema: "../../node_modules/wrangler/config-schema.json",
  name: "emailtasker-auth",
  compatibility_date: "2026-08-20",
  workers_dev: false,
  preview_urls: false,
  routes: [
    {
      pattern: "emailtasker-auth.azzuwayed.com",
      custom_domain: true,
    },
  ],
  observability: {
    enabled: false,
  },
  assets: {
    directory: "./public",
    html_handling: "auto-trailing-slash",
    not_found_handling: "none",
  },
};
if (!fs.existsSync(workerConfigPath)) {
  failures.push("missing infra/mobile-auth-worker/wrangler.jsonc");
} else {
  try {
    const workerConfig = JSON.parse(
      read(workerConfigPath).replace(/,\s*([}\]])/g, "$1"),
    );
    if (JSON.stringify(workerConfig) !== JSON.stringify(expectedWorkerConfig)) {
      failures.push(
        "infra/mobile-auth-worker/wrangler.jsonc: dedicated assets-only Custom Domain configuration is not exact",
      );
    }
  } catch (error) {
    failures.push(
      `infra/mobile-auth-worker/wrangler.jsonc: invalid JSON: ${error.message}`,
    );
  }
}

const associationRelativePath =
  "infra/mobile-auth-worker/public/.well-known/apple-app-site-association";
const associationPath = path.join(root, associationRelativePath);
const expectedAssociation = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "6HCZJT6JFZ.com.azzuwayed.emailtasker",
        paths: ["/mobile-auth/callback/"],
      },
      {
        appID: "6HCZJT6JFZ.com.azzuwayed.emailtasker.dev",
        paths: ["/mobile-auth/dev/callback/"],
      },
    ],
  },
};
if (!fs.existsSync(associationPath)) {
  failures.push(`missing ${associationRelativePath}`);
} else {
  try {
    const association = JSON.parse(read(associationPath));
    if (JSON.stringify(association) !== JSON.stringify(expectedAssociation)) {
      failures.push(
        `${associationRelativePath}: app identifiers and paths are not exact`,
      );
    }
  } catch (error) {
    failures.push(`${associationRelativePath}: invalid JSON: ${error.message}`);
  }
}

function checkMobileAuthFallback(relativePath, expectedPath, copy) {
  const workerRelativePath = path.join(
    "infra/mobile-auth-worker/public",
    relativePath,
  );
  const file = path.join(authAssetsRoot, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`missing ${workerRelativePath}`);
    return;
  }
  const html = read(file);
  const firstScript = html.match(
    /<head>\s*<meta charset="utf-8"\s*\/>\s*<script>([\s\S]*?)<\/script>/i,
  );
  if (!firstScript) {
    failures.push(
      `${workerRelativePath}: parameter scrub is not the first script`,
    );
  } else {
    let replaced;
    try {
      new vm.Script(firstScript[1], {
        filename: workerRelativePath,
      }).runInNewContext({
        window: {
          location: {
            search: "?code=secret",
            hash: "#state=secret",
            pathname: expectedPath,
          },
          history: {
            replaceState: (...args) => {
              replaced = args;
            },
          },
        },
      });
    } catch (error) {
      failures.push(
        `${workerRelativePath}: parameter scrub failed: ${error.message}`,
      );
    }
    if (
      !replaced ||
      replaced.length !== 3 ||
      replaced[0] !== null ||
      replaced[1] !== "" ||
      replaced[2] !== expectedPath
    ) {
      failures.push(
        `${workerRelativePath}: query and fragment are not replaced with the clean path`,
      );
    }
  }

  for (const expected of [
    '<meta name="robots" content="noindex,nofollow,noarchive" />',
    '<meta name="referrer" content="no-referrer" />',
    '<meta http-equiv="Cache-Control" content="no-store" />',
    'data-locale="en"',
    'data-locale="ar" lang="ar" dir="rtl"',
    ...copy,
  ]) {
    if (!html.includes(expected)) {
      failures.push(`${workerRelativePath}: missing ${expected}`);
    }
  }

  const englishSection = html.match(
    /<section data-locale="en">([\s\S]*?)<\/section>/i,
  )?.[1];
  const arabicSection = html.match(
    /<section data-locale="ar"[^>]*>([\s\S]*?)<\/section>/i,
  )?.[1];
  for (const tag of ["h1", "p"]) {
    const englishCount = englishSection?.match(
      new RegExp(`<${tag}>`, "g"),
    )?.length;
    const arabicCount = arabicSection?.match(
      new RegExp(`<${tag}>`, "g"),
    )?.length;
    if (
      englishCount !== arabicCount ||
      englishCount !== (tag === "h1" ? 1 : 2)
    ) {
      failures.push(
        `${workerRelativePath}: English and Arabic recovery structure is not equivalent`,
      );
    }
  }
  for (const forbidden of [
    /<(?:img|iframe|link|source|video|audio)\b/i,
    /<(?:script|form)\b[^>]*(?:src|action)\s*=/i,
    /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/,
    /https?:\/\//i,
  ]) {
    if (forbidden.test(html)) {
      failures.push(
        `${workerRelativePath}: callback page can make an external request`,
      );
    }
  }
}

checkMobileAuthFallback(
  "mobile-auth/callback/index.html",
  "/mobile-auth/callback/",
  [
    "Reopen EmailTasker to finish signing in.",
    "افتح EmailTasker من جديد لإكمال تسجيل الدخول.",
  ],
);
checkMobileAuthFallback(
  "mobile-auth/dev/callback/index.html",
  "/mobile-auth/dev/callback/",
  [
    "Reopen EmailTasker Development to finish signing in.",
    "افتح نسخة EmailTasker التطويرية من جديد لإكمال تسجيل الدخول.",
  ],
);

function parseHeaderRules(contents) {
  const rules = new Map();
  let currentRule;
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      currentRule = line.trim();
      rules.set(currentRule, new Map());
      continue;
    }
    const header = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!currentRule || !header) {
      failures.push(
        "infra/mobile-auth-worker/public/_headers: invalid header rule",
      );
      continue;
    }
    rules.get(currentRule).set(header[1].toLowerCase(), header[2]);
  }
  return rules;
}

function inlineSourceHashes(tag) {
  const hashes = new Set();
  for (const relativePath of [
    "mobile-auth/callback/index.html",
    "mobile-auth/dev/callback/index.html",
  ]) {
    const file = path.join(authAssetsRoot, relativePath);
    if (!fs.existsSync(file)) continue;
    for (const match of read(file).matchAll(
      new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"),
    )) {
      hashes.add(
        `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
      );
    }
  }
  return [...hashes];
}

const headersRelativePath = "infra/mobile-auth-worker/public/_headers";
const headersPath = path.join(root, headersRelativePath);
if (!fs.existsSync(headersPath)) {
  failures.push(`missing ${headersRelativePath}`);
} else {
  const rules = parseHeaderRules(read(headersPath));
  const scriptHashes = inlineSourceHashes("script");
  const styleHashes = inlineSourceHashes("style");
  const expectedRules = new Map([
    [
      "/.well-known/apple-app-site-association",
      new Map([
        [
          "cache-control",
          "public, max-age=3600, must-revalidate, no-transform",
        ],
        [
          "content-security-policy",
          "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ],
        ["content-type", "application/json"],
        ["referrer-policy", "no-referrer"],
        ["x-content-type-options", "nosniff"],
        ["x-robots-tag", "noindex, nofollow, noarchive"],
      ]),
    ],
    [
      "/mobile-auth/*",
      new Map([
        ["cache-control", "no-store"],
        [
          "content-security-policy",
          `default-src 'none'; script-src ${scriptHashes.join(" ")}; style-src ${styleHashes.join(" ")}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`,
        ],
        ["content-type", "text/html; charset=utf-8"],
        ["referrer-policy", "no-referrer"],
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "DENY"],
        ["x-robots-tag", "noindex, nofollow, noarchive"],
      ]),
    ],
  ]);

  if (
    JSON.stringify([...rules.keys()]) !==
    JSON.stringify([...expectedRules.keys()])
  ) {
    failures.push(`${headersRelativePath}: route patterns are not exact`);
  }
  for (const [route, expectedHeaders] of expectedRules) {
    const actualHeaders = rules.get(route);
    if (!actualHeaders) continue;
    if (
      JSON.stringify([...actualHeaders]) !==
      JSON.stringify([...expectedHeaders])
    ) {
      failures.push(
        `${headersRelativePath}: ${route} security headers or inline-source hashes are not exact`,
      );
    }
  }
}

const manifestPath = path.join(root, "updates.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifestText = read(manifestPath);
    const manifest = JSON.parse(manifestText);
    const legacyDigest = createHash("sha256")
      .update(manifestText)
      .digest("hex");
    if (
      manifest.version !== "1.2.0" ||
      legacyDigest !==
        "7af0508f44d3327138b20238add377877ac459323ec7adb8ec53cdc30669144a"
    ) {
      failures.push(
        "updates.json: legacy feed is not the frozen 1.2.0 document",
      );
    }
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
  } catch (error) {
    failures.push(`updates.json: invalid JSON: ${error.message}`);
  }
}

const v2ManifestPath = path.join(root, "updates-v2.json");
let v2Payload = null;
if (!fs.existsSync(v2ManifestPath)) {
  failures.push("missing updates-v2.json");
} else {
  try {
    const manifest = JSON.parse(read(v2ManifestPath));
    if (
      Object.keys(manifest).sort().join(",") !==
        "emailtasker,notes,platforms,pub_date,version" ||
      Object.keys(manifest.platforms ?? {})
        .sort()
        .join(",") !== "darwin-aarch64,darwin-x86_64"
    ) {
      failures.push("updates-v2.json: Tauri envelope fields are not exact");
    }
    const control = manifest.emailtasker;
    if (
      Object.keys(control ?? {})
        .sort()
        .join(",") !== "payloadBase64,payloadSignature"
    ) {
      failures.push(
        "updates-v2.json: emailtasker envelope fields are not exact",
      );
    }
    const inert =
      control?.payloadBase64 === "" && control?.payloadSignature === "";
    const signed = Boolean(control?.payloadBase64 && control?.payloadSignature);
    if (!inert && !signed) {
      failures.push("updates-v2.json: control envelope is incomplete");
    } else if (inert && manifest.version !== "1.2.0") {
      failures.push("updates-v2.json: inert bootstrap version is not 1.2.0");
    } else if (signed) {
      const payloadBytes = Buffer.from(control.payloadBase64, "base64");
      if (payloadBytes.toString("base64") !== control.payloadBase64) {
        failures.push("updates-v2.json: payloadBase64 is not canonical");
      } else {
        v2Payload = JSON.parse(payloadBytes.toString("utf8"));
        const payloadValid =
          Object.keys(v2Payload).sort().join(",") ===
            "archive,channel,cohortSalt,critical,dmg,enabled,minimumMacos,publishedAt,revision,rolloutPercentage,schemaVersion,version" &&
          Object.keys(v2Payload.archive ?? {})
            .sort()
            .join(",") === "sha256,signature,sizeBytes,url" &&
          Object.keys(v2Payload.dmg ?? {})
            .sort()
            .join(",") === "sha256,sizeBytes,url" &&
          v2Payload.schemaVersion === 2 &&
          v2Payload.channel === "stable" &&
          Number.isSafeInteger(v2Payload.revision) &&
          v2Payload.revision > 0 &&
          v2Payload.version === manifest.version &&
          v2Payload.publishedAt === manifest.pub_date &&
          typeof v2Payload.enabled === "boolean" &&
          typeof v2Payload.critical === "boolean" &&
          /^\d+(?:\.\d+){1,2}$/.test(v2Payload.minimumMacos ?? "") &&
          Number.isSafeInteger(v2Payload.rolloutPercentage) &&
          v2Payload.rolloutPercentage >= 0 &&
          v2Payload.rolloutPercentage <= 100 &&
          typeof v2Payload.cohortSalt === "string" &&
          v2Payload.cohortSalt.length >= 8 &&
          /^[0-9a-f]{64}$/.test(v2Payload.archive?.sha256 ?? "") &&
          Number.isSafeInteger(v2Payload.archive?.sizeBytes) &&
          v2Payload.archive.sizeBytes > 0 &&
          typeof v2Payload.archive?.signature === "string" &&
          /^[0-9a-f]{64}$/.test(v2Payload.dmg?.sha256 ?? "") &&
          Number.isSafeInteger(v2Payload.dmg?.sizeBytes) &&
          v2Payload.dmg.sizeBytes > 0;
        if (!payloadValid)
          failures.push("updates-v2.json: invalid signed schema-2 payload");
      }
    }
    for (const platform of ["darwin-aarch64", "darwin-x86_64"]) {
      const entry = manifest.platforms?.[platform];
      if (
        !entry ||
        Object.keys(entry).sort().join(",") !== "signature,url" ||
        typeof entry.signature !== "string" ||
        typeof entry.url !== "string"
      ) {
        failures.push(
          `updates-v2.json: invalid standard Tauri ${platform} entry`,
        );
      } else if (
        v2Payload &&
        (entry.signature !== v2Payload.archive.signature ||
          entry.url !== v2Payload.archive.url)
      ) {
        failures.push(
          `updates-v2.json: ${platform} differs from signed archive`,
        );
      }
    }
  } catch (error) {
    failures.push(`updates-v2.json: invalid JSON: ${error.message}`);
  }
}

const downloadsPath = path.join(root, "downloads.json");
if (!fs.existsSync(downloadsPath)) {
  failures.push("missing downloads.json");
} else {
  try {
    const downloads = JSON.parse(read(downloadsPath));
    const valid =
      Object.keys(downloads).sort().join(",") ===
        "dmg,minimumMacos,publishedAt,schemaVersion,version" &&
      Object.keys(downloads.dmg ?? {})
        .sort()
        .join(",") === "sha256,sizeBytes,url" &&
      downloads.schemaVersion === 1 &&
      /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(
        downloads.version ?? "",
      ) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
        downloads.publishedAt ?? "",
      ) &&
      /^\d+(?:\.\d+){1,2}$/.test(downloads.minimumMacos ?? "") &&
      /^[0-9a-f]{64}$/.test(downloads.dmg?.sha256 ?? "") &&
      Number.isSafeInteger(downloads.dmg?.sizeBytes) &&
      downloads.dmg.sizeBytes > 0 &&
      downloads.dmg?.url ===
        `https://github.com/azzuwayed/emailtasker-website/releases/download/v${downloads.version}/EmailTasker_${downloads.version}_universal.dmg`;
    if (!valid)
      failures.push("downloads.json: invalid schema-1 download pointer");
    if (
      v2Payload &&
      JSON.stringify(downloads) !==
        JSON.stringify({
          schemaVersion: 1,
          version: v2Payload.version,
          publishedAt: v2Payload.publishedAt,
          minimumMacos: v2Payload.minimumMacos,
          dmg: v2Payload.dmg,
        })
    ) {
      failures.push("downloads.json: does not match the signed v2 DMG payload");
    }
    const downloadScriptPath = path.join(root, "download.js");
    if (!fs.existsSync(downloadScriptPath)) {
      failures.push("missing download.js");
    } else {
      const script = read(downloadScriptPath);
      if (
        (await resolvedDownloadHref(script, downloads)) !== downloads.dmg?.url
      ) {
        failures.push(
          "download.js: did not resolve the approved downloads.json DMG",
        );
      }
      const rejectedHref = await resolvedDownloadHref(script, {
        ...downloads,
        dmg: { ...downloads.dmg, url: "https://example.test/EmailTasker.dmg" },
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
    failures.push(`downloads.json: invalid JSON: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "site check passed: EN/AR Pages site, dedicated mobile auth Worker assets and headers, manifest-derived SEO and media, public downloads, localized Hub handoffs, and updater host",
);
