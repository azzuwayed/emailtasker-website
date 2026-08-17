(() => {
  const allowedPrefix =
    "https://github.com/azzuwayed/emailtasker-website/releases/download/";

  function resolveDmg(downloads) {
    const candidate = downloads?.dmg?.url;
    const expected = `${allowedPrefix}v${downloads?.version}/EmailTasker_${downloads?.version}_universal.dmg`;
    if (
      Object.keys(downloads ?? {})
        .sort()
        .join(",") !== "dmg,minimumMacos,publishedAt,schemaVersion,version" ||
      Object.keys(downloads?.dmg ?? {})
        .sort()
        .join(",") !== "sha256,sizeBytes,url" ||
      downloads?.schemaVersion !== 1 ||
      !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(
        downloads?.version ?? "",
      ) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
        downloads?.publishedAt ?? "",
      ) ||
      !/^\d+(?:\.\d+){1,2}$/.test(downloads?.minimumMacos ?? "") ||
      !/^[0-9a-f]{64}$/.test(downloads?.dmg?.sha256 ?? "") ||
      !Number.isSafeInteger(downloads?.dmg?.sizeBytes) ||
      downloads.dmg.sizeBytes <= 0 ||
      typeof candidate !== "string" ||
      candidate !== expected
    ) {
      return null;
    }
    return candidate;
  }

  async function hydrateDownload(link) {
    try {
      const response = await fetch(link.dataset.downloadsUrl, {
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
