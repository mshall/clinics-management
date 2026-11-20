// Copies the JSON specs the compiled demo seed reads at runtime (readFileSync next to __dirname) into dist-seed (Q10 Part B).
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "prisma", "demo");
const to = join(root, "dist-seed", "prisma", "demo");
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from).filter((n) => n.endsWith(".json"))) cpSync(join(from, f), join(to, f));
console.log("seed assets copied to dist-seed/prisma/demo");
