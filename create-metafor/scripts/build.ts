import { build } from "bun"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const root = join(__dirname, "..")
const src = join(root, "src")
const dist = join(root, "dist")

console.log("🔨 Building create-metafor...")

// Сборка CLI
console.log("  📦 CLI...")
await build({
  entrypoints: [join(src, "cli.ts")],
  outdir: dist,
  target: "node",
  minify: true,
  format: "esm",
})

// Сборка TUI
console.log("  📦 TUI...")
await build({
  entrypoints: [join(src, "tui", "tui.tsx")],
  outdir: dist,
  target: "node",
  minify: true,
  format: "esm",
})

// Сборка worker
console.log("  📦 Worker...")
await build({
  entrypoints: [join(src, "tui", "workers", "version-checker.ts")],
  outdir: join(dist, "workers"),
  target: "node",
  minify: true,
  format: "esm",
})

// Копирование templates
console.log("  📦 Templates...")
const { cp } = await import("fs/promises")
await cp(join(src, "..", "templates"), join(dist, "templates"), { recursive: true })

console.log("✅ Build complete!")
