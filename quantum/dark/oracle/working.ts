/**
Working authoring keeps live changes in Boundary and publishes the selected
accepted derivative only on explicit commit. Scope comes from the existing
Oracle registry. No extra access store or Git operation is introduced.
@packageDocumentation
*/
import type {MetaAddress} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {
  META_DECLARATION_APPLY_METHOD, META_DECLARATION_STAGE_METHOD,
  META_MATTER_APPLY_METHOD, META_MATTER_STAGE_METHOD,
  META_SOURCE_COMMIT_METHOD, META_DECLARATION_WRITE_CAPABILITY,
  META_MATTER_WRITE_CAPABILITY,
  META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
  validateMetaSourceRevisionReadRequest,
  type MetaAuthoringCapability, type MetaDeclarationApplyReceipt, type MetaMatterApplyReceipt,
  type MetaDeclarationSourceProjectionV1, type MetaWorkingRevisionReadReceipt,
} from "shared/protocol/metafor/authoring"
import type {DarkForceHistory, DarkForceHistoryParticle} from "../force/history.ts"
import {resolveMetaAuthoringPath} from "../load.ts"
import {DeclarationAuthoringService, type DeclarationAuthoringMeta} from "./declaration.ts"
import {MatterAuthoringService} from "./matter.ts"
import type {ForceLifecycle} from "../force/lifecycle.ts"
import {validateWorkingMatter} from "./working-validation.ts"

type AcceptedSource = {entry: DarkForceHistoryParticle; projection: MetaDeclarationSourceProjectionV1}

export class WorkingDeclarationService {
  #queue: Promise<unknown> = Promise.resolve()
  readonly #stage: DeclarationAuthoringService
  readonly #matter: MatterAuthoringService

