import {file} from "bun"
import {fileURLToPath} from "node:url"
import {createVisualAnnotationApi} from "./AnnotationApi.ts"
import index from "./index.html"

const annotationApi = createVisualAnnotationApi(
  fileURLToPath(new URL("./.annotations", import.meta.url)),
)

const server = Bun.serve({
  hostname: Bun.env.VISUAL_HOST ?? "0.0.0.0",
  port: Number(Bun.env.VISUAL_PORT ?? 4014),
  routes: {
    "/": index,
    "/engine-static/JetBrainsMono-Bold.ttf": file(
      new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
  },
  async fetch(request) {
    return await annotationApi(request) ??
      new Response("Not found", {status: 404})
  },
})

console.log(`Visual playground: ${server.url}`)
