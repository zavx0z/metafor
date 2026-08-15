import type {BunRequest} from "bun"
import routes from "./web/routes"
import {webRoute as rpcWeb} from "@internall/rpc/service/web/route"
import {
  routes as rpc,
  websocket,
  type RpcSocketData,
} from "@internall/rpc/server"

Bun.serve<RpcSocketData>({
  routes: {
    "/": routes.static.html,
    "/manifest.webmanifest": routes.static.manifest,
    "/assets/*": routes.static.assets,
    "/startup-main.js": routes.startup.main,
    "/startup-service.js": routes.startup.service,
    "/import-main.js": routes.import.main,
    "/import-service.js": routes.import.service,
    "/internal/:module": (request: BunRequest<"/internal/:module">) => {
      switch (request.params.module) {
        case "rpc":
          return rpcWeb
        default:
          return new Response(null, {status: 404})
      }
    },
    "/service": rpc.service,
  },
  fetch(request) {
    if (request.method === "GET" && request.headers.get("Accept")?.includes("text/html"))
      return routes.static.html.clone()
    return new Response(null, {status: 404})
  },
  websocket,
})
