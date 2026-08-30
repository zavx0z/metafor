import {dirname, join} from "node:path"
import {
  buildPackage,
  closeRpc,
  messageRpc,
  openRpc,
  packageArtifactIdentityHeaders,
  packageChanges,
  parseBrowserPackageArtifactUrl,
  releaseChangedMessage,
  rpcServiceTopic,
  upgradeRpc,
  type BrowserPackageArtifactIdentity,
  type NonRootPackageArtifactKey,
  type RpcSocketData,
  type ReleasablePackage,
  type VersionChange,
} from "../../release/server"
import {artifactIntegrity, packageIdentityHeaders} from "../../shared/package/integrity"
import type {BrowserPackageEnvironment} from "../../shared/package/environment"

type Fault =
  | "none"
  | "release-service-http-once"
  | "update-build-failure-once"
  | "update-fetch-failure-once"

type FixtureArtifactConfig = Readonly<{
  name: string
  env: BrowserPackageEnvironment
  artifact?: NonRootPackageArtifactKey
  load?: "eager" | "lazy"
  type?: string
  version: string
  path: string
  revision: number
}>

type FixtureReleasePlan = Readonly<{
  name: ReleasablePackage
  change: VersionChange
  previousVersion: string
  version: string
}>

const fault = (process.env.LOAD_TEST_FAULT ?? "none") as Fault
const port = Number(process.env.LOAD_TEST_PORT)
const artifactConfig = parseArtifactConfig(process.env.LOAD_TEST_ARTIFACTS)

if (!Number.isInteger(port) || port <= 0) throw new Error("LOAD_TEST_PORT is required")

