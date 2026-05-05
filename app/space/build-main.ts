import { copyFileSync, rmSync } from "node:fs"
import { join } from "node:path"

const root = import.meta.dir
const outdir = join(root, "out")

rmSync(outdir, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [join(root, "electron/main.ts")],
  outdir,
  target: "node",
  format: "cjs",
  external: ["electron"],
  sourcemap: "linked",
  naming: { entry: "main.cjs" },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

// preload script ships as-is (CJS, requires electron at runtime)
copyFileSync(join(root, "electron/preload.cjs"), join(outdir, "preload.cjs"))

console.log(`[space] main + preload built → out/`)
