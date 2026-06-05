import {existsSync, readFileSync} from "node:fs"
import {extname, resolve} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {serializeError} from "./errors.ts"
import {asObject, asString} from "./guards.ts"
import type {ProtocolClient} from "./protocol-client.ts"
import type {EventLogger} from "./logger.ts"
import {sourceMapMapper, type SourceMapLookup} from "./source-map.ts"
import type {BreakpointSpec} from "./target.ts"
import type {JsonObject} from "./types.ts"

export type BreakpointScript = {
  scriptId: string
  url: string
  sourceMapURL?: string
}

export type InstalledBreakpoint = {
  breakpointId: string
  scriptId: string
  url: string
  result: unknown
}

export type BreakpointRegistration = {
  id: string
  spec: BreakpointSpec
  installed: InstalledBreakpoint[]
}

type TrackedBreakpoint = BreakpointRegistration & {
  installedByScriptId: Map<string, InstalledBreakpoint>
  logicalBreakpointIds: Set<string>
}

export class BreakpointStore {
  #client: ProtocolClient
  #logger: EventLogger
  #nextId = 1
  #breakpoints = new Map<string, TrackedBreakpoint>()

  constructor(options: {
    client: ProtocolClient
    logger: EventLogger
  }) {
    this.#client = options.client
    this.#logger = options.logger
  }

  get registrations(): BreakpointRegistration[] {
    return [...this.#breakpoints.values()].map(publicRegistration)
  }

  reset(): void {
    this.#breakpoints.clear()
    this.#logger.event("breakpoint.store.reset", {})
  }

  clearInstalled(reason: string): void {
    let registrations = 0
    let installed = 0
    let logical = 0

    for (const tracked of this.#breakpoints.values()) {
      if (tracked.installed.length === 0 && tracked.installedByScriptId.size === 0 && tracked.logicalBreakpointIds.size === 0) continue
      registrations += 1
      installed += tracked.installed.length
      logical += tracked.logicalBreakpointIds.size
      tracked.installed = []
      tracked.installedByScriptId.clear()
      tracked.logicalBreakpointIds.clear()
    }

    if (registrations === 0) return
    this.#logger.event("breakpoint.installed.clear", {reason, registrations, installed, logical})
  }

  add(spec: BreakpointSpec): BreakpointRegistration {
    const id = `interpreter-bp-${this.#nextId++}`
    const tracked: TrackedBreakpoint = {
      id,
      spec,
      installed: [],
      installedByScriptId: new Map(),
      logicalBreakpointIds: new Set(),
    }
    this.#breakpoints.set(id, tracked)
    this.#logger.event("breakpoint.added", {id, spec})
    return publicRegistration(tracked)
  }

  addMany(specs: BreakpointSpec[]): BreakpointRegistration[] {
    return specs.map((spec) => this.add(spec))
  }

  async handleScriptParsed(script: BreakpointScript): Promise<void> {
    for (const tracked of this.#breakpoints.values()) {
      if (!matchesBreakpointSpec(tracked.spec, script.url) && !matchesBreakpointSource(tracked.spec, script)) continue
      await this.#installForScript(tracked, script)
    }
  }

  async applyToScripts(scripts: BreakpointScript[]): Promise<void> {
    for (const script of scripts) {
      await this.handleScriptParsed(script)
    }
  }

  async armPendingByUrl(ids?: readonly string[]): Promise<void> {
    const idSet = ids === undefined ? null : new Set(ids)
    for (const tracked of this.#breakpoints.values()) {
      if (idSet !== null && !idSet.has(tracked.id)) continue
      await this.#installLogicalByUrl(tracked)
    }
  }

  async remove(idOrBreakpointId: string): Promise<BreakpointRegistration | {breakpointId: string}> {
    const tracked = this.#breakpoints.get(idOrBreakpointId)
    if (tracked !== undefined) {
      const attempted = new Set<string>()
      for (const installed of tracked.installedByScriptId.values()) {
        if (attempted.has(installed.breakpointId)) continue
        attempted.add(installed.breakpointId)
        await this.#removeBunBreakpoint(installed.breakpointId, {id: tracked.id})
      }
      for (const breakpointId of tracked.logicalBreakpointIds) {
        if (attempted.has(breakpointId)) continue
        attempted.add(breakpointId)
        await this.#removeBunBreakpoint(breakpointId, {id: tracked.id})
      }
      this.#breakpoints.delete(idOrBreakpointId)
      this.#logger.event("breakpoint.removed", {id: idOrBreakpointId})
      return publicRegistration(tracked)
    }

    for (const current of this.#breakpoints.values()) {
      for (const [scriptId, installed] of current.installedByScriptId) {
        if (installed.breakpointId !== idOrBreakpointId) continue
        await this.#removeBunBreakpoint(idOrBreakpointId, {id: current.id, scriptId})
        current.installedByScriptId.delete(scriptId)
        current.installed = current.installed.filter((item) => item.breakpointId !== idOrBreakpointId)
        current.logicalBreakpointIds.delete(idOrBreakpointId)
        this.#logger.event("breakpoint.bun_removed", {
          id: current.id,
          breakpointId: idOrBreakpointId,
          scriptId,
        })
        return publicRegistration(current)
      }
    }

