import localforage from "localforage";
import LZString from "lz-string";

export type TBotsManifestItem = {
  name: string;
  file: string; // xml filename in /public/xml
  description?: string;
  difficulty?: string;
  strategy?: string;
  features?: string[];
};

const XML_CACHE_PREFIX = "botbot:xml:";

// In-memory cache for faster access
const memoryCache = new Map<string, string>();

// Domain-aware XML base path: defaults to /xml/, but can switch to /xml/<domain>/ after manifest resolution
let XML_BASE = "/xml/";
export const getXmlBase = () => XML_BASE;
const setXmlBase = (base: string) => {
  XML_BASE = base.endsWith("/") ? base : `${base}/`;
};

const isHtmlDocument = (text: string) =>
  /^\s*<!doctype html|^\s*<html[\s>]/i.test(text);

const fetchTextIfValid = async (
  url: string,
  init?: RequestInit,
): Promise<string | null> => {
  const res = await fetch(url, init);
  if (!res.ok) return null;

  const text = await res.text();
  if (isHtmlDocument(text)) return null;

  return text;
};

const decompress = (data: string | null) =>
  data ? LZString.decompressFromUTF16(data) : null;
const compress = (data: string) => LZString.compressToUTF16(data);

export const getCachedXml = async (file: string): Promise<string | null> => {
  try {
    const key = `${XML_CACHE_PREFIX}${file}`;
    const cached = (await localforage.getItem<string>(key)) || null;
    return decompress(cached);
  } catch (e) {
    // eslint-disable-next-line no-console
    return null;
  }
};

export const setCachedXml = async (file: string, xml: string) => {
  try {
    const key = `${XML_CACHE_PREFIX}${file}`;
    await localforage.setItem(key, compress(xml));
  } catch (e) {
    // eslint-disable-next-line no-console
  }
};

export const fetchXmlWithCache = async (
  file: string,
): Promise<string | null> => {
  // Check memory cache first
  if (memoryCache.has(file)) {
    return memoryCache.get(file)!;
  }

  // Check persistent cache
  const cached = await getCachedXml(file);
  if (cached) {
    memoryCache.set(file, cached); // Store in memory for faster access
    return cached;
  }

  try {
    // 1) Try domain-specific base (set after manifest) else default /xml/
    const primaryUrl = `${getXmlBase()}${encodeURIComponent(file)}`;
    const fallbackUrls = [
      primaryUrl,
      `/xml/default/${encodeURIComponent(file)}`,
      `/xml/${encodeURIComponent(file)}`,
    ];

    let xml: string | null = null;
    for (const url of fallbackUrls) {
      xml = await fetchTextIfValid(url);
      if (xml) break;
    }

    if (!xml) return null;

    // Store in both caches
    memoryCache.set(file, xml);
    await setCachedXml(file, xml);
    return xml;
  } catch (e: any) {
    // Only log non-404 errors to reduce console noise
    if (e?.message && !e.message.includes("404")) {
      // eslint-disable-next-line no-console
    }
    return null;
  }
};

export const prefetchAllXmlInBackground = async (files: string[]) => {
  // Fire-and-forget prefetch with throttling to avoid overwhelming the browser
  const batchSize = 3; // Load 3 files at a time
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((file) => fetchXmlWithCache(file)));
    // Small delay between batches to prevent blocking
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
};

export const getBotsManifest = async (): Promise<
  TBotsManifestItem[] | null
> => {
  try {
    const hostname = window.location.hostname.toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const override = (urlParams.get("bots_domain") || "")
      .toLowerCase()
      .replace(/^www\./, "");
    const domain = (override || hostname).replace(/^www\./, "");

    const candidates = [
      {
        url: `/xml/${encodeURIComponent(domain)}/bots.json`,
        base: `/xml/${domain}/`,
      },
      { url: "/xml/default/bots.json", base: "/xml/default/" },
      { url: "/xml/bots.json", base: "/xml/" },
    ];

    for (const candidate of candidates) {
      const text = await fetchTextIfValid(candidate.url, {
        cache: "force-cache",
      });
      if (!text) {
        continue;
      }

      const data = JSON.parse(text) as TBotsManifestItem[];
      setXmlBase(candidate.base);
      return data;
    }

    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    return null;
  }
};
