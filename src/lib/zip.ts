import JSZip from "jszip";

import type { SkillFile } from "./api-client";

/** Builds a flat zip of markdown files and triggers a browser download. */
export async function downloadSkillsZip(files: SkillFile[], zipName = "skills.zip"): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = zipName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
