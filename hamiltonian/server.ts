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
      GET: async (request: Request) => {
        const requestedModule = new URL(request.url).searchParams.get("module")
        if (Bun.env.NODE_ENV === "development") {
          console.debug("[hamiltonian/server/code:delivery]", "получен запрос клиентского модуля", {
            module: requestedModule,
          })
        }
        const module = await buildableModule(requestedModule)
        if (module === null) {
          if (Bun.env.NODE_ENV === "development") {
            console.debug("[hamiltonian/server/code:delivery]", "клиентский модуль не найден", {
              module: requestedModule,
              status: 404,
            })
          }
          return new Response(null, {status: 404})
        }
        const response = await packageResponse(module)
        if (Bun.env.NODE_ENV === "development") {
          console.debug("[hamiltonian/server/code:delivery]", "клиентский модуль готов к отправке", {
            module,
            status: response.status,
          })
        }
        return response
      },
      POST: async (request: Request, server: Bun.Server<RpcSocketData>) => {
        if (Bun.env.NODE_ENV === "development") {
          console.debug("[hamiltonian/server/code:update]", "получен запрос на обновление", {
            contentType: request.headers.get("Content-Type"),
            endpoint: new URL(request.url).pathname,
          })
        }
        const modules = await rebuildableModules(request)
        if (modules instanceof Response) {
          if (Bun.env.NODE_ENV === "development") {
            console.debug("[hamiltonian/server/code:update]", "запрос на обновление отклонён", {
              status: modules.status,
            })
          }
          return modules
        }
        if (Bun.env.NODE_ENV === "development") {
          console.debug("[hamiltonian/server/code:update]", "модули приняты для обновления", {modules})
        }
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
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/code:update]", "сборка модулей началась", {modules})
  }
  const results = await Promise.all(modules.map(buildPackage))
  const response = {success: results.every((result) => result.success), results}
  if (!response.success) {
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/code:update]", "сборка модулей завершилась с ошибкой", {
        modules,
        results: results.map(({module, success, exitCode, outputs}) => ({
          module,
          success,
          exitCode,
          outputs,
        })),
      })
    }
    return Response.json(response, {status: 422})
  }

  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/code:update]", "сборка модулей завершена", {
      modules,
      results: results.map(({module, success, exitCode, outputs}) => ({
        module,
        success,
        exitCode,
        outputs,
      })),
    })
  }
  const notification = JSON.stringify({type: "build", modules})
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/code:update]", "отправляем уведомление об обновлении", {
      modules,
      subscribers: server.subscriberCount(rpcServiceTopic),
      topic: rpcServiceTopic,
    })
    const sendStatus = server.publish(rpcServiceTopic, notification)
    console.debug("[hamiltonian/server/code:update]", "уведомление об обновлении отправлено", {
      modules,
      sendStatus,
      topic: rpcServiceTopic,
    })
  } else {
    server.publish(rpcServiceTopic, notification)
  }
  return Response.json(response)
}
