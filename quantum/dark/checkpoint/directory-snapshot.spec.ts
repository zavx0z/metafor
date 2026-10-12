import {expect, test} from "bun:test"
import {mkdtemp, mkdir, readdir, realpath, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {captureOfflineCheckpoint, publishCurrentOfflineCheckpoint, LOCAL_CHECKPOINT_LIMITS_V1} from "./capture"
import {createDetachedDissolveCandidateBundle} from "./dissolve-candidate"
import {CheckpointGitRepository} from "./repository"
import {DurableEnergyDissolveRetarget} from "../../energy/dissolve-retarget"

test("directory capture/dissolve refuse before database read, output creation or membership work", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-directory-snapshot-")))
  const mass = join(root, "mass")
  const workspace = join(mass, "33333333-3333-4333-8333-333333333333.dir")
  await mkdir(workspace, {recursive: true})
  await writeFile(join(workspace, "profile"), "untouched")
  const target = join(root, "candidate")
  const missing = join(root, "missing.sqlite")
  try {
    await expect(captureOfflineCheckpoint({root: "fixture", historyDirectory: "missing-history", baseBoundary: missing, currentBoundary: missing,
      massDirectory: mass, repository: target, controlState: "missing-control"})).rejects.toThrow("Directory Mass capture")
    await expect(createDetachedDissolveCandidateBundle({root: "fixture", proposal: {request: {source: "fixture"}}, validAbsent: [{}],
      capturedAt: "2026-10-11T00:00:00.000Z", confirmStoppedPrivateCopies: true, stoppedMassDirectory: mass, targetDirectory: target} as never)).rejects.toThrow("Directory Mass dissolve")
    const {parseMetaAddress, GRAPH_SCHEMA} = await import("@metafor/types/metafor/graph")
    const identity = parseMetaAddress("fixture")!
    const graph = {schema: GRAPH_SCHEMA, root: identity, template: {[identity]: {name: "Fixture", fields: [], superposition: [], mass: [{key: "workspace", format: "directory" as const}], processes: []}}, runtime: {roots: [], reactions: []}}
    expect(() => publishCurrentOfflineCheckpoint({cutId: "directory-cut", sequence: 1, previousSnapshotSequence: null, acceptedSequences: [1],
      base: graph, result: graph, boundary: new Uint8Array([1]), mass: [], patches: [{sequence: 1, operations: []}],
      repository: target, capturedAt: "2026-10-11T00:00:00.000Z", trigger: "owner-bookmark"})).toThrow("Directory Mass capture")
    const repository = join(root, "checkpoint.git")
    const store = CheckpointGitRepository.initialize(repository, LOCAL_CHECKPOINT_LIMITS_V1)
    const filesBefore = (await readdir(repository, {recursive: true})).sort()
    expect(() => store.write({identity: {cutId: "directory-cut", sequence: 1}, capturedAt: "2026-10-11T00:00:00.000Z", trigger: "owner-bookmark",
      boundary: new Uint8Array([1]), mass: [], projection: {base: graph, result: graph},
      patches: {previousSnapshotSequence: null, entries: [{sequence: 1, operations: []}]}})).toThrow("Directory Mass capture")
    expect((await readdir(repository, {recursive: true})).sort()).toEqual(filesBefore)
    expect(() => DurableEnergyDissolveRetarget.prepare(target, {handles: [{format: "directory"}]} as never)).toThrow("Directory Mass dissolve")
    expect(await Bun.file(target).exists()).toBeFalse()
    expect(await Bun.file(missing).exists()).toBeFalse()
    expect(await Bun.file(join(workspace, "profile")).text()).toBe("untouched")
  } finally {await rm(root, {recursive: true, force: true})}
})
