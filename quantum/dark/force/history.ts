import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs"
import {join} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
  META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
  type MetaAuthoringCauseV1,
} from "shared/protocol/metafor/authoring"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {
  type Part,
  type ParticleOperation,
  type SourcedParticle,
} from "shared/protocol/force/particle"

export const DARK_FORCE_HISTORY_SCHEMA = "metafor/dark-force-history/v1" as const
export const DARK_FORCE_PARTICLE_SCHEMA = "metafor/dark-force-particle/v1" as const
export const DARK_FORCE_HISTORY_CATALOG_SCHEMA = "metafor/dark-force-history-catalog/v1" as const
export const DARK_FORCE_HISTORY_SEGMENT_CAPACITY = 4_096

const MANIFEST_FILE = "manifest.json"
const CATALOG_FILE = "catalog.json"
const SEGMENTS_DIRECTORY = "segments"
const SEGMENT_NAME = /^\d{20}\.ndjson$/
const parts = new Set<Part>(["inflaton", "graviton", "photon", "gluon", "higgs", "w+", "w-", "z"])
const operations = new Set<ParticleOperation>(["add", "remove", "replace", "move", "copy", "test"])

export type DarkForceHistoryManifest = {
  schema: typeof DARK_FORCE_HISTORY_SCHEMA
  cutId: string
  startedAt: string
  retroactiveComplete: false
  legacyHistory: "removed-after-backup"
  segmentCapacity: number
}

export type DarkForceHistoryParticle = {
  schema: typeof DARK_FORCE_PARTICLE_SCHEMA
  id: string
  sequence: number
  acceptedAt: string
  particle: SourcedParticle
  authoring?: MetaAuthoringCauseV1
}

export type DarkForceHistorySegment = {
  file: string
  firstSequence: number
  lastSequence: number
  minAcceptedAt: string
  maxAcceptedAt: string
  minParticleTs: number
  maxParticleTs: number
  count: number
}

export type DarkForceHistoryCatalog = {
  schema: typeof DARK_FORCE_HISTORY_CATALOG_SCHEMA
  cutId: string
  segments: DarkForceHistorySegment[]
}

export type DarkForceHistoryStatus = {
  path: string
  cutId: string
  startedAt: string
  sequence: number
  segments: number
  retroactiveComplete: false
}

export type DarkForceHistoryCutInput = {
  cutId: string
  startedAt?: string
  segmentCapacity?: number
}

export type DarkForceHistoryQuery = {
  id?: string
  fromSequence?: number
  toSequence?: number
  fromAcceptedAt?: string
  toAcceptedAt?: string
  fromParticleTs?: number
  toParticleTs?: number
  part?: Part
  op?: ParticleOperation
  by?: string
  from?: string
  path?: string | number
  limit?: number
}

export type DarkForceHistoryOptions = {
  now?: () => Date
}

const segmentFile = (firstSequence: number): string =>
  `${String(firstSequence).padStart(20, "0")}.ndjson`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value)
  return required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key)) &&
    Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key))
}

const isSafeSequence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const isTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isFinitePath = (value: unknown): value is string | number =>
  typeof value === "string" || (typeof value === "number" && Number.isFinite(value))

const isCanonicalTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false
  const milliseconds = Date.parse(value)
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value
}

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/

