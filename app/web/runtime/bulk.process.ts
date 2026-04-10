import { existsSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createBulkWeakProtocol, subscribeBulkPhotons, type PhotonMessage } from "@bulk/em"
import { executeProcess, loadAction } from "@bulk/weak"
import type {
  DbBackend,
  DbFieldSchemaRecord,
  DbMetaProcessRecord,
  DbMetaRows,
  DbWimpRows,
} from "../../../pkg/db/core.ts"
import type { Self } from "../../../index.ts"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const META_HUB_ROOT = resolve(REPO_ROOT, "github")
const ACTION_IMPORT_PATTERN = /import\s*\(\s*["']([^"']+)["']\s*\)/g

type ProcessFieldMap = Record<string, DbFieldSchemaRecord & { topology?: boolean }>
type ProcessValueMap = Record<string, unknown>

type AppBulkProcessHandlerParams = {
  field: ProcessFieldMap
  mass: Record<string, unknown>
  self: Self
  value: ProcessValueMap
}

export type AppBulkProcessTarget = {
  backend: DbBackend
  meta: DbMetaRows["meta"]
  process: DbMetaProcessRecord
  self: Self
  field: ProcessFieldMap
  value: ProcessValueMap
  mass: Record<string, unknown>
  wimpFieldIdByFieldKey: Map<string, string>
  wimpId: string
}

export type AppBulkProcessExecutionResult = {
  boson: "w+" | "w-"
  values: Record<string, unknown>
}

export interface AppBulkProcessRuntime {
  close(): void
}

export interface AppBulkProcessRuntimeOptions {
  backend: DbBackend
  executorId?: string
  log?: (message: unknown) => void
  openTargetBackend?: () => DbBackend | Promise<DbBackend>
}

const inlineHandlerCache = new Map<string, Function>()

const defaultLog = (_message: unknown): void => {}

const toRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

const normalizeMass = (
  metaMass: unknown,
  massOverride: unknown,
): Record<string, unknown> => ({
  ...structuredClone(toRecord(metaMass)),
  ...structuredClone(toRecord(massOverride)),
})

const normalizeFieldSchema = (schema: DbFieldSchemaRecord): DbFieldSchemaRecord & { topology?: boolean } => ({
  type: schema.type,
  required: schema.required,
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(Array.isArray(schema.values) ? { values: [...schema.values] } : {}),
  ...(schema.topology ? { topology: true } : {}),
})

const buildFieldMap = (metaRows: DbMetaRows): ProcessFieldMap =>
  Object.fromEntries(metaRows.fields.map((field) => [field.fieldKey, normalizeFieldSchema(field.schema)]))

const buildValueMap = (
  metaRows: DbMetaRows,
  wimpRows: DbWimpRows,
): {
  value: ProcessValueMap
  wimpFieldIdByFieldKey: Map<string, string>
} => {
  const metaFieldById = new Map(metaRows.fields.map((field) => [field.id, field] as const))
  const valueByWimpFieldId = new Map(wimpRows.values.map((row) => [row.ownerWimpFieldId, structuredClone(row.value)] as const))
  const value: ProcessValueMap = {}
  const wimpFieldIdByFieldKey = new Map<string, string>()

  for (const wimpField of wimpRows.fields) {
    const metaField = metaFieldById.get(wimpField.metaFieldId)
    if (!metaField) continue

    value[metaField.fieldKey] = valueByWimpFieldId.has(wimpField.id) ? valueByWimpFieldId.get(wimpField.id) : null
    wimpFieldIdByFieldKey.set(metaField.fieldKey, wimpField.id)
  }

  return { value, wimpFieldIdByFieldKey }
}

const resolveMetaModulePath = (metaSrc: string): string => resolve(META_HUB_ROOT, metaSrc, "meta.ts")

const resolveExistingModuleSpecifier = (path: string): string => {
  const candidates = [
    path,
    `${path}.ts`,
    `${path}.js`,
    `${path}.mts`,
    `${path}.mjs`,
    resolve(path, "index.ts"),
    resolve(path, "index.js"),
    resolve(path, "index.mts"),
    resolve(path, "index.mjs"),
  ]

  const existing = candidates.find((candidate) => existsSync(candidate))
  return pathToFileURL(existing ?? path).href
}

