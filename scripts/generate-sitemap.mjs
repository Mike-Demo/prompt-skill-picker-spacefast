#!/usr/bin/env node
/**
 * Writes public/sitemap.xml for the static (SpaceFast) build.
 *
 * Mirrors the STATIC_ENTRIES list in src/routes/sitemap[.]xml.ts, which only
 * serves on the Lovable (server) target. Run before `vite build` so the file
 * lands in dist/client with the rest of public/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://skills.mikedemo.dev";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STATIC_ENTRIES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/library", changefreq: "weekly", priority: "0.8" },
  { path: "/claude-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/mcp-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/chatgpt-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/github-copilot-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/grok-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/perplexity-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/superhuman-go-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/cursor-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/wordpress-skills", changefreq: "weekly", priority: "0.8" },
  { path: "/docs/api", changefreq: "monthly", priority: "0.6" },
  { path: "/licenses", changefreq: "monthly", priority: "0.5" },
];

const lastmod = new Date().toISOString().slice(0, 10);

const urls = STATIC_ENTRIES.map((entry) =>
  [
    "  <url>",
    `    <loc>${BASE_URL}${entry.path}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    "  </url>",
  ].join("\n"),
);

const xml = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ...urls,
  `</urlset>`,
  "",
].join("\n");

const outFile = resolve(ROOT, "public", "sitemap.xml");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, xml);
console.log(`wrote ${outFile} (${STATIC_ENTRIES.length} urls, lastmod ${lastmod})`);
