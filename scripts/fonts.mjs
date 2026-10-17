// Copies the self-hosted web fonts (SIL Open Font License) from npm packages into public/fonts.
// Runs in CI before deploy. A missing font never fails the build: the CSS falls back to system fonts.
import { readdirSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const out = "public/fonts";
mkdirSync(out, { recursive: true });

const fonts = [
  { pkg: "@fontsource-variable/bricolage-grotesque", target: "bricolage.woff2" },
  { pkg: "@fontsource-variable/geist", target: "geist.woff2" },
];

for (const { pkg, target } of fonts) {
  const dir = join("node_modules", pkg, "files");
  if (!existsSync(dir)) { console.warn(`fonts: ${pkg} not installed, skipping`); continue; }
  const files = readdirSync(dir).filter((f) => f.endsWith(".woff2") && /-latin-/.test(f) && /normal/.test(f));
  const pick = files.find((f) => /wght-normal/.test(f)) ?? files.find((f) => /full-normal/.test(f)) ?? files[0];
  if (!pick) { console.warn(`fonts: no latin woff2 in ${pkg}`); continue; }
  copyFileSync(join(dir, pick), join(out, target));
  console.log(`fonts: ${pkg}/${pick} -> ${out}/${target}`);
}
