import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { getFeed } from "./server/feed";
import { getPost, validateArticleUrl } from "./server/post";
import { getArchiveCandidate, meetsGainThreshold } from "./server/platforms/archive";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  /**
   * Fetch a publication's recent posts (Substack, Ghost, or Medium -- whichever
   * platform cascade matches first). Platforms with no reliable feed convention
   * (beehiiv, homegrown blogs) report platform: null rather than erroring.
   */
  app.get("/api/feed", async (req, res) => {
    const domain = req.query.domain;
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Missing or invalid domain" });
    }

    try {
      const result = await getFeed(domain);
      res.json(result);
    } catch (error: any) {
      console.error("Feed error:", error);
      res.status(500).json({ error: error.message || "An error occurred fetching the feed" });
    }
  });

  /**
   * Fetch a single article by its full URL. Tries Substack's structured extraction
   * first, then falls back to generic Readability-based extraction for everything
   * else (Ghost, Medium, beehiiv, homegrown blogs).
   */
  app.get("/api/post", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing or invalid url" });
    }

    try {
      validateArticleUrl(url);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const post = await getPost(url);
      if (!post) {
        return res.status(404).json({ error: "Could not extract an article from this URL." });
      }
      res.json(post);
    } catch (error: any) {
      console.error("Post error:", error);
      res.status(500).json({ error: error.message || "An error occurred fetching the post" });
    }
  });

  /**
   * Background archive.is lookup for a post the client already flagged as
   * paywalled/thin/failed (see archiveWorthChecking on /api/post). Only returns a
   * candidate when it's substantially fuller than what the client already has --
   * see meetsGainThreshold.
   */
  app.get("/api/archive", async (req, res) => {
    const { url, originalLength } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing or invalid url" });
    }

    try {
      validateArticleUrl(url);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    const originalTextLength = Number(originalLength) || 0;

    try {
      const candidate = await getArchiveCandidate(url);
      if (!candidate || !meetsGainThreshold(candidate.textLength, originalTextLength)) {
        return res.status(204).end();
      }
      res.json(candidate);
    } catch (error: any) {
      console.error("Archive lookup error:", error);
      res.status(204).end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
