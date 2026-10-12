import {defaultMetaSourceResolver} from "shared/metafor/source"
import {
  META_AUTHORING_CONTRACT_VERSION,
  validateMetaCreateRequest,
  type MetaAuthoringCapability,
  type MetaCreateReceipt,
} from "shared/protocol/metafor/authoring"
import {metaAuthoringRequestDigest} from "./authoring.ts"

export type MetaCreateCapabilityReader = (
  rpcSource: string,
) => readonly MetaAuthoringCapability[]

export class MetaCreateServiceError extends Error {
  override readonly name = "MetaCreateServiceError"
}

const validationError = (
  issues: readonly {path: string; code: string; message: string}[],
): MetaCreateServiceError => new MetaCreateServiceError(
  issues.map((issue) => `${issue.path || "/"} ${issue.code}: ${issue.message}`).join("; "),
)

/**
Authoring materializes canonical owner/repository as one sibling repository in
an explicitly provided preparation root. Default source root follows the
filesystem adapter; default installed mode rejects creation before mutation.
Capability, request revision and inert Git receipt remain at the authoring
boundary. [Create tests](./create.spec.ts) verify flat placement and conflicts.
*/
export class MetaCreateService {
  private readonly repositoriesRoot: string
  private readonly readOnly: boolean

  constructor(
    private readonly capabilities: MetaCreateCapabilityReader,
    repositoriesRoot?: string,
  ) {
    const resolver = defaultMetaSourceResolver()
    this.repositoriesRoot = repositoriesRoot ?? resolver.root
    this.readOnly = repositoriesRoot === undefined && resolver.installed
  }

  async create(input: unknown, rpcSource: string): Promise<MetaCreateReceipt> {
    if (this.readOnly) throw new MetaCreateServiceError("Meta creation requires a source preparation root")
    const normalized = validateMetaCreateRequest(input, {
      capabilities: this.capabilities(rpcSource),
    })
    if (!normalized.ok) throw validationError(normalized.issues)
    const {buildMetaPackageTemplate, materializeMetaCreatePatch} = await import("create-metafor/library")
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
      repositoriesRoot: this.repositoriesRoot,
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
