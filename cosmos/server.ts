import {
  closeRpc,
  getPackage,
  getRelease,
  messageRpc,
  openRpc,
  publishRelease,
  recoverPublication,
  rpcServiceTopic,
  type RpcSocketData,
  upgradeRpc
} from "@cosmos/release"
await recoverPublication()

Bun.serve<RpcSocketData>({
  routes: {
    "/": Bun.file(new URL("./static/index.html", import.meta.url)),
    "/manifest.webmanifest": Bun.file(new URL("./static/manifest.json", import.meta.url), {type: "application/manifest+json"}),
    "/assets/fonts/JetBrainsMono-Bold.ttf": Bun.file(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url)),
    "/assets/*": async (request: Request) => {
      const asset = new URL(request.url).pathname.slice("/assets/".length)
      if (!asset || asset.includes("%") || asset.split("/").some((part) => !part || part === "." || part === ".."))
        return new Response(null, {status: 404})
      const file = Bun.file(new URL(`./assets/${asset}`, import.meta.url))
      if (!await file.exists()) return new Response(null, {status: 404})
      return new Response(file)
    },
    "/@cosmos/:module": {GET: getPackage},
    "/@internal/:module": {GET: getPackage},
    "/@metafor/:module": {GET: getPackage},
    "/code": {
      GET: getRelease,
      POST: (request: Request, server: Bun.Server<RpcSocketData>) => publishRelease(request, {
        topic: rpcServiceTopic,
        subscriberCount: () => server.subscriberCount(rpcServiceTopic),
        publish: (message) => server.publish(rpcServiceTopic, message),
      }),
    },
    "/sw": (request: Request, server: Bun.Server<RpcSocketData>) => upgradeRpc(request, server),
    "/*": (request: Request) => {
      if (request.headers.get("Accept")?.includes("text/html"))
        return new Response(Bun.file(new URL("./static/index.html", import.meta.url)))
      return new Response(null, {status: 404})
    },
  },
  fetch: () => new Response(null, {status: 404}),
  websocket: {
    open: openRpc,
    message: messageRpc,
    close: closeRpc,
  },
})
