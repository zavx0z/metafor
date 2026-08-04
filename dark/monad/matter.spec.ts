import {afterEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_MATTER_APPLY_METHOD,
  META_MATTER_WRITE_CAPABILITY,
  type MetaAuthoringCapability,
  type MetaMatterRequest,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import {sourceForceMessage} from "shared/protocol/force/message"
import {open, type BoundaryDatabase} from "../../boundary/sqlite.ts"
import {sourceRevision} from "../../create-metafor/src/source.ts"
import {DarkForceHistory} from "../force/history.ts"
import {
  MatterAuthoringService,
  type MatterAuthoringParentReader,
} from "./matter.ts"

const ROOT = parseMetaAddress("example/root")!
const NESTED = parseMetaAddress("example/nested")!
const CHILD = parseMetaAddress("example/child")!
const RPC_SOURCE = "test/authoring"

const directories: string[] = []
const boundaries: BoundaryDatabase[] = []

afterEach(async () => {
  for (const boundary of boundaries.splice(0)) await boundary.close()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})))
})

const metaSource = (children: readonly MetaAddress[]): string => `export default MetaFor("test", {desc: ""})
  .matter(({ html }) => html\`${children.length === 0 ? "" : `\n${children.map((child) => `    <meta-for src="${child}" />`).join("\n")}\n  `}\`)
  .bulk()
`

const fixture = async (
  matter: ReadonlyMap<MetaAddress, readonly MatterParticle[]>,
): Promise<{
  root: string
  boundary: BoundaryDatabase
  history: DarkForceHistory
  service: MatterAuthoringService
  paths: Map<MetaAddress, string>
}> => {
  const root = await mkdtemp(join(tmpdir(), "metafor-matter-authoring-"))
  directories.push(root)
  const paths = new Map<MetaAddress, string>()
  for (const [address, particles] of matter) {
    const path = join(root, "cluster", address, "meta.ts")
    await mkdir(dirname(path), {recursive: true})
    await writeFile(path, metaSource(particles.filter((particle) => particle.kind === "wimp").map((particle) => particle.src as MetaAddress)))
    paths.set(address, path)
  }
  const boundary = await open(":memory:")
  boundaries.push(boundary)
  const history = new DarkForceHistory(join(root, "history", "v1"), {
    cutId: "matter-authoring-test",
    startedAt: "2026-08-04T12:00:00.000Z",
  })
  const grant: MetaAuthoringCapability = {
    capability: META_MATTER_WRITE_CAPABILITY,
    method: META_MATTER_APPLY_METHOD,
    scopes: [ROOT, NESTED, CHILD],
    operationClass: "matter",
    liveState: true,
    gitCommit: false,
  }
  const readParent: MatterAuthoringParentReader = async (address) => {
    const targetPath = paths.get(address)
    if (!targetPath) throw new Error(`Missing test parent ${address}`)
    const source = await readFile(targetPath, "utf8")
    return {
      address,
      targetPath,
      source,
      revision: sourceRevision(source),
      matter: structuredClone(matter.get(address) ?? []),
    }
  }
  const force = {
    async acceptAuthoringParticle(input: Parameters<typeof sourceForceMessage>[0], cause: Parameters<DarkForceHistory["accept"]>[1]) {
      if (!cause) throw new Error("Missing authoring cause")
      const particle = sourceForceMessage(input, "dark").parts[0]
      const accepted = history.accept(particle, cause)
      await boundary.materialize({parts: [particle]})
      return {
        ok: true as const,
        delivered: ["boundary", "bulk"] as Array<"boundary" | "bulk">,
        particle,
        acceptance: {
          cutId: "matter-authoring-test",
          sequence: accepted.sequence,
          id: accepted.id,
        },
      }
    },
  }
  return {
    root,
    boundary,
    history,
    paths,
    service: new MatterAuthoringService(history, force, () => [grant], readParent),
  }
}

const applyBoundary = async (
  boundary: BoundaryDatabase,
  op: "add" | "remove",
  path: "wimp" | "matter",
  value: Record<string, unknown>,
): Promise<void> => {
  await boundary.materialize({parts: [{part: "inflaton", op, path, value, by: "dark", ts: 1}]})
}

const revision = async (path: string) => sourceRevision(await readFile(path))

