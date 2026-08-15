import type {BunRequest} from "bun"
import {rpc, type RpcSocketData} from "@internall/rpc/routes"
import {statics} from "./web/static/routes"
import {startups} from "./web/startup/routes"
import {imports} from "./web/import/routes"

Bun.serve<RpcSocketData>({
  routes: {
    "/": statics.html,
    "/manifest.webmanifest": statics.manifest,
    "/assets/*": statics.assets,
    "/startup-main.js": startups.main,
    "/startup-service.js": startups.service,
    "/import/:module": (request: BunRequest<"/import/:module">) => {
      switch (request.params.module) {
        case "main":
          return imports.main.clone()
        case "service":
          return imports.service.clone()
        default:
          return new Response(null, {status: 404})
      }
    },
    "/internal/:module": (request: BunRequest<"/internal/:module">) => {
      switch (request.params.module) {
        case "rpc":
          return rpc.service.clone()
        default:
          return new Response(null, {status: 404})
      }
    },
    "/sw": rpc.sw,
  },
  fetch(request) {
    if (request.method === "GET" && request.headers.get("Accept")?.includes("text/html"))
      return statics.html.clone()
    return new Response(null, {status: 404})
  },
  websocket: rpc.websocket,
})
