import fs from "node:fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * Vite's preview server (used while prerendering) attaches an stdin listener it
 * later removes; this sandbox's stdin has no `off`, which crashed the build
 * after every page was written. Vite skips that listener entirely under `CI`.
 */
process.env["CI"] = process.env["CI"] ?? "true";

/**
 * Two build targets:
 * - default (Spacefast and any other plain static host, including a bare
 *   `vite build` auto-detected from GitHub): no Cloudflare Worker entrypoint,
 *   just the prerendered HTML in `dist/client`.
 * - Lovable hosting: Cloudflare Worker output, so the published site and
 *   preview can serve requests. Enabled automatically inside Lovable's own
 *   environment (`LOVABLE` is set there) or explicitly via `LOVABLE_BUILD=1`.
 *   `STATIC_BUILD=1` always forces it off.
 *
 * The Cloudflare plugin is imported lazily and only for the Lovable target:
 * static hosts like Spacefast scan the repository and reject anything that
 * loads Cloudflare Worker tooling, so the plain build must not touch it.
 * For the same reason there is deliberately no `wrangler.jsonc` in the repo —
 * the Worker settings live inline in the plugin call below.
 */
const wantsWorkerOutput =
  process.env["STATIC_BUILD"] !== "1" &&
  (process.env["LOVABLE_BUILD"] === "1" || Boolean(process.env["LOVABLE"]));

/**
 * Every public, non-parameterized path to prerender. Parameterized routes
 * (/s/$token, /api/*) are deliberately excluded — they resolve at request
 * time against the Functions worker.
 */
function prerenderPages(): { path: string }[] {
  return [
    "/",
    "/library",
    "/licenses",
    "/docs/api",
    "/mcp-skills",
    "/superhuman-go-skills",
    "/chatgpt-skills",
    "/grok-skills",
    "/perplexity-skills",
    "/claude-skills",
    "/github-copilot-skills",
    "/cursor-skills",
    "/wordpress-skills",
  ].map((value) => ({ path: value }));
}

/**
 * The prerender step boots the built server from `dist/server/server.js`, while
 * the Cloudflare output is emitted as `dist/server/index.js`. This writes a
 * tiny re-export so both names resolve.
 */
function prerenderServerShim(): Plugin {
  return {
    name: "prerender-server-shim",
    enforce: "post",
    writeBundle(options) {
      const dir = options.dir;
      if (!dir || path.basename(dir) !== "server") return;
      if (!fs.existsSync(path.join(dir, "index.js"))) return;
      fs.writeFileSync(
        path.join(dir, "server.js"),
        'export * from "./index.js";\nexport { default } from "./index.js";\n',
      );
    },
  };
}

/**
 * Prerendered HTML also has to survive the Cloudflare build step, which
 * rewrites the client output directory. Keep each page in memory and flush it
 * into both the Nitro public output and `dist/client` once the build finished.
 */
const prerenderedHtml = new Map<string, string>();

function flushPrerenderedHtml(): void {
  if (prerenderedHtml.size === 0) return;
  const outDirs = [".output/public", process.env["TSS_CLIENT_OUTPUT_DIR"] ?? "dist/client"];
  for (const outDir of outDirs) {
    if (!fs.existsSync(path.resolve(outDir))) continue;
    for (const [pagePath, html] of prerenderedHtml) {
      // "/" must land on <outDir>/index.html: a leading slash would otherwise
      // resolve to the filesystem root and the home page would go missing.
      const relative = pagePath.replace(/^\/+|\/+$/g, "");
      const file = path.join(path.resolve(outDir), relative, "index.html");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
    }
  }
  prerenderedHtml.clear();
}

process.on("exit", flushPrerenderedHtml);

export default defineConfig(async ({ command }) => {
  const pages = command === "build" ? prerenderPages() : [];
  // The workerd runtime isn't available for the dev server, so the Cloudflare
  // plugin is build-only — and only for the Lovable-hosting target.
  const useCloudflare = command === "build" && wantsWorkerOutput;
  const cloudflarePlugins = useCloudflare
    ? (await import("@cloudflare/vite-plugin")).cloudflare({
        viteEnvironment: { name: "ssr" },
        // Inline replacement for the deleted wrangler.jsonc (see note above).
        config: {
          name: "skill-finder",
          compatibility_date: "2025-09-24",
          compatibility_flags: ["nodejs_compat"],
          main: "@tanstack/react-start/server-entry",
        },
      })
    : [];

  return {
    server: {
      host: "::",
      port: 8080,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      ...cloudflarePlugins,
      tanstackStart({
        pages,
        prerender: {
          enabled: command === "build",
          crawlLinks: false,
          autoStaticPathsDiscovery: false,
          onSuccess: ({ page, html }: { page: { path: string }; html: string }) => {
            prerenderedHtml.set(page.path, html);
          },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts (our
        // SSR error wrapper). Both build targets build from this.
        server: { entry: "server" },
      }),
      viteReact(),
      ...(useCloudflare ? [prerenderServerShim()] : []),
    ],
  };
});