  constructor(
    private readonly history: Pick<DarkForceHistory, "read" | "status" | "findAuthoring">,
    force: Pick<ForceLifecycle, "acceptAuthoringParticle">,
    private readonly capabilities: (source: string) => readonly MetaAuthoringCapability[],
    private readonly readCanonical: (address: MetaAddress) => Promise<MetaDSL>,
    private readonly sourcePath: (address: MetaAddress) => string = resolveMetaAuthoringPath,
  ) {
    this.#stage = new DeclarationAuthoringService(history, force,
      source => capabilities(source).filter(grant => grant.method === META_DECLARATION_STAGE_METHOD)
        .map(grant => ({...grant, method: META_DECLARATION_APPLY_METHOD})),
      address => this.#readMeta(address), sourcePath, {apply() {}}, true)
    this.#matter = new MatterAuthoringService(history, force,
      source => capabilities(source).filter(grant => grant.method === META_MATTER_STAGE_METHOD)
        .map(grant => ({...grant, method: META_MATTER_APPLY_METHOD})),
      async address => {
        const source = await this.#source(address)
        const meta = await readCanonical(address)
        return {address, ...source, matter: meta.matter ?? [],
          fields: Object.fromEntries(meta.fields.map(field => [field.key, {type: field.type,
            ...(field.type === "enum" && field.values ? {values: [...field.values]} : {})}]))}
      }, sourcePath, {apply() {return null}, async reconcile() {}}, true,
      undefined, request => validateWorkingMatter(request, readCanonical))
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.#queue.then(operation)
    this.#queue = current.catch(() => {})
    return current
  }

  #latest(): Map<MetaAddress, AcceptedSource> {
    const result = new Map<MetaAddress, AcceptedSource>()
    const last = this.history.status().sequence
    let next = 1
    while (next <= last) {
      const entries = this.history.read({fromSequence: next, toSequence: last, part: "inflaton", limit: 1000})
      if (!entries.length) break
      for (const entry of entries) for (const projection of entry.authoring?.sourceProjections ?? []) {
        if (!("path" in projection) || !projection.path || projection.path === "meta.ts")
          result.set(projection.address, {entry, projection})
      }
      next = entries.at(-1)!.sequence + 1
    }
    return result
  }

  async #source(address: MetaAddress) {
    const {readSourceSnapshot, readPreparedSource} = await import("create-metafor/library")
    const current = await readSourceSnapshot(this.sourcePath(address))
    const accepted = this.#latest().get(address)
    const cause = accepted?.entry.authoring
    if (!accepted || !cause || cause.publication !== "deferred" ||
        current.revision === accepted.projection.afterRevision) return {...current, sourceRevision: current.revision}
    return {...current, source: await readPreparedSource(current.targetPath, cause.operationId, accepted.projection.afterRevision),
      revision: accepted.projection.afterRevision, sourceRevision: current.revision}
  }

  async #readMeta(address: MetaAddress): Promise<DeclarationAuthoringMeta> {
    const source = await this.#source(address)
    const meta = await this.readCanonical(address)
    return {address, ...source, name: meta.name,
      ...(meta.desc === undefined ? {} : {description: meta.desc}),
      ...(meta.lifecycle === undefined ? {} : {lifecycle: meta.lifecycle}),
      fields: meta.fields, states: meta.superposition,
      mass: meta.mass ?? [], processes: meta.processes ?? [], reactions: meta.reactions ?? [],
      ...(meta.bulk === undefined ? {} : {bulk: meta.bulk})}
  }

  /** Uses the ordinary declaration request; its revisions name the working source returned by read. */
  stage(input: unknown, source: string): Promise<MetaDeclarationApplyReceipt> {
    return this.#serialize(async () => await this.#stage.apply(input, source))
  }

  /** Changes composition using already installed canonical Meta; the source projection stays deferred. */
  stageMatter(input: unknown, source: string): Promise<MetaMatterApplyReceipt> {
    return this.#serialize(async () => await this.#matter.apply(input, source))
  }

  async read(input: unknown, source: string): Promise<MetaWorkingRevisionReadReceipt> {
    const normalized = validateMetaSourceRevisionReadRequest(input, {capabilities: this.capabilities(source)})
    if (!normalized.ok) throw new Error(normalized.issues.map(issue => issue.message).join("; "))
    return await this.#serialize(async () => ({contractVersion: 1, sources: await Promise.all(normalized.value.addresses.map(async address => {
      const current = await this.#source(address)
      return {address, revision: current.revision, sourceRevision: current.sourceRevision}
    }))}))
  }

  /** Publishes an exact accepted version through the existing atomic source projector; never commits Git. */
  commit(input: unknown, source: string): Promise<MetaDeclarationApplyReceipt> {
    return this.#serialize(async () => {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Source commit requires a closed request")
      const value = input as Record<string, unknown>
      if (Object.keys(value).sort().join(",") !== "capability,contractVersion,operationId,requestDigest" ||
          value.contractVersion !== 1 || ![META_DECLARATION_WRITE_CAPABILITY, META_MATTER_WRITE_CAPABILITY].includes(value.capability as never) ||
          typeof value.operationId !== "string" || typeof value.requestDigest !== "string") throw new Error("Invalid source commit request")
      const entry = this.history.findAuthoring(source, value.operationId)
      const cause = entry?.authoring
      if (!entry || !cause || cause.publication !== "deferred" ||
          cause.requestDigest !== value.requestDigest) throw new Error("Accepted working version is unavailable")
      const capability = cause.schema === META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1 ? META_DECLARATION_WRITE_CAPABILITY : META_MATTER_WRITE_CAPABILITY
      if (value.capability !== capability) throw new Error("Source commit capability does not match the accepted operation")
      const scopes = new Set(this.capabilities(source).filter(grant => grant.method === META_SOURCE_COMMIT_METHOD &&
        grant.capability === value.capability).flatMap(grant => grant.scopes))
      if (cause.sourceProjections.some(item => !scopes.has(item.address))) throw new Error("Source commit is outside the Oracle authoring scope")
      const {publishWorkingSourceCandidates} = await import("create-metafor/library")
      const published = await publishWorkingSourceCandidates(cause.operationId, cause.sourceProjections.map(item => ({
        targetPath: this.sourcePath(item.address), beforeRevision: item.beforeRevision, afterRevision: item.afterRevision,
      })))
      const separator = entry.id.lastIndexOf(":")
      return {contractVersion: 1, operationId: cause.operationId, requestDigest: cause.requestDigest,
        acceptance: {cutId: entry.id.slice(0, separator), id: entry.id, sequence: entry.sequence},
        sourceProjections: structuredClone(cause.sourceProjections), boundary: "applied", phase: "complete",
        source: {outcome: published.files.some(item => item.outcome === "published") ? "published" : "already_published",
          files: cause.sourceProjections.map(item => {
            const file = published.files.find(file => file.targetPath === this.sourcePath(item.address))!
            return {...item, beforeRevision: file.beforeRevision, outcome: file.outcome}
          })},
        materialization: {outcome: "applied"}}
    })
  }
}