const parseAuthoringCause = (
  value: unknown,
  location: string,
): MetaAuthoringCauseV1 => {
  if (
    !isJSONData(value) ||
    !isRecord(value) ||
    !exactKeys(value, [
      "schema",
      "contractVersion",
      "rpcSource",
      "operationId",
      "requestDigest",
      "sourceProjections",
    ]) ||
    (value.schema !== META_MATTER_AUTHORING_CAUSE_SCHEMA_V1 &&
      value.schema !== META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1) ||
    value.contractVersion !== META_AUTHORING_CONTRACT_VERSION ||
    typeof value.rpcSource !== "string" ||
    value.rpcSource.length === 0 ||
    value.rpcSource.length > 256 ||
    value.rpcSource.trim() !== value.rpcSource ||
    typeof value.operationId !== "string" ||
    !operationIdPattern.test(value.operationId) ||
    typeof value.requestDigest !== "string" ||
    !digestPattern.test(value.requestDigest) ||
    !Array.isArray(value.sourceProjections) ||
    value.sourceProjections.length === 0
  ) throw new Error(`Dark Force history authoring cause is invalid at ${location}`)

  const targets = new Set<string>()
  let previous = ""
  const sourceProjections = value.sourceProjections.map((projection, index) => {
    const declaration = value.schema === META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1
    const path = isRecord(projection) && typeof projection.path === "string"
      ? projection.path
      : "meta.ts"
    const target = isRecord(projection) && typeof projection.address === "string"
      ? `${projection.address}\u0000${path}`
      : ""
    if (
      !isRecord(projection) ||
      !exactKeys(projection, ["address", "beforeRevision", "afterRevision"], declaration ? ["path"] : []) ||
      typeof projection.address !== "string" ||
      parseMetaAddress(projection.address) === null ||
      (path !== "meta.ts" && !/^actions\/[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.ts$/.test(path)) ||
      targets.has(target) ||
      target.localeCompare(previous) < 0 ||
      typeof projection.beforeRevision !== "string" ||
      (!digestPattern.test(projection.beforeRevision) && !(
        declaration && path !== "meta.ts" && projection.beforeRevision === "absent"
      )) ||
      typeof projection.afterRevision !== "string" ||
      !digestPattern.test(projection.afterRevision) ||
      projection.beforeRevision === projection.afterRevision
    ) {
      throw new Error(
        `Dark Force history authoring source projection is invalid at ${location}.sourceProjections[${index}]`,
      )
    }
    targets.add(target)
    previous = target
    return {
      address: projection.address,
      ...(Object.hasOwn(projection, "path") ? {path: path as "meta.ts" | `actions/${string}.ts`} : {}),
      beforeRevision: projection.beforeRevision,
      afterRevision: projection.afterRevision,
    }
  })
  return structuredClone({
    schema: value.schema,
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    rpcSource: value.rpcSource,
    operationId: value.operationId,
    requestDigest: value.requestDigest,
    sourceProjections,
  }) as MetaAuthoringCauseV1
}

const authoringKey = (
  value: Pick<MetaAuthoringCauseV1, "rpcSource" | "operationId">,
): string => `${value.rpcSource}\u0000${value.operationId}`

const isJSONData = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object") return false
  if (ancestors.has(value)) return false

  const prototype = Object.getPrototypeOf(value)
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some((key) => typeof key !== "string")) return false
    if (keys.some((key) =>
      typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))) return false
    if (keys.some((key) => {
      if (key === "length") return false
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      return !descriptor || !descriptor.enumerable || !("value" in descriptor)
    })) return false
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) return false
    }
  } else {
    if (prototype !== Object.prototype && prototype !== null) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(descriptors).some((key) => {
      if (typeof key !== "string") return true
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      return !descriptor || !descriptor.enumerable || !("value" in descriptor)
    })) return false
  }

  ancestors.add(value)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    return Reflect.ownKeys(descriptors).every((key) => {
      if (key === "length" && Array.isArray(value)) return true
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      return Boolean(descriptor && "value" in descriptor && isJSONData(descriptor.value, ancestors))
    })
  } finally {
    ancestors.delete(value)
  }
}

const parseParticle = (value: unknown, location: string): SourcedParticle => {
  if (
    !isJSONData(value) ||
    !isRecord(value) ||
    !exactKeys(value, ["part", "op", "path", "by", "ts"], ["value", "from"])
  ) {
    throw new Error(`Dark Force history Particle is invalid at ${location}`)
  }
  if (
    !parts.has(value.part as Part) ||
    !operations.has(value.op as ParticleOperation) ||
    !isFinitePath(value.path) ||
    typeof value.by !== "string" ||
    value.by.trim().length === 0 ||
    !isTimestamp(value.ts) ||
    (Object.hasOwn(value, "from") && !isFinitePath(value.from)) ||
    (Object.hasOwn(value, "value") && !isJSONData(value.value))
  ) throw new Error(`Dark Force history Particle is invalid at ${location}`)
  return structuredClone(value) as unknown as SourcedParticle
}