describe("Matter authoring service", () => {
  test("accepts add once, keeps canonical source unchanged and returns the same receipt on repeat", async () => {
    const current = new Map<MetaAddress, readonly MatterParticle[]>([[ROOT, []]])
    const test = await fixture(current)
    await applyBoundary(test.boundary, "add", "wimp", {src: ROOT, name: "Root", desc: null})
    const rootPath = test.paths.get(ROOT)!
    const before = await readFile(rootPath, "utf8")
    const request: MetaMatterRequest = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "add-child",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "add",
      child: CHILD,
      toParent: ROOT,
      revisions: [{address: ROOT, revision: await revision(rootPath)}],
    }

    const first = await test.service.apply(request, RPC_SOURCE)
    const repeated = await test.service.apply(request, RPC_SOURCE)
    await expect(test.service.apply({...request, child: NESTED}, RPC_SOURCE))
      .rejects.toThrow("already bound to a different request")

    expect(repeated).toEqual(first)
    expect(first).toMatchObject({
      phase: "source_pending",
      boundary: "applied",
      acceptance: {cutId: "matter-authoring-test", sequence: 1, id: "matter-authoring-test:1"},
      sourceProjections: [{address: ROOT, beforeRevision: request.revisions[0]!.revision}],
    })
    expect(test.history.read()).toHaveLength(1)
    expect(await readFile(rootPath, "utf8")).toBe(before)
    expect((await readdir(dirname(rootPath))).some((file) => file.includes("add-child") && file.endsWith(".candidate"))).toBe(true)
    expect(await test.boundary.projection.sql<Array<{src: string}>>`
      SELECT edge.src FROM matter_particle_wimp AS edge
      JOIN matter_particle AS matter ON matter.id = edge.particle
      WHERE matter.wimp = ${ROOT} AND matter.local_id = ${1}
    `).toEqual([{src: CHILD}])
  })

  test("moves one live child into its nested Atom without changing its identity", async () => {
    const current = new Map<MetaAddress, readonly MatterParticle[]>([
      [ROOT, [{kind: "wimp", src: NESTED}, {kind: "wimp", src: CHILD}]],
      [NESTED, []],
    ])
    const test = await fixture(current)
    await applyBoundary(test.boundary, "add", "wimp", {src: ROOT, name: "Root", desc: null})
    await applyBoundary(test.boundary, "add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: NESTED,
    })
    await applyBoundary(test.boundary, "add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: CHILD,
    })
    await applyBoundary(test.boundary, "add", "wimp", {src: NESTED, name: "Nested", desc: null})
    await applyBoundary(test.boundary, "add", "wimp", {src: CHILD, name: "Child", desc: null})
    const childBefore = Number((await test.boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD}
    `)[0]!.id)
    const nestedAtom = Number((await test.boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${NESTED}
    `)[0]!.id)
    const rootPath = test.paths.get(ROOT)!
    const nestedPath = test.paths.get(NESTED)!
    const rootBefore = await readFile(rootPath, "utf8")
    const nestedBefore = await readFile(nestedPath, "utf8")

    const result = await test.service.apply({
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "move-child",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "move",
      child: CHILD,
      fromParent: ROOT,
      toParent: NESTED,
      revisions: [
        {address: NESTED, revision: await revision(nestedPath)},
        {address: ROOT, revision: await revision(rootPath)},
      ],
    }, RPC_SOURCE)

    expect(result.sourceProjections.map(({address}) => address)).toEqual([NESTED, ROOT])
    expect(await readFile(rootPath, "utf8")).toBe(rootBefore)
    expect(await readFile(nestedPath, "utf8")).toBe(nestedBefore)
    expect(await test.boundary.projection.sql<Array<{id: number; parentAtom: number | null}>>`
      SELECT id, parent_atom AS parentAtom FROM atom WHERE wimp = ${CHILD}
    `).toEqual([{id: childBefore, parentAtom: nestedAtom}])
  })

  test("removes one live occurrence but leaves its source repository untouched", async () => {
    const current = new Map<MetaAddress, readonly MatterParticle[]>([[ROOT, [{kind: "wimp", src: CHILD}]]])
    const test = await fixture(current)
    await applyBoundary(test.boundary, "add", "wimp", {src: ROOT, name: "Root", desc: null})
    await applyBoundary(test.boundary, "add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await applyBoundary(test.boundary, "add", "wimp", {src: CHILD, name: "Child", desc: null})
    const rootPath = test.paths.get(ROOT)!
    const before = await readFile(rootPath, "utf8")

    await test.service.apply({
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "remove-child",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "remove",
      child: CHILD,
      fromParent: ROOT,
      revisions: [{address: ROOT, revision: await revision(rootPath)}],
    }, RPC_SOURCE)

    expect(await readFile(rootPath, "utf8")).toBe(before)
    expect(await test.boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM matter_particle WHERE wimp = ${ROOT}
    `).toEqual([{count: 0}])
    expect(await test.boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom WHERE wimp = ${CHILD}
    `).toEqual([{count: 0}])
  })
})
