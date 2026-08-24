import {file} from "bun"
import {fileURLToPath} from "node:url"
import {createVisualAnnotationApi} from "./AnnotationApi.ts"
import {createEdgeExampleApi} from "./EdgeExampleApi.ts"
import index from "./index.html"

const annotationApi = createVisualAnnotationApi(
  fileURLToPath(new URL("./.annotations", import.meta.url)),
)
const edgeExampleApi = createEdgeExampleApi(
  fileURLToPath(new URL("./.edge-examples", import.meta.url)),
)

const server = Bun.serve({
  hostname: Bun.env.VISUAL_HOST ?? "0.0.0.0",
  port: Number(Bun.env.VISUAL_PORT ?? 4014),
  // The client owns long-lived GPU devices, canvases and document listeners
  // that are disposed on a full page unload. Replacing its module graph in
  // place leaves both Bun's bundle IDs and those browser resources stale.
  development: {hmr: false},
  routes: {
    "/": index,
    "/engine-static/jetbrains-mono-bold.ttf": file(
      new URL(import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf")),
    ),
  },
  async fetch(request) {
    return await edgeExampleApi(request) ??
      await annotationApi(request) ??
      new Response("Not found", {status: 404})
  },
})

console.log(`Visual playground: ${server.url}`)
