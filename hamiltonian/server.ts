import type {BunRequest} from "bun"
import {rpc, type RpcSocketData} from "@internal/rpc/routes"
import {rpcServiceTopic} from "@internal/rpc/server"
import {statics} from "./web/static/routes"
import {startups} from "./web/startup/routes"
import {imports} from "./web/import/routes"
import {buildPackage, type RebuildableModule} from "./build"

Bun.serve<RpcSocketData>({
  routes: {
    "/": statics.html,
    "/manifest.webmanifest": statics.manifest,
    "/assets/*": statics.assets,
    "/startup-main.js": startups.main,
    "/startup-service.js": startups.service,
    "/build": async (request: BunRequest<"/build">, server: Bun.Server<RpcSocketData>) => {
      if (request.method !== "POST") return new Response(null, {status: 405})

      let input: unknown
      try {
        input = await request.json()
      } catch {
        return new Response(null, {status: 400})
      }

      if (typeof input !== "object" || input === null || !("module" in input))
        return new Response(null, {status: 400})

      switch (input.module) {
        case "@import/main":
        case "@import/service":
        case "@internal/rpc":
          return await buildModule(input.module, server)
        default:
          return new Response(null, {status: 404})
      }
    },
    "/import/:module": ({params, method}: BunRequest<"/import/:module">) => {
      switch (params.module) {
        case "main": {
          if (method === "GET") return imports.main()
          else return new Response(null, {status: 405})
        }
        case "service": {
          if (method === "GET") return imports.service()
          else return new Response(null, {status: 405})
        }
        default:
          return new Response(null, {status: 404})
      }
    },
    "/internal/:module": ({params, method}: BunRequest<"/internal/:module">) => {
      switch (params.module) {
        case "rpc": {
          if (method === "GET") return rpc.service()
          else return new Response(null, {status: 405})
        }
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

async function buildModule(
  module: RebuildableModule,
  server: Bun.Server<RpcSocketData>,
) {
  const result = await buildPackage(module)
  if (!result.success) return Response.json(result, {status: 422})

  server.publish(rpcServiceTopic, JSON.stringify({type: "build", module}))
  return Response.json(result)
}
