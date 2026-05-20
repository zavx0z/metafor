import type {BunPlugin} from "bun"

const wgslTextPlugin: BunPlugin = {
  name: "wgsl-text",
  setup(build) {
    build.onLoad({filter: /\.wgsl$/}, async (args) => ({
      contents: `export default ${JSON.stringify(await Bun.file(args.path).text())};`,
      loader: "js",
    }))
  },
}

export default wgslTextPlugin
