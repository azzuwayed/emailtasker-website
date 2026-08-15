/**
 * The one owner of how a product manifest becomes a rendered page.
 *
 * `sync-product.mjs` writes pages from these directives and `check-site.mjs`
 * verifies pages against the same ones, so the renderer and the gate cannot
 * disagree about what a page is supposed to say. Every function here throws on
 * invalid input; callers decide whether to collect the message or abort.
 */

import { extname } from "node:path";

export const siteOrigin = "https://emailtasker.azzuwayed.com";

/**
 * Pre-schema-3 manifests carry no `displayName`, so the public name falls back
 * per locale. A single English fallback would rename the Arabic page and its
 * JSON-LD the moment a schema 1 or 2 manifest was synced.
 */
export const legacyDisplayNames = {
  en: "EmailTasker",
  ar: "ايميل تاسكر",
};

export const localePages = {
  en: {
    page: "index.html",
    prefix: "",
    canonical: `${siteOrigin}/`,
    ogLocale: "en_US",
    ogAlternate: "ar_SA",
    appStoreLabel: "Download on the App Store",
  },
  ar: {
    page: "ar/index.html",
    prefix: "../",
    canonical: `${siteOrigin}/ar/`,
    ogLocale: "ar_SA",
    ogAlternate: "en_US",
    appStoreLabel: "حمّل من App Store",
  },
};

export const LOCALES = ["en", "ar"];

export function byCodeUnit(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Key-sorted JSON so two structurally equal values compare as equal strings. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => byCodeUnit(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`unsupported media type: ${path}`);
}

/**
 * Reads intrinsic dimensions from PNG, WebP (VP8/VP8L/VP8X), and JPEG headers.
 * Written out rather than taking a dependency so the site has no image toolchain.
 */
export function imageDimensions(bytes, path) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return {
        width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
        height:
          1 +
          ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
      };
    }
    if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }

  throw new Error(`cannot read image dimensions: ${path}`);
}

export function mediaItems(manifest) {
  return [
    ...(manifest.media.hero ? [manifest.media.hero] : []),
    ...manifest.media.screenshots,
    ...(manifest.schemaVersion === 3 && manifest.media.socialCard
      ? [manifest.media.socialCard]
      : []),
  ];
}

export function sourceMediaPath(manifest, item, locale = "en") {
  const value =
    manifest.schemaVersion === 1
      ? item.path
      : (item.paths?.[locale] ?? item.paths?.default);
  if (
    typeof value !== "string" ||
    !value.startsWith("product/media/") ||
    value.includes("..")
  ) {
    throw new Error(`invalid product media path: ${String(value)}`);
  }
  return value;
}

/** Every distinct source file the manifest references, in stable order. */
export function mediaPaths(manifest) {
  const paths = new Set();
  for (const item of mediaItems(manifest)) {
    if (manifest.schemaVersion === 1) {
      paths.add(sourceMediaPath(manifest, item));
      continue;
    }
    for (const locale of LOCALES) {
      paths.add(sourceMediaPath(manifest, item, locale));
    }
  }
  return [...paths].sort(byCodeUnit);
}

export function mediaAlt(item, locale, fallback = "") {
  if (typeof item.alt === "string") return item.alt;
  if (item.alt && typeof item.alt[locale] === "string") return item.alt[locale];
  return fallback;
}

export function publishedMediaPath(contentRevision, sourcePath) {
  return `assets/product/${contentRevision}/${sourcePath.slice("product/media/".length)}`;
}

export function localizedLink(value, locale) {
  if (!value) return undefined;
  return typeof value === "string" ? value : value[locale];
}

/**
 * The revision digest. Dimensions are deliberately outside it: they are derived
 * from bytes already covered by the hash.
 */
export function contentRevisionInput(manifest, media) {
  return [
    canonicalJson(manifest),
    ...media.map(
      (item) => `${item.path}:${item.sha256}:${item.bytes}:${item.mimeType}`,
    ),
  ].join("\n");
}

/**
 * Manifest rules that hold wherever a manifest is read. `media` is optional;
 * pass it to also hold the social card to its Open Graph dimensions.
 */