    await this.#removeBunBreakpoint(idOrBreakpointId)
    this.#logger.event("breakpoint.external_removed", {breakpointId: idOrBreakpointId})
    for (const current of this.#breakpoints.values()) current.logicalBreakpointIds.delete(idOrBreakpointId)
    return {breakpointId: idOrBreakpointId}
  }

  async #installForScript(tracked: TrackedBreakpoint, script: BreakpointScript): Promise<void> {
    if (tracked.installedByScriptId.has(script.scriptId)) return

    const byScriptId = await this.#installByScriptId(tracked, script)
    if (byScriptId) {
      if (tracked.installedByScriptId.has(script.scriptId)) {
        await this.#clearLogicalBreakpoints(tracked, "script_id_installed")
      }
      return
    }

    await this.#installByResolvedUrl(tracked, script)
  }

  async #installByResolvedUrl(tracked: TrackedBreakpoint, script: BreakpointScript): Promise<boolean> {
    const mapped = generatedBreakpointLocation(tracked.spec, script)
    const params: JsonObject = {
      url: script.url,
      lineNumber: mapped.location.lineNumber,
      columnNumber: mapped.location.columnNumber,
    }
    if (typeof tracked.spec.condition === "string") params["condition"] = tracked.spec.condition

    try {
      const result = await this.#client.request("Debugger.setBreakpointByUrl", params)
      const breakpointId = breakpointIdFromResult(result)
      const locations = locationsFromResult(result)
      this.#logger.event("breakpoint.install_by_url.result", {
        id: tracked.id,
        spec: tracked.spec,
        scriptId: script.scriptId,
        url: script.url,
        requestedLocation: mapped.requested,
        generatedLocation: mapped.generated,
        breakpointId,
        locations,
        result,
      })

      if (breakpointId === undefined || locations.length === 0) return false

      this.#rememberInstalled(tracked, {
        breakpointId,
        scriptId: script.scriptId,
        url: script.url,
        result,
      })
      await this.#activateBreakpoints()
      return true
    } catch (error) {
      this.#logger.event("breakpoint.install_by_url.failed", {
        id: tracked.id,
        spec: tracked.spec,
        scriptId: script.scriptId,
        url: script.url,
        requestedLocation: mapped.requested,
        generatedLocation: mapped.generated,
        error: serializeError(error),
      })
      return false
    }
  }

  async #installLogicalByUrl(tracked: TrackedBreakpoint): Promise<boolean> {
    if (tracked.logicalBreakpointIds.size > 0) return true

    const params = logicalBreakpointParams(tracked.spec) ?? runtimeBreakpointParams(tracked.spec)
    if (params === null) return false

    try {
      const result = await this.#client.request("Debugger.setBreakpointByUrl", params)
      const breakpointId = breakpointIdFromResult(result)
      const locations = locationsFromResult(result)
      this.#logger.event("breakpoint.logical_by_url.result", {
        id: tracked.id,
        spec: tracked.spec,
        params,
        breakpointId,
        locations,
        result,
      })

      if (breakpointId === undefined) return false
      tracked.logicalBreakpointIds.add(breakpointId)
      this.#rememberInstalled(tracked, {
        breakpointId,
        scriptId: "",
        url: logicalBreakpointUrl(params),
        result,
      }, `logical:${breakpointId}`)
      await this.#activateBreakpoints()
      return true
    } catch (error) {
      this.#logger.event("breakpoint.logical_by_url.failed", {
        id: tracked.id,
        spec: tracked.spec,
        params,
        error: serializeError(error),
      })
      return false
    }
  }

  async #installByScriptId(tracked: TrackedBreakpoint, script: BreakpointScript): Promise<boolean> {
    const mapped = generatedBreakpointLocation(tracked.spec, script)
    const location: JsonObject = {scriptId: script.scriptId, ...mapped.location}
    const params: JsonObject = {location}
    if (typeof tracked.spec.condition === "string") params["condition"] = tracked.spec.condition

    try {
      const result = await this.#client.request("Debugger.setBreakpoint", params)
      const breakpointId = breakpointIdFromResult(result)
      if (breakpointId === undefined) {
        this.#logger.event("breakpoint.install.no_id", {
          id: tracked.id,
          scriptId: script.scriptId,
          url: script.url,
          requestedLocation: mapped.requested,
          generatedLocation: mapped.generated,
          result,
        })
        return false
      }

      const installed: InstalledBreakpoint = {
        breakpointId,
        scriptId: script.scriptId,
        url: script.url,
        result,
      }
      this.#rememberInstalled(tracked, installed)
      await this.#activateBreakpoints()
      this.#logger.event("breakpoint.installed", {
        id: tracked.id,
        spec: tracked.spec,
        scriptId: script.scriptId,
        url: script.url,
        requestedLocation: mapped.requested,
        generatedLocation: mapped.generated,
        breakpointId,
        result,
      })
      return true
    } catch (error) {
      if (isDuplicateBreakpointError(error) && tracked.logicalBreakpointIds.size > 0) {
        this.#logger.event("breakpoint.installed.logical_cover", {
          id: tracked.id,
          spec: tracked.spec,
          scriptId: script.scriptId,
          url: script.url,
          requestedLocation: mapped.requested,
          generatedLocation: mapped.generated,
          error: serializeError(error),
        })
        return true
      }
      this.#logger.event("breakpoint.install.failed", {
        id: tracked.id,
        spec: tracked.spec,
        scriptId: script.scriptId,
        url: script.url,
        requestedLocation: mapped.requested,
        generatedLocation: mapped.generated,
        error: serializeError(error),
      })
      return false
    }
  }

  #rememberInstalled(tracked: TrackedBreakpoint, installed: InstalledBreakpoint, key = installed.scriptId): void {
    if (tracked.installed.some((current) => current.breakpointId === installed.breakpointId && current.scriptId === installed.scriptId)) return
    tracked.installedByScriptId.set(key, installed)
    tracked.installed.push(installed)
  }

  async #clearLogicalBreakpoints(tracked: TrackedBreakpoint, reason: string): Promise<void> {
    if (tracked.logicalBreakpointIds.size === 0) return

    const pendingIds = [...tracked.logicalBreakpointIds]
    const removedIds = new Set<string>()
    for (const breakpointId of pendingIds) {
      const removed = await this.#removeBunBreakpoint(breakpointId, {id: tracked.id})
      if (removed) removedIds.add(breakpointId)
    }
    if (removedIds.size === 0) return

    for (const breakpointId of removedIds) tracked.logicalBreakpointIds.delete(breakpointId)
    for (const [key, installed] of tracked.installedByScriptId) {
      if (removedIds.has(installed.breakpointId)) tracked.installedByScriptId.delete(key)
    }
    tracked.installed = tracked.installed.filter((installed) => !removedIds.has(installed.breakpointId))
    this.#logger.event("breakpoint.logical_cleared", {
      id: tracked.id,
      reason,
      breakpointIds: [...removedIds],
    })
  }

  async #removeBunBreakpoint(
    breakpointId: string,
    detail: {id?: string; scriptId?: string} = {},
  ): Promise<boolean> {
    try {
      await this.#client.request("Debugger.removeBreakpoint", {breakpointId})
      return true
    } catch (error) {
      this.#logger.event("breakpoint.remove.failed", {
        ...detail,
        breakpointId,
        error: serializeError(error),
      })
      return false
    }
  }

  async #activateBreakpoints(): Promise<void> {
    try {
      await this.#client.request("Debugger.setBreakpointsActive", {active: true})
    } catch (error) {
      this.#logger.event("breakpoint.activate.failed", {error: serializeError(error)})
    }
  }
}

