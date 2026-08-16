import {rpcServiceTopic, sw, websocket, type RpcSocketData} from "@internal/rpc/server"
import {
  buildableModule,
  packageResponse,
  rebuildableModules,
  type RebuildableModule,
} from "../../build"

type Fault =
  | "none"
  | "import-service-http-once"
  | "internal-invalid-once"
  | "update-build-failure-once"

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
let buildRequests = 0

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
      GET: async (request: Request) => {
        const module = await buildableModule(new URL(request.url).searchParams.get("module"))
        if (module === null) return new Response(null, {status: 404})

        switch (module) {
          case "@import/main":
            requests.importMain += 1
            return await artifactResponse(module)
          case "@import/service":
            requests.importService += 1
            if (fault === "import-service-http-once" && requests.importService === 1) {
              return new Response("Service importer unavailable", {
                status: 503,
                headers: javascriptHeaders,
              })
            }
            return await artifactResponse(module)
          case "@internal/rpc":
            requests.internalRpc += 1
            if (fault === "internal-invalid-once" && requests.internalRpc === 1) {
              return new Response(")", {headers: javascriptHeaders})
            }
            return await artifactResponse(module)
          default:
            return packageResponse(module)
        }
      },
      POST: async (request: Request) => {
        const modules = await rebuildableModules(request)
        if (modules instanceof Response) return modules
        buildRequests += 1
        const failed = fault === "update-build-failure-once" && buildRequests === 1
        const results = modules.map((module, index) => ({
          module,
          success: !failed || index !== modules.length - 1,
          exitCode: !failed || index !== modules.length - 1 ? 0 : 1,
          stdout: "",
          stderr: !failed || index !== modules.length - 1 ? "" : "Fixture build failed",
          outputs: [],
        }))
        const success = results.every((result) => result.success)
        if (!success) return Response.json({success, results}, {status: 422})

        for (const module of modules) revisions[module] = (revisions[module] ?? 0) + 1
        server.publish(rpcServiceTopic, JSON.stringify({type: "build", modules}))
        return Response.json({success, results})
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

async function artifactResponse(module: RebuildableModule) {
  const response = await packageResponse(module)
  const revision = revisions[module] ?? 0
  if (revision === 0 || !response.ok) return response
  const source = await response.text()
  return new Response(`${source}\nconsole.info(${JSON.stringify(`fixture ${module} ${revision}`)})`, {
    headers: response.headers,
  })
}
