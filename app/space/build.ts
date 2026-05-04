import { rmSync } from "node:fs"
import { join } from "node:path"

const root = import.meta.dir
const outdir = join(root, "dist")

rmSync(outdir, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [join(root, "index.html")],
  outdir,
  target: "browser",
  minify: true,
  sourcemap: "linked",
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`[space] built ${result.outputs.length} files → dist/`)
