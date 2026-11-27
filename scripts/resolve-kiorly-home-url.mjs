// Prints the Kiorly Home URL for the web build (VITE_KIORLY_HOME_URL): the first origin of KIORLY_HOME_ORIGINS in the environment config
// (infra/config/kx-test.json, generated from the URL registry), so the Clinic login shows "Switch product". Prints nothing when none is configured.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "infra", "config");
const file = path.join(dir, process.env.KIORLY_ENV_CONFIG?.trim() || "kx-test.json");
try {
  const origins = String(JSON.parse(fs.readFileSync(file, "utf8")).env?.KIORLY_HOME_ORIGINS ?? "");
  const first = origins.split(",").map((s) => s.trim()).find((s) => /^https:\/\//.test(s));
  if (first) process.stdout.write(first);
} catch {
  /* no config: no link, the build still works */
}
