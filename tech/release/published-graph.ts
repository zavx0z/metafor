import {extname} from "node:path"
import {createHash} from "node:crypto"
import {packageArtifact} from "@metafor/tech-build"
import {isGeneratedPackageArtifactKey, isPackageArtifactKey, isPackageEnvironment} from "@metafor/tech-build/identity"
import {
  validatePublishedReleaseGraph,
  publishedReleaseGraphDigest,
  type PublishedReleaseGraph,
  type InstalledArtifactIdentity,
  type ReleaseArtifactSource,
} from "./graph"
import type {createReleaseComposition} from "./composition"
import type {createReleaseStorage} from "./storage"
import type {createPublicationQueue} from "./queue"

export interface PublishedReleaseGraphReader {
  publishedReleaseGraph(): Promise<PublishedReleaseGraph>
  readPublishedArtifact(identity: InstalledArtifactIdentity): Promise<ReadableStream<Uint8Array>>
}

/**
Читает переносимую проекцию уже подтверждённого [графа выпуска](./README.md).
Ожидает принятую публикацию, проверяет ready receipts и bytes всех outputs.
Новая версия, source build и выбор источника здесь не создаются.
Сценарии проекции: `spec/published-graph.spec.ts`.
*/
export async function readPublishedReleaseGraph(release: PublishedReleaseGraphReader) {
  return await release.publishedReleaseGraph()
}

/** Получает exact bytes из pinned графа, сохраняя source paths внутри владельца публикации. */
export async function readPublishedReleaseArtifact(
  release: PublishedReleaseGraphReader,
  graph: PublishedReleaseGraph,
  identity: InstalledArtifactIdentity,
) {
  const pinned = validatePublishedReleaseGraph(graph)
  const member = pinned.packages.find(member => member.name === identity.name && member.version === identity.version)
  const part = member?.environments.find(part => part.env === identity.env)
  if (!part?.outputs.some(output => output.artifact === identity.artifact && output.sha256 === identity.sha256 && output.size === identity.size))
    throw new Error("Artifact does not belong to published release offer")
  return await release.readPublishedArtifact(identity)
}

/** Фиксирует одну готовую проекцию и выдаёт source, не меняющий target при новой публикации. */
export async function createPublishedReleaseSource(release: PublishedReleaseGraphReader) {
  const graph = await readPublishedReleaseGraph(release)
  const digest = publishedReleaseGraphDigest(graph)
  const artifacts: ReleaseArtifactSource = Object.freeze({
    read: (identity: InstalledArtifactIdentity) => readPublishedReleaseArtifact(release, graph, identity),
  })
  return Object.freeze({graph, digest, artifacts})
}

export function createPublishedGraphReader(
  composition: ReturnType<typeof createReleaseComposition>,
  storage: ReturnType<typeof createReleaseStorage>,
  queue: ReturnType<typeof createPublicationQueue>,
): PublishedReleaseGraphReader {
  async function publishedReleaseGraph() {
    await queue.waitForPublication()
    const members = await composition.readReleaseComposition()
    const membership = new Set(members.map(member => member.name))
    const packages = await Promise.all(members.map(async member => {
      if (!await storage.isReady(member.name, member.version)) throw new Error("Published release graph is not ready")
      const receipts = await storage.read(member.name, member.version)
      if (receipts.length === 0 || receipts[0]!.environments.some(env => !receipts.some(receipt => receipt.env === env)))
        throw new Error("Published release graph environments are incomplete")
      const dependencies = receipts[0]!.dependencies
      if (receipts.some(receipt => JSON.stringify(receipt.dependencies) !== JSON.stringify(dependencies)))
        throw new Error("Published release graph dependencies differ")
      const environments = await Promise.all(receipts.map(async receipt => {
        const publicArtifacts: Record<string, string> = {}
        const outputs = await Promise.all(receipt.outputs.map(async output => {
          const actual = await packageArtifact(output.path)
          if (!actual || actual.sha256 !== output.sha256 || actual.size !== output.size)
            throw new Error("Published release graph output is missing or corrupt")
          if (output.artifact === undefined || output.kind === undefined) throw new Error("Published release output identity is missing")
          if (output.kind !== "sourcemap" && output.artifact !== "." && !isGeneratedPackageArtifactKey(output.artifact))
            publicArtifacts[output.artifact] = receipt.owner.publicArtifactExtensions?.[output.artifact] ?? extname(output.path)
          return {
            artifact: output.artifact,
            kind: output.kind,
            type: output.type,
            sha256: output.sha256,
            size: output.size,
            ...(output.load === undefined ? {} : {load: output.load}),
            ...(output.sourceMapFor === undefined ? {} : {sourceMapFor: output.sourceMapFor}),
          }
        }))
        return {env: receipt.env, publicArtifacts, outputs}
      }))
      return {
        name: member.name,
        version: member.version,
        dependencies: Object.fromEntries(Object.entries(dependencies).filter(([name]) => membership.has(name))),
        environments,
      }
    }))
    return validatePublishedReleaseGraph({schemaVersion: 1, packages})
  }
  async function readPublishedArtifact(identity: InstalledArtifactIdentity) {
    if (!identity || typeof identity.name !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(identity.name) ||
      typeof identity.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(identity.version) ||
      typeof identity.env !== "string" || !isPackageEnvironment(identity.env) || !isPackageArtifactKey(identity.artifact) ||
      !/^[a-f0-9]{64}$/.test(identity.sha256) || !Number.isSafeInteger(identity.size) || identity.size <= 0)
      throw new Error("Invalid published artifact identity")
    if (!await storage.isReady(identity.name, identity.version)) throw new Error("Published artifact version is not ready")
    const receipts = await storage.read(identity.name, identity.version)
    const output = receipts.find(receipt => receipt.env === identity.env)?.outputs.find(output =>
      output.artifact === identity.artifact && output.sha256 === identity.sha256 && output.size === identity.size)
    if (!output || output.sha256 !== identity.sha256 || output.size !== identity.size)
      throw new Error("Artifact differs from published receipt")
    const bytes = await Bun.file(output.path).bytes()
    if (bytes.byteLength !== identity.size || createHash("sha256").update(bytes).digest("hex") !== identity.sha256)
      throw new Error("Published artifact bytes are missing or corrupt")
    return new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(bytes); controller.close()}})
  }
  return {publishedReleaseGraph, readPublishedArtifact}
}
