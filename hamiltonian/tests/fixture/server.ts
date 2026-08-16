import {rpcServiceTopic, sw, websocket, type RpcSocketData} from "@internal/rpc/server"
import {
  buildableModule,
  packageResponse,
  rebuildableModule,
  type RebuildableModule,
} from "../../build"

type Fault = "none" | "import-service-http-once" | "internal-invalid-once"

const fault = (process.env.LOAD_TEST_FAULT ?? "none") as Fault
const port = Number(process.env.LOAD_TEST_PORT)

if (!Number.isInteger(port) || port <= 0) throw new Error("LOAD_TEST_PORT is required")

const requests = {
  importMain: 0,
  importService: 0,
  internalRpc: 0,
}
const revisions: Record<RebuildableModule, number> = {
  "@import/main": 0,
  "@import/service": 0,
  "@internal/rpc": 0,
}

const javascriptHeaders = {"Content-Type": "text/javascript; charset=utf-8"}

const server = Bun.serve<RpcSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/": Bun.file(new URL("../../web/static/index.html", import.meta.url)),
    "/manifest.webmanifest": Bun.file(
      new URL("../../web/static/manifest.json", import.meta.url),
      {type: "application/manifest+json"},
    ),
    "/assets/fonts/JetBrainsMono-Bold.ttf": Bun.file(
      new URL("../../../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
    "/assets/*": async (request: Request) => {
      const asset = new URL(request.url).pathname.slice("/assets/".length)
      if (asset.split("/").includes("..")) return new Response(null, {status: 404})
      const file = Bun.file(new URL(`../../assets/${asset}`, import.meta.url))
      if (!await file.exists()) return new Response(null, {status: 404})
      return new Response(file)
    },
    "/code": {
      GET: (request: Request) => {
        const module = buildableModule(new URL(request.url).searchParams.get("module"))
        if (module === null) return new Response(null, {status: 404})

        switch (module) {
          case "@import/main":
            requests.importMain += 1
            return updatedArtifact(module) ?? packageResponse(module)
          case "@import/service":
            requests.importService += 1
            if (fault === "import-service-http-once" && requests.importService === 1) {
              return new Response("Service importer unavailable", {
                status: 503,
                headers: javascriptHeaders,
              })
            }
            return updatedArtifact(module) ?? packageResponse(module)
          case "@internal/rpc":
            requests.internalRpc += 1
            if (fault === "internal-invalid-once" && requests.internalRpc === 1) {
              return new Response(")", {headers: javascriptHeaders})
            }
            return updatedArtifact(module) ?? packageResponse(module)
          default:
            return packageResponse(module)
        }
      },
      POST: (request: Request) => {
        const module = rebuildableModule(new URL(request.url).searchParams.get("module"))
        if (module === null) return new Response(null, {status: 404})
        revisions[module] += 1
        server.publish(rpcServiceTopic, JSON.stringify({type: "build", module}))
        return Response.json({success: true, module})
      },
    },
    "/sw": sw,
    "/__tests/state": () => Response.json({fault, requests}),
    "/*": (request: Request) => {
      if (request.headers.get("Accept")?.includes("text/html"))
        return new Response(Bun.file(new URL("../../web/static/index.html", import.meta.url)))
      return new Response(null, {status: 404})
    },
  },
  fetch: () => new Response(null, {status: 404}),
  websocket,
})

console.info(JSON.stringify({event: "ready", port: server.port, fault}))

function updatedArtifact(module: RebuildableModule) {
  const revision = revisions[module]
  if (revision === 0) return null
  return new Response(`console.info(${JSON.stringify(`fixture ${module} ${revision}`)})`, {
    headers: javascriptHeaders,
  })
}
