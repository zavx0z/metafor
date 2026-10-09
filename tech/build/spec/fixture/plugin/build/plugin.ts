import type {BunPlugin} from "bun"

export default {
  name: "fixture-compiled-tsx",
  async setup(build) {
    Object.assign(globalThis, {__fixtureCompilerPid: process.pid})
    const before = JSON.stringify(build.config)
    const rejected: string[] = []
    const mutations = [
      () => { build.config.target = "bun" },
      () => { build.config.entrypoints.push("./not-an-entry.ts") },
      () => { build.config.loader![".fixture"] = "json" },
    ]
    for (const mutate of mutations) {
      try { mutate() } catch (error) { rejected.push(String(error)) }
    }
    await Bun.write("../compiler.json", JSON.stringify({
      pid: process.pid,
      rejected,
      unchanged: before === JSON.stringify(build.config),
    }))
    build.onLoad({filter: /\.tsx$/}, async ({path}) => {
      const source = await Bun.file(path).text()
      if (!source.includes("<button>Visual</button>")) throw new Error("Fixture TSX is missing")
      return {contents: 'export const view = "compiled-button"\n', loader: "js"}
    })
  },
} satisfies BunPlugin