const parseManifest = (value: unknown, filename: string): DarkForceHistoryManifest => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schema",
      "cutId",
      "startedAt",
      "retroactiveComplete",
      "legacyHistory",
      "segmentCapacity",
    ]) ||
    value.schema !== DARK_FORCE_HISTORY_SCHEMA ||
    typeof value.cutId !== "string" ||
    !/^[A-Za-z0-9._-]+$/.test(value.cutId) ||
    !isCanonicalTime(value.startedAt) ||
    value.retroactiveComplete !== false ||
    value.legacyHistory !== "removed-after-backup" ||
    !isSafeSequence(value.segmentCapacity)
  ) throw new Error(`Dark Force history manifest is invalid: ${filename}`)
  return value as DarkForceHistoryManifest
}

const parseEntry = (
  value: unknown,
  manifest: DarkForceHistoryManifest,
  expectedSequence: number,
  location: string,
): DarkForceHistoryParticle => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["schema", "id", "sequence", "acceptedAt", "particle"], ["authoring"]) ||
    value.schema !== DARK_FORCE_PARTICLE_SCHEMA ||
    value.id !== `${manifest.cutId}:${expectedSequence}` ||
    value.sequence !== expectedSequence ||
    !isCanonicalTime(value.acceptedAt)
  ) throw new Error(`Dark Force history entry is invalid at ${location}`)
  const entry: DarkForceHistoryParticle = {
    schema: DARK_FORCE_PARTICLE_SCHEMA,
    id: value.id,
    sequence: value.sequence,
    acceptedAt: value.acceptedAt,
    particle: parseParticle(value.particle, `${location}.particle`),
  }
  if (Object.hasOwn(value, "authoring")) {
    entry.authoring = parseAuthoringCause(value.authoring, `${location}.authoring`)
  }
  return entry
}

const readJSON = (filename: string): unknown => {
  try {
    return JSON.parse(readFileSync(filename, "utf8")) as unknown
  } catch {
    throw new Error(`Dark Force history JSON is invalid: ${filename}`)
  }
}

