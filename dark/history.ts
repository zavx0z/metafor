import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import {dirname} from "node:path"
import type {SourcedParticle} from "shared/protocol/force/particle"
import type {
  DarkHistoryClearRequest,
  DarkHistoryClearResult,
  DarkHistoryDirection,
  DarkHistoryEntry,
  DarkHistoryReadRequest,
  DarkHistoryReadResult,
  DarkHistoryTimeStep,
} from "@metafor/types/dark/history"

const DEFAULT_LIMIT_STEPS = 250
const MAX_LIMIT_STEPS = 1_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const nonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return Number(value)
}

const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return Number(value)
}

type NormalizedReadRequest = {
  fromTs: number
  toTs: number
  limitSteps: number
}

const readRequest = (value: unknown): NormalizedReadRequest => {
  if (value === undefined || value === null) {
    return {fromTs: 0, toTs: Number.MAX_SAFE_INTEGER, limitSteps: DEFAULT_LIMIT_STEPS}
  }
  if (!isRecord(value)) throw new Error("Dark history read params must be an object")
  const fromTs = value.fromTs === undefined
    ? 0
    : nonNegativeInteger(value.fromTs, "fromTs")
  const toTs = value.toTs === undefined
    ? Number.MAX_SAFE_INTEGER
    : nonNegativeInteger(value.toTs, "toTs")
  if (toTs < fromTs) throw new Error("toTs must be greater than or equal to fromTs")
  const limitSteps = value.limitSteps === undefined
    ? DEFAULT_LIMIT_STEPS
    : positiveInteger(value.limitSteps, "limitSteps")
  if (limitSteps > MAX_LIMIT_STEPS) throw new Error(`limitSteps must not exceed ${MAX_LIMIT_STEPS}`)
  return {fromTs, toTs, limitSteps}
}

const parseLine = (line: string, filename: string, lineNumber: number): DarkHistoryEntry => {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error(`Dark history is corrupted at ${filename}:${lineNumber}`)
  }
  if (
    !isRecord(value) ||
    (value.direction !== "incoming" && value.direction !== "outgoing") ||
    !isRecord(value.particle) || typeof value.particle.by !== "string" ||
    !Number.isSafeInteger(value.particle.ts) || Number(value.particle.ts) < 0
  ) throw new Error(`Dark history entry is invalid at ${filename}:${lineNumber}`)
  return value as DarkHistoryEntry
}

/** Append-only physical adapter for Dark's parallel time-step history. */
export class DarkHistory {
  #count = 0
  #latestTs: number | null = null

  constructor(readonly filename: string) {
    mkdirSync(dirname(filename), {recursive: true})
    if (!existsSync(filename)) writeFileSync(filename, "", "utf8")
    const entries = this.#entries()
    this.#count = entries.length
    this.#latestTs = entries.reduce<number | null>(
      (latest, entry) => latest === null ? entry.particle.ts : Math.max(latest, entry.particle.ts),
      null,
    )
  }

  get latestTs(): number | null {
    return this.#latestTs
  }

  record(direction: DarkHistoryDirection, particle: SourcedParticle): DarkHistoryEntry {
    const entry: DarkHistoryEntry = {
      direction,
      particle: structuredClone(particle),
    }
    appendFileSync(this.filename, `${JSON.stringify(entry)}\n`, "utf8")
    this.#count += 1
    this.#latestTs = this.#latestTs === null ? particle.ts : Math.max(this.#latestTs, particle.ts)
    return structuredClone(entry)
  }

  read(params: unknown = {}): DarkHistoryReadResult {
    const {fromTs, toTs, limitSteps} = readRequest(params)
    const byTimeStep = new Map<number, DarkHistoryEntry[]>()
    for (const entry of this.#entries()) {
      const ts = entry.particle.ts
      if (ts < fromTs || ts > toTs) continue
      const patches = byTimeStep.get(ts) ?? []
      patches.push(entry)
      byTimeStep.set(ts, patches)
    }
    const matching: DarkHistoryTimeStep[] = [...byTimeStep.entries()]
      .sort(([left], [right]) => left - right)
      .map(([ts, patches]) => ({ts, patches}))
    const steps = matching.slice(0, limitSteps)
    return {
      version: 1,
      steps,
      throughTs: steps.at(-1)?.ts ?? null,
      latestTs: this.#latestTs,
      hasMore: matching.length > steps.length,
    }
  }

  clear(params: unknown): DarkHistoryClearResult {
    const request = params as Partial<DarkHistoryClearRequest> | null
    if (!isRecord(request) || request.confirm !== "clear-dark-history") {
      throw new Error('Dark history clear requires confirm: "clear-dark-history"')
    }
    const removed = this.#count
    writeFileSync(this.filename, "", "utf8")
    this.#count = 0
    this.#latestTs = null
    return {version: 1, removed, latestTs: null}
  }

  #entries(): DarkHistoryEntry[] {
    const content = readFileSync(this.filename, "utf8")
    if (!content) return []
    return content
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line, index) => parseLine(line, this.filename, index + 1))
  }
}
