#!/usr/bin/env node
/**
 * Copies the Nitro public output (.output/public) into dist/client after the
 * static build, so the Functions worker and any plain static host serve the
 * same files. Skips with a warning (does not fail) when the source directory
 * does not exist — the plain static build may never create it.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const source = resolve(ROOT, ".output", "public");
const dest = resolve(ROOT, process.env["TSS_CLIENT_OUTPUT_DIR"] ?? "dist/client");

if (!existsSync(source)) {
  console.warn(`copy-static-output: ${source} does not exist, skipping`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });
console.log(`copy-static-output: copied ${source} -> ${dest}`);
