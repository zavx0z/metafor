import {afterEach, describe, expect, test} from "bun:test"
import {chmodSync, mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {spawnSync} from "node:child_process"
import {
  validateCheckpointForwardPatchDocumentV1,
  validateCheckpointManifestV1,
  type CheckpointIdentityV1,
  type CheckpointJsonPatchOperationV1,
  type CheckpointManifestV1,
} from "@dark/types/checkpoint"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {
  CheckpointGitRepository,
  CheckpointRepositoryError,
  type CheckpointCapture,
  type CheckpointRepositoryLimits,
} from "./repository.ts"

const directories: string[] = []
const encoder = new TextEncoder()
const limits: CheckpointRepositoryLimits = {
  maxBlobBytes: 8 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
  maxMassEntries: 16,
}

const root = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-checkpoint-repository-"))
  directories.push(directory)
  return directory
}

const git = (repository: string, ...args: string[]): string => {
  const result = spawnSync("git", ["--git-dir", repository, ...args], {
    env: {...process.env, GIT_TERMINAL_PROMPT: "0"},
    encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`)
  return result.stdout.trim()
}

const ROOT = parseMetaAddress("example/root")!

const projection = (sequence: number): Graph => ({
  schema: GRAPH_SCHEMA,
  root: ROOT,
  template: {
    [ROOT]: {
      name: `Root ${sequence}`,
      fields: [],
      superposition: [{name: "idle", transitions: null}],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      ref: "atom:1",
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: "idle",
      values: {},
      mass: [],
      children: [],
    }],
    reactions: [],
  },
})

const operations = (sequence: number): CheckpointJsonPatchOperationV1[] => [{
  op: "replace",
  path: "/template/example~1root/name",
  value: `Root ${sequence}`,
}]

const capture = (
  sequence: number,
  previousSnapshotSequence: number | null,
  override: Partial<CheckpointCapture> = {},
): CheckpointCapture => {
  const first = previousSnapshotSequence === null ? 1 : previousSnapshotSequence + 1
  return {
    identity: {cutId: "synthetic-cut", sequence},
    capturedAt: `2026-07-26T16:00:${sequence.toString().padStart(2, "0")}.000Z`,
    trigger: "owner-bookmark",
    boundary: encoder.encode(`sqlite-${sequence}`),
    projection: {
      base: projection(previousSnapshotSequence ?? sequence),
      result: projection(sequence),
    },
    mass: [
      {
        keyId: "11111111-1111-4111-8111-111111111111",
        format: "json",
        bytes: encoder.encode('{"shared":true}'),
      },
      {
        keyId: "22222222-2222-4222-8222-222222222222",
        format: "binary",
        bytes: encoder.encode('{"shared":true}'),
      },
    ],
    patches: {
      previousSnapshotSequence,
      entries: Array.from(
        {length: Math.max(0, sequence - first + 1)},
        (_, index) => ({
          sequence: first + index,
          operations: previousSnapshotSequence === null ? [] : operations(first + index),
        }),
      ),
    },
    ...override,
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

describe("isolated checkpoint Git repository", () => {
  test("initializes only a bare repository without branches or remotes", () => {
    const repository = join(root(), "checkpoint.git")
    CheckpointGitRepository.initialize(repository, limits)

    expect(git(repository, "rev-parse", "--is-bare-repository")).toBe("true")
    expect(git(repository, "for-each-ref", "--format=%(refname)", "refs/heads")).toBe("")
    expect(git(repository, "remote")).toBe("")
  })

  test("publishes one verified commit and deduplicates equal Mass chunks", () => {
    const repository = join(root(), "checkpoint.git")
    const store = CheckpointGitRepository.initialize(repository, limits)
    const result = store.write(capture(2, null))

    expect(result.manifest.identity).toEqual({cutId: "synthetic-cut", sequence: 2})
    expect(result.manifest.patches).toMatchObject({
      previousSnapshotSequence: null,
      fromSequence: 1,
      throughSequence: 2,
      entries: 2,
      base: {sequence: 0},
      result: {sequence: 2},
    })
    expect(result.manifest.projection).toMatchObject({
      schema: "metafor/graph",
      root: ROOT,
      canonicalization: "rfc8785",
    })
    expect(result.manifest.mass[0]!.blob.sha256).toBe(result.manifest.mass[1]!.blob.sha256)
    const sharedDigest = result.manifest.mass[0]!.blob.chunks[0]!.sha256
    const paths = git(repository, "ls-tree", "-r", "--name-only", result.commit).split("\n")
    expect(paths.filter((path) => path.endsWith(sharedDigest))).toHaveLength(1)
    expect(git(repository, "rev-list", "--all", "--count")).toBe("1")
    expect(git(repository, "rev-parse", result.sequenceRef)).toBe(result.commit)
    expect(git(repository, "rev-parse", "refs/metafor/checkpoints/synthetic-cut/head")).toBe(result.commit)
    expect(store.verify({cutId: "synthetic-cut", sequence: 2})).toEqual(result)
  })

  test("creates a linear immutable commit per snapshot and reuses unchanged objects", () => {
    const repository = join(root(), "checkpoint.git")
    const store = CheckpointGitRepository.initialize(repository, limits)
    const first = store.write(capture(1, null))
    const second = store.write(capture(3, 1))

    expect(git(repository, "rev-list", "--all", "--count")).toBe("2")
    expect(git(repository, "rev-parse", `${second.commit}^`)).toBe(first.commit)
    const digest = first.manifest.mass[0]!.blob.chunks[0]!.sha256
    const firstObject = git(repository, "ls-tree", first.commit, `objects/sha256/${digest.slice(0, 2)}/${digest}`)
      .split(/\s+/)[2]
    const secondObject = git(repository, "ls-tree", second.commit, `objects/sha256/${digest.slice(0, 2)}/${digest}`)
      .split(/\s+/)[2]
    expect(secondObject).toBe(firstObject)
  })

  test("rejects duplicate identities and incomplete patch coverage before publication", () => {
    const repository = join(root(), "checkpoint.git")
    const store = CheckpointGitRepository.initialize(repository, limits)
    store.write(capture(1, null))

    expect(() => store.write(capture(1, null))).toThrow("already exists")
    expect(() => store.write(capture(3, 1, {
      patches: {previousSnapshotSequence: 1, entries: [{sequence: 2, operations: []}]},
    }))).toThrow("patch span")
    expect(validateCheckpointForwardPatchDocumentV1({
      schema: "metafor/checkpoint-forward-patches/v1",
      cutId: "synthetic-cut",
      projection: {
        schema: "metafor/graph",
        root: ROOT,
        canonicalization: "rfc8785",
      },
      previousSnapshotSequence: 1,
      fromSequence: 2,
      throughSequence: 2,
      base: {sequence: 1, sha256: "0".repeat(64)},
      result: {sequence: 2, sha256: "1".repeat(64)},
      entries: [{
        sequence: 2,
        operations: [{op: "remove", path: "/value", inverse: true}],
      }],
    })).toBe(false)
    expect(git(repository, "rev-list", "--all", "--count")).toBe("1")
  })

  test("keeps a commit invisible after a crash before ref publication and can retry", () => {
    const repository = join(root(), "checkpoint.git")
    let orphan = ""
    const crashing = CheckpointGitRepository.initialize(repository, limits, {
      beforePublish(commit) {
        orphan = commit
        throw new Error("simulated crash")
      },
    })

    expect(() => crashing.write(capture(1, null))).toThrow("simulated crash")
    expect(orphan).toMatch(/^[0-9a-f]{40,64}$/)
    expect(git(repository, "for-each-ref", "--format=%(refname)", "refs/metafor")).toBe("")
    expect(git(repository, "rev-list", "--all", "--count")).toBe("0")

    const recovered = CheckpointGitRepository.open(repository, limits)
    const result = recovered.write(capture(1, null))
    expect(result.commit).toBe(orphan)
    expect(git(repository, "rev-list", "--all", "--count")).toBe("1")
  })

  test("publishes sequence and head refs atomically under a competing cut-head update", () => {
    const repository = join(root(), "checkpoint.git")
    const base = CheckpointGitRepository.initialize(repository, limits)
    base.write(capture(1, null))
    const competitor = CheckpointGitRepository.open(repository, limits)
    const stale = CheckpointGitRepository.open(repository, limits, {
      beforePublish() {
        competitor.write(capture(3, 1))
      },
    })

    expect(() => stale.write(capture(2, 1))).toThrow("publication failed atomically")
    expect(() => base.verify({cutId: "synthetic-cut", sequence: 2})).toThrow("is missing")
    expect(base.verify({cutId: "synthetic-cut", sequence: 3}).manifest.identity.sequence).toBe(3)
    expect(git(repository, "rev-list", "--all", "--count")).toBe("2")
  })

  test("rejects corrupted Git objects and closed-manifest violations", () => {
    const directory = root()
    const repository = join(directory, "checkpoint.git")
    const store = CheckpointGitRepository.initialize(repository, limits)
    const result = store.write(capture(1, null))
    const sha256 = result.manifest.boundary.blob.chunks[0]!.sha256
    const tree = git(repository, "ls-tree", result.commit, `objects/sha256/${sha256.slice(0, 2)}/${sha256}`)
    const object = tree.split(/\s+/)[2]!
    const objectPath = join(repository, "objects", object.slice(0, 2), object.slice(2))
    chmodSync(objectPath, 0o600)
    writeFileSync(objectPath, "corrupt")
    expect(() => store.verify({cutId: "synthetic-cut", sequence: 1})).toThrow()

    const invalid = structuredClone(result.manifest) as CheckpointManifestV1 & {inverse?: unknown}
    invalid.inverse = []
    expect(validateCheckpointManifestV1(invalid)).toMatchObject({ok: false})
  })

  test("enforces explicit blob budgets before any ref becomes visible", () => {
    const repository = join(root(), "checkpoint.git")
    const store = CheckpointGitRepository.initialize(repository, {
      maxBlobBytes: 3,
      maxTotalBytes: 64,
      maxMassEntries: 2,
    })
    expect(() => store.write(capture(1, null, {boundary: encoder.encode("four")})))
      .toThrow(CheckpointRepositoryError)
    expect(git(repository, "for-each-ref", "--format=%(refname)", "refs/metafor")).toBe("")
  })
})
