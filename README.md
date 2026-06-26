# Historical Investigator MCP

A beginner-friendly [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that searches historical records from the [Library of Congress](https://www.loc.gov/) APIs.

Built with TypeScript, Node.js, the official `@modelcontextprotocol/sdk`, and `zod` for input validation.

## Setup

```bash
npm install
npm run build
```

## Running the server

The server communicates over stdio (standard for MCP):

```bash
npm start
```

## Cursor / MCP client configuration

Add this to your MCP settings (for example in Cursor):

```json
{
  "mcpServers": {
    "historical-investigator": {
      "command": "node",
      "args": ["/absolute/path/to/historical-investigator-mcp/dist/index.js"]
    }
  }
}
```

Replace the path with your local clone of this project.

## Tools

### 1. `search_historical_newspapers`

Search historical newspaper records from **Chronicling America** via the Library of Congress API.

| Parameter   | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| `query`     | string | yes      | Search keywords                      |
| `state`     | string | no       | US state name or abbreviation        |
| `dateStart` | string | no       | Start date (`YYYY-MM-DD`)            |
| `dateEnd`   | string | no       | End date (`YYYY-MM-DD`)              |
| `limit`     | number | no       | Max results (1–100, default 20)      |

**Example prompt:** “Search Chronicling America for articles about the San Francisco earthquake in California between 1906-04-01 and 1906-04-30.”

Uses the Chronicling America collection endpoint with:

- `q` — keyword search
- `fa=location:{state}` — state filter (e.g. `location:california`)
- `start_date` / `end_date` — date range (`YYYY-MM-DD`)
- `c` — result limit
- `fo=json` — JSON response

The response includes a **`requestUrl`** field with the exact LOC API URL used, which helps with debugging.

**Date filtering limitation:** The LOC API accepts `start_date` and `end_date`, but results are not always strictly limited to that range. You may see newspaper pages from nearby dates (or later years) when the search terms appear in OCR text. If you need an exact date window, check each result’s `date` field and filter client-side.

---

### 2. `get_newspaper_item`

Fetch metadata for a specific LOC item or resource.

| Parameter      | Type   | Required | Description                                      |
|----------------|--------|----------|--------------------------------------------------|
| `itemIdOrUrl`  | string | yes      | Item ID (e.g. `2014717546`) or full loc.gov URL  |

**Example prompt:** “Get metadata for LOC item 2014717546.”

---

### 3. `fetch_page_ocr_text`

Download raw OCR plain text from a URL (often found in item metadata).

| Parameter     | Type   | Required | Description                    |
|---------------|--------|----------|--------------------------------|
| `ocrTextUrl`  | string | yes      | URL to the OCR text file       |

**Example prompt:** “Fetch the OCR text from this URL: …”

Returns plain text. Errors are handled safely and reported back to the client.

---

### 4. `search_prints_and_photographs`

Search prints and photographs in the LOC collections.

| Parameter | Type   | Required | Description                     |
|-----------|--------|----------|---------------------------------|
| `query`   | string | yes      | Search keywords                 |
| `limit`   | number | no       | Max results (1–100, default 20) |

Uses: `https://www.loc.gov/photos/` with `fo=json`.

---

### 5. `search_maps`

Search map records in the LOC collections.

| Parameter | Type   | Required | Description                     |
|-----------|--------|----------|---------------------------------|
| `query`   | string | yes      | Search keywords                 |
| `limit`   | number | no       | Max results (1–100, default 20) |

Uses: `https://www.loc.gov/maps/` with `fo=json`.

---

### 6. `search_manuscripts`

Search manuscript records in the LOC collections.

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `query`   | string | yes      | Search keywords                |
| `limit`   | number | no       | Max results (1–25, default 10) |

Uses: `https://www.loc.gov/manuscripts/` with `fo=json`.

Returns trimmed fields: title, date, contributor, description, subjects, and item link.

---

### 7. `search_audio_recordings`

Search audio recordings in the LOC collections.

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `query`   | string | yes      | Search keywords                |
| `limit`   | number | no       | Max results (1–25, default 10) |

Uses: `https://www.loc.gov/audio/` with `fo=json`.

Returns trimmed fields: title, date, contributors, description, subjects, and item link.

---

### 8. `search_film_and_video`

Search film and video records in the LOC collections.

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `query`   | string | yes      | Search keywords                |
| `limit`   | number | no       | Max results (1–25, default 10) |

Uses: `https://www.loc.gov/film-and-videos/` with `fo=json`.

Returns trimmed fields: title, date, contributors, description, subjects, and item link.

---

### 9. `get_item_resources`

Fetch a specific LOC item or resource and return digital files when available.

| Parameter      | Type   | Required | Description                                           |
|----------------|--------|----------|-------------------------------------------------------|
| `itemIdOrUrl`  | string | yes      | Item ID, resource path, or full loc.gov URL           |

Returns title, date, item link, resources/files/images/OCR links when present. If nothing is digitized, returns a helpful message.

---

### 10. `compare_historical_sources`

Compare two LOC records side by side using metadata only (no AI summarization).

| Parameter       | Type   | Required | Description                          |
|-----------------|--------|----------|--------------------------------------|
| `itemIdOrUrl1`  | string | yes      | First item ID or full loc.gov URL    |
| `itemIdOrUrl2`  | string | yes      | Second item ID or full loc.gov URL   |

Returns both records (title, date, location, contributors, subjects, description, link) plus a comparison object with `same_year`, `shared_subjects`, and `source_types`.

## Project structure

```
historical-investigator-mcp/
├── src/
│   └── index.ts      # MCP server and LOC API helpers
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

## API notes

- All LOC requests use `fo=json` for JSON responses.
- Newspaper searches use `q`, optional `fa=location:...`, and optional `start_date` / `end_date` on the Chronicling America collection endpoint.
- Photo and map searches use the `/photos/` and `/maps/` format endpoints with `q` and `c`.
- Manuscript, audio, and film searches use `/manuscripts/`, `/audio/`, and `/film-and-videos/` with trimmed result fields.
- `get_item_resources` and `compare_historical_sources` fetch item metadata with `fo=json`.
- No API key is required for the public LOC JSON/YAML API.
- State values can be full names (`California`) or abbreviations (`CA`); both are normalized to LOC location facets.

## License

MIT
