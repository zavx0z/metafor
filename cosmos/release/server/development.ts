import {createDevelopmentSources} from "./development-source"
import {createOptionalDevelopment} from "./development-availability"
import type {createNativeReplOracle} from "./repl"
import {readNativeReplAssignment} from "./repl"
import {authorizeAgentRequest, readAgentBody} from "./agents"
import {readDevelopmentConfiguration} from "./development-config"
import {createDevelopmentCatalog} from "./development-catalog"
import {createDevelopmentConversations} from "./development-conversations"
import {createDevelopmentMachineGrant} from "./development-machine"
import {DEVELOPMENT_PATH, type DevelopmentSubscription, type DevelopmentChatScope} from "../shared/development"

type Host = {requestIP(request: Request): {address: string} | null}

/** Ошибка source assignment не меняет готовность обязательных участников Core. */
export function configuredOptionalDevelopment(environment: Readonly<Record<string, string | undefined>>, repl: ReturnType<typeof createNativeReplOracle> | null) {
  return createOptionalDevelopment<Host, DevelopmentChatScope>({
    initialize: () => configuredDevelopment(environment, repl),
    authorize: authorizeAgentRequest,
    failed() {console.error("[@cosmos/release:development]", "Исходное окружение Cosmos недоступно; Core и настройки продолжают работу", {code: "workspace_unavailable"})},
  })
}

/** Один owner в существующем release, без listener, второго REPL и внешнего Project. */
export async function configuredDevelopment(environment: Readonly<Record<string, string | undefined>>, repl: ReturnType<typeof createNativeReplOracle> | null) {
  const config = await readDevelopmentConfiguration(environment)
  if (!config) return null
  let observed = await createDevelopmentCatalog(config)
  const catalog: Awaited<ReturnType<typeof createDevelopmentCatalog>> = {
    get snapshot() {return observed.snapshot},
    source: name => observed.source(name),
    subject: address => observed.subject(address),
  }
  let refreshing: Promise<void> | undefined
  const refresh = () => refreshing ??= createDevelopmentCatalog(config).then(value => {observed = value}).finally(() => {refreshing = undefined})
  const assignment = config.machine?.enabled ? await readNativeReplAssignment(environment) : null
  if (config.machine?.enabled && (!assignment || !repl)) throw new Error("Development machine was enabled without its native owner assignment")
  const conversations = createDevelopmentConversations(config, catalog, {
    ...(config.machine?.enabled && assignment && repl ? {machine: (_input, source) => createDevelopmentMachineGrant({repl, assignment, cwd: source.directory,
      hostId: config.machine!.hostId, revision: config.machine!.revision})} : {}),
  })
  const sources = createDevelopmentSources(catalog)
  const readers = new Map<string, number>()
  let closed = false
  const ready = () => {if (closed) throw new Error("Development workspace is closed")}
  const subscribe: DevelopmentSubscription = (scope, listener) => {ready(); return conversations.subscribe(scope, listener)}
  return {
    get catalog() {return catalog.snapshot},
    subscribe,
    async fetch(request: Request, host: Host): Promise<Response> {
      try {
        ready()
        authorizeAgentRequest(request, host)
        const url = new URL(request.url)
        if (url.search) return new Response(null, {status: 400})
        if (url.pathname === `${DEVELOPMENT_PATH}/catalog` && request.method === "GET") {await refresh(); return Response.json(catalog.snapshot, {headers: {"cache-control": "no-store"}})}
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
    async close() {if (closed) return; closed = true; readers.clear(); await conversations.close()},
  }
}