export function logicalBreakpointParams(spec: BreakpointSpec): JsonObject | null {
  const params: JsonObject = {
    lineNumber: Math.max(0, Math.floor(spec.line) - 1),
    columnNumber: spec.column ?? 0,
  }
  if (typeof spec.condition === "string") params["condition"] = spec.condition
  if (spec.urlRegex !== undefined) {
    params["urlRegex"] = spec.urlRegex
    return params
  }
  const url = spec.sourceUrl ?? spec.url
  if (url === undefined || url.length === 0) return null
  if (isLocalTranspiledSource(url)) return null
  params["url"] = url
  return params
}

export function runtimeBreakpointParams(spec: BreakpointSpec, cwd = process.cwd()): JsonObject | null {
  if (spec.urlRegex !== undefined) return null
  const source = spec.sourceUrl ?? spec.url
  if (source === undefined || source.length === 0) return null

  const path = localSourcePath(source, cwd)
  if (path === null) return null
  const loader = transpilerLoader(path)
  if (loader === null) return null

  try {
    const sourceText = readFileSync(path, "utf8")
    const generated = generatedLocationFromTranspiledPrefix(sourceText, loader, spec.line)
    if (generated === null) return null

    const params: JsonObject = {
      url: path,
      lineNumber: generated.line,
      columnNumber: spec.column ?? 0,
    }
    if (typeof spec.condition === "string") params["condition"] = spec.condition
    return params
  } catch {
    return null
  }
}

