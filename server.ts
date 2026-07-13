import express from "express";
import path from "path";
import { readFile } from "fs/promises";
import { createServer as createViteServer } from "vite";
import { getFeed } from "./server/feed";
import { getPost, validateArticleUrl } from "./server/post";
import { getArchiveCandidate } from "./server/archive";
import {
  articleUrlForPreviewRequest,
  articleUrlFromPath,
  injectSocialPreview,
} from "./server/socialPreview";
import { cachePreviewPost, takePreviewPost } from "./server/previewPostCache";

function publicRequestUrl(req: express.Request): string {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return `${protocol}://${req.get("host")}${req.path}`;
}

async function addSocialPreview(html: string, req: express.Request): Promise<string> {
  const articleUrl = articleUrlForPreviewRequest(req.method, req.path);
  if (!articleUrl) return html;

  try {
    validateArticleUrl(articleUrl);
    const post = await getPost(articleUrl);
    if (!post) return html;

    cachePreviewPost(articleUrl, post);
    return injectSocialPreview(html, post, publicRequestUrl(req));
  } catch (error) {
    console.error("Social preview error:", error);
    return html;
  }
}

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
      const post = takePreviewPost(url) || await getPost(url);
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
   * Background multi-provider archive lookup for a post the client flagged as
   * paywalled/thin/failed (see archiveWorthChecking on /api/post). Only returns a
   * candidate when it is substantially fuller than what the client already has.
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
      const candidate = await getArchiveCandidate(url, originalTextLength);
      if (!candidate) {
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

    // Vite normally owns the HTML response in development. Intercept article
    // routes so their initial HTML contains the same metadata as production.
    app.use(async (req, res, next) => {
      if (!articleUrlForPreviewRequest(req.method, req.path)) return next();

      try {
        const source = await readFile(path.join(process.cwd(), "index.html"), "utf8");
        const transformed = await vite.transformIndexHtml(req.originalUrl, source);
        const html = await addSocialPreview(transformed, req);
        res.set("Cache-Control", "public, max-age=300").type("html").send(html);
      } catch (error) {
        next(error);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", async (req, res, next) => {
      try {
        const indexPath = path.join(distPath, "index.html");
        if (!articleUrlFromPath(req.path)) {
          return res.sendFile(indexPath);
        }

        const source = await readFile(indexPath, "utf8");
        const html = await addSocialPreview(source, req);
        res.set("Cache-Control", "public, max-age=300").type("html").send(html);
      } catch (error) {
        next(error);
      }
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
