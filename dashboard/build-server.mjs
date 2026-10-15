import { build } from "esbuild";
await build({
  entryPoints: ["src/server/main.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  // jsonc-parser's UMD entry uses relative dynamic requires; bundle its ESM entry.
  mainFields: ["module", "main"],
  target: "node24",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
