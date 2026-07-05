import {existsSync} from "node:fs"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {ForceMessage} from "boundary"

export type EnergyProtocol = {
  close(): void
}

export type EnergyProtocolOptions = {
  force?: BroadcastChannel
  energyId?: string
  timeoutMs?: number
  runtimeKind?: string
}

type EnergyProcessActionDescriptor = {
  type: "action"
  wimp: string
  key: string
  env: string[]
  action: {
    src: string
    importSpecifier?: string
    wrapperSrc?: string
    readFields: Array<[fieldId: number, key: string]>
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseActorIdPath = (path: unknown): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const readEnergyId = (): string =>
  Bun.env.ENERGY_ID?.trim() || "energy-local"

const readTimeoutMs = (): number => {
  const raw = Bun.env.ENERGY_TIMEOUT_MS?.trim()
  if (!raw) return 2000
  const timeout = Number(raw)
  return Number.isFinite(timeout) && timeout >= 0 ? timeout : 2000
}

const readRuntimeKind = (): string =>
  Bun.env.ENERGY_RUNTIME_KIND?.trim() || Bun.env.ENERGY_ENV?.trim() || "server"

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const readProcessDescriptor = (value: Record<string, unknown>): EnergyProcessActionDescriptor | null => {
  if (!isRecord(value.process) || value.process.type !== "action" || !isRecord(value.process.action)) return null
  const action = value.process.action
  if (typeof action.src !== "string" || action.src.trim().length === 0) return null

  const readFields: Array<[number, string]> = []
  if (Array.isArray(action.readFields)) {
    for (const item of action.readFields) {
      if (!Array.isArray(item)) continue
      const fieldId = item[0]
      const key = item[1]
      if (typeof fieldId === "number" && Number.isSafeInteger(fieldId) && typeof key === "string" && key.length > 0) {
        readFields.push([fieldId, key])
      }
    }
  }

  return {
    type: "action",
    wimp: typeof value.process.wimp === "string" ? value.process.wimp : "",
    key: typeof value.process.key === "string" ? value.process.key : "",
    env: Array.isArray(value.process.env)
      ? value.process.env.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    action: {
      src: action.src,
      ...(typeof action.importSpecifier === "string" && action.importSpecifier.length > 0
        ? {importSpecifier: action.importSpecifier}
        : {}),
      ...(typeof action.wrapperSrc === "string" && action.wrapperSrc.length > 0 ? {wrapperSrc: action.wrapperSrc} : {}),
      readFields,
    },
  }
}

const canExecuteInRuntime = (descriptor: EnergyProcessActionDescriptor, runtimeKind: string): boolean =>
  descriptor.env.length === 0 ||
  descriptor.env.includes("any") ||
  descriptor.env.includes(runtimeKind) ||
  (runtimeKind === "server" && descriptor.env.includes("node"))

const resolveProcessModule = (specifier: string, descriptor: EnergyProcessActionDescriptor): string => {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(specifier) || !specifier.startsWith(".")) return specifier
  if (!descriptor.wimp) return pathToFileURL(resolve(process.cwd(), specifier)).href

  const wimpRoot = descriptor.wimp.startsWith("/")
    ? descriptor.wimp
    : resolve(process.cwd(), descriptor.wimp.startsWith("github/") ? descriptor.wimp : `github/${descriptor.wimp}`)
  const primaryMeta = resolve(wimpRoot, "meta.ts")
  const fallbackMeta = resolve(wimpRoot, "src", "meta.ts")
  return new URL(specifier, pathToFileURL(existsSync(primaryMeta) ? primaryMeta : fallbackMeta)).href
}

const rewriteDynamicImports = (src: string, descriptor: EnergyProcessActionDescriptor): string =>
  src.replace(/import\s*\(\s*(["'])([^"']+)\1\s*\)/g, (_match: string, _quote: string, specifier: string) =>
    `import(${JSON.stringify(resolveProcessModule(specifier, descriptor))})`
  )

const buildActionValue = (
  fields: Record<string, unknown>,
  descriptor: EnergyProcessActionDescriptor,
): Record<string, unknown> => {
  if (descriptor.action.readFields.length === 0) return {...fields}

  const value: Record<string, unknown> = {}
  for (const [fieldId, key] of descriptor.action.readFields) {
    const address = String(fieldId)
    if (Object.hasOwn(fields, address)) value[key] = fields[address]
  }
  return value
}

const executeProcessAction = async (
  actorId: number,
  fields: Record<string, unknown>,
  descriptor: EnergyProcessActionDescriptor,
  runtimeKind: string,
): Promise<void> => {
  if (!canExecuteInRuntime(descriptor, runtimeKind)) {
    throw new Error(`Energy runtime ${runtimeKind} cannot execute process env ${descriptor.env.join(",")}`)
  }

  const value = buildActionValue(fields, descriptor)
  const params = {field: fields, value, mass: {actorId}, self: {actorId}}
  if (descriptor.action.wrapperSrc) {
    const wrapper = (0, eval)(`(${rewriteDynamicImports(descriptor.action.wrapperSrc, descriptor)})`) as unknown
    if (typeof wrapper !== "function") throw new Error("Energy process wrapperSrc did not evaluate to a function")
    await (wrapper as (input: typeof params) => unknown | Promise<unknown>)(params)
    return
  }

  const mod = await import(resolveProcessModule(descriptor.action.src, descriptor))
  const action = descriptor.action.importSpecifier ? mod[descriptor.action.importSpecifier] : mod.default
  if (typeof action !== "function") {
    throw new Error(`Energy process action export is not a function: ${descriptor.action.importSpecifier ?? "default"}`)
  }
  await action(value)
}

export function startEnergyProtocol(options: EnergyProtocolOptions = {}): EnergyProtocol {
  const force = options.force ?? new BroadcastChannel("force")
  const energyId = options.energyId ?? readEnergyId()
  const timeoutMs = options.timeoutMs ?? readTimeoutMs()
  const runtimeKind = options.runtimeKind ?? readRuntimeKind()
  const pendingActors = new Set<number>()
  const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>()
  let closed = false

  force.onmessage = (event) => {
    for (const part of (event.data as ForceMessage).parts) {
      switch (part.part) {
        case "photon": {
          if (part.op !== "replace") break
          const actorId = parseActorIdPath(part.path)
          if (actorId === null) break

          force.postMessage({
            parts: [{
              part: "z",
              op: "test",
              path: actorId,
              value: {energy: energyId},
            }],
          })
          break
        }
        case "z": {
          if (part.op !== "copy") break
          const actorId = parseActorIdPath(part.path)
          if (actorId === null) break
          if (part.from !== energyId) break
          if (!isRecord(part.value) || !isRecord(part.value.fields)) break
          if (pendingActors.has(actorId)) break
          pendingActors.add(actorId)

          const descriptor = readProcessDescriptor(part.value)
          if (descriptor) {
            void executeProcessAction(actorId, part.value.fields, descriptor, runtimeKind)
              .then(() => {
                if (closed) return
                force.postMessage({
                  parts: [{
                    part: "w+",
                    op: "replace",
                    path: actorId,
                    value: {fields: {}},
                  }],
                })
              })
              .catch((error) => {
                if (closed) return
                force.postMessage({
                  parts: [{
                    part: "w-",
                    op: "replace",
                    path: actorId,
                    value: {error: errorMessage(error), fields: {}},
                  }],
                })
              })
              .finally(() => {
                pendingActors.delete(actorId)
              })
            break
          }

          const timer = setTimeout(() => {
            pendingActors.delete(actorId)
            pendingTimers.delete(actorId)
            if (closed) return
            force.postMessage({
              parts: [{
                part: "w+",
                op: "replace",
                path: actorId,
                value: {fields: {}},
              }],
            })
          }, timeoutMs)
          pendingTimers.set(actorId, timer)
          break
        }
      }
    }
  }

  return {
    close() {
      closed = true
      for (const timer of pendingTimers.values()) clearTimeout(timer)
      pendingTimers.clear()
      pendingActors.clear()
      force.close()
    },
  }
}

export const energyProtocol = startEnergyProtocol()