export const resolveAppBulkActionSpecifier = (metaSrc: string, actionSrc: string): string => {
  if (actionSrc.includes("://")) return actionSrc
  if (isAbsolute(actionSrc)) return resolveExistingModuleSpecifier(actionSrc)

  const metaModulePath = resolveMetaModulePath(metaSrc)
  return resolveExistingModuleSpecifier(resolve(dirname(metaModulePath), actionSrc))
}

const rewriteActionWrapperImports = (target: AppBulkProcessTarget): string => {
  const wrapperSrc = target.process.actionWrapperSrc
  if (!wrapperSrc) {
    throw new Error(`Action process ${target.process.id} does not declare actionWrapperSrc`)
  }

  return wrapperSrc.replace(ACTION_IMPORT_PATTERN, (_match, specifier: string) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.includes("://")) {
      return `import(${JSON.stringify(specifier)})`
    }

    return `import(${JSON.stringify(resolveAppBulkActionSpecifier(target.meta.src, specifier))})`
  })
}

const compileInlineHandler = (src: string): Function => {
  const cached = inlineHandlerCache.get(src)
  if (cached) return cached

  const handler = new Function(`return (${src})`)()
  if (typeof handler !== "function") {
    throw new Error("Inline process handler must compile to function")
  }

  inlineHandlerCache.set(src, handler)
  return handler
}

const collectHandlerValues = async (
  handlerSrc: string | undefined,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (!handlerSrc) return {}

  const collected: Record<string, unknown> = {}
  const handler = compileInlineHandler(handlerSrc)
  const update = (patch: Record<string, unknown>): Record<string, unknown> => {
    Object.assign(collected, structuredClone(patch))
    return patch
  }

  await Promise.resolve(handler({ ...params, update }))
  return collected
}

const resolveProcessSelfPath = async (backend: DbBackend, rows: DbWimpRows): Promise<string> => {
  const segments = [String(rows.wimp.wimpOrder)]
  let currentWimpId = rows.wimp.id

  for (;;) {
    const edge = await backend.readWimpEdge(currentWimpId)
    if (!edge?.parentWimpId) break

    const parentRows = await backend.readWimpRows(edge.parentWimpId)
    if (!parentRows) break

    segments.push(String(parentRows.wimp.wimpOrder))
    currentWimpId = parentRows.wimp.id
  }

  return segments.reverse().join("/")
}

const resolveProcessTarget = async (
  backend: DbBackend,
  photon: Pick<PhotonMessage, "path" | "value">,
): Promise<AppBulkProcessTarget | null> => {
  const wimpRows = await backend.readWimpRows(photon.path)
  if (!wimpRows) return null

  const metaRows = await backend.readMetaRows(wimpRows.wimp.metaId)
  if (!metaRows) return null

  const currentState = metaRows.states.find((state) => state.id === wimpRows.state.metaStateId)
  if (!currentState || currentState.stateName !== photon.value) {
    return null
  }

  const process = metaRows.processes.find((entry) => entry.processKey === photon.value)
  if (!process) return null

  const { value, wimpFieldIdByFieldKey } = buildValueMap(metaRows, wimpRows)

  return {
    backend,
    meta: metaRows.meta,
    process,
    self: {
      atom: wimpRows.wimp.id,
      meta: metaRows.meta.src,
      path: await resolveProcessSelfPath(backend, wimpRows),
    },
    field: buildFieldMap(metaRows),
    value,
    mass: normalizeMass(metaRows.meta.mass, wimpRows.wimp.massOverride),
    wimpFieldIdByFieldKey,
    wimpId: wimpRows.wimp.id,
  }
}

const resolveFreshProcessTarget = async (
  backend: DbBackend,
  photon: Pick<PhotonMessage, "path" | "value">,
  openTargetBackend?: () => DbBackend | Promise<DbBackend>,
): Promise<AppBulkProcessTarget | null> => {
  if (!openTargetBackend) {
    return await resolveProcessTarget(backend, photon)
  }

  const freshBackend = await Promise.resolve(openTargetBackend())
  try {
    return await resolveProcessTarget(freshBackend, photon)
  } finally {
    await freshBackend.close()
  }
}

const valuesToWimpFieldValues = (
  target: AppBulkProcessTarget,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  const nextValues: Record<string, unknown> = {}

  for (const [fieldKey, value] of Object.entries(values)) {
    const wimpFieldId = target.wimpFieldIdByFieldKey.get(fieldKey)
    if (!wimpFieldId) {
      throw new Error(`Process handler tried to update unknown field "${fieldKey}" for ${target.meta.src}`)
    }
    nextValues[wimpFieldId] = value
  }

  return nextValues
}

