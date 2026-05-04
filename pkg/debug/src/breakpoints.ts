import {fileURLToPath, pathToFileURL} from "node:url"
import {serializeError} from "./errors.ts"
import {asObject, asString} from "./guards.ts"
import type {InspectorClient} from "./inspector-client.ts"
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
}

export class BreakpointStore {
  #client: InspectorClient
  #logger: EventLogger
  #nextId = 1
  #breakpoints = new Map<string, TrackedBreakpoint>()

  constructor(options: {
    client: InspectorClient
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

  add(spec: BreakpointSpec): BreakpointRegistration {
    const id = `agent-bp-${this.#nextId++}`
    const tracked: TrackedBreakpoint = {
      id,
      spec,
      installed: [],
      installedByScriptId: new Map(),
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
      if (!matchesBreakpointSpec(tracked.spec, script.url)) continue
      await this.#installForScript(tracked, script)
    }
  }

  async applyToScripts(scripts: BreakpointScript[]): Promise<void> {
    for (const script of scripts) {
      await this.handleScriptParsed(script)
    }
  }

  async remove(idOrBreakpointId: string): Promise<BreakpointRegistration | {breakpointId: string}> {
    const tracked = this.#breakpoints.get(idOrBreakpointId)
    if (tracked !== undefined) {
      for (const installed of tracked.installedByScriptId.values()) {
        await this.#removeBunBreakpoint(installed.breakpointId)
      }
      this.#breakpoints.delete(idOrBreakpointId)
      this.#logger.event("breakpoint.removed", {id: idOrBreakpointId})
      return publicRegistration(tracked)
    }

    for (const current of this.#breakpoints.values()) {
      for (const [scriptId, installed] of current.installedByScriptId) {
        if (installed.breakpointId !== idOrBreakpointId) continue
        await this.#removeBunBreakpoint(idOrBreakpointId)
        current.installedByScriptId.delete(scriptId)
        current.installed = current.installed.filter((item) => item.breakpointId !== idOrBreakpointId)
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
    return {breakpointId: idOrBreakpointId}
  }

  async #installForScript(tracked: TrackedBreakpoint, script: BreakpointScript): Promise<void> {
    if (tracked.installedByScriptId.has(script.scriptId)) return

    const byScriptId = await this.#installByScriptId(tracked, script)
    if (byScriptId) return

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

  #rememberInstalled(tracked: TrackedBreakpoint, installed: InstalledBreakpoint): void {
    tracked.installedByScriptId.set(installed.scriptId, installed)
    tracked.installed.push(installed)
  }

  async #removeBunBreakpoint(breakpointId: string): Promise<void> {
    await this.#client.request("Debugger.removeBreakpoint", {breakpointId})
  }

  async #activateBreakpoints(): Promise<void> {
    try {
      await this.#client.request("Debugger.setBreakpointsActive", {active: true})
    } catch (error) {
      this.#logger.event("breakpoint.activate.failed", {error: serializeError(error)})
    }
  }
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

function sameScriptUrl(expected: string, actual: string): boolean {
  const expectedVariants = new Set(scriptUrlVariants(expected))
  return scriptUrlVariants(actual).some((variant) => expectedVariants.has(variant))
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

function breakpointIdFromResult(result: unknown): string | undefined {
  const object = asObject(result)
  return asString(object?.["breakpointId"])
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
    url: script.url,
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
