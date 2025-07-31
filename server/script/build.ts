import { join } from "path"
const rootPath = join(import.meta.dirname, "..", "..")

async function build(dev: boolean, distDir: string, entrypoint: string) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: distDir,
    target: "bun",
    sourcemap: "none",
    splitting: false,
    minify: !dev,
    naming: "[dir]/[name].[ext]",
  })

  console.log(result.success ? "Build success" : "Build failed")
}

if (import.meta.main) {
  const fileName = "metafor"
  const entrypoint = join(rootPath, "server", fileName + ".ts")
  const distDir = join(rootPath, "dist", "server")

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