function generatedLocationFromTranspiledPrefix(
  sourceText: string,
  loader: "js" | "jsx" | "ts" | "tsx",
  sourceLine: number,
): {line: number} | null {
  const line = Math.max(1, Math.floor(sourceLine))
  const lines = sourceText.split("\n")
  const source = lines[line - 1]?.trim() ?? ""
  if (source.length === 0 || source.startsWith("//") || source.startsWith("*") || source.startsWith("/*")) return null

  try {
    const prefix = lines.slice(0, line).join("\n")
    const output = new Bun.Transpiler({loader}).transformSync(prefix)
    const generatedLines = output.split("\n")
    for (let idx = generatedLines.length - 1; idx >= 0; idx--) {
      if (generatedLines[idx]!.trim().length > 0) return {line: idx}
    }
    return null
  } catch {
    return null
  }
}

function localSourcePath(source: string, cwd: string): string | null {
  const clean = source.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (clean.length === 0) return null
  if (clean.startsWith("file:")) {
    try {
      const path = fileURLToPath(clean)
      return existsSync(path) ? path : null
    } catch {
      return null
    }
  }
  if (/^[A-Za-z]:\//.test(clean) || clean.startsWith("/")) return existsSync(clean) ? clean : null

  const stripped = clean.replace(/^r\//, "").replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "")
  const path = resolve(cwd, stripped)
  return existsSync(path) ? path : null
}

function transpilerLoader(path: string): "js" | "jsx" | "ts" | "tsx" | null {
  switch (extname(path).toLowerCase()) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return "js"
    case ".jsx":
      return "jsx"
    case ".ts":
    case ".mts":
    case ".cts":
      return "ts"
    case ".tsx":
      return "tsx"
    default:
      return null
  }
}

function isLocalTranspiledSource(source: string, cwd = process.cwd()): boolean {
  const path = localSourcePath(source, cwd)
  if (path === null) return false
  const loader = transpilerLoader(path)
  return loader === "ts" || loader === "tsx"
}

function logicalBreakpointUrl(params: JsonObject): string {
  const url = params["url"]
  if (typeof url === "string") return url
  const urlRegex = params["urlRegex"]
  if (typeof urlRegex === "string") return urlRegex
  return ""
}

export function matchesBreakpointSpec(spec: BreakpointSpec, scriptUrl: string): boolean {
  if (spec.url !== undefined && sameScriptUrl(spec.url, scriptUrl)) return true
  if (spec.urlRegex !== undefined) {
    try {
      const regex = new RegExp(spec.urlRegex)
      return scriptUrlVariants(scriptUrl).some((url) => regex.test(url))
    } catch {
      return false
    }
  }
  return false
}

function matchesBreakpointSource(spec: BreakpointSpec, script: BreakpointScript): boolean {
  if (spec.sourceUrl === undefined) return false
  return sourceMapMapper(script.sourceMapURL)
    .sources()
    .some((source) => sameScriptUrl(spec.sourceUrl!, source))
}

function sameScriptUrl(expected: string, actual: string): boolean {
  const expectedVariants = new Set(scriptUrlVariants(expected))
  if (scriptUrlVariants(actual).some((variant) => expectedVariants.has(variant))) return true

  const expectedPaths = scriptUrlVariants(expected).map(scriptPathParts).filter((parts) => parts.length > 0)
  const actualPaths = scriptUrlVariants(actual).map(scriptPathParts).filter((parts) => parts.length > 0)
  return expectedPaths.some((expectedPath) => actualPaths.some((actualPath) => samePathSuffix(expectedPath, actualPath)))
}

function scriptUrlVariants(input: string): string[] {
  const variants = new Set<string>()
  if (input.length === 0) return []

  variants.add(input)

  if (input.startsWith("file://")) {
    try {
      variants.add(fileURLToPath(input))
    } catch {}
  } else if (input.startsWith("/")) {
    try {
      variants.add(pathToFileURL(input).href)
    } catch {}
  }

  return [...variants]
}

function scriptPathParts(input: string): string[] {
  let clean = input.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  try {
    const url = new URL(clean)
    if (url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:") {
      clean = decodeURIComponent(url.pathname)
    }
  } catch {}
  const parts = clean.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..")
  if (parts[0] === "r") parts.shift()
  return parts
}

function samePathSuffix(a: string[], b: string[]): boolean {
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length < 2 || shorter.length > longer.length) return false
  const offset = longer.length - shorter.length
  for (let idx = 0; idx < shorter.length; idx++) {
    if (shorter[idx] !== longer[offset + idx]) return false
  }
  return true
}

