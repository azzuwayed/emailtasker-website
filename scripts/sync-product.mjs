#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const websiteName = basename(websiteRoot);
const expectedProductId = websiteName.replace(/-website$/, "");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const sourceArg = process.argv.indexOf("--source-root");
const sourceRoot = resolve(
  sourceArg >= 0
    ? process.argv[sourceArg + 1]
    : join(websiteRoot, "..", expectedProductId),
);

function fail(message) {
  throw new Error(`sync-product: ${message}`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function replaceElement(html, attribute, value, label) {
  const pattern = new RegExp(
    `(<[^>]+${attribute.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`,
  );
  if (!pattern.test(html)) fail(`${label} marker is missing`);
  return html.replace(pattern, `$1${escapeHtml(value)}$2`);
}

function mediaPaths(manifest) {
  return [
    ...(manifest.media.hero ? [manifest.media.hero.path] : []),
    ...manifest.media.screenshots.map((item) => item.path),
  ].sort();
}

function mimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  fail(`unsupported media type: ${path}`);
}

async function publication() {
  const manifest = JSON.parse(
    await readFile(join(sourceRoot, "product", "manifest.json"), "utf8"),
  );
  if (manifest.schemaVersion !== 1) fail("schemaVersion must equal 1");
  if (manifest.productId !== expectedProductId) {
    fail(`expected productId ${expectedProductId}, got ${manifest.productId}`);
  }
  const media = [];
  for (const path of mediaPaths(manifest)) {
    const bytes = await readFile(join(sourceRoot, path));
    media.push({
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      mimeType: mimeType(path),
    });
  }
  const input = [
    canonicalJson(manifest),
    ...media.map(
      (item) => `${item.path}:${item.sha256}:${item.bytes}:${item.mimeType}`,
    ),
  ].join("\n");
  return {
    schemaVersion: 1,
    productId: manifest.productId,
    contentRevision: createHash("sha256").update(input).digest("hex"),
    manifest,
  };
}

async function check() {
  const product = JSON.parse(
    await readFile(join(websiteRoot, "product.json"), "utf8"),
  );
  if (
    product.schemaVersion !== 1 ||
    product.productId !== expectedProductId ||
    !/^[a-f0-9]{64}$/.test(product.contentRevision)
  ) {
    fail("product.json identity or revision is invalid");
  }
  for (const page of ["index.html", join("ar", "index.html")]) {
    const html = await readFile(join(websiteRoot, page), "utf8");
    const revision = html.match(
      /<meta\s+name="product-revision"\s+content="([a-f0-9]*)"\s*\/>/,
    )?.[1];
    if (revision !== product.contentRevision) {
      fail(`${page} does not expose product.json revision`);
    }
  }
  process.stdout.write(`${product.productId} ${product.contentRevision}\n`);
}

async function sync() {
  const product = await publication();
  for (const [locale, page] of [
    ["en", "index.html"],
    ["ar", join("ar", "index.html")],
  ]) {
    const content = product.manifest.locales[locale];
    let html = await readFile(join(websiteRoot, page), "utf8");
    html = html.replace(
      /<meta\s+name="product-revision"\s+content="[a-f0-9]*"\s*\/>/,
      `<meta name="product-revision" content="${product.contentRevision}" />`,
    );
    for (const field of ["tag", "overview", "audience"]) {
      html = replaceElement(
        html,
        `data-product-field="${field}"`,
        content[field],
        `${page} ${field}`,
      );
    }
    for (const highlight of content.highlights) {
      html = replaceElement(
        html,
        `data-product-highlight="${highlight.key}"`,
        highlight.text,
        `${page} highlight ${highlight.key}`,
      );
    }
    await writeFile(join(websiteRoot, page), html);
  }
  await writeFile(
    join(websiteRoot, "product.json"),
    `${JSON.stringify(product, null, 2)}\n`,
  );
  await check();
}

(checkOnly ? check() : sync()).catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
