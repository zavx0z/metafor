import {
  META_AUTHORING_CONTRACT_VERSION,
  META_CREATE_CAPABILITY,
  META_CREATE_METHOD,
  META_MATTER_APPLY_METHOD,
  META_MATTER_WRITE_CAPABILITY,
  META_SOURCE_READ_CAPABILITY,
  META_SOURCE_REVISION_READ_METHOD,
  validateMetaCapabilitiesReadRequest,
  validateMetaSourceRevisionReadRequest,
  type MetaAuthoringCapability,
  type MetaCapabilitiesReadReceipt,
  type MetaSourceRevisionReadReceipt,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import {readSourceRevision} from "../../create-metafor/src/source.ts"
import {resolveMetaPath} from "../load.ts"

export type MetaAuthoringSourcePath = (address: MetaAddress) => string

export interface MetaAuthoringLocalConfiguration {
  readonly source: string
  readonly scopes: MetaAddress[]
}

export class MetaAuthoringRegistryError extends Error {
  override readonly name = "MetaAuthoringRegistryError"
}

const validationError = (
  issues: readonly {path: string; code: string; message: string}[],
): MetaAuthoringRegistryError => new MetaAuthoringRegistryError(
  issues.map((issue) => `${issue.path || "/"} ${issue.code}: ${issue.message}`).join("; "),
)

const sortCapabilities = (
  capabilities: readonly MetaAuthoringCapability[],
): MetaAuthoringCapability[] => [...structuredClone(capabilities)].sort((left, right) =>
  left.method.localeCompare(right.method) || left.capability.localeCompare(right.capability)
)

export const metaAuthoringCapabilitiesForScopes = (
  scopes: readonly MetaAddress[],
): MetaAuthoringCapability[] => [
  {
    capability: META_CREATE_CAPABILITY,
    method: META_CREATE_METHOD,
    scopes: [...scopes],
    operationClass: "create",
    liveState: false,
    gitCommit: false,
  },
  {
    capability: META_MATTER_WRITE_CAPABILITY,
    method: META_MATTER_APPLY_METHOD,
    scopes: [...scopes],
    operationClass: "matter",
    liveState: true,
    gitCommit: false,
  },
  {
    capability: META_SOURCE_READ_CAPABILITY,
    method: META_SOURCE_REVISION_READ_METHOD,
    scopes: [...scopes],
    operationClass: "source_read",
    liveState: false,
    gitCommit: false,
  },
]

export const readMetaAuthoringLocalConfiguration = (
  environment: Readonly<Record<string, string | undefined>>,
): MetaAuthoringLocalConfiguration | null => {
  const source = environment.META_AUTHORING_RPC_SOURCE?.trim() ?? ""
  const rawScopes = environment.META_AUTHORING_SCOPES?.trim() ?? ""
  if (!source && !rawScopes) return null
  if (!source || !rawScopes || source !== environment.META_AUTHORING_RPC_SOURCE) {
    throw new MetaAuthoringRegistryError(
      "META_AUTHORING_RPC_SOURCE and META_AUTHORING_SCOPES must be configured together",
    )
  }
  const scopes = rawScopes.split(",").map((value) => parseMetaAddress(value.trim()))
  if (scopes.some((value) => value === null)) {
    throw new MetaAuthoringRegistryError("META_AUTHORING_SCOPES contains an invalid Meta address")
  }
  const normalized = scopes as MetaAddress[]
  if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
    throw new MetaAuthoringRegistryError("META_AUTHORING_SCOPES must contain unique Meta addresses")
  }
  return {source, scopes: normalized.sort((left, right) => left.localeCompare(right))}
}

export class MetaAuthoringRegistry {
  readonly #grants = new Map<string, MetaAuthoringCapability[]>()

  constructor(
    entries: Iterable<readonly [string, readonly MetaAuthoringCapability[]]>,
    private readonly sourcePath: MetaAuthoringSourcePath = resolveMetaPath,
  ) {
    for (const [rawSource, capabilities] of entries) {
      const source = rawSource.trim()
      if (!source || source !== rawSource || this.#grants.has(source)) {
        throw new MetaAuthoringRegistryError("Authoring RPC source identity is invalid or duplicated")
      }
      this.#grants.set(source, sortCapabilities(capabilities))
    }
  }

  grants(source: string): MetaAuthoringCapability[] {
    return structuredClone(this.#grants.get(source) ?? [])
  }

  readCapabilities(input: unknown, source: string): MetaCapabilitiesReadReceipt {
    const normalized = validateMetaCapabilitiesReadRequest(input)
    if (!normalized.ok) throw validationError(normalized.issues)
    return {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      capabilities: this.grants(source),
    }
  }

  async readSourceRevisions(input: unknown, source: string): Promise<MetaSourceRevisionReadReceipt> {
    const grants = this.grants(source)
    const normalized = validateMetaSourceRevisionReadRequest(input, {capabilities: grants})
    if (!normalized.ok) throw validationError(normalized.issues)
    const sources = await Promise.all(normalized.value.addresses.map(async (address) => {
      try {
        return {address, revision: await readSourceRevision(this.sourcePath(address))}
      } catch {
        throw new MetaAuthoringRegistryError(`Source revision is unavailable: ${address}`)
      }
    }))
    return {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      sources,
    }
  }
}
