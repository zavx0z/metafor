import {createDevelopmentSources} from "./development-source"
import {createDevelopmentContent} from "./development-content"
import {createOptionalDevelopment} from "./development-availability"
import type {createNativeReplOracle} from "./repl"
import {readNativeReplAssignment} from "./repl"
import {authorizeAgentRequest, readAgentBody} from "./agents"
import {readDevelopmentConfiguration} from "./development-config"
import {createDevelopmentCatalog} from "./development-catalog"
import {createDevelopmentConversations} from "./development-conversations"
import {createDevelopmentMachineGrant} from "./development-machine"
import {createDevelopmentScenarios} from "./development-scenarios"
import {assignedScenarioCompiler} from "./development-scenario-compiler"
import {createAssignedPreparation, developmentReleaseTools, type DevelopmentReleaseHost} from "./development-preparation"
import {developmentScenarioTools} from "./development-scenario-tools"
import {DEVELOPMENT_PATH, type DevelopmentSubscription, type DevelopmentChatScope} from "../shared/development"

type Host = {requestIP(request: Request): {address: string} | null; timeout?(request: Request, seconds: number): void}

/** Ошибка source assignment не меняет готовность обязательных участников Core. */
export function configuredOptionalDevelopment(environment: Readonly<Record<string, string | undefined>>, repl: ReturnType<typeof createNativeReplOracle> | null,
  releaseHost?: DevelopmentReleaseHost) {
  return createOptionalDevelopment<Host, DevelopmentChatScope>({
    initialize: () => configuredDevelopment(environment, repl, releaseHost),
    authorize: authorizeAgentRequest,
    failed() {console.error("[@cosmos/release:development]", "Исходное окружение Cosmos недоступно; Core и настройки продолжают работу", {code: "workspace_unavailable"})},
  })
}

