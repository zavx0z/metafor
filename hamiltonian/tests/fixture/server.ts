import {rpcServiceTopic, sw, websocket, type RpcSocketData} from "@internal/rpc/server"
import {
  buildablePackage,
  packageResponse,
  packageChanges,
  releasedPackages,
  type ReleasablePackage,
  type ReleasedPackage,
  type VersionChange,
} from "../../web/release/server"

type Fault =
  | "none"
  | "release-service-http-once"
  | "internal-invalid-once"
  | "update-build-failure-once"
  | "update-fetch-failure-once"

const fault = (process.env.LOAD_TEST_FAULT ?? "none") as Fault
const port = Number(process.env.LOAD_TEST_PORT)

if (!Number.isInteger(port) || port <= 0) throw new Error("LOAD_TEST_PORT is required")

const requests = {
  releaseMain: 0,
  releaseService: 0,
  internalRpc: 0,
}
const revisions: Record<ReleasablePackage, number> = {
  "@release/main": 0,
  "@release/service": 0,
  "@internal/rpc": 0,
}
const versions = new Map((await releasedPackages()).map(({name, version}) => [name, version]))
let buildRequests = 0
let updateFetchFailures = 0
let connections = 0
const sockets = new Set<Bun.ServerWebSocket<RpcSocketData>>()

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
        const url = new URL(request.url)
        const requestedModule = url.searchParams.get("module")
        if (requestedModule === null) return Response.json({packages: fixturePackages()})
        const module = await buildablePackage(requestedModule)
        if (module === null) return new Response(null, {status: 404})

        switch (module) {
          case "@release/main":
            requests.releaseMain += 1
            return await artifactResponse(module)
          case "@release/service":
            requests.releaseService += 1
            if (fault === "release-service-http-once" && requests.releaseService === 1) {
              return new Response("Service release unavailable", {
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
            if (
              fault === "update-fetch-failure-once"
              && (revisions[module] ?? 0) > 0
              && url.searchParams.has("version")
              && updateFetchFailures++ === 0
            ) return new Response("Update artifact unavailable", {status: 503})
            return await artifactResponse(module)
          default:
            return packageResponse(module)
        }
      },
      POST: async (request: Request) => {
        const packages = await packageChanges(request)
        if (packages instanceof Response) return packages
        buildRequests += 1
        const failed = fault === "update-build-failure-once" && buildRequests === 1
        const results = packages.map(({name, change}, index) => ({
          module: name,
          change,
          previousVersion: versions.get(name)!,
          version: changedVersion(versions.get(name)!, change),
          success: !failed || index !== packages.length - 1,
          exitCode: !failed || index !== packages.length - 1 ? 0 : 1,
          stdout: "",
          stderr: !failed || index !== packages.length - 1 ? "" : "Fixture build failed",
          outputs: [],
        }))
        const success = results.every((result) => result.success)
        if (!success) return Response.json({success, results, packages: []}, {status: 422})

        for (const result of results) {
          versions.set(result.module, result.version)
          revisions[result.module] = (revisions[result.module] ?? 0) + 1
        }
        const released = results.map(({module}) => fixturePackage(module))
        server.publish(rpcServiceTopic, JSON.stringify({type: "release", packages: released}))
        return Response.json({success, results, packages: released})
      },
    },
    "/sw": sw,
    "/__tests/state": () => Response.json({connections, fault, requests}),
    "/__tests/rpc/close": {
      POST: () => {
        for (const socket of sockets) socket.close(1000, "fixture server restart")
        return new Response(null, {status: 204})
      },
    },
    "/*": (request: Request) => {
      if (request.headers.get("Accept")?.includes("text/html"))
        return new Response(Bun.file(new URL("../../web/static/index.html", import.meta.url)))
      return new Response(null, {status: 404})
    },
  },
  fetch: () => new Response(null, {status: 404}),
  websocket: {
    ...websocket,
    open(socket) {
      connections += 1
      sockets.add(socket)
      websocket.open!(socket)
    },
    close(socket, code, reason) {
      sockets.delete(socket)
      websocket.close!(socket, code, reason)
    },
  },
})

console.info(JSON.stringify({event: "ready", port: server.port, fault}))

async function artifactResponse(module: ReleasablePackage) {
  const response = await packageResponse(module)
  const revision = revisions[module] ?? 0
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.set("X-Package-Name", module)
  headers.set("X-Package-Version", versions.get(module)!)
  if (revision === 0) return new Response(response.body, {headers})
  const source = await response.text()
  return new Response(`${source}\nconsole.info(${JSON.stringify(`fixture ${module} ${revision}`)})`, {
    headers,
  })
}

function fixturePackages(): ReleasedPackage[] {
  return [...versions].map(([name]) => fixturePackage(name))
}

function fixturePackage(name: ReleasablePackage): ReleasedPackage {
  const version = versions.get(name)!
  return {
    name,
    version,
    endpoint: `/code?module=${name}&version=${version}`,
    cache: name.startsWith("@release/") ? "release" : "internal",
  }
}

function changedVersion(version: string, change: VersionChange) {
  let [major, minor, patch] = version.split(".").map(Number) as [number, number, number]
  if (change === "major") {
    major += 1
    minor = 0
    patch = 0
  } else if (change === "minor") {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}
