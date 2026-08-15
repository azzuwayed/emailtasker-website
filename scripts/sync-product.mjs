#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  contentRevisionInput,
  imageDimensions,
  localePages,
  mediaPaths,
  mimeType,
  pageDirectives,
  publishedMediaPath,
  renderPage,
  validateManifest,
  verifyPage,
} from "./product-model.mjs";

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

const sourceManifest = join(sourceRoot, "product", "manifest.json");

/**
 * This repository is public and clones standalone, so the sibling source
 * checkout may not exist. Source parity is then unverifiable rather than
 * failing: `check:site` still validates the committed publication end to end.
 */
async function hasSourceCheckout() {
  try {
    await access(sourceManifest, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function publication() {
  const manifest = JSON.parse(await readFile(sourceManifest, "utf8"));
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
      ...imageDimensions(bytes, path),
    });
  }

  const problems = validateManifest(manifest, media);
  if (problems.length > 0) fail(problems.join("; "));

  return {
    product: {
      schemaVersion: 1,
      productId: manifest.productId,
      contentRevision: createHash("sha256")
        .update(contentRevisionInput(manifest, media))
        .digest("hex"),
      manifest,
    },
    media,
  };
}

/**
 * Revision directories are immutable but not cumulative: only the current
 * publication is reachable from a page, so the rest are dead weight.
 */
async function pruneRevisions(keep) {
  const productAssets = join(websiteRoot, "assets", "product");
  let entries;
  try {
    entries = await readdir(productAssets, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === keep) continue;
    await rm(join(productAssets, entry.name), { recursive: true, force: true });
  }
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
  if (!(await hasSourceCheckout())) {
    process.stdout.write(
      `${product.productId} ${product.contentRevision} (source parity skipped: no checkout at ${sourceRoot})\n`,
    );
    return;
  }

  const expected = await publication();
  if (canonicalJson(product) !== canonicalJson(expected.product)) {
    fail("product.json does not match the accepted source manifest and media");
  }
  for (const item of expected.media) {
    const bytes = await readFile(
      join(websiteRoot, publishedMediaPath(product.contentRevision, item.path)),
    );
    if (
      bytes.length !== item.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    ) {
      fail(`published media does not match ${item.path}`);
    }
  }
  const problems = [];
  for (const [locale, config] of Object.entries(localePages)) {
    const html = await readFile(join(websiteRoot, config.page), "utf8");
    problems.push(
      ...verifyPage(html, pageDirectives(product, expected.media, locale)),
    );
  }
  if (problems.length > 0) fail(`\n${problems.join("\n")}`);
  process.stdout.write(`${product.productId} ${product.contentRevision}\n`);
}

async function sync() {
  const { product, media } = await publication();
  for (const item of media) {
    const target = join(
      websiteRoot,
      publishedMediaPath(product.contentRevision, item.path),
    );
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceRoot, item.path), target);
  }
  // Render both pages before writing either: a missing marker must abort while
  // the tree still points at a complete publication.
  const rendered = [];
  for (const [locale, config] of Object.entries(localePages)) {
    const page = join(websiteRoot, config.page);
    const html = await readFile(page, "utf8");
    rendered.push([
      page,
      renderPage(html, pageDirectives(product, media, locale)),
    ]);
  }
  for (const [page, html] of rendered) {
    await writeFile(page, html);
  }
  await writeFile(
    join(websiteRoot, "product.json"),
    `${JSON.stringify(product, null, 2)}\n`,
  );
  await check();
  // Last, so a failure above never strips the media the committed pages still
  // reference.
  await pruneRevisions(product.contentRevision);
}

(checkOnly ? check() : sync()).catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