const requests = {
  internalVisual: 0,
  releaseMain: 0,
  releaseService: 0,
}
const revisions: Record<ReleasablePackage, number> = {
  "@internal/visual": 0,
  "@cosmos/release": 0,
}
const versions = new Map<ReleasablePackage, string>()
const environments = new Map<ReleasablePackage, BrowserPackageEnvironment[]>()
for (const {name, env, artifact, version} of artifactConfig.values()) {
  if (name !== "@cosmos/release" && name !== "@internal/visual") continue
  const previousVersion = versions.get(name)
  if (previousVersion !== undefined && previousVersion !== version)
    throw new Error(`Fixture package ${name} mixes versions ${previousVersion} and ${version}`)
  versions.set(name, version)
  if (artifact === undefined) {
    const packageEnvironments = environments.get(name) ?? []
    packageEnvironments.push(env)
    environments.set(name, packageEnvironments)
  }
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
    "/assets/fonts/jetbrains-mono-bold.ttf": Bun.file(
      new URL(import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf")),
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
    "/@cosmos/:module": {GET: fixtureArtifactResponse},
    "/@cosmos/:module/*": {GET: fixtureArtifactResponse},
    "/@internal/:module": {GET: fixtureArtifactResponse},
    "/@internal/:module/*": {GET: fixtureArtifactResponse},
    "/@metafor/:module": {GET: fixtureArtifactResponse},
    "/@metafor/:module/*": {GET: fixtureArtifactResponse},
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

        let staged: FixtureArtifactConfig[]
        try {
          staged = (await Promise.all(plans.map(stageFixturePackage))).flat()
        } catch (error) {
          const result = results.at(-1)
          if (result) {
            result.success = false
            result.exitCode = 1
            result.stderr = String(error)
          }
          return Response.json({success: false, results, packages: []}, {status: 422})
        }
        for (const artifact of staged) {
          artifactConfig.set(artifactKey(
            artifact.name,
            artifact.env,
            artifact.artifact,
            artifact.version,
          ), artifact)
        }
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

async function stageFixturePackage(
  plan: FixtureReleasePlan,
): Promise<FixtureArtifactConfig[]> {
  const revision = (revisions[plan.name] ?? 0) + 1
  if (plan.name !== "@internal/visual") {
    const current = [...artifactConfig.values()].filter(({name, version}) =>
      name === plan.name && version === plan.previousVersion)
    if (current.length !== (environments.get(plan.name) ?? []).length) {
      throw new Error(`Fixture roots are incomplete for ${plan.name}:${plan.previousVersion}`)
    }
    return current.map((artifact) => Object.freeze({
      ...artifact,
      version: plan.version,
      revision,
    }))
  }

  const currentRoot = artifactConfig.get(artifactKey(
    plan.name,
    "main",
    undefined,
    plan.previousVersion,
  ))
  if (!currentRoot) throw new Error(`Visual fixture root is missing for ${plan.previousVersion}`)
  const outdir = join(
    dirname(currentRoot.path),
    `visual-${port}-${buildRequests}-${plan.version.replaceAll(".", "-")}`,
  )
  const build = await buildPackage(plan.name, {
    env: "main",
    outdir,
    version: plan.version,
  })
  if (!build.success) {
    throw new Error(`Visual fixture build failed for ${plan.version}: ${build.stderr}`)
  }
  const outputs = build.outputs.filter(({kind}) => kind !== "sourcemap")
  const roots = outputs.filter(({artifact}) => artifact === ".")
  const eagerNonRoots = outputs.filter(({artifact, load}) => artifact !== "." && load === "eager")
  if (roots.length !== 1 || eagerNonRoots.length === 0) {
    throw new Error(`Visual fixture outputs are incomplete for ${plan.version}`)
  }
  return outputs.map((output) => Object.freeze({
    name: plan.name,
    env: "main" as const,
    ...(output.artifact === "."
      ? {}
      : {artifact: output.artifact as NonRootPackageArtifactKey}),
    ...(output.load === undefined ? {} : {load: output.load}),
    ...(output.type === undefined ? {} : {type: output.type}),
    version: plan.version,
    path: output.path,
    revision,
  }))
}

async function artifactResponse(
  module: ReleasablePackage,
  env: BrowserPackageEnvironment,
  artifact?: NonRootPackageArtifactKey,
  version = versions.get(module)!,
) {
  const configured = artifactConfig.get(artifactKey(module, env, artifact, version))
  if (!configured) return new Response(null, {status: 404})
  const original = await Bun.file(configured.path).text()
  const revision = configured.revision
  const source = revision === 0 || artifact !== undefined
    ? original
    : `${original}\nconsole.info(${JSON.stringify(`fixture ${module} ${revision}`)})`
  const integrity = await artifactIntegrity(new TextEncoder().encode(source).buffer as ArrayBuffer)
  const identity: BrowserPackageArtifactIdentity = {
    name: module,
    env,
    ...(artifact === undefined ? {} : {artifact}),
    version,
    ...integrity,
  }
  const headers = artifactHeaders(env, configured.type)
  for (const [header, value] of Object.entries(packageArtifactIdentityHeaders(identity))) {
    headers.set(header, value)
  }
  return new Response(source, {headers})
}

async function fixtureArtifactResponse(request: Request) {
  const url = new URL(request.url)
  const artifact = parseBrowserPackageArtifactUrl(url)
  if (artifact === null) return new Response(null, {status: 404})
  const selectedVersion = artifact.name === "@cosmos/startup"
    ? artifact.version ?? initialArtifactVersion(artifact.name, artifact.env, artifact.artifact)
    : artifact.version ?? versions.get(artifact.name as ReleasablePackage)
  if (selectedVersion === undefined) return new Response(null, {status: 404})
  const configured = artifactConfig.get(artifactKey(
    artifact.name,
    artifact.env,
    artifact.artifact,
    selectedVersion,
  ))
  if (!configured) return new Response(null, {status: 404})

  switch (artifact.name) {
    case "@cosmos/startup":
      return await staticArtifactResponse(configured)
    case "@cosmos/release": {
      if (artifact.env === "main") {
        requests.releaseMain += 1
        return await artifactResponse(artifact.name, artifact.env, undefined, selectedVersion)
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
        && (revisions[artifact.name] ?? 0) > 0
        && artifact.env === "service"
        && url.searchParams.has("version")
        && updateFetchFailures++ === 0
      ) {
        await Bun.sleep(500)
        return new Response("Update artifact unavailable", {status: 503})
      }
      return await artifactResponse(artifact.name, artifact.env, undefined, selectedVersion)
    }
    case "@internal/visual":
      requests.internalVisual += 1
      return await artifactResponse(
        artifact.name,
        artifact.env,
        artifact.artifact,
        selectedVersion,
      )
    default:
      return new Response(null, {status: 404})
  }
}

async function staticArtifactResponse(
  artifact: {name: string, env: BrowserPackageEnvironment, version: string, path: string},
) {
  const source = await Bun.file(artifact.path).text()
  const integrity = await artifactIntegrity(new TextEncoder().encode(source).buffer as ArrayBuffer)
  return new Response(source, {
    headers: mergeHeaders(artifactHeaders(artifact.env), packageIdentityHeaders({...artifact, ...integrity})),
  })
}

async function fixturePackages(): Promise<BrowserPackageArtifactIdentity[]> {
  const roots = (await Promise.all([...versions].map(([name]) =>
    fixturePackageEnvironments(name)))).flat()
  const publicArtifacts = await Promise.all([...artifactConfig.values()].flatMap((artifact) =>
    artifact.artifact === undefined
      || artifact.name !== "@internal/visual"
      || artifact.version !== versions.get("@internal/visual")
      || artifact.load !== "eager"
      ? []
      : [fixtureArtifactIdentity(
          artifact.name,
          artifact.env,
          artifact.artifact,
        )]))
  return [...roots, ...publicArtifacts]
}

async function fixturePackageEnvironments(name: ReleasablePackage) {
  return await Promise.all((environments.get(name) ?? []).map((env) => fixturePackage(name, env)))
}

async function fixturePackage(
  name: ReleasablePackage,
  env: BrowserPackageEnvironment,
): Promise<BrowserPackageArtifactIdentity> {
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

async function fixtureArtifactIdentity(
  name: ReleasablePackage,
  env: BrowserPackageEnvironment,
  artifact: NonRootPackageArtifactKey,
): Promise<BrowserPackageArtifactIdentity> {
  const version = versions.get(name)!
  const response = await artifactResponse(name, env, artifact)
  const sha256 = response.headers.get("X-Package-SHA256")
  const size = Number(response.headers.get("X-Package-Size"))
  if (sha256 === null || !Number.isSafeInteger(size) || size <= 0)
    throw new Error(`Fixture identity is missing for ${name}:${env}:${artifact}`)
  return {name, env, artifact, version, sha256, size}
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

function parseArtifactConfig(value: string | undefined) {
  if (value === undefined) throw new Error("LOAD_TEST_ARTIFACTS is required")
  const entries = JSON.parse(value) as Array<{
    name: string
    env: BrowserPackageEnvironment
    artifact?: NonRootPackageArtifactKey
    load?: "eager" | "lazy"
    type?: string
    version: string
    path: string
  }>
  return new Map<string, FixtureArtifactConfig>(entries.map((entry) => [
    artifactKey(entry.name, entry.env, entry.artifact, entry.version),
    Object.freeze({...entry, revision: 0}),
  ]))
}

function initialArtifactVersion(
  name: string,
  env: BrowserPackageEnvironment,
  artifact?: NonRootPackageArtifactKey,
) {
  return [...artifactConfig.values()].find((configured) =>
    configured.name === name
    && configured.env === env
    && configured.artifact === artifact)?.version
}

function artifactKey(
  name: string,
  env: BrowserPackageEnvironment,
  artifact: string | undefined,
  version: string,
) {
  return `${name}\u0000${env}\u0000${artifact ?? "."}\u0000${version}`
}

function artifactHeaders(env: BrowserPackageEnvironment, type?: string) {
  const headers = new Headers({"Content-Type": type ?? javascriptHeaders["Content-Type"]})
  if (env === "service") {
    headers.set("Content-Security-Policy", "script-src 'unsafe-eval'")
    headers.set("Service-Worker-Allowed", "/")
  }
  return headers
}

function mergeHeaders(headers: Headers, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) headers.set(name, value)
  return headers
}