/** Один owner в существующем release, без listener, второго REPL и внешнего Project. */
export async function configuredDevelopment(environment: Readonly<Record<string, string | undefined>>, repl: ReturnType<typeof createNativeReplOracle> | null,
  releaseHost?: DevelopmentReleaseHost) {
  const config = await readDevelopmentConfiguration(environment)
  if (!config) return null
  let observed = await createDevelopmentCatalog(config)
  const catalog: Awaited<ReturnType<typeof createDevelopmentCatalog>> = {
    get snapshot() {return observed.snapshot},
    source: name => observed.source(name),
    subject: address => observed.subject(address),
    contentNode: (name, nodeId) => observed.contentNode(name, nodeId),
  }
  let refreshing: Promise<void> | undefined
  const refresh = () => refreshing ??= createDevelopmentCatalog(config).then(value => {observed = value}).finally(() => {refreshing = undefined})
  const assignment = config.machine?.enabled ? await readNativeReplAssignment(environment) : null
  if (config.machine?.enabled && (!assignment || !repl)) throw new Error("Development machine was enabled without its native owner assignment")
  const compiler = config.scenarios
  const scenarios = releaseHost && compiler ? createDevelopmentScenarios(catalog, {
    tracePreloadPath: await releaseHost.scenarioPreloadEntrypoint(), tsserverPath: () => assignedScenarioCompiler(compiler),
  }) : null
  const preparation = releaseHost ? createAssignedPreparation(config, catalog, releaseHost, environment) : null
  const conversations = createDevelopmentConversations(config, catalog, {
    tools: (_input, source) => [
      ...(releaseHost ? developmentReleaseTools(releaseHost, source.writable ? preparation : null, source.address) : []),
      ...(scenarios ? developmentScenarioTools(scenarios, source.name) : []),
    ],
    ...(config.machine?.enabled && assignment && repl ? {machine: (_input, source) => createDevelopmentMachineGrant({repl, assignment, cwd: source.directory,
      hostId: config.machine!.hostId, revision: config.machine!.revision})} : {}),
  })
  const sources = createDevelopmentSources(catalog)
  const content = createDevelopmentContent(catalog, scenarios ? "available" : "unassigned")
  const readers = new Map<string, number>()
  let closed = false
  const ready = () => {if (closed) throw new Error("Development workspace is closed")}
  const subscribe: DevelopmentSubscription = (scope, listener) => {ready(); return conversations.subscribe(scope, listener)}
  return {
    get catalog() {return catalog.snapshot},
    refreshCatalog: refresh,
    subscribe,
    async fetch(request: Request, host: Host): Promise<Response> {
      try {
        ready()
        authorizeAgentRequest(request, host)
        const url = new URL(request.url)
        if (url.search) return new Response(null, {status: 400})
        if (request.method === "GET" && url.pathname.startsWith(`${DEVELOPMENT_PATH}/resource/`)) {
          const [name, ...parts] = url.pathname.slice(`${DEVELOPMENT_PATH}/resource/`.length).split("/")
          if (!name || !parts.length) return new Response(null, {status: 400})
          return sources.resource(decodeURIComponent(name), parts.map(decodeURIComponent).join("/"))
        }
        if (url.pathname === `${DEVELOPMENT_PATH}/catalog` && request.method === "GET")
          return Response.json(catalog.snapshot, {headers: {"cache-control": "no-store"}})
        if (request.method !== "POST") return new Response(null, {status: 405})
        const body = await readAgentBody(request)
        if (url.pathname === `${DEVELOPMENT_PATH}/reader`) {
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return new Response(null, {status: 400})
          const now = Date.now()
          for (const [id, expires] of readers) if (expires <= now) readers.delete(id)
          if (readers.size >= 1024) return new Response(null, {status: 429})
          const readerToken = crypto.randomUUID()
          readers.set(readerToken, now + 15 * 60_000)
          return Response.json({protocol: "cosmos-development-reader/1", readerToken}, {headers: {"cache-control": "no-store"}})
        }
        const token = request.headers.get("x-storybook-session")
        if (!token || (readers.get(token) ?? 0) <= Date.now()) return new Response(null, {status: 401})
        if (url.pathname.startsWith(`${DEVELOPMENT_PATH}/scenarios/`)) {
          if (!scenarios) return Response.json({error: "Выполнение сценариев не назначено"}, {status: 503})
          if (!body || typeof body !== "object" || Array.isArray(body)) return new Response(null, {status: 400})
          const value = body as Record<string, unknown>
          const allowed = url.pathname.endsWith("/list") ? ["packageName", "nodeId"] : ["packageName", "nodeId", "sourcePath", "expectedDigest"]
          if (typeof value.packageName !== "string" || value.nodeId !== undefined && typeof value.nodeId !== "string"
            || Object.keys(value).some(key => !allowed.includes(key))) return new Response(null, {status: 400})
          if (url.pathname === `${DEVELOPMENT_PATH}/scenarios/list`) return Response.json(await scenarios.list(value.packageName, value.nodeId as string | undefined))
          if (url.pathname !== `${DEVELOPMENT_PATH}/scenarios/run` || typeof value.sourcePath !== "string" || typeof value.expectedDigest !== "string")
            return new Response(null, {status: 400})
          host.timeout?.(request, 0)
          const abort = new AbortController()
          const encoder = new TextEncoder()
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              let cancelled = false
              abort.signal.addEventListener("abort", () => {cancelled = true}, {once: true})
              const send = (event: unknown) => {if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))}
              send({type: "progress", progress: {phase: "preparing"}})
              void scenarios.run({packageName: value.packageName as string, ...(value.nodeId ? {nodeId: value.nodeId as string} : {}),
                sourcePath: value.sourcePath as string, expectedDigest: value.expectedDigest as string},
              AbortSignal.any([request.signal, abort.signal]), progress => send({type: "progress", progress}))
                .then(result => send({type: "result", result}), error => send({type: "error", error: error instanceof Error ? error.message : String(error)}))
                .finally(() => {if (!cancelled) controller.close()})
            },
            cancel() {abort.abort()},
          })
          return new Response(stream, {headers: {"content-type": "application/x-ndjson", "cache-control": "no-store"}})
        }
        if (url.pathname === `${DEVELOPMENT_PATH}/resource`) {
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== "packageName,path" ||
              !("packageName" in body) || typeof body.packageName !== "string" || !("path" in body) || typeof body.path !== "string") return new Response(null, {status: 400})
          return sources.resource(body.packageName, body.path)
        }
        if (url.pathname === `${DEVELOPMENT_PATH}/content`) {
          if (!body || typeof body !== "object" || Array.isArray(body) || !("packageName" in body) || typeof body.packageName !== "string" ||
              Object.keys(body).some(key => key !== "packageName" && key !== "nodeId") || "nodeId" in body && typeof body.nodeId !== "string") return new Response(null, {status: 400})
          return Response.json(await content(body.packageName, "nodeId" in body ? body.nodeId as string : undefined), {headers: {"cache-control": "no-store"}})
        }
        if (url.pathname.startsWith(`${DEVELOPMENT_PATH}/source/`)) {
          if (!body || typeof body !== "object" || Array.isArray(body) || !("packageName" in body) || typeof body.packageName !== "string") return new Response(null, {status: 400})
          const value = body as Record<string, unknown>, operation = url.pathname.slice(`${DEVELOPMENT_PATH}/source/`.length)
          let result: unknown
          if (operation === "list" && (value.path === undefined || typeof value.path === "string")) result = await sources.list(body.packageName, value.path as string | undefined)
          else if (operation === "read" && typeof value.path === "string") result = await sources.read(body.packageName, value.path)
          else if (operation === "save" && typeof value.path === "string" && typeof value.content === "string" && typeof value.expectedHash === "string") result = await sources.save(body.packageName, value.path, value.content, value.expectedHash)
          else return new Response(null, {status: 400})
          return Response.json(result, {headers: {"cache-control": "no-store"}})
        }
        if (!url.pathname.startsWith(`${DEVELOPMENT_PATH}/chat/`)) return new Response(null, {status: 404})
        const operation = url.pathname.slice(`${DEVELOPMENT_PATH}/chat/`.length)
        if (!/^[a-z-]+$/u.test(operation)) return new Response(null, {status: 400})
        return Response.json(await conversations.request(operation, body, request.signal), {headers: {"cache-control": "no-store"}})
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "development_unavailable"
        const status = code === "CONFLICT" ? 409 : error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 409
        const message = error instanceof Error ? error.message : "Development workspace is unavailable"
        return Response.json(new URL(request.url).pathname.startsWith(`${DEVELOPMENT_PATH}/chat/`) ? {error: message, code} : {error: {code, message}},
          {status, headers: {"cache-control": "no-store"}})
      }
    },
    async close() {if (closed) return; closed = true; readers.clear(); await scenarios?.close(); await preparation?.close(); await conversations.close()},
  }
}
