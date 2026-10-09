import type {BunPlugin} from "bun"

export default {
  name: "dependency-plugin",
  async setup(build) {
    Object.assign(globalThis, {__fixtureDependencyCompiler: process.pid})
    await Bun.write("../dependency-compiler.json", JSON.stringify({pid: process.pid, target: build.config.target}))
    build.onLoad({filter: /main\/index\.ts$/}, async ({path}) => ({
      contents: `${await Bun.file(path).text()}\nexport const compiledByDependency = "public-compiler"\n`,
      loader: "ts",
    }))
  },
} satisfies BunPlugin