export function validateManifest(manifest, media) {
  const problems = [];
  if (![1, 2, 3].includes(manifest.schemaVersion)) {
    problems.push("schemaVersion must equal 1, 2, or 3");
  }
  if (!manifest.locales?.en || !manifest.locales?.ar) {
    problems.push("manifest must include English and Arabic content");
    return problems;
  }
  if (manifest.schemaVersion !== 3) return problems;

  if (!manifest.media.socialCard)
    problems.push("schema 3 socialCard is required");
  for (const locale of LOCALES) {
    const content = manifest.locales[locale];
    if (
      !content.displayName ||
      !content.seo?.title ||
      !content.seo?.description
    ) {
      problems.push(
        `schema 3 ${locale} displayName and SEO fields are required`,
      );
    }
    if (manifest.media.socialCard && media) {
      const sourcePath = sourceMediaPath(
        manifest,
        manifest.media.socialCard,
        locale,
      );
      const card = media.find((item) => item.path === sourcePath);
      if (card && (card.width !== 1200 || card.height !== 630)) {
        problems.push(`${locale} social card must be 1200x630`);
      }
    }
    const appStoreUrl = localizedLink(manifest.links?.appStore, locale);
    if (manifest.links?.appStore && !appStoreUrl) {
      problems.push(
        `schema 3 ${locale} App Store link is required when appStore is present`,
      );
    }
    if (appStoreUrl) {
      let url;
      try {
        url = new URL(appStoreUrl);
      } catch {
        url = undefined;
      }
      if (url?.protocol !== "https:") {
        problems.push(`${locale} App Store link must use HTTPS`);
      }
    }
  }
  return problems;
}

export function buildPageModel(product, media, locale) {
  const { manifest, contentRevision } = product;
  const config = localePages[locale];
  const content = manifest.locales[locale];
  const displayName = content.displayName ?? legacyDisplayNames[locale];
  const title = content.seo?.title ?? `${displayName} — ${content.tag}`;
  const description =
    content.seo?.description ?? content.accountSummary ?? content.overview;
  const socialCard = manifest.media.socialCard ?? manifest.media.hero;
  const socialSourcePath = sourceMediaPath(manifest, socialCard, locale);
  const socialPath = publishedMediaPath(contentRevision, socialSourcePath);
  const socialMedia = media.find((item) => item.path === socialSourcePath);
  if (!socialMedia) {
    throw new Error(`${locale} social image metadata is missing`);
  }
  const appStoreUrl = localizedLink(manifest.links?.appStore, locale);
  const mediaByKey = new Map();
  for (const item of [
    manifest.media.hero,
    ...manifest.media.screenshots,
  ].filter(Boolean)) {
    const relativePath = publishedMediaPath(
      contentRevision,
      sourceMediaPath(manifest, item, locale),
    );
    mediaByKey.set(item.key, {
      src: `${config.prefix}${relativePath}`,
      absoluteSrc: `${siteOrigin}/${relativePath}`,
      alt: mediaAlt(
        item,
        locale,
        item.key === "hero" ? (content.heroAlt ?? displayName) : displayName,
      ),
    });
  }
  return {
    config,
    content,
    displayName,
    title,
    description,
    social: {
      src: `${siteOrigin}/${socialPath}`,
      alt: mediaAlt(socialCard, locale, content.heroAlt ?? displayName),
      width: socialMedia.width,
      height: socialMedia.height,
      type: socialMedia.mimeType,
    },
    mediaByKey,
    appStoreUrl,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: displayName,
      applicationCategory: "BusinessApplication",
      operatingSystem: appStoreUrl
        ? "macOS 14 or later, iOS"
        : "macOS 14 or later",
      url: config.canonical,
      description,
      image: `${siteOrigin}/${socialPath}`,
      screenshot: [...mediaByKey.values()].map((item) => item.absoluteSrc),
      inLanguage: locale,
      ...(appStoreUrl ? { sameAs: [appStoreUrl] } : {}),
    },
  };
}

/**
 * Everything a page must say, as data. `renderPage` writes it and `verifyPage`
 * reads it back; a field added to one is a field added to both.
 */
