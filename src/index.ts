import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const LOC_BASE = "https://www.loc.gov";

// --- Helper functions for Library of Congress API requests ---

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`LOC API request failed (${response.status}): ${url}`);
  }

  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/plain, */*" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch text (${response.status}): ${url}`);
  }

  return response.text();
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(path, LOC_BASE);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("fo", "json");
  return url.toString();
}

function formatSearchResults(data: unknown, requestUrl?: string): string {
  const parsed = z
    .object({
      results: z.array(z.record(z.unknown())).optional(),
      pagination: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(data);

  if (!parsed.success) {
    return JSON.stringify(requestUrl ? { requestUrl, data } : data, null, 2);
  }

  const summary: Record<string, unknown> = {
    pagination: parsed.data.pagination ?? null,
    count: parsed.data.results?.length ?? 0,
    results: parsed.data.results ?? [],
  };

  if (requestUrl) {
    summary.requestUrl = requestUrl;
  }

  return JSON.stringify(summary, null, 2);
}

// Map common US state abbreviations to LOC location facet values (lowercase).
const US_STATE_FACETS: Record<string, string> = {
  al: "alabama",
  ak: "alaska",
  az: "arizona",
  ar: "arkansas",
  ca: "california",
  co: "colorado",
  ct: "connecticut",
  de: "delaware",
  dc: "district of columbia",
  fl: "florida",
  ga: "georgia",
  hi: "hawaii",
  id: "idaho",
  il: "illinois",
  in: "indiana",
  ia: "iowa",
  ks: "kansas",
  ky: "kentucky",
  la: "louisiana",
  me: "maine",
  md: "maryland",
  ma: "massachusetts",
  mi: "michigan",
  mn: "minnesota",
  ms: "mississippi",
  mo: "missouri",
  mt: "montana",
  ne: "nebraska",
  nv: "nevada",
  nh: "new hampshire",
  nj: "new jersey",
  nm: "new mexico",
  ny: "new york",
  nc: "north carolina",
  nd: "north dakota",
  oh: "ohio",
  ok: "oklahoma",
  or: "oregon",
  pa: "pennsylvania",
  ri: "rhode island",
  sc: "south carolina",
  sd: "south dakota",
  tn: "tennessee",
  tx: "texas",
  ut: "utah",
  vt: "vermont",
  va: "virginia",
  wa: "washington",
  wv: "west virginia",
  wi: "wisconsin",
  wy: "wyoming",
};

function normalizeLocationFacet(state: string): string {
  const trimmed = state.trim().toLowerCase();
  return US_STATE_FACETS[trimmed] ?? trimmed;
}

function buildNewspaperSearchParams(
  query: string,
  limit: number,
  state?: string,
  dateStart?: string,
  dateEnd?: string
): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {
    q: query,
    c: limit,
  };

  if (state) {
    params.fa = `location:${normalizeLocationFacet(state)}`;
  }
  if (dateStart) {
    params.start_date = dateStart;
  }
  if (dateEnd) {
    params.end_date = dateEnd;
  }

  return params;
}

function resolveItemUrl(itemIdOrUrl: string): string {
  const trimmed = itemIdOrUrl.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    url.searchParams.set("fo", "json");
    return url.toString();
  }

  const id = trimmed.replace(/^\/+|\/+$/g, "");
  return buildUrl(`/item/${id}/`, {});
}

function resolveItemOrResourceUrl(itemIdOrUrl: string): string {
  const trimmed = itemIdOrUrl.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    url.searchParams.set("fo", "json");
    return url.toString();
  }

  const path = trimmed.replace(/^\/+|\/+$/g, "");

  if (path.startsWith("resource/")) {
    return buildUrl(`/${path}/`, {});
  }
  if (path.startsWith("item/")) {
    return buildUrl(`/${path}/`, {});
  }
  if (path.includes("/")) {
    return buildUrl(`/resource/${path}/`, {});
  }

  return buildUrl(`/item/${path}/`, {});
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}

function formatCatalogHit(record: Record<string, unknown>): Record<string, unknown> {
  const item = (record.item as Record<string, unknown> | undefined) ?? {};

  const contributors = asStringArray(
    record.contributor ?? item.contributors ?? item.contributor_names ?? item.creators
  );
  const description = asStringArray(
    record.description ?? item.description ?? item.summary ?? item.notes
  );
  const subjects = asStringArray(record.subject ?? item.subjects ?? item.subject_headings);

  return {
    title: record.title ?? item.title ?? null,
    date: record.date ?? item.date ?? item.date_issued ?? null,
    contributor: contributors.length ? contributors : null,
    description: description.length ? description : null,
    subjects: subjects.length ? subjects : null,
    link: record.url ?? record.id ?? item.link ?? null,
  };
}

function formatCatalogSearchResults(data: unknown, requestUrl?: string): string {
  const parsed = z
    .object({
      results: z.array(z.record(z.unknown())).optional(),
      pagination: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(data);

  if (!parsed.success) {
    return JSON.stringify(requestUrl ? { requestUrl, data } : data, null, 2);
  }

  const summary: Record<string, unknown> = {
    pagination: parsed.data.pagination ?? null,
    count: parsed.data.results?.length ?? 0,
    results: (parsed.data.results ?? []).map((record) => formatCatalogHit(record)),
  };

  if (requestUrl) {
    summary.requestUrl = requestUrl;
  }

  return JSON.stringify(summary, null, 2);
}

function extractYear(dateValue: unknown): string | null {
  if (typeof dateValue !== "string") {
    return null;
  }

  const match = dateValue.match(/\d{4}/);
  return match ? match[0] : null;
}

function extractItemMetadata(data: unknown): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(data);
  if (!parsed.success) {
    return { error: "Could not parse item metadata" };
  }

  const raw = parsed.data;
  const item = (raw.item as Record<string, unknown> | undefined) ?? raw;

  const contributors = asStringArray(
    raw.contributor ?? item.contributors ?? item.contributor_names ?? item.creators
  );
  const description = asStringArray(
    raw.description ?? item.description ?? item.summary ?? item.notes
  );
  const subjects = asStringArray(raw.subject ?? item.subjects ?? item.subject_headings);
  const location = asStringArray(raw.location ?? item.location);
  const sourceTypes = asStringArray(raw.original_format ?? item.format ?? raw.type);

  return {
    title: raw.title ?? item.title ?? null,
    date: raw.date ?? item.date ?? item.date_issued ?? null,
    location: location.length ? location : null,
    contributors: contributors.length ? contributors : null,
    subjects: subjects.length ? subjects : null,
    description: description.length ? description : null,
    link: raw.url ?? raw.id ?? item.link ?? null,
    source_types: sourceTypes.length ? sourceTypes : null,
  };
}

function collectResourceLinks(data: Record<string, unknown>): string[] {
  const links = new Set<string>();

  const addLink = (value: unknown): void => {
    if (typeof value === "string" && value.startsWith("http")) {
      links.add(value);
    }
  };

  for (const url of asStringArray(data.image_url)) {
    addLink(url);
  }

  addLink(data.fulltext_service);
  addLink(data.fulltext_file);
  addLink(data.word_coordinates_url);

  const page = data.page as Record<string, unknown> | undefined;
  if (page) {
    addLink(page.fulltext_file);
    addLink(page.fulltext_service);
  }

  if (Array.isArray(data.resources)) {
    for (const resource of data.resources) {
      if (typeof resource !== "object" || resource === null) {
        continue;
      }

      const entry = resource as Record<string, unknown>;
      addLink(entry.url);
      addLink(entry.image);
      addLink(entry.fulltext_file);
      addLink(entry.fulltext_service);
      addLink(entry.word_coordinates);
    }
  }

  return [...links];
}

function extractItemResources(data: unknown): Record<string, unknown> {
  const metadata = extractItemMetadata(data);
  const parsed = z.record(z.string(), z.unknown()).safeParse(data);

  if (!parsed.success) {
    return metadata;
  }

  const raw = parsed.data;
  const resources = Array.isArray(raw.resources) ? raw.resources : [];
  const images = asStringArray(raw.image_url);
  const resourceLinks = collectResourceLinks(raw);
  const hasResources = resources.length > 0 || images.length > 0 || resourceLinks.length > 0;

  return {
    ...metadata,
    resources: resources.length ? resources : null,
    images: images.length ? images : null,
    resource_links: resourceLinks.length ? resourceLinks : null,
    message: hasResources
      ? null
      : "No digital resource files, images, or OCR links were found for this item.",
  };
}

function compareHistoricalMetadata(
  item1: Record<string, unknown>,
  item2: Record<string, unknown>
): Record<string, unknown> {
  const year1 = extractYear(item1.date);
  const year2 = extractYear(item2.date);

  const subjects1 = new Set(
    asStringArray(item1.subjects).map((subject) => subject.toLowerCase())
  );
  const subjects2 = asStringArray(item2.subjects).map((subject) => subject.toLowerCase());
  const sharedSubjects = subjects2.filter((subject) => subjects1.has(subject));

  return {
    same_year: year1 && year2 ? year1 === year2 : null,
    shared_subjects: [...new Set(sharedSubjects)],
    source_types: {
      item1: item1.source_types ?? null,
      item2: item2.source_types ?? null,
    },
  };
}

// --- MCP server setup ---

const server = new McpServer({
  name: "historical-investigator-mcp",
  version: "1.1.0",
});

server.registerTool(
  "search_historical_newspapers",
  {
    description:
      "Search historical newspaper records from Chronicling America via the Library of Congress API.",
    inputSchema: {
      query: z.string().describe("Search keywords"),
      state: z.string().optional().describe("US state name or abbreviation to filter by"),
      dateStart: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      dateEnd: z.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
  },
  async ({ query, state, dateStart, dateEnd, limit }) => {
    try {
      const params = buildNewspaperSearchParams(
        query,
        limit ?? 20,
        state,
        dateStart,
        dateEnd
      );
      const url = buildUrl("/collections/chronicling-america/", params);
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: formatSearchResults(data, url) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching newspapers: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_newspaper_item",
  {
    description: "Fetch metadata for a specific Library of Congress newspaper or item record.",
    inputSchema: {
      itemIdOrUrl: z
        .string()
        .describe("Item ID (e.g. 2014717546) or full loc.gov item/resource URL"),
    },
  },
  async ({ itemIdOrUrl }) => {
    try {
      const url = resolveItemUrl(itemIdOrUrl);
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error fetching item: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "fetch_page_ocr_text",
  {
    description: "Fetch raw OCR text from a supplied text URL (plain text).",
    inputSchema: {
      ocrTextUrl: z.string().url().describe("URL to the OCR plain-text file"),
    },
  },
  async ({ ocrTextUrl }) => {
    try {
      const text = await fetchText(ocrTextUrl);

      return {
        content: [{ type: "text", text }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error fetching OCR text: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_prints_and_photographs",
  {
    description: "Search Library of Congress prints and photographs.",
    inputSchema: {
      query: z.string().describe("Search keywords"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const url = buildUrl("/photos/", {
        q: query,
        c: limit ?? 20,
      });
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: formatSearchResults(data) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching photos: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_maps",
  {
    description: "Search Library of Congress map records.",
    inputSchema: {
      query: z.string().describe("Search keywords"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const url = buildUrl("/maps/", {
        q: query,
        c: limit ?? 20,
      });
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: formatSearchResults(data) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching maps: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_manuscripts",
  {
    description: "Search Library of Congress manuscript records.",
    inputSchema: {
      query: z.string().describe("Search keywords"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Max results (default 10, max 25)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const url = buildUrl("/manuscripts/", {
        q: query,
        c: limit ?? 10,
      });
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: formatCatalogSearchResults(data, url) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching manuscripts: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_audio_recordings",
  {
    description: "Search Library of Congress audio records.",
    inputSchema: {
      query: z.string().describe("Search keywords"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Max results (default 10, max 25)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const url = buildUrl("/audio/", {
        q: query,
        c: limit ?? 10,
      });
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: formatCatalogSearchResults(data, url) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching audio: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_film_and_video",
  {
    description: "Search Library of Congress film and video records.",
    inputSchema: {
      query: z.string().describe("Search keywords"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Max results (default 10, max 25)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const url = buildUrl("/film-and-videos/", {
        q: query,
        c: limit ?? 10,
      });
      const data = await fetchJson(url);

      return {
        content: [{ type: "text", text: formatCatalogSearchResults(data, url) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching film and video: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_item_resources",
  {
    description:
      "Fetch a LOC item and return available digital resource files, images, and OCR links when present.",
    inputSchema: {
      itemIdOrUrl: z
        .string()
        .describe("Item ID, resource path, or full loc.gov item/resource URL"),
    },
  },
  async ({ itemIdOrUrl }) => {
    try {
      const url = resolveItemOrResourceUrl(itemIdOrUrl);
      const data = await fetchJson(url);
      const result = {
        requestUrl: url,
        ...extractItemResources(data),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error fetching item resources: ${message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "compare_historical_sources",
  {
    description: "Compare two LOC source records side by side using metadata fields only.",
    inputSchema: {
      itemIdOrUrl1: z.string().describe("First item ID or full loc.gov URL"),
      itemIdOrUrl2: z.string().describe("Second item ID or full loc.gov URL"),
    },
  },
  async ({ itemIdOrUrl1, itemIdOrUrl2 }) => {
    try {
      const url1 = resolveItemUrl(itemIdOrUrl1);
      const url2 = resolveItemUrl(itemIdOrUrl2);
      const [data1, data2] = await Promise.all([fetchJson(url1), fetchJson(url2)]);
      const item1 = extractItemMetadata(data1);
      const item2 = extractItemMetadata(data2);

      const result = {
        item1: { requestUrl: url1, ...item1 },
        item2: { requestUrl: url2, ...item2 },
        comparison: compareHistoricalMetadata(item1, item2),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error comparing sources: ${message}` }],
        isError: true,
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
