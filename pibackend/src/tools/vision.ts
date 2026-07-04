import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { seedDir } from "../lib/paths";
import type { ToolPayload, ToolResult } from "../types";

export function verify(payload: ToolPayload): ToolResult {
  const observations = [];
  const citations = [];

  for (const attachment of payload.message.attachments) {
    if (attachment.kind !== "image") continue;
    const imagePath = resolve(join(seedDir, ".."), attachment.path);
    const captionPath = `${imagePath}.caption.txt`;
    const caption = existsSync(captionPath) ? readFileSync(captionPath, "utf8") : "No caption sidecar found.";
    observations.push({
      filename: attachment.filename,
      mode: "caption-stub",
      caption,
      risk_flags: riskFlags(caption)
    });
    citations.push({
      source: existsSync(captionPath) ? relative(join(seedDir, ".."), captionPath).replaceAll("\\", "/") : attachment.path,
      locator: "vision sidecar",
      quote: caption
    });
  }

  return { tool: "vision.verify", data: { observations }, citations };
}

function riskFlags(caption: string): string[] {
  const lowered = caption.toLowerCase();
  return ["mold", "filth", "active leak", "standing water", "pest"].filter((word) => lowered.includes(word));
}
