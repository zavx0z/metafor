import {createHash} from "node:crypto"
import {lstatSync, readFileSync} from "node:fs"
import {basename, join, resolve} from "node:path"
import type {MonadRpcPeer} from "shared/transport/monad"
import {
  MF117_CANDIDATE_DIRECTORY,
  MF117_ENERGY_EVIDENCE_METHOD,
  MF117_ENERGY_FENCE_METHOD,
  MF117_ENERGY_PREFLIGHT_METHOD,
  MF117_ENERGY_RETARGET_METHOD,
  MF117_ENERGY_VERIFY_METHOD,
  MF117_SOURCE,
  MF117_STATE_DIRECTORY,
  MF117_TARGET,
} from "../shared/mf117.ts"
import {massFileName, type MassFileFormat} from "../shared/mass.ts"
import type {
  BoundaryDissolveCausalAdmissionRecordV1,
  BoundaryDissolveRetainedBindingV1,
} from "../boundary/dissolve-causal-admission.ts"
import {
  buildEnergyDissolveRetargetRequest,
  DurableEnergyDissolveRetarget,
  type EnergyDissolveSourceGenerations,
} from "./dissolve-retarget.ts"
import {EnergyMassCatalog} from "./mass.ts"
import type {EnergyMonad} from "./monad.ts"

const schema = "metafor/energy-mf117-live/v1" as const
const digestPattern = /^[0-9a-f]{64}$/

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex")

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Energy MF-117 request must be an object")
  }
  return value as Record<string, unknown>
}

const exact = (value: Record<string, unknown>, keys: readonly string[]): void => {
  const own = Object.keys(value).toSorted()
  if (JSON.stringify(own) !== JSON.stringify([...keys].toSorted())) {
    throw new Error("Energy MF-117 request is not closed")
  }
}