const writeDurableJSON = (filename: string, value: unknown, exclusive = false): void => {
  const descriptor = openSync(filename, exclusive ? "wx" : "w", 0o600)
  try {
    writeSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, undefined, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

const appendDurable = (filename: string, value: unknown): void => {
  const descriptor = openSync(filename, "a", 0o600)
  try {
    writeSync(descriptor, `${JSON.stringify(value)}\n`, undefined, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

const segmentSummary = (file: string, entries: readonly DarkForceHistoryParticle[]): DarkForceHistorySegment => {
  const accepted = entries.map((entry) => entry.acceptedAt)
  const particleTs = entries.map((entry) => entry.particle.ts)
  return {
    file,
    firstSequence: entries[0]!.sequence,
    lastSequence: entries.at(-1)!.sequence,
    minAcceptedAt: accepted.reduce((minimum, value) => value < minimum ? value : minimum),
    maxAcceptedAt: accepted.reduce((maximum, value) => value > maximum ? value : maximum),
    minParticleTs: Math.min(...particleTs),
    maxParticleTs: Math.max(...particleTs),
    count: entries.length,
  }
}

const readSegment = (
  root: string,
  file: string,
  manifest: DarkForceHistoryManifest,
  expectedFirst: number,
): DarkForceHistoryParticle[] => {
  const filename = join(root, SEGMENTS_DIRECTORY, file)
  const text = readFileSync(filename, "utf8")
  if (text.length === 0 || !text.endsWith("\n")) {
    throw new Error(`Dark Force history segment has a truncated tail: ${filename}`)
  }
  const lines = text.slice(0, -1).split("\n")
  if (lines.length === 0 || lines.length > manifest.segmentCapacity) {
    throw new Error(`Dark Force history segment size is invalid: ${filename}`)
  }
  return lines.map((line, index) => {
    let value: unknown
    try {
      value = JSON.parse(line) as unknown
    } catch {
      throw new Error(`Dark Force history entry is invalid at ${filename}:${index + 1}`)
    }
    return parseEntry(value, manifest, expectedFirst + index, `${filename}:${index + 1}`)
  })
}

const sameCatalog = (left: unknown, right: DarkForceHistoryCatalog): boolean => {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

const persistCatalog = (root: string, catalog: DarkForceHistoryCatalog): void => {
  const filename = join(root, CATALOG_FILE)
  const temporary = join(root, `.catalog.${process.pid}.${crypto.randomUUID()}.tmp`)
  try {
    writeDurableJSON(temporary, catalog, true)
    renameSync(temporary, filename)
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
}

const validateRange = (name: string, value: number | undefined, minimum: number): void => {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum)) {
    throw new Error(`Dark Force history ${name} is invalid`)
  }
}

const queryTime = (name: string, value: string | undefined): string | undefined => {
  if (value !== undefined && !isCanonicalTime(value)) throw new Error(`Dark Force history ${name} is invalid`)
  return value
}

/**
 * Complete post-cut append-only Particle history owned by Dark Force.
 *
 * The directory manifest records only the cut. Segment lines contain only
 * accepted Particle envelopes. Every envelope is synchronously appended and
 * fsynced before routing. catalog.json is a rebuildable navigation cache and
 * never participates in Particle acceptance.
 */
export class DarkForceHistory {
  readonly #manifest: DarkForceHistoryManifest
  readonly #now: () => Date
  #activeFile: string | null = null
  #activeEntries: DarkForceHistoryParticle[] = []
  #catalog: DarkForceHistoryCatalog
  #sequence = 0
  readonly #authoring = new Map<string, DarkForceHistoryParticle>()

  constructor(
    readonly directory: string,
    cut?: DarkForceHistoryCutInput,
    options: DarkForceHistoryOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date())
    const manifestFile = join(directory, MANIFEST_FILE)
    const segmentsDirectory = join(directory, SEGMENTS_DIRECTORY)
    const cutId = cut?.cutId.trim()
    if (cut && (!cutId || !/^[A-Za-z0-9._-]+$/.test(cutId))) {
      throw new Error("Dark Force history cutId must use only letters, digits, dot, underscore or hyphen")
    }

    if (!existsSync(manifestFile)) {
      if (!cutId) {
        throw new Error("DARK_FORCE_HISTORY_CUT_ID is required to create the first complete Dark Force history")
      }
      const startedAt = cut?.startedAt ?? this.#now().toISOString()
      if (!isCanonicalTime(startedAt)) throw new Error("Dark Force history startedAt must be a canonical ISO timestamp")
      const segmentCapacity = cut?.segmentCapacity ?? DARK_FORCE_HISTORY_SEGMENT_CAPACITY
      if (!isSafeSequence(segmentCapacity)) throw new Error("Dark Force history segmentCapacity must be a positive safe integer")
      mkdirSync(segmentsDirectory, {recursive: true})
      writeDurableJSON(manifestFile, {
        schema: DARK_FORCE_HISTORY_SCHEMA,
        cutId,
        startedAt,
        retroactiveComplete: false,
        legacyHistory: "removed-after-backup",
        segmentCapacity,
      } satisfies DarkForceHistoryManifest, true)
    }

    this.#manifest = parseManifest(readJSON(manifestFile), manifestFile)
    if (cutId && this.#manifest.cutId !== cutId) {
      throw new Error(`Dark Force history cutId mismatch: expected ${this.#manifest.cutId}, received ${cutId}`)
    }
    if (!existsSync(segmentsDirectory)) {
      throw new Error(`Dark Force history segments directory is missing: ${segmentsDirectory}`)
    }

    const files = readdirSync(segmentsDirectory).toSorted()
    if (files.some((file) => !SEGMENT_NAME.test(file))) {
      throw new Error(`Dark Force history segments directory contains an invalid file: ${segmentsDirectory}`)
    }
    const segments: DarkForceHistorySegment[] = []
    let expectedFirst = 1
    for (const [index, file] of files.entries()) {
      const filenameFirst = Number(file.slice(0, 20))
      if (filenameFirst !== expectedFirst) {
        throw new Error(`Dark Force history segment sequence is invalid: ${file}`)
      }
      const entries = readSegment(directory, file, this.#manifest, expectedFirst)
      for (const entry of entries) this.#registerAuthoring(entry)
      if (index < files.length - 1 && entries.length !== this.#manifest.segmentCapacity) {
        throw new Error(`Dark Force history closed segment is incomplete: ${file}`)
      }
      segments.push(segmentSummary(file, entries))
      if (index === files.length - 1 && entries.length < this.#manifest.segmentCapacity) {
        this.#activeFile = file
        this.#activeEntries = entries
      }
      expectedFirst += entries.length
    }
    this.#sequence = expectedFirst - 1
    this.#catalog = {
      schema: DARK_FORCE_HISTORY_CATALOG_SCHEMA,
      cutId: this.#manifest.cutId,
      segments,
    }
    const catalogFile = join(directory, CATALOG_FILE)
    let storedCatalog: unknown = null
    if (existsSync(catalogFile)) {
      try {
        storedCatalog = readJSON(catalogFile)
      } catch {
        storedCatalog = null
      }
    }
    if (!sameCatalog(storedCatalog, this.#catalog)) persistCatalog(directory, this.#catalog)
  }

  accept(
    particle: SourcedParticle,
    authoring?: MetaAuthoringCauseV1,
  ): DarkForceHistoryParticle {
    const normalized = parseParticle(particle, "accept")
    const normalizedAuthoring = authoring === undefined
      ? undefined
      : parseAuthoringCause(authoring, "accept.authoring")
    if (normalizedAuthoring) {
      const existing = this.#authoring.get(authoringKey(normalizedAuthoring))
      if (existing) {
        const conflict = existing.authoring?.requestDigest === normalizedAuthoring.requestDigest
          ? "already has an accepted Particle"
          : "is already bound to a different request digest"
        throw new Error(
          `Dark Force authoring operation ${normalizedAuthoring.rpcSource}/${normalizedAuthoring.operationId} ${conflict}`,
        )
      }
    }
    const sequence = this.#sequence + 1
    const acceptedAt = this.#now().toISOString()
    if (!isCanonicalTime(acceptedAt)) throw new Error("Dark Force history clock returned an invalid timestamp")
    const entry: DarkForceHistoryParticle = {
      schema: DARK_FORCE_PARTICLE_SCHEMA,
      id: `${this.#manifest.cutId}:${sequence}`,
      sequence,
      acceptedAt,
      particle: normalized,
      ...(normalizedAuthoring === undefined ? {} : {authoring: normalizedAuthoring}),
    }

    const current = this.#catalog.segments.at(-1)
    const file = this.#activeFile ?? segmentFile(sequence)
    appendDurable(join(this.directory, SEGMENTS_DIRECTORY, file), entry)

    const entries = this.#activeFile === file ? this.#activeEntries : []
    entries.push(entry)
    const summary = segmentSummary(file, entries)
    const segments = current?.file === file
      ? [...this.#catalog.segments.slice(0, -1), summary]
      : [...this.#catalog.segments, summary]
    this.#catalog = {...this.#catalog, segments}
    this.#sequence = sequence
    this.#registerAuthoring(entry)
    if (entries.length < this.#manifest.segmentCapacity) {
      this.#activeFile = file
      this.#activeEntries = entries
    } else {
      this.#activeFile = null
      this.#activeEntries = []
    }

    try {
      persistCatalog(this.directory, this.#catalog)
    } catch {
      // catalog.json is derived. A durable Particle remains accepted and the
      // catalog is rebuilt from segments at the next open.
    }
    return structuredClone(entry)
  }

  findAuthoring(
    rpcSource: string,
    operationId: string,
  ): DarkForceHistoryParticle | null {
    if (
      rpcSource.length === 0 ||
      rpcSource.length > 256 ||
      rpcSource.trim() !== rpcSource ||
      !operationIdPattern.test(operationId)
    ) throw new Error("Dark Force authoring lookup is invalid")
    const entry = this.#authoring.get(authoringKey({rpcSource, operationId}))
    return entry ? structuredClone(entry) : null
  }

  read(query: DarkForceHistoryQuery = {}): DarkForceHistoryParticle[] {
    const allowed = new Set([
      "id",
      "fromSequence",
      "toSequence",
      "fromAcceptedAt",
      "toAcceptedAt",
      "fromParticleTs",
      "toParticleTs",
      "part",
      "op",
      "by",
      "from",
      "path",
      "limit",
    ])
    if (!isRecord(query) || Reflect.ownKeys(query).some((key) => typeof key !== "string" || !allowed.has(key))) {
      throw new Error("Dark Force history query is invalid")
    }
    validateRange("fromSequence", query.fromSequence, 1)
    validateRange("toSequence", query.toSequence, 1)
    validateRange("fromParticleTs", query.fromParticleTs, 0)
    validateRange("toParticleTs", query.toParticleTs, 0)
    validateRange("limit", query.limit, 1)
    const fromAcceptedAt = queryTime("fromAcceptedAt", query.fromAcceptedAt)
    const toAcceptedAt = queryTime("toAcceptedAt", query.toAcceptedAt)
    if (query.id !== undefined && typeof query.id !== "string") throw new Error("Dark Force history id is invalid")
    if (query.part !== undefined && !parts.has(query.part)) throw new Error("Dark Force history part is invalid")
    if (query.op !== undefined && !operations.has(query.op)) throw new Error("Dark Force history op is invalid")
    if (query.by !== undefined && (typeof query.by !== "string" || query.by.length === 0)) {
      throw new Error("Dark Force history by is invalid")
    }
    if (query.from !== undefined && (typeof query.from !== "string" || query.from.length === 0)) {
      throw new Error("Dark Force history from is invalid")
    }
    if (query.path !== undefined && !isFinitePath(query.path)) throw new Error("Dark Force history path is invalid")

    const idSequence = query.id?.startsWith(`${this.#manifest.cutId}:`)
      ? Number(query.id.slice(this.#manifest.cutId.length + 1))
      : query.id === undefined ? undefined : Number.NaN
    if (idSequence !== undefined && !isSafeSequence(idSequence)) return []
    const fromSequence = Math.max(query.fromSequence ?? 1, idSequence ?? 1)
    const toSequence = Math.min(query.toSequence ?? Number.MAX_SAFE_INTEGER, idSequence ?? Number.MAX_SAFE_INTEGER)
    if (fromSequence > toSequence) return []
    const limit = Math.min(query.limit ?? 1_000, 1_000)
    const result: DarkForceHistoryParticle[] = []

    for (const segment of this.#catalog.segments) {
      if (segment.lastSequence < fromSequence || segment.firstSequence > toSequence) continue
      if (fromAcceptedAt && segment.maxAcceptedAt < fromAcceptedAt) continue
      if (toAcceptedAt && segment.minAcceptedAt > toAcceptedAt) continue
      if (query.fromParticleTs !== undefined && segment.maxParticleTs < query.fromParticleTs) continue
      if (query.toParticleTs !== undefined && segment.minParticleTs > query.toParticleTs) continue

      const entries = this.#activeFile === segment.file
        ? this.#activeEntries
        : readSegment(this.directory, segment.file, this.#manifest, segment.firstSequence)
      for (const entry of entries) {
        if (entry.sequence < fromSequence || entry.sequence > toSequence) continue
        if (fromAcceptedAt && entry.acceptedAt < fromAcceptedAt) continue
        if (toAcceptedAt && entry.acceptedAt > toAcceptedAt) continue
        if (query.fromParticleTs !== undefined && entry.particle.ts < query.fromParticleTs) continue
        if (query.toParticleTs !== undefined && entry.particle.ts > query.toParticleTs) continue
        if (query.part !== undefined && entry.particle.part !== query.part) continue
        if (query.op !== undefined && entry.particle.op !== query.op) continue
        if (query.by !== undefined && entry.particle.by !== query.by) continue
        if (query.from !== undefined && entry.particle.from !== query.from) continue
        if (query.path !== undefined && entry.particle.path !== query.path) continue
        result.push(structuredClone(entry))
        if (result.length === limit) return result
      }
    }
    return result
  }

  status(): DarkForceHistoryStatus {
    return {
      path: this.directory,
      cutId: this.#manifest.cutId,
      startedAt: this.#manifest.startedAt,
      sequence: this.#sequence,
      segments: this.#catalog.segments.length,
      retroactiveComplete: false,
    }
  }

  #registerAuthoring(entry: DarkForceHistoryParticle): void {
    if (!entry.authoring) return
    const key = authoringKey(entry.authoring)
    if (this.#authoring.has(key)) {
      throw new Error(
        `Dark Force history contains duplicate authoring operation: ${entry.authoring.rpcSource}/${entry.authoring.operationId}`,
      )
    }
    this.#authoring.set(key, entry)
  }
}