function breakpointIdFromResult(result: unknown): string | undefined {
  const object = asObject(result)
  return asString(object?.["breakpointId"])
}

function isDuplicateBreakpointError(error: unknown): boolean {
  return serializeError(error).includes("Breakpoint for given location already exists")
}

function locationsFromResult(result: unknown): JsonObject[] {
  const object = asObject(result)
  const locations = object?.["locations"]
  if (!Array.isArray(locations)) return []
  return locations
    .map((location) => asObject(location))
    .filter((location): location is JsonObject => location !== undefined)
}

function publicRegistration(tracked: TrackedBreakpoint): BreakpointRegistration {
  return {
    id: tracked.id,
    spec: tracked.spec,
    installed: [...tracked.installed],
  }
}

function generatedBreakpointLocation(spec: BreakpointSpec, script: BreakpointScript): {
  requested: {lineNumber: number; columnNumber: number}
  generated: SourceMapLookup
  location: {lineNumber: number; columnNumber: number}
} {
  const requested = {
    lineNumber: Math.max(0, Math.floor(spec.line) - 1),
    columnNumber: spec.column ?? 0,
  }
  const generated = sourceMapMapper(script.sourceMapURL).generatedLocation({
    line: requested.lineNumber,
    column: requested.columnNumber,
    url: spec.sourceUrl ?? spec.url ?? script.url,
  })
  return {
    requested,
    generated,
    location: {
      lineNumber: generated.line,
      columnNumber: generated.column,
    },
  }
}
