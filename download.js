(() => {
  const allowedPrefix =
    "https://github.com/azzuwayed/emailtasker-website/releases/download/";

  function resolveDmg(manifest) {
    const candidate =
      manifest?.platforms?.["darwin-aarch64"]?.dmg?.url ??
      manifest?.macos?.arm64?.dmg?.url;
    if (
      typeof candidate !== "string" ||
      !candidate.startsWith(allowedPrefix) ||
      !candidate.endsWith(".dmg")
    ) {
      return null;
    }
    return candidate;
  }

  async function hydrateDownload(link) {
    try {
      const response = await fetch(link.dataset.manifestUrl, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const dmg = resolveDmg(await response.json());
      if (dmg) link.href = dmg;
    } catch {
      // Keep the public latest-release fallback already rendered in the page.
    }
  }

  for (const link of document.querySelectorAll("[data-emailtasker-download]")) {
    void hydrateDownload(link);
  }
})();