export function pageDirectives(product, media, locale) {
  const model = buildPageModel(product, media, locale);
  const { config } = model;
  return {
    page: config.page,
    appStoreLabel: config.appStoreLabel,
    title: model.title,
    metaByName: [
      ["description", model.description],
      ["product-revision", product.contentRevision],
      ["twitter:card", "summary_large_image"],
      ["twitter:title", model.title],
      ["twitter:description", model.description],
      ["twitter:image", model.social.src],
      ["twitter:image:alt", model.social.alt],
    ],
    metaByProperty: [
      ["og:type", "website"],
      ["og:title", model.title],
      ["og:description", model.description],
      ["og:url", config.canonical],
      ["og:locale", config.ogLocale],
      ["og:locale:alternate", config.ogAlternate],
      ["og:image", model.social.src],
      ["og:image:alt", model.social.alt],
      ["og:image:width", String(model.social.width)],
      ["og:image:height", String(model.social.height)],
      ["og:image:type", model.social.type],
    ],
    links: [
      ["canonical", undefined, config.canonical],
      ["alternate", "en", localePages.en.canonical],
      ["alternate", "ar", localePages.ar.canonical],
      ["alternate", "x-default", localePages.en.canonical],
    ],
    fields: [
      ["displayName", model.displayName],
      ...["tag", "overview", "audience"].map((field) => [
        field,
        model.content[field],
      ]),
    ],
    highlights: model.content.highlights.map((item) => [item.key, item.text]),
    media: [...model.mediaByKey],
    jsonLd: model.jsonLd,
    appStoreUrl: model.appStoreUrl,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading a page                                                             */
/* -------------------------------------------------------------------------- */

function tagByAttributes(html, tagName, attributes) {
  const lookaheads = Object.entries(attributes)
    .map(
      ([attribute, value]) =>
        `(?=[^>]*\\b${escapeRegExp(attribute)}="${escapeRegExp(value)}")`,
    )
    .join("");
  return html.match(new RegExp(`<${tagName}\\b${lookaheads}[^>]*>`, "i"))?.[0];
}

function attributeValue(tag, attribute) {
  return tag?.match(new RegExp(`\\b${escapeRegExp(attribute)}="([^"]*)"`))?.[1];
}

function elementText(html, attribute, value) {
  const pattern = new RegExp(
    `<[^>]+\\b${escapeRegExp(attribute)}="${escapeRegExp(value)}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
  );
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
}

/**
 * Compares parsed values rather than bytes, so a page stays verifiable after
 * Prettier reflows it — `sync:product` writes unformatted and `format:release`
 * rewraps, which a text comparison could not survive.
 *
 * Returns one message per mismatch, already prefixed with the page.
 */
export function verifyPage(html, directives) {
  const problems = [];
  const { page } = directives;
  const note = (message) => problems.push(`${page}: ${message}`);

  const expectAttribute = (tagName, marker, attribute, expected) => {
    const tag = tagByAttributes(html, tagName, marker);
    if (!tag) {
      note(`missing ${tagName} ${JSON.stringify(marker)}`);
      return;
    }
    if (attributeValue(tag, attribute) !== escapeHtml(expected)) {
      note(
        `${attribute} for ${JSON.stringify(marker)} does not match product.json`,
      );
    }
  };

  if (
    html.match(/<title>([\s\S]*?)<\/title>/)?.[1] !==
    escapeHtml(directives.title)
  ) {
    note("title does not match product.json");
  }
  for (const [name, value] of directives.metaByName) {
    expectAttribute("meta", { name }, "content", value);
  }
  for (const [property, value] of directives.metaByProperty) {
    expectAttribute("meta", { property }, "content", value);
  }
  for (const [rel, hreflang, href] of directives.links) {
    expectAttribute(
      "link",
      hreflang ? { rel, hreflang } : { rel },
      "href",
      href,
    );
  }
  for (const [field, value] of directives.fields) {
    if (
      elementText(html, "data-product-field", field) !==
      escapeHtml(value).replace(/\s+/g, " ").trim()
    ) {
      note(`data-product-field=${field} does not match product.json`);
    }
  }
  for (const [key, value] of directives.highlights) {
    if (
      elementText(html, "data-product-highlight", key) !==
      escapeHtml(value).replace(/\s+/g, " ").trim()
    ) {
      note(`data-product-highlight=${key} does not match product.json`);
    }
  }
  for (const [key, item] of directives.media) {
    expectAttribute("img", { "data-product-media": key }, "src", item.src);
    expectAttribute("img", { "data-product-media": key }, "alt", item.alt);
  }

  const jsonLdText = html.match(
    /<script\b[^>]*data-product-json-ld[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  try {
    if (
      canonicalJson(JSON.parse(jsonLdText)) !== canonicalJson(directives.jsonLd)
    ) {
      note("JSON-LD does not match product.json");
    }
  } catch (error) {
    note(`product JSON-LD is invalid: ${error.message}`);
  }

  const appStoreBlock = html.match(
    /<!-- product-app-store:start -->([\s\S]*?)<!-- product-app-store:end -->/,
  )?.[1];
  if (appStoreBlock === undefined) {
    note("App Store CTA markers are missing");
  } else if (directives.appStoreUrl) {
    if (
      !appStoreBlock.includes(`href="${escapeHtml(directives.appStoreUrl)}"`) ||
      !appStoreBlock.includes(escapeHtml(directives.appStoreLabel))
    ) {
      note("App Store CTA does not match product.json");
    }
  } else if (/<a\b/.test(appStoreBlock)) {
    note("App Store CTA is present without a manifest link");
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Writing a page                                                             */
/* -------------------------------------------------------------------------- */

function replaceTagAttribute(tag, attribute, value) {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`\\s${escapeRegExp(attribute)}="[^"]*"`);
  if (pattern.test(tag)) {
    return tag.replace(pattern, ` ${attribute}="${escaped}"`);
  }
  return tag.replace(/\s*\/?>(?=\s*$)/, ` ${attribute}="${escaped}"$&`);
}

/**
 * Rewrites a page in place from the same directives `verifyPage` reads. Output
 * is intentionally unformatted; `pnpm format:release` owns the final style.
 */
export function renderPage(html, directives) {
  const { page } = directives;
  const fail = (message) => {
    throw new Error(`${page} ${message}`);
  };

  const replaceTagged = (tagName, lookaheads, attribute, value, label) => {
    const pattern = new RegExp(
      `<${tagName}\\b${lookaheads.map((one) => `(?=[^>]*${escapeRegExp(one)})`).join("")}[^>]*>`,
    );
    const match = html.match(pattern)?.[0];
    if (!match) fail(`${label} marker is missing`);
    html = html.replace(match, replaceTagAttribute(match, attribute, value));
  };

  const replaceElement = (attribute, value, label) => {
    const pattern = new RegExp(
      `(<[^>]+${escapeRegExp(attribute)}[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`,
    );
    if (!pattern.test(html)) fail(`${label} marker is missing`);
    html = html.replace(pattern, `$1${escapeHtml(value)}$2`);
  };

  if (!/<title>[\s\S]*?<\/title>/.test(html)) fail("title is missing");
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(directives.title)}</title>`,
  );

  for (const [name, value] of directives.metaByName) {
    replaceTagged("meta", [`name="${name}"`], "content", value, name);
  }
  for (const [property, value] of directives.metaByProperty) {
    replaceTagged(
      "meta",
      [`property="${property}"`],
      "content",
      value,
      property,
    );
  }
  for (const [rel, hreflang, href] of directives.links) {
    replaceTagged(
      "link",
      hreflang ? [`rel="${rel}"`, `hreflang="${hreflang}"`] : [`rel="${rel}"`],
      "href",
      href,
      hreflang ? `${rel} ${hreflang}` : rel,
    );
  }

  const jsonLdPattern =
    /(<script\b[^>]*data-product-json-ld[^>]*>)[\s\S]*?(<\/script>)/;
  if (!jsonLdPattern.test(html)) fail("JSON-LD marker is missing");
  html = html.replace(
    jsonLdPattern,
    `$1\n${JSON.stringify(directives.jsonLd, null, 2).replaceAll("<", "\\u003c")}\n$2`,
  );

  for (const [field, value] of directives.fields) {
    replaceElement(`data-product-field="${field}"`, value, field);
  }
  for (const [key, value] of directives.highlights) {
    replaceElement(
      `data-product-highlight="${key}"`,
      value,
      `highlight ${key}`,
    );
  }
  for (const [key, item] of directives.media) {
    for (const [attribute, value] of [
      ["src", item.src],
      ["alt", item.alt],
    ]) {
      replaceTagged(
        "img",
        [`data-product-media="${key}"`],
        attribute,
        value,
        `media ${key}`,
      );
    }
  }

  const ctaPattern =
    /(<!-- product-app-store:start -->)[\s\S]*?(<!-- product-app-store:end -->)/;
  if (!ctaPattern.test(html)) fail("App Store CTA block markers are missing");
  const cta = directives.appStoreUrl
    ? `            <a class="button" href="${escapeHtml(directives.appStoreUrl)}" rel="noopener">${escapeHtml(directives.appStoreLabel)}</a>`
    : "";
  return html.replace(ctaPattern, `$1\n${cta}\n            $2`);
}
