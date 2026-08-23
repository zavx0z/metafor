import {createHash} from "node:crypto"
import {
  META_OBSERVATION_CONTRACT_VERSION,
  validateEnergyMassResultReadRequest,
  type DarkForceHistoryReadReceipt,
  type EnergyMassResultContent,
  type EnergyMassResultReadReceipt,
} from "shared/protocol/metafor/observation"
import type {JsonValue} from "@metafor/types/metafor/graph"
import type {EnergyCatalogStore} from "../catalog.ts"
import type {EnergyMassCatalog, EnergyMassGate} from "../mass.ts"

type FrontierReader = () => Promise<DarkForceHistoryReadReceipt>

const invalid = (issues: Array<{path: string; code: string; message: string}>): Error =>
  new Error(issues.map(({path, code, message}) => `${path || "/"} [${code}] ${message}`).join("; "))

const isJson = (value: unknown, ancestors = new Set<object>()): value is JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || ancestors.has(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) return false
  } else if (prototype !== Object.prototype && prototype !== null) return false
  ancestors.add(value)
  try {
    return Object.values(value).every((item) => isJson(item, ancestors))
  } finally {
    ancestors.delete(value)
  }
}

const jsonContent = (bytes: Uint8Array): EnergyMassResultContent => {
  if (bytes.length === 0) return {format: "json", present: false}
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error("Energy Mass JSON result is invalid")
  }
  if (!isJson(value)) throw new Error("Energy Mass JSON result is not closed JSON")
  return {format: "json", present: true, value}
}

/** Bounded read-only projection of one currently authorized Mass key-file. */
export class EnergyMassResultReadService {
  constructor(
    private readonly catalog: EnergyCatalogStore,
    private readonly files: EnergyMassCatalog,
    private readonly gate: EnergyMassGate,
    private readonly frontier: FrontierReader,
  ) {}

  async read(input: unknown): Promise<EnergyMassResultReadReceipt> {
    const validation = validateEnergyMassResultReadRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const request = validation.value
    const atom = this.catalog.resolveAtom(request.atom)
    if (!atom) throw new Error("Energy Mass Atom locator is stale or does not select an Atom")
    const artifact = this.catalog.mass(atom.id).find((item) => item.key === request.key)
    if (!artifact) throw new Error(`Energy Mass key is not declared for selected Atom: ${request.key}`)
    if (this.gate.fenced(atom.id, artifact.id, artifact.keyId)) {
      throw new Error("Energy Mass result is temporarily fenced")
    }
    this.gate.generation(atom.id, artifact.id, artifact.keyId)
    const bytes = await this.files.readBounded(artifact.keyId, artifact.format, request.maxBytes)
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const
    if (request.expectedDigest !== undefined && request.expectedDigest !== digest) {
      throw new Error(`Energy Mass digest mismatch: expected ${request.expectedDigest}, received ${digest}`)
    }
    const history = await this.frontier()
    if (history.resolution !== "exact" || history.range !== null) {
      throw new Error("Dark returned an invalid causal frontier for Mass result")
    }
    return {
      contractVersion: META_OBSERVATION_CONTRACT_VERSION,
      resolution: "exact",
      frontier: structuredClone(history.frontier),
      atom: structuredClone(request.atom),
      key: request.key,
      digest,
      bytes: bytes.length,
      content: artifact.format === "json"
        ? jsonContent(bytes)
        : {format: "binary", base64: Buffer.from(bytes).toString("base64")},
    }
  }
}
