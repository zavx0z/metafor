import { join } from "path"
const rootPath = join(import.meta.dirname, "..", "..")

async function build(dev: boolean, distDir: string, entrypoint: string) {
  const result = await Bun.build({
    entrypoints: [entrypoint, join(rootPath, "web", "debug", "console.js")],
    outdir: distDir,
    target: "browser",
    format: "esm",
    sourcemap: dev ? "inline" : "none",
    splitting: false,
    minify: !dev,
    external: [join(rootPath, "web", "debug", "console.js")],
    naming: "[dir]/[name].[ext]",
  })

  console.log(result.success ? "Build success" : "Build failed")
}

if (import.meta.main) {
  const fileName = "metafor"
  const entrypoint = join(rootPath, "web", fileName + ".ts")
  const distDir = join(rootPath, "dist", "web")

  switch (process.argv[2]) {
    case "--dev":
      console.log("Building in development mode")
      await build(true, distDir, entrypoint)
      break
    case "--prod":
      console.log("Building in production mode")
      await build(false, distDir, entrypoint)
      break
    default:
      console.error("Usage: bun run build:js --dev|--prod")
      process.exit(1)
  }
}
