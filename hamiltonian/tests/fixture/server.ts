import type {BunRequest} from "bun"
import {rpc, type RpcSocketData} from "@internal/rpc/routes"
import {imports} from "../../web/import/routes"
import {startups} from "../../web/startup/routes"
import {statics} from "../../web/static/routes"

type Fault = "none" | "import-service-http-once" | "internal-invalid-once"

const fault = (process.env.LOAD_TEST_FAULT ?? "none") as Fault
const port = Number(process.env.LOAD_TEST_PORT)

if (!Number.isInteger(port) || port <= 0) throw new Error("LOAD_TEST_PORT is required")

const requests = {
  importMain: 0,
  importService: 0,
  internalRpc: 0,
}

const javascriptHeaders = {"Content-Type": "text/javascript; charset=utf-8"}

const server = Bun.serve<RpcSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/": statics.html,
    "/manifest.webmanifest": statics.manifest,
    "/assets/*": statics.assets,
    "/startup-main.js": startups.main,
    "/startup-service.js": startups.service,
    "/import/:module": (request: BunRequest<"/import/:module">) => {
      switch (request.params.module) {
        case "main":
          requests.importMain += 1
          return imports.main()
        case "service":
          requests.importService += 1
          if (fault === "import-service-http-once" && requests.importService === 1) {
            return new Response("Service importer unavailable", {
              status: 503,
              headers: javascriptHeaders,
            })
          }
          return imports.service()
        default:
          return new Response(null, {status: 404})
      }
    },
    "/internal/:module": (request: BunRequest<"/internal/:module">) => {
      switch (request.params.module) {
        case "rpc":
          requests.internalRpc += 1
          if (fault === "internal-invalid-once" && requests.internalRpc === 1) {
            return new Response(")", {headers: javascriptHeaders})
          }
          return rpc.service()
        default:
          return new Response(null, {status: 404})
      }
    },
    "/sw": rpc.sw,
    "/__tests/state": () => Response.json({fault, requests}),
  },
  fetch(request) {
    if (request.method === "GET" && request.headers.get("Accept")?.includes("text/html"))
      return statics.html.clone()
    return new Response(null, {status: 404})
  },
  websocket: rpc.websocket,
})

console.info(JSON.stringify({event: "ready", port: server.port, fault}))
