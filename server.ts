import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

function parseSubstackPreloads(html: string) {
  const match = html.match(/window\._preloads\s*=\s*JSON\.parse\(("(?:(?:\\.|[^"\\])*)")\)/s);
  if (!match) {
    return null;
  }

  // Substack embeds preload data as JSON.parse("escaped JSON text").
  const jsonText = JSON.parse(match[1]);
  return JSON.parse(jsonText);
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Set up common headers to avoid Cloudflare blocking
  const fetchHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };

  /**
   * Fetch a Substack feed (recent posts)
   */
  app.get("/api/feed", async (req, res) => {
    const domain = req.query.domain;
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Missing or invalid domain" });
    }

    try {
      // First try the archive API endpoint
      const apiUrl = `https://${domain}/api/v1/archive?sort=new&limit=25`;
      const response = await fetch(apiUrl, { headers: fetchHeaders });
      
      const text = await response.text();
      
      // Check if it's actually JSON
      if (text.trim().startsWith("[") || text.trim().startsWith("{")) {
         return res.json(JSON.parse(text));
      }

      // If it returned HTML, fallback to scraping the archive page
      const archiveUrl = `https://${domain}/archive`;
      const archiveRes = await fetch(archiveUrl, { headers: fetchHeaders });
      const archiveHtml = await archiveRes.text();
      
      const data = parseSubstackPreloads(archiveHtml);
      if (data) {
        const posts = data.newPostsForArchive || data.feed || data.posts || data.recentPosts || [];
        return res.json(posts);
      }
      
      throw new Error(`Substack returned HTML instead of data, and fallback extraction failed. Status: ${response.status}`);
    } catch (error: any) {
      console.error("Feed error:", error);
      res.status(500).json({ error: error.message || "An error occurred fetching the feed" });
    }
  });

  /**
   * Fetch a specific Substack post
   */
  app.get("/api/post", async (req, res) => {
    const { domain, slug } = req.query;
    if (!domain || !slug || typeof domain !== "string" || typeof slug !== "string") {
      return res.status(400).json({ error: "Missing or invalid domain/slug" });
    }

    try {
      // Fetch the actual post HTML page instead of API to ensure we get it
      const postUrl = `https://${domain}/p/${slug}`;
      const response = await fetch(postUrl, { headers: fetchHeaders });
      const text = await response.text();

      // Check for _preloads in the HTML
      const data = parseSubstackPreloads(text);
      if (data) {
         const post = data.post || data.postDetail || (data.pub && data.pub.post);
         if (post) {
            return res.json(post);
         }
      }

      // Fallback: try the API endpoint if HTML scraping didn't find the post
      const apiUrl = `https://${domain}/api/v1/posts/${slug}`;
      const apiRes = await fetch(apiUrl, { headers: fetchHeaders });
      const apiText = await apiRes.text();
      
      if (apiText.trim().startsWith("{")) {
         return res.json(JSON.parse(apiText));
      }

      throw new Error(`Substack returned HTML, could not extract post data. Status: ${response.status}`);
    } catch (error: any) {
      console.error("Post error:", error);
      res.status(500).json({ error: error.message || "An error occurred fetching the post" });
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