const regularBytes = (filename: string): Uint8Array => {
  const stat = lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Energy MF-117 evidence is not a regular file: ${filename}`)
  }
  return new Uint8Array(readFileSync(filename))
}

export type EnergyMF117MassEvidenceInput = Readonly<{
  schema: typeof schema
  atom: number
  declaration: number
  keyId: string
  format: MassFileFormat
}>

export type EnergyMF117MassEvidence = Readonly<{
  kind: "present"
  digestSha256: string
}> | Readonly<{
  kind: "absent"
  marker: "metafor/mass-absent/v1"
}>

export type EnergyMF117PreflightInput = Readonly<{
  schema: typeof schema
  bindings: readonly BoundaryDissolveRetainedBindingV1[]
}>

export type EnergyMF117PreflightReceipt = Readonly<{
  schema: typeof schema
  source: typeof MF117_SOURCE
  target: typeof MF117_TARGET
  generations: EnergyDissolveSourceGenerations
  evidence: readonly EnergyMF117MassEvidence[]
  rollback: Readonly<{
    files: number
    manifestSha256: string
    verified: true
  }>
  retention: "retain-until-explicit-gc"
}>

type RollbackManifest = {
  files: Array<{path: string; bytes: number; sha256: string}>
}

/**
 * Exact Energy-owned live adapter for MF-117. Its Monad methods are private
 * provider methods; it has no HTTP route and no delete/release operation.
 */
export class EnergyMF117LiveAdapter {
  readonly #catalog: EnergyMassCatalog
  readonly #receiptPath: string
  readonly #candidateDirectory: string

  constructor(
    private readonly monad: EnergyMonad,
    options: {
      receiptPath?: string
      candidateDirectory?: string
      massDirectory?: string
    } = {},
  ) {
    this.#receiptPath = resolve(
      options.receiptPath ?? join(MF117_STATE_DIRECTORY, "energy-retarget.json"),
    )
    this.#candidateDirectory = resolve(
      options.candidateDirectory ?? MF117_CANDIDATE_DIRECTORY,
    )
    this.#catalog = new EnergyMassCatalog(options.massDirectory)
  }

  register(peer: Pick<MonadRpcPeer, "expose">): void {
    peer.expose(MF117_ENERGY_EVIDENCE_METHOD, async (input) =>
      await this.massEvidence(input))
    peer.expose(MF117_ENERGY_PREFLIGHT_METHOD, async (input) =>
      await this.preflight(input))
    peer.expose(MF117_ENERGY_FENCE_METHOD, async (input) =>
      await this.fence(input))
    peer.expose(MF117_ENERGY_RETARGET_METHOD, async (input) =>
      await this.retarget(input))
    peer.expose(MF117_ENERGY_VERIFY_METHOD, async () =>
      await this.verify())
  }

  async massEvidence(value: unknown): Promise<EnergyMF117MassEvidence> {
    const input = record(value)
    exact(input, ["schema", "atom", "declaration", "keyId", "format"])
    if (
      input.schema !== schema ||
      input.atom !== 1 ||
      !Number.isSafeInteger(input.declaration) ||
      Number(input.declaration) <= 0 ||
      typeof input.keyId !== "string" ||
      !["json", "binary"].includes(String(input.format))
    ) throw new Error("Energy MF-117 Mass evidence identity is invalid")
    const artifact = this.monad.catalog.mass(1).find((entry) =>
      entry.id === input.declaration &&
      entry.keyId === input.keyId &&
      entry.format === input.format)
    if (!artifact) throw new Error("Energy MF-117 Mass evidence identity is stale")
    const filename = join(
      this.#catalog.root,
      massFileName(input.keyId, input.format as MassFileFormat),
    )
    try {
      return {
        kind: "present",
        digestSha256: sha256(regularBytes(filename)),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      return {kind: "absent", marker: "metafor/mass-absent/v1"}
    }
  }

  async preflight(value: unknown): Promise<EnergyMF117PreflightReceipt> {
    const input = record(value)
    exact(input, ["schema", "bindings"])
    if (input.schema !== schema || !Array.isArray(input.bindings) || input.bindings.length !== 5) {
      throw new Error("Energy MF-117 preflight requires exactly five bindings")
    }
    const bindings = input.bindings as BoundaryDissolveRetainedBindingV1[]
    const generations: number[] = []
    const evidence: EnergyMF117MassEvidence[] = []
    for (let index = 0; index < bindings.length; index += 1) {
      const binding = bindings[index]!
      if (
        binding.ordinal !== index + 1 ||
        binding.sourceAtom !== 1 ||
        binding.targetAtom !== 2 ||
        binding.sourceGlobalKey.length === 0 ||
        binding.retention !== "retain-until-explicit-gc"
      ) throw new Error("Energy MF-117 binding is not the exact Inference to Lada plan")
      generations.push(this.monad.massGate.generation(
        binding.sourceAtom,
        binding.sourceDeclaration,
        binding.sourceGlobalKey,
      ))
      evidence.push(await this.massEvidence({
        schema,
        atom: binding.sourceAtom,
        declaration: binding.sourceDeclaration,
        keyId: binding.sourceGlobalKey,
        format: binding.format,
      }))
    }
    const rollback = this.#verifyRollbackMass()
    return Object.freeze({
      schema,
      source: MF117_SOURCE,
      target: MF117_TARGET,
      generations: Object.freeze(generations) as unknown as EnergyDissolveSourceGenerations,
      evidence: Object.freeze(evidence),
      rollback,
      retention: "retain-until-explicit-gc",
    })
  }

  async fence(value: unknown): Promise<{
    receipt: ReturnType<DurableEnergyDissolveRetarget["receipt"]>
    binding: ReturnType<DurableEnergyDissolveRetarget["fenceBinding"]>
  }> {
    const input = record(value)
    exact(input, ["schema", "admission", "generations"])
    if (input.schema !== schema || !Array.isArray(input.generations)) {
      throw new Error("Energy MF-117 fence request is invalid")
    }
    const admission = input.admission as BoundaryDissolveCausalAdmissionRecordV1
    const generations = input.generations as unknown as EnergyDissolveSourceGenerations
    const durable = DurableEnergyDissolveRetarget.prepare(
      this.#receiptPath,
      buildEnergyDissolveRetargetRequest(admission, generations),
    )
    await durable.fence({
      fence: async (handle) => {
        if (
          this.monad.massGate.generation(
            handle.source.atom,
            handle.source.declaration,
            handle.source.globalKey,
          ) !== handle.source.generation
        ) throw new Error("Energy MF-117 source generation changed before fence")
        this.monad.massGate.fence(
          handle.source.atom,
          handle.source.declaration,
          handle.source.globalKey,
        )
      },
    })
    return {receipt: durable.receipt(), binding: durable.fenceBinding()}
  }

  async retarget(value: unknown): Promise<{
    receipt: ReturnType<DurableEnergyDissolveRetarget["receipt"]>
    binding: ReturnType<DurableEnergyDissolveRetarget["retargetBinding"]>
  }> {
    const input = record(value)
    exact(input, ["schema", "admission"])
    if (input.schema !== schema) throw new Error("Energy MF-117 retarget request is invalid")
    const admission = input.admission as BoundaryDissolveCausalAdmissionRecordV1
    const durable = DurableEnergyDissolveRetarget.open(this.#receiptPath)
    await durable.retargetAfterCommit(admission, {
      retarget: async (handle, entryId) => ({
        targetGeneration: this.monad.massGate.retarget(
          {
            atom: handle.source.atom,
            declaration: handle.source.declaration,
            key: handle.source.globalKey,
            generation: handle.source.generation,
          },
          {
            atom: handle.target.atom,
            declaration: handle.target.declaration,
            key: handle.target.globalKey,
          },
          entryId,
        ),
      }),
    })
    return {receipt: durable.receipt(), binding: durable.retargetBinding()}
  }

  async verify(): Promise<{
    schema: typeof schema
    phase: "retargeted"
    sourceFencesRetained: 5
    targetGenerations: readonly number[]
    rollbackVerified: true
  }> {
    const durable = DurableEnergyDissolveRetarget.open(this.#receiptPath)
    const receipt = durable.receipt()
    if (receipt.phase !== "retargeted") {
      throw new Error("Energy MF-117 retarget receipt is incomplete")
    }
    for (const entry of receipt.entries) {
      if (
        !this.monad.massGate.fenced(
          entry.handle.source.atom,
          entry.handle.source.declaration,
          entry.handle.source.globalKey,
        ) ||
        entry.targetGeneration === null ||
        this.monad.massGate.generation(
          entry.handle.target.atom,
          entry.handle.target.declaration,
          entry.handle.target.globalKey,
        ) !== entry.targetGeneration
      ) throw new Error("Energy MF-117 retained fence or target generation is unavailable")
    }
    this.#verifyRollbackMass()
    return {
      schema,
      phase: "retargeted",
      sourceFencesRetained: 5,
      targetGenerations: receipt.entries.map(({targetGeneration}) => targetGeneration!),
      rollbackVerified: true,
    }
  }

  #verifyRollbackMass(): EnergyMF117PreflightReceipt["rollback"] {
    const manifestPath = join(this.#candidateDirectory, "rollback-manifest.json")
    const manifestBytes = regularBytes(manifestPath)
    const manifest = JSON.parse(
      new TextDecoder("utf8", {fatal: true}).decode(manifestBytes),
    ) as RollbackManifest
    if (!Array.isArray(manifest.files)) {
      throw new Error("Energy MF-117 rollback manifest is invalid")
    }
    const files = manifest.files.filter(({path}) => path.startsWith("rollback/mass/"))
    if (files.length !== 4) {
      throw new Error("Energy MF-117 rollback must retain exactly four present Mass files")
    }
    for (const entry of files) {
      if (
        basename(entry.path) !== entry.path.slice("rollback/mass/".length) ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 0 ||
        !digestPattern.test(entry.sha256)
      ) throw new Error("Energy MF-117 rollback Mass entry is invalid")
      const bytes = regularBytes(join(this.#candidateDirectory, entry.path))
      if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
        throw new Error(`Energy MF-117 rollback Mass digest changed: ${entry.path}`)
      }
    }
    return Object.freeze({
      files: files.length,
      manifestSha256: sha256(manifestBytes),
      verified: true,
    })
  }
}

export const ENERGY_MF117_LIVE_SCHEMA = schema
