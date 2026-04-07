import {serve} from "bun"
import indexHtml from "./index.html"

const dark = new Worker("./dark.ts")

const server = serve({
  port: 4444,
  routes: {
    "/": indexHtml
  }
})
console.log(`server running on https://${server.hostname}:${server.port}`)