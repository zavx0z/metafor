export type StoredBreakpointSpec = {
  url?: string
  sourceUrl?: string
  urlRegex?: string
  line: number
  column?: number
  condition?: string
}

export type BreakpointStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type StoredBreakpointState = {
  version: 2
  processes: Record<string, StoredBreakpointSpec[]>
}

export const BREAKPOINTS_STORAGE_KEY = "interpreter:breakpoints:v2"
export const LEGACY_BREAKPOINTS_STORAGE_KEY = "interpreter:breakpoints:v1"

export function readProcessBreakpointSpecs(storage: Pick<BreakpointStorage, "getItem">, processId: string): StoredBreakpointSpec[] {
  const normalizedProcessId = normalizeProcessId(processId)
  if (normalizedProcessId.length === 0) return []

  const state = readStoredBreakpointState(storage)
  if (Object.prototype.hasOwnProperty.call(state.processes, normalizedProcessId)) {
    return state.processes[normalizedProcessId] ?? []
  }

  return readLegacyBreakpointSpecs(storage)
}

export function writeProcessBreakpointSpecs(storage: BreakpointStorage, processId: string, specs: readonly StoredBreakpointSpec[]): void {
  const normalizedProcessId = normalizeProcessId(processId)
  if (normalizedProcessId.length === 0) return

  const state = readStoredBreakpointState(storage)
  const normalizedSpecs = dedupeStoredBreakpointSpecs(specs)
  if (normalizedSpecs.length === 0) {
    delete state.processes[normalizedProcessId]
  } else {
    state.processes[normalizedProcessId] = normalizedSpecs
  }
  writeStoredBreakpointState(storage, state)
}

export function mergeProcessBreakpointSpecs(storage: BreakpointStorage, processId: string, specs: readonly StoredBreakpointSpec[]): void {
  const current = readProcessBreakpointSpecs(storage, processId)
  writeProcessBreakpointSpecs(storage, processId, [...current, ...specs])
}

export function removeProcessBreakpointSpec(storage: BreakpointStorage, processId: string, spec: StoredBreakpointSpec): void {
  const targetKey = storedBreakpointSpecKey(spec)
  const next = readProcessBreakpointSpecs(storage, processId).filter((current) => storedBreakpointSpecKey(current) !== targetKey)
  writeProcessBreakpointSpecs(storage, processId, next)
}

export function readStoredBreakpointState(storage: Pick<BreakpointStorage, "getItem">): StoredBreakpointState {
  const raw = storage.getItem(BREAKPOINTS_STORAGE_KEY)
  if (raw === null) return emptyStoredBreakpointState()
  try {
    return parseStoredBreakpointState(JSON.parse(raw))
  } catch {
    return emptyStoredBreakpointState()
  }
}

export function readLegacyBreakpointSpecs(storage: Pick<BreakpointStorage, "getItem">): StoredBreakpointSpec[] {
  const raw = storage.getItem(LEGACY_BREAKPOINTS_STORAGE_KEY)
  if (raw === null) return []
  try {
    return parseStoredBreakpointSpecs(JSON.parse(raw))
  } catch {
    return []
  }
}

export function parseStoredBreakpointState(value: unknown): StoredBreakpointState {
  if (typeof value !== "object" || value === null) return emptyStoredBreakpointState()
  const object = value as Record<string, unknown>
  const processes = object["processes"]
  if (typeof processes !== "object" || processes === null || Array.isArray(processes)) return emptyStoredBreakpointState()

  const next: StoredBreakpointState = emptyStoredBreakpointState()
  for (const [processId, rawSpecs] of Object.entries(processes as Record<string, unknown>)) {
    const normalizedProcessId = normalizeProcessId(processId)
    if (normalizedProcessId.length === 0) continue
    const specs = parseStoredBreakpointSpecs(rawSpecs)
    if (specs.length > 0) next.processes[normalizedProcessId] = specs
  }
  return next
}

export function parseStoredBreakpointSpecs(value: unknown): StoredBreakpointSpec[] {
  if (!Array.isArray(value)) return []
  const out: StoredBreakpointSpec[] = []
  for (const item of value) {
    const spec = normalizeStoredBreakpointSpec(item)
    if (spec !== null) out.push(spec)
  }
  return dedupeStoredBreakpointSpecs(out)
}

export function normalizeStoredBreakpointSpec(value: unknown): StoredBreakpointSpec | null {
  if (typeof value !== "object" || value === null) return null
  const object = value as Record<string, unknown>
  const line = object["line"]
  if (typeof line !== "number" || !Number.isInteger(line) || line <= 0) return null

  const url = typeof object["url"] === "string" ? object["url"].trim() : ""
  const sourceUrl = typeof object["sourceUrl"] === "string" ? object["sourceUrl"].trim() : ""
  const urlRegex = typeof object["urlRegex"] === "string" ? object["urlRegex"].trim() : ""
  if (url.length === 0 && sourceUrl.length === 0 && urlRegex.length === 0) return null

  const spec: StoredBreakpointSpec = {line}
  if (url.length > 0) spec.url = url
  if (sourceUrl.length > 0) spec.sourceUrl = sourceUrl
  if (urlRegex.length > 0) spec.urlRegex = urlRegex

  const column = object["column"]
  if (typeof column === "number" && Number.isInteger(column) && column >= 0) spec.column = column

  const condition = typeof object["condition"] === "string" ? object["condition"].trim() : ""
  if (condition.length > 0) spec.condition = condition

  return spec
}

export function dedupeStoredBreakpointSpecs(specs: readonly StoredBreakpointSpec[]): StoredBreakpointSpec[] {
  const byKey = new Map<string, StoredBreakpointSpec>()
  for (const spec of specs) {
    const normalized = normalizeStoredBreakpointSpec(spec)
    if (normalized === null) continue
    byKey.set(storedBreakpointSpecKey(normalized), normalized)
  }
  return [...byKey.values()].sort((a, b) => {
    const urlA = a.sourceUrl ?? a.url ?? a.urlRegex ?? ""
    const urlB = b.sourceUrl ?? b.url ?? b.urlRegex ?? ""
    if (urlA !== urlB) return urlA.localeCompare(urlB)
    if (a.line !== b.line) return a.line - b.line
    return (a.column ?? 0) - (b.column ?? 0)
  })
}

export function storedBreakpointSpecKey(spec: StoredBreakpointSpec): string {
  return [
    spec.url ?? "",
    spec.sourceUrl ?? "",
    spec.urlRegex ?? "",
    String(spec.line),
    String(spec.column ?? 0),
    spec.condition ?? "",
  ].join("\0")
}

function writeStoredBreakpointState(storage: BreakpointStorage, state: StoredBreakpointState): void {
  const processes: Record<string, StoredBreakpointSpec[]> = {}
  for (const [processId, specs] of Object.entries(state.processes)) {
    const normalizedProcessId = normalizeProcessId(processId)
    const normalizedSpecs = dedupeStoredBreakpointSpecs(specs)
    if (normalizedProcessId.length > 0 && normalizedSpecs.length > 0) processes[normalizedProcessId] = normalizedSpecs
  }

  if (Object.keys(processes).length === 0) {
    storage.removeItem(BREAKPOINTS_STORAGE_KEY)
    return
  }
  storage.setItem(BREAKPOINTS_STORAGE_KEY, JSON.stringify({version: 2, processes}))
}

function emptyStoredBreakpointState(): StoredBreakpointState {
  return {version: 2, processes: {}}
}

function normalizeProcessId(processId: string): string {
  return processId.trim()
}
