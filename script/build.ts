import { join } from "path"
const rootPath = join(import.meta.dirname, "..")

const result = await Bun.build({
  entrypoints: [
    join(rootPath, "core", "index.ts"),
    join(rootPath, "schema", "index.ts"),
    join(rootPath, "web", "console.js"),
    join(rootPath, "server", "console.ts"),
  ],
  outdir: join(rootPath, "dist"),
  target: "browser",
  format: "esm",
  // sourcemap: dev ? "inline" : "none",
  sourcemap: "none",
  // minify: !dev,
  // external: [join(rootPath, "web", "console.js")],
  // external: ["spark-md5"],
  naming: "[dir]/[name].[ext]",
})

console.log(result.success ? "Build success" : "Build failed")
