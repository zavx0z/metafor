import {
  buildablePackage,
  closeRpc,
  getPackage,
  messageRpc,
  openRpc,
  packageResponse,
  packageChanges,
  recoverPublication,
  releaseChangedMessage,
  releasedPackages,
  rpcServiceTopic,
  upgradeRpc,
  type RpcSocketData,
  type ReleasablePackage,
  type ReleasedPackage,
  type VersionChange,
} from "../../release/server"
import {
  parseBrowserPackageUrl,
} from "../../shared/package/url"
import {artifactIntegrity, packageIdentityHeaders} from "../../shared/package/integrity"
import type {BrowserPackageEnvironment} from "../../shared/package/environment"

type Fault =
  | "none"
  | "release-service-http-once"
  | "update-build-failure-once"
  | "update-fetch-failure-once"

const fault = (process.env.LOAD_TEST_FAULT ?? "none") as Fault
const port = Number(process.env.LOAD_TEST_PORT)

if (!Number.isInteger(port) || port <= 0) throw new Error("LOAD_TEST_PORT is required")

const requests = {
  internalVisual: 0,
  releaseMain: 0,
  releaseService: 0,
}
const revisions: Record<ReleasablePackage, number> = {
  "@internal/visual": 0,
  "@hamiltonian/release": 0,
}
const initialPackages = await fixtureInitialPackages()
const versions = new Map(initialPackages.map(({name, version}) => [name, version]))
const environments = new Map<ReleasablePackage, BrowserPackageEnvironment[]>()
for (const {name, env} of initialPackages) {
  const packageEnvironments = environments.get(name) ?? []
  packageEnvironments.push(env)
  environments.set(name, packageEnvironments)
}
let buildRequests = 0
let updateFetchFailures = 0
let connections = 0
const sockets = new Set<Bun.ServerWebSocket<RpcSocketData>>()

const javascriptHeaders = {"Content-Type": "text/javascript; charset=utf-8"}

const server = Bun.serve<RpcSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/": Bun.file(new URL("../../static/index.html", import.meta.url)),
    "/manifest.webmanifest": Bun.file(
      new URL("../../static/manifest.json", import.meta.url),
      {type: "application/manifest+json"},
    ),
    "/assets/fonts/JetBrainsMono-Bold.ttf": Bun.file(
      new URL("../../../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
    "/assets/*": async (request: Request) => {
      const asset = new URL(request.url).pathname.slice("/assets/".length)
      if (
        !asset
        || asset.includes("%")
        || asset.split("/").some((part) => !part || part === "." || part === "..")
      )
        return new Response(null, {status: 404})
      const file = Bun.file(new URL(`../../assets/${asset}`, import.meta.url))
      if (!await file.exists()) return new Response(null, {status: 404})
      return new Response(file)
    },
    "/@hamiltonian/:module": {GET: fixtureArtifactResponse},
    "/@internal/:module": {GET: fixtureArtifactResponse},
    "/@metafor/:module": {GET: fixtureArtifactResponse},
    "/code": {
      GET: async (request: Request) => {
        const url = new URL(request.url)
        if (url.search !== "") return new Response(null, {status: 404})
        return Response.json({packages: await fixturePackages()})
      },
      POST: async (request: Request) => {
        const packages = await packageChanges(request)
        if (packages instanceof Response) return packages
        buildRequests += 1
        const failed = fault === "update-build-failure-once" && buildRequests === 1
        const plans = packages.map(({name, change}) => ({
          name,
          change,
          previousVersion: versions.get(name)!,
          version: changedVersion(versions.get(name)!, change),
        }))
        const results = plans.flatMap((plan) => (environments.get(plan.name) ?? []).map((env) => ({
          module: plan.name,
          env,
          change: plan.change,
          previousVersion: plan.previousVersion,
          version: plan.version,
          success: true,
          exitCode: 0,
          stdout: "",
          stderr: "",
          outputs: [],
        })))
        if (failed && results.length > 0) {
          const result = results.at(-1)!
          result.success = false
          result.exitCode = 1
          result.stderr = "Fixture build failed"
        }
        const success = results.every((result) => result.success)
        if (!success) return Response.json({success, results, packages: []}, {status: 422})

        for (const plan of plans) {
          versions.set(plan.name, plan.version)
          revisions[plan.name] = (revisions[plan.name] ?? 0) + 1
        }
        const released = (await Promise.all(plans.map(({name}) => fixturePackageEnvironments(name))))
          .flat()
        server.publish(rpcServiceTopic, JSON.stringify(releaseChangedMessage()))
        return Response.json({success, results, packages: released})
      },
    },
    "/sw": (request: Request, bunServer: Bun.Server<RpcSocketData>) =>
      upgradeRpc(request, bunServer),
    "/__tests/state": () => Response.json({connections, fault, requests}),
    "/__tests/rpc/close": {
      POST: () => {
        for (const socket of sockets) socket.close(1000, "fixture server restart")
        return new Response(null, {status: 204})
      },
    },
    "/*": (request: Request) => {
      if (request.headers.get("Accept")?.includes("text/html"))
        return new Response(Bun.file(new URL("../../static/index.html", import.meta.url)))
      return new Response(null, {status: 404})
    },
  },
  fetch: () => new Response(null, {status: 404}),
  websocket: {
    open(socket) {
      connections += 1
      sockets.add(socket)
      openRpc(socket)
    },
    message: (socket, message) => messageRpc(socket, message, fixturePackages),
    close(socket, code, reason) {
      sockets.delete(socket)
      closeRpc(socket, code, reason)
    },
  },
})

