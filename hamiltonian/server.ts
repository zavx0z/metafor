import {rpcServiceTopic, sw, websocket, type RpcSocketData} from "@internal/rpc/server"
import {buildableModule} from "./build"
import {
  packageChanges,
  publishPackages,
  releasedPackageResponse,
  releaseStateResponse,
  type PackageChange,
} from "./release"

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
        const url = new URL(request.url)
        const requestedModule = url.searchParams.get("module")
        if (requestedModule === null) return await releaseStateResponse()
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
        const response = await releasedPackageResponse(
          module,
          url.searchParams.get("version"),
        )
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
        const packages = await packageChanges(request)
        if (packages instanceof Response) {
          if (Bun.env.NODE_ENV === "development") {
            console.debug("[hamiltonian/server/code:update]", "запрос на обновление отклонён", {
              status: packages.status,
            })
          }
          return packages
        }
        if (Bun.env.NODE_ENV === "development") {
          console.debug("[hamiltonian/server/code:update]", "пакеты приняты для обновления", {
            packages,
          })
        }
        return await buildPackages(packages, server)
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

async function buildPackages(
  packages: PackageChange[],
  server: Bun.Server<RpcSocketData>,
) {
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/code:update]", "сборка пакетов началась", {packages})
  }
  const response = await publishPackages(packages)
  if (!response.success) {
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/code:update]", "сборка пакетов завершилась с ошибкой", {
        packages,
        results: response.results.map(({module, success, exitCode, outputs}) => ({
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
    console.debug("[hamiltonian/server/code:update]", "сборка и публикация пакетов завершены", {
      packages: response.packages,
      results: response.results.map(({module, success, exitCode, outputs}) => ({
        module,
        success,
        exitCode,
        outputs,
      })),
    })
  }
  const notification = JSON.stringify({type: "release", packages: response.packages})
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/code:update]", "отправляем уведомление об обновлении", {
      packages: response.packages,
      subscribers: server.subscriberCount(rpcServiceTopic),
      topic: rpcServiceTopic,
    })
    const sendStatus = server.publish(rpcServiceTopic, notification)
    console.debug("[hamiltonian/server/code:update]", "уведомление об обновлении отправлено", {
      packages: response.packages,
      sendStatus,
      topic: rpcServiceTopic,
    })
  } else {
    server.publish(rpcServiceTopic, notification)
  }
  return Response.json(response)
}
