import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses user input (URL or handle) and extracts the Substack domain and post slug.
 */
export function parseSubstackInput(input: string): { domain: string; slug: string | null } | null {
  input = input.trim();
  if (!input) return null;

  // Fix corrupted protocols from URL paths like https:/domain...
  if (input.startsWith("http:/") && !input.startsWith("http://")) {
    input = input.replace("http:/", "http://");
  }
  if (input.startsWith("https:/") && !input.startsWith("https://")) {
    input = input.replace("https:/", "https://");
  }

  let urlStr = input;
  
  // If it doesn't start with a protocol, assume it's a domain or handle
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    if (input.includes("/")) {
      urlStr = "https://" + input;
    } else if (input.includes(".")) {
      urlStr = "https://" + input;
    } else {
      urlStr = `https://${input}.substack.com`;
    }
  }

  try {
    const url = new URL(urlStr);
    const domain = url.hostname;
    
    // Attempt to extract slug if it's a post url (/p/[slug])
    const pathParts = url.pathname.split("/").filter(Boolean);
    let slug = null;
    
    if (pathParts[0] === "p" && pathParts[1]) {
      slug = pathParts[1];
    } else if (pathParts.length === 1 && domain !== "substack.com") {
      // Some custom setups might just have /slug, but Substack specifically uses /p/slug.
      // We will stick to /p/slug detection for safety, otherwise load the feed.
    }

    return { domain, slug };
  } catch (e) {
    return null;
  }
}
