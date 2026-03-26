import { serve, build, file } from "bun"
import { join, normalize } from "path"
import index from "./index.html"

const ROOT = normalize(join(import.meta.dir, "../../"))

const server = serve({
  routes: {
    "/": index,
    "/dark.js": async () =>
      new Response((await build({ entrypoints: [join(ROOT, "dark/web.ts")] })).outputs[0], {
        headers: { "Content-Type": "application/javascript" },
      }),
    "/boundary.js": async () =>
      new Response((await build({ entrypoints: [join(ROOT, "boundary/web.ts")] })).outputs[0], {
        headers: { "Content-Type": "application/javascript" },
      }),
    "/github/*": (req) =>
      new Response(file(join(ROOT, new URL(req.url).pathname)), {
        headers: { "Content-Type": "application/json" },
      }),
  },
})

console.log(`https://${server.hostname}:${server.port}`)
