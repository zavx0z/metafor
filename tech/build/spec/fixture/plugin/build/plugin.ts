import type {BunPlugin} from "bun"

export default {
  name: "fixture-compiled-tsx",
  setup(build) {
    build.onLoad({filter: /\.tsx$/}, async ({path}) => {
      const source = await Bun.file(path).text()
      if (!source.includes("<button>Visual</button>")) throw new Error("Fixture TSX is missing")
      return {contents: 'export const view = "compiled-button"\n', loader: "js"}
    })
  },
} satisfies BunPlugin
