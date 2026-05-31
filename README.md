# Unstack

A modern, distraction-free reader for Substack publications. Unstack gives you a clean, beautiful reading experience with elegant typography, seamless media handling, and intuitive native-like previews for your favorite Substack newsletters.

## Features

- **Distraction-Free Reading:** A minimalist, typography-focused aesthetic that puts the content front and center.
- **Beautiful Media Handling:** Custom parsing and safe rendering for complex Substack embeds including YouTube, Twitter, and native Substack videos.
- **Paywall Previews:** Elegantly styled placeholders for premium content blocks with clear paths to the original publication.
- **Substack Discovery:** View feeds and parse individual posts natively directly from an author's domain.

## Tech Stack

- **Frontend:** React 19, Tailwind CSS v4, Lucide React (for iconography), Motion (for smooth layout transitions and animations).
- **Backend:** Express API proxy for safely fetching Substack feeds while avoiding CORS issues.
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
