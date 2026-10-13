// Stopper bygget hvis Supabase-nøkkelen med full tilgang (service/secret key) eller den private nøkkelen
// for TikTok-tokenet finnes i web/. Frontend skal bare bruke publishable-nøkkelen og lese schema dashboard
// som authenticated; web kan kryptere TikTok-tokenet (offentlig nøkkel), men aldri lese det.
// Kjøres automatisk før `npm run build` (prebuild) og i GitHub Actions.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipDirs = new Set(["node_modules", ".next", ".vercel", "out", "coverage"]);
// Mønstrene settes sammen, så denne filen ikke treffer seg selv.
const patterns = [
  "sb_" + "secret_",
  "SUPABASE_" + "SECRET_KEY",
  "SUPABASE_" + "SERVICE_ROLE",
  "service_" + "role",
  "TIKTOK_TOKEN_" + "PRIVATE_KEY",
];

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      if (text.includes(pattern)) hits.push(`${relative(root, path)}: ${pattern}`);
    }
  }
}

walk(root);
if (hits.length) {
  console.error("Fant spor av en nøkkel som ikke skal finnes i web/:");
  for (const hit of hits) console.error(`  ${hit}`);
  console.error("Frontend skal bare bruke publishable-nøkkelen og den offentlige TikTok-nøkkelen. Bygget stoppes.");
  process.exit(1);
}
console.log("Ingen spor av nøkler med full tilgang i web/.");
