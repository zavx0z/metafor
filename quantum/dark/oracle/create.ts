import {resolve} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  validateMetaCreateRequest,
  type MetaAuthoringCapability,
  type MetaCreateReceipt,
} from "shared/protocol/metafor/authoring"
import {
  buildMetaPackageTemplate,
  materializeMetaCreatePatch,
} from "create-metafor/library"
import {metaAuthoringRequestDigest} from "./authoring.ts"

export type MetaCreateCapabilityReader = (
  rpcSource: string,
) => readonly MetaAuthoringCapability[]

export class MetaCreateServiceError extends Error {
  override readonly name = "MetaCreateServiceError"
}

export const canonicalMetaClusterRoot = resolve(import.meta.dir, "../..", "cluster")

const validationError = (
  issues: readonly {path: string; code: string; message: string}[],
): MetaCreateServiceError => new MetaCreateServiceError(
  issues.map((issue) => `${issue.path || "/"} ${issue.code}: ${issue.message}`).join("; "),
)

export class MetaCreateService {
  constructor(
    private readonly capabilities: MetaCreateCapabilityReader,
    private readonly clusterRoot: string = canonicalMetaClusterRoot,
  ) {}

  async create(input: unknown, rpcSource: string): Promise<MetaCreateReceipt> {
    const normalized = validateMetaCreateRequest(input, {
      capabilities: this.capabilities(rpcSource),
    })
    if (!normalized.ok) throw validationError(normalized.issues)
    const request = normalized.value
    const [owner, repository] = request.address.split("/") as [string, string]
    const template = buildMetaPackageTemplate({
      identity: {owner, repository},
      name: request.name,
      description: request.description,
      author: owner,
      errorLabel: "Error",
      htmlLang: "en",
      profile: request.profile,
    })
    const result = await materializeMetaCreatePatch({
      clusterRoot: this.clusterRoot,
      operationId: request.operationId,
      template,
    })
    return {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: request.operationId,
      requestDigest: metaAuthoringRequestDigest(request),
      phase: "created",
      outcome: result.outcome,
      address: request.address,
      sourceRevision: result.sourceRevision,
      files: result.files,
      repository: result.repository,
    }
  }
}
