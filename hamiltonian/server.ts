import {rpcServiceTopic, sw, websocket, type RpcSocketData} from "@internal/rpc/server"
import {
  buildableModule,
  buildPackage,
  packageResponse,
  rebuildableModules,
  type RebuildableModule,
} from "./build"

Bun.serve<RpcSocketData>({
  routes: {
    "/": Bun.file(new URL("./web/static/index.html", import.meta.url)),
    "/manifest.webmanifest": Bun.file(new URL("./web/static/manifest.json", import.meta.url), {
      type: "application/manifest+json",
    }),
    "/assets/fonts/JetBrainsMono-Bold.ttf": Bun.file(
      new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
    "/assets/*": async (request: Request) => {
      const asset = new URL(request.url).pathname.slice("/assets/".length)
      if (asset.split("/").includes("..")) return new Response(null, {status: 404})
      const file = Bun.file(new URL(`./assets/${asset}`, import.meta.url))
      if (!await file.exists()) return new Response(null, {status: 404})
      return new Response(file)
    },
    "/code": {
      GET: (request: Request) => {
        const module = buildableModule(new URL(request.url).searchParams.get("module"))
        if (module === null) return new Response(null, {status: 404})
        return packageResponse(module)
      },
      POST: async (request: Request, server: Bun.Server<RpcSocketData>) => {
        const modules = await rebuildableModules(request)
        if (modules instanceof Response) return modules
        return await buildModules(modules, server)
      },
    },
    "/sw": sw,
    "/*": (request: Request) => {
      if (request.headers.get("Accept")?.includes("text/html"))
        return new Response(Bun.file(new URL("./web/static/index.html", import.meta.url)))
      return new Response(null, {status: 404})
    },
  },
  fetch: () => new Response(null, {status: 404}),
  websocket,
})

async function buildModules(
  modules: RebuildableModule[],
  server: Bun.Server<RpcSocketData>,
) {
  const results = await Promise.all(modules.map(buildPackage))
  const response = {success: results.every((result) => result.success), results}
  if (!response.success) return Response.json(response, {status: 422})

  server.publish(rpcServiceTopic, JSON.stringify({type: "build", modules}))
  return Response.json(response)
}
