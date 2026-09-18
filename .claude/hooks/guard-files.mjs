// PreToolUse guard: blocks edits Claude must never make directly.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import { readFileSync } from "node:fs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // never break the session on malformed input
}

const raw = input?.tool_input?.file_path ?? input?.tool_input?.path ?? "";
const path = String(raw).replaceAll("\\", "/");
if (!path) process.exit(0);

const rules = [
  { re: /\.(unity|prefab|asset|meta|controller|anim|mat|physicMaterial)$/i,
    why: "Unity YAML asset. Use Unity MCP tools or give the human exact Editor steps." },
  { re: /\/app-unity\/(ProjectSettings|Packages\/packages-lock\.json|Library|Temp|Logs|UserSettings)\//i,
    why: "Unity-managed folder. Change settings through the Editor (or Unity MCP)." },
  { re: /\/StreamingAssets\/content\//i,
    why: "Generated copy. Edit /content/ instead; the Editor import script copies it." },
  { re: /(^|\/)\.env(\.(?!example$)[^/]*)?$/i, why: "Secrets file. Edit .env.example and tell the human which variable to set." },
  { re: /\.(pem|key)$|\/keys\//i, why: "Key material must never be written by Claude." },
];

for (const r of rules) {
  if (r.re.test(path)) {
    console.error(`Blocked edit to ${raw}: ${r.why}`);
    process.exit(2);
  }
}
process.exit(0);
