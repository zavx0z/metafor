import {rpcServiceTopic, sw, websocket, type RpcSocketData} from "@internal/rpc/server"
import {releaseRoute} from "@release/server"

const code = releaseRoute<RpcSocketData>({
  topic: rpcServiceTopic,
  subscriberCount: (server) => server.subscriberCount(rpcServiceTopic),
  publish: (server, message) => server.publish(rpcServiceTopic, message),
})

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
    "/code": code,
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
