# Unstack

A modern, distraction-free reader for newsletters and articles. Unstack gives you a clean, beautiful reading experience with elegant typography, seamless media handling, and intuitive native-like previews -- with first-class support for Substack, Ghost, and Medium, and best-effort reading for beehiiv and homegrown blogs via generic article extraction.

## Features

- **Distraction-Free Reading:** A minimalist, typography-focused aesthetic that puts the content front and center.
- **Beautiful Media Handling:** Custom parsing and safe rendering for complex embeds including YouTube, Twitter, and native Substack videos.
- **Paywall Previews:** Elegantly styled placeholders for premium content blocks with clear paths to the original publication.
- **Multi-Platform Feed Browsing:** View recent posts directly from a Substack, Ghost, or Medium domain.
- **Universal Article Reading:** Paste a direct article link from almost any platform -- including beehiiv and homegrown blogs -- and Unstack will extract a clean reading view via Mozilla's Readability, even without a dedicated feed integration.
- **Multi-Archive Rescue:** Thin, paywalled, or unreachable pages are checked against the Wayback Machine first and archive.is second. A substantially fuller capture can be read in Unstack, while the original remains one tap away.
- **Publisher Alternatives:** When the primary DOM is thin, Unstack can use publisher-declared JSON-LD article bodies, AMP/print pages, or a matching same-site RSS/Atom entry before consulting archives.

## Tech Stack

- **Frontend:** React 19, Tailwind CSS v4, Lucide React (for iconography), Motion (for smooth layout transitions and animations).
- **Backend:** Express API proxying feed and article fetches. Substack posts are read via its structured preload data; Ghost and Medium feeds are read via their standard RSS endpoints (`rss-parser`); any other article link falls back to generic extraction via `@mozilla/readability` + `jsdom`.
- **Parser:** `html-react-parser` combined with `dompurify` for secure and customizable transformation of raw HTML into polished React components.
- **Build Tool:** Vite + esbuild (for compiling the custom API and serving over a single port).

## Getting Started

### Prerequisites

Ensure you have Node.js installed.

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Variables

Before starting the app, copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

If you plan to utilize AI features down the road, you may populate `GEMINI_API_KEY` inside `.env`. `APP_URL` is also available for custom deployment domains.

Some publishers and archive services block requests from hosting-provider IP ranges. Unstack can optionally retry failed or challenged HTML requests through a proxy:

- `HTML_FETCH_PROXY_URL`: An HTTP(S) endpoint that returns the target page's raw HTML. It may accept the encoded target as a `url` query parameter (the default) or include a `{url}` placeholder in its configured URL.
- `HTML_FETCH_PROXY_TOKEN`: Optional bearer token sent only to the proxy endpoint.

Direct fetching remains the default and is always attempted first. For the scheduled GitHub drift probe, the same values can be configured as repository secrets. Without a proxy, hosting-network blocks are reported as `INCONCLUSIVE`; confirmed result-structure drift still fails the workflow.

Archive lookup is provider-neutral. Unstack uses the Wayback Machine's documented Availability API before attempting archive.is's HTML search page. Provider caches are independent, so a miss from one archive never suppresses another provider.

Successful, substantial original-source extractions and immutable archive hits are cached in memory for a fixed 48 hours. Thin/paywalled previews, failures, oversized bodies, and URLs with credential-like query parameters are excluded. Archive misses expire after one hour so newly-created captures can appear. The cache is process-local and is cleared by a deploy or Railway restart.

### Running locally

```bash
npm run dev
```

The application and development server will be available at `http://localhost:3000`.

### Production Build

To build the full-stack application (compiling both the React application and the Node/Express backend):

```bash
npm run build
```

Then start the built application:

```bash
npm start
```

## License

MIT
