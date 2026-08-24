import {join} from "node:path"
import {
  currentServerProcessIdentity,
  serverProcessReady,
} from "../../shared/package/process"
import {getPackage, getRelease} from "./http/delivery"
import {publishRelease} from "./release/update"
import {recoverPublication} from "./release/publication"
import {
  closeRpc,
  messageRpc,
  openRpc,
  rpcServiceTopic,
  type RpcSocketData,
  upgradeRpc,
} from "./rpc"
import {cosmosRoot} from "./shared/paths"

const staticRoot = join(cosmosRoot, "static")
const assetsRoot = join(cosmosRoot, "assets")
const indexHtml = join(staticRoot, "index.html")

/** Создаёт единственный release-owned HTTP/WebSocket server Cosmos. */
export async function startReleaseServer(
  options: {port?: number} = {},
): Promise<Bun.Server<RpcSocketData>> {
  await recoverPublication()

  const server = Bun.serve<RpcSocketData>({
    ...(options.port === undefined ? {} : {port: options.port}),
    routes: {
      "/": Bun.file(indexHtml),
      "/manifest.webmanifest": Bun.file(join(staticRoot, "manifest.json"), {
        type: "application/manifest+json",
      }),
      "/assets/fonts/jetbrains-mono-bold.ttf": Bun.file(
        new URL(import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf")),
      ),
      "/assets/*": async (request: Request) => {
        const asset = new URL(request.url).pathname.slice("/assets/".length)
        if (!asset || asset.includes("%") || asset.split("/").some((part) =>
          !part || part === "." || part === "..")) return new Response(null, {status: 404})
        const file = Bun.file(join(assetsRoot, asset))
        if (!await file.exists()) return new Response(null, {status: 404})
        return new Response(file)
      },
      "/@cosmos/:module": {GET: getPackage},
      "/@internal/:module": {GET: getPackage},
      "/@metafor/:module": {GET: getPackage},
      "/code": {
        GET: getRelease,
        POST: (request: Request, current: Bun.Server<RpcSocketData>) => publishRelease(request, {
          topic: rpcServiceTopic,
          subscriberCount: () => current.subscriberCount(rpcServiceTopic),
          publish: (message) => current.publish(rpcServiceTopic, message),
        }),
      },
      "/sw": (request: Request, current: Bun.Server<RpcSocketData>) =>
        upgradeRpc(request, current),
      "/*": (request: Request) => {
        if (request.headers.get("Accept")?.includes("text/html"))
          return new Response(Bun.file(indexHtml))
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

  if (process.send) process.send(serverProcessReady(currentServerProcessIdentity()))
  return server
}

/** Запускает release server как самостоятельный exact package artifact. */
export async function runReleaseServer(): Promise<Bun.Server<RpcSocketData>> {
  const server = await startReleaseServer()
  const stop = () => server.stop(true)
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  return server
}