const executeFinallyProcess = async (
  target: AppBulkProcessTarget,
): Promise<AppBulkProcessExecutionResult> => {
  if (!target.process.beforeSrc) {
    return { boson: "w+", values: {} }
  }

  try {
    const before = compileInlineHandler(target.process.beforeSrc)
    await Promise.resolve(
      before({
        field: target.field,
        mass: target.mass,
        self: target.self,
        value: target.value,
      }),
    )
    return { boson: "w+", values: {} }
  } catch {
    return { boson: "w-", values: {} }
  }
}

export const executeAppBulkProcessTarget = async (
  target: AppBulkProcessTarget,
): Promise<AppBulkProcessExecutionResult> => {
  if (target.process.processKind === "finally") {
    return await executeFinallyProcess(target)
  }

  try {
    const action =
      target.process.actionWrapperSrc !== undefined
        ? compileInlineHandler(rewriteActionWrapperImports(target))
        : await loadAction<AppBulkProcessHandlerParams["field"], AppBulkProcessHandlerParams["mass"]>({
            src: resolveAppBulkActionSpecifier(
              target.meta.src,
              target.process.actionSrc ?? (() => {
                throw new Error(`Action process ${target.process.id} does not declare actionSrc`)
              })(),
            ),
            ...(target.process.actionImportSpecifier !== undefined
              ? { importSpecifier: target.process.actionImportSpecifier }
              : {}),
          })

    const data = await executeProcess({
      action,
      self: target.self,
      field: target.field,
      value: target.value,
      mass: target.mass,
    })
    const handlerValues = await collectHandlerValues(target.process.successSrc, {
      data,
      field: target.field,
      mass: target.mass,
      self: target.self,
      value: target.value,
    })

    return {
      boson: "w+",
      values: valuesToWimpFieldValues(target, handlerValues),
    }
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    const handlerValues = await collectHandlerValues(target.process.errorSrc, {
      error: normalizedError,
      field: target.field,
      mass: target.mass,
      self: target.self,
      value: target.value,
    })

    return {
      boson: "w-",
      values: valuesToWimpFieldValues(target, handlerValues),
    }
  }
}

export const createAppBulkProcessRuntime = ({
  backend,
  executorId = "app-web-bulk",
  log = defaultLog,
  openTargetBackend,
}: AppBulkProcessRuntimeOptions): AppBulkProcessRuntime => {
  const inFlight = new Set<string>()
  const protocol = createBulkWeakProtocol()
  const subscription = subscribeBulkPhotons((message) => {
    if (message.source !== "boundary") return

    void (async () => {
      let target: AppBulkProcessTarget | null = null
      let inFlightKey: string | null = null

      try {
        target = await resolveFreshProcessTarget(backend, message, openTargetBackend)
        if (!target) return

        inFlightKey = `${target.wimpId}:${target.process.id}`
        if (inFlight.has(inFlightKey)) {
          protocol.emitZReject(target.wimpId, target.process.id, executorId)
          return
        }

        inFlight.add(inFlightKey)
        protocol.emitZClaim(target.wimpId, target.process.id, executorId)
        protocol.emitZAccept(target.wimpId, target.process.id, executorId)
        log({
          type: "bulk-process-start",
          wimpId: target.wimpId,
          processId: target.process.id,
          processKey: target.process.processKey,
          meta: target.meta.src,
        })

        const result = await executeAppBulkProcessTarget(target)
        if (result.boson === "w+") {
          protocol.emitWSuccessValues(target.wimpId, target.process.id, result.values)
        } else {
          protocol.emitWErrorValues(target.wimpId, target.process.id, result.values)
        }

        log({
          type: "bulk-process-done",
          boson: result.boson,
          wimpId: target.wimpId,
          processId: target.process.id,
          values: result.values,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log({
          type: "bulk-process-error",
          ...(target ? { wimpId: target.wimpId, processId: target.process.id } : {}),
          error: message,
        })
        if (target) {
          protocol.emitWErrorValues(target.wimpId, target.process.id, {})
        }
      } finally {
        if (target) {
          protocol.emitZRelease(target.wimpId, target.process.id, executorId)
        }
        if (inFlightKey) {
          inFlight.delete(inFlightKey)
        }
      }
    })()
  })

  return {
    close() {
      subscription.close()
      protocol.close()
    },
  }
}