console.info(JSON.stringify({event: "ready", port: server.port, fault}))

async function artifactResponse(
  module: ReleasablePackage,
  env: BrowserPackageEnvironment,
) {
  const response = await packageResponse(module, env)
  const revision = revisions[module] ?? 0
  if (!response.ok) return response
  const original = await response.text()
  const source = revision === 0
    ? original
    : `${original}\nconsole.info(${JSON.stringify(`fixture ${module} ${revision}`)})`
  const integrity = await artifactIntegrity(new TextEncoder().encode(source).buffer as ArrayBuffer)
  const headers = new Headers(response.headers)
  for (const [header, value] of Object.entries(packageIdentityHeaders({
    name: module,
    env,
    version: versions.get(module)!,
    ...integrity,
  }))) headers.set(header, value)
  return new Response(source, {headers})
}

async function fixtureArtifactResponse(request: Request) {
  const url = new URL(request.url)
  const artifact = parseBrowserPackageUrl(url)
  if (artifact === null) return new Response(null, {status: 404})
  const module = await buildablePackage(artifact.name, artifact.env)
  if (module === null) return new Response(null, {status: 404})

  switch (module) {
    case "@hamiltonian/release": {
      if (artifact.env === "main") {
        requests.releaseMain += 1
        return await artifactResponse(module, artifact.env)
      }
      requests.releaseService += 1
      if (fault === "release-service-http-once" && requests.releaseService === 1) {
        return new Response("Service release unavailable", {
          status: 503,
          headers: javascriptHeaders,
        })
      }
      if (
        fault === "update-fetch-failure-once"
        && (revisions[module] ?? 0) > 0
        && artifact.env === "service"
        && url.searchParams.has("version")
        && updateFetchFailures++ === 0
      ) {
        await Bun.sleep(500)
        return new Response("Update artifact unavailable", {status: 503})
      }
      return await artifactResponse(module, artifact.env)
    }
    case "@internal/visual":
      requests.internalVisual += 1
      return await artifactResponse(module, artifact.env)
    default:
      return await getPackage(request)
  }
}

async function fixturePackages(): Promise<ReleasedPackage[]> {
  return (await Promise.all([...versions].map(([name]) => fixturePackageEnvironments(name)))).flat()
}

async function fixturePackageEnvironments(name: ReleasablePackage) {
  return await Promise.all((environments.get(name) ?? []).map((env) => fixturePackage(name, env)))
}

async function fixturePackage(
  name: ReleasablePackage,
  env: BrowserPackageEnvironment,
): Promise<ReleasedPackage> {
  const version = versions.get(name)!
  const response = await artifactResponse(name, env)
  const sha256 = response.headers.get("X-Package-SHA256")
  const size = Number(response.headers.get("X-Package-Size"))
  if (sha256 === null || !Number.isSafeInteger(size) || size <= 0)
    throw new Error(`Fixture identity is missing for ${name}:${env}`)
  return {
    name,
    env,
    version,
    sha256,
    size,
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

async function fixtureInitialPackages() {
  try {
    return await releasedPackages()
  } catch {
    const environment = Bun.env.NODE_ENV
    Bun.env.NODE_ENV = "production"
    try {
      await recoverPublication()
      return await releasedPackages()
    } finally {
      if (environment === undefined) delete Bun.env.NODE_ENV
      else Bun.env.NODE_ENV = environment
    }
  }
}
