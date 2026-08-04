import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  SourceWriteError,
  discardSourceCandidates,
  prepareSourceCandidate,
  prepareSourceCandidates,
  publishSourceCandidates,
  recoverAndPublishSourceCandidates,
  readSourceRevision,
  sourceRevision,
} from "../src/source.ts"

describe("atomic Meta source boundary", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "metafor-source-"))
  })

  afterEach(async () => {
    await rm(root, {recursive: true, force: true})
  })

  const target = async (name: string, source: string): Promise<string> => {
    const path = join(root, name, "meta.ts")
    await mkdir(dirname(path), {recursive: true})
    await writeFile(path, source)
    return path
  }

  test("prepares without replacing source, then atomically publishes and verifies it", async () => {
    const path = await target("lada", "before\n")
    const candidate = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })

    expect(await readFile(path, "utf8")).toBe("before\n")
    expect(await readFile(candidate.candidatePath, "utf8")).toBe("after\n")

    const receipt = await publishSourceCandidates([candidate])
    expect(await readFile(path, "utf8")).toBe("after\n")
    expect(await readSourceRevision(path)).toBe(sourceRevision("after\n"))
    expect(receipt).toEqual({
      operationId: "matter-add",
      files: [{
        targetPath: path,
        beforeRevision: sourceRevision("before\n"),
        afterRevision: sourceRevision("after\n"),
        outcome: "published",
      }],
    })
  })

  test("publishes and recovers one absent owned Process artifact with meta.ts", async () => {
    const meta = await target("process", "before\n")
    const action = join(dirname(meta), "actions", "run.ts")
    const candidates = await prepareSourceCandidates([
      {
        targetPath: action,
        operationId: "process-add-recover",
        expectedRevision: "absent",
        source: "export default () => null\n",
      },
      {
        targetPath: meta,
        operationId: "process-add-recover",
        expectedRevision: sourceRevision("before\n"),
        source: "after\n",
      },
    ])

    await expect(readFile(action, "utf8")).rejects.toMatchObject({code: "ENOENT"})
    const receipt = await recoverAndPublishSourceCandidates(
      "process-add-recover",
      candidates.map((candidate) => ({
        targetPath: candidate.targetPath,
        beforeRevision: candidate.beforeRevision,
        afterRevision: candidate.afterRevision,
      })),
    )

    expect(receipt.files).toEqual([
      expect.objectContaining({targetPath: action, beforeRevision: "absent", outcome: "published"}),
      expect.objectContaining({targetPath: meta, outcome: "published"}),
    ])
    expect(await readFile(action, "utf8")).toBe("export default () => null\n")
    expect(await readFile(meta, "utf8")).toBe("after\n")
  })

  test("rejects a stale prepare without creating or replacing anything", async () => {
    const path = await target("lada", "current\n")
    const result = prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add",
      expectedRevision: sourceRevision("stale\n"),
      source: "after\n",
    })

    await expect(result).rejects.toMatchObject({code: "source_revision_mismatch"})
    expect(await readFile(path, "utf8")).toBe("current\n")
  })

  test("detects a concurrent change before replacing any file in a move batch", async () => {
    const first = await target("lada", "lada-before\n")
    const second = await target("lada-chat", "chat-before\n")
    const candidates = await Promise.all([
      prepareSourceCandidate({
        targetPath: first,
        operationId: "matter-move",
        expectedRevision: sourceRevision("lada-before\n"),
        source: "lada-after\n",
      }),
      prepareSourceCandidate({
        targetPath: second,
        operationId: "matter-move",
        expectedRevision: sourceRevision("chat-before\n"),
        source: "chat-after\n",
      }),
    ])
    await writeFile(second, "concurrent\n")

    await expect(publishSourceCandidates(candidates)).rejects.toMatchObject({
      code: "source_revision_mismatch",
    })
    expect(await readFile(first, "utf8")).toBe("lada-before\n")
    expect(await readFile(second, "utf8")).toBe("concurrent\n")
    await discardSourceCandidates(candidates)
  })

  test("cleans an earlier temp when later batch preparation fails", async () => {
    const first = await target("lada", "lada-before\n")
    const second = await target("lada-chat", "chat-current\n")

    await expect(prepareSourceCandidates([
      {
        targetPath: first,
        operationId: "matter-move",
        expectedRevision: sourceRevision("lada-before\n"),
        source: "lada-after\n",
      },
      {
        targetPath: second,
        operationId: "matter-move",
        expectedRevision: sourceRevision("chat-stale\n"),
        source: "chat-after\n",
      },
    ])).rejects.toMatchObject({code: "source_revision_mismatch"})

    expect(await readFile(first, "utf8")).toBe("lada-before\n")
    expect(await readFile(second, "utf8")).toBe("chat-current\n")
    expect((await readdir(dirname(first))).filter((name) => name.endsWith(".candidate"))).toEqual([])
  })

  test("publishes the same prepared candidate idempotently", async () => {
    const path = await target("lada", "before\n")
    const candidate = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-remove",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })

    await publishSourceCandidates([candidate])
    const repeated = await publishSourceCandidates([candidate])

    expect(repeated.files[0]?.outcome).toBe("already_published")
    expect(await readFile(path, "utf8")).toBe("after\n")
  })

  test("recovers an accepted candidate before the first source replacement", async () => {
    const path = await target("lada", "before\n")
    const candidate = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add-recover",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })

    const receipt = await recoverAndPublishSourceCandidates("matter-add-recover", [{
      targetPath: path,
      beforeRevision: candidate.beforeRevision,
      afterRevision: candidate.afterRevision,
    }])

    expect(receipt.files[0]?.outcome).toBe("published")
    expect(await readFile(path, "utf8")).toBe("after\n")
  })

  test("recognizes completed source and removes stale recovery artifacts", async () => {
    const path = await target("lada", "before\n")
    const candidate = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-remove-recover",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })
    await publishSourceCandidates([candidate])
    await writeFile(candidate.candidatePath, "after\n")
    const rollback = join(dirname(path), ".meta.ts.matter-remove-recover.rollback")
    await writeFile(rollback, "before\n")

    const receipt = await recoverAndPublishSourceCandidates("matter-remove-recover", [{
      targetPath: path,
      beforeRevision: candidate.beforeRevision,
      afterRevision: candidate.afterRevision,
    }])

    expect(receipt.files[0]?.outcome).toBe("already_published")
    expect((await readdir(dirname(path))).filter((name) => name.endsWith(".candidate") || name.endsWith(".rollback")))
      .toEqual([])
  })

  test("finishes a partially published move from candidate and rollback evidence", async () => {
    const first = await target("lada", "lada-before\n")
    const second = await target("lada-chat", "chat-before\n")
    const candidates = await prepareSourceCandidates([
      {
        targetPath: first,
        operationId: "matter-move-recover",
        expectedRevision: sourceRevision("lada-before\n"),
        source: "lada-after\n",
      },
      {
        targetPath: second,
        operationId: "matter-move-recover",
        expectedRevision: sourceRevision("chat-before\n"),
        source: "chat-after\n",
      },
    ])
    await writeFile(join(dirname(first), ".meta.ts.matter-move-recover.rollback"), "lada-before\n")
    await writeFile(join(dirname(second), ".meta.ts.matter-move-recover.rollback"), "chat-before\n")
    await rename(candidates[0]!.candidatePath, first)

    const receipt = await recoverAndPublishSourceCandidates("matter-move-recover", candidates.map((candidate) => ({
      targetPath: candidate.targetPath,
      beforeRevision: candidate.beforeRevision,
      afterRevision: candidate.afterRevision,
    })))

    expect(Object.fromEntries(receipt.files.map(({targetPath, outcome}) => [targetPath, outcome])))
      .toEqual({[first]: "already_published", [second]: "published"})
    expect(await readFile(first, "utf8")).toBe("lada-after\n")
    expect(await readFile(second, "utf8")).toBe("chat-after\n")
    expect((await readdir(dirname(first))).filter((name) => name.endsWith(".candidate") || name.endsWith(".rollback")))
      .toEqual([])
    expect((await readdir(dirname(second))).filter((name) => name.endsWith(".candidate") || name.endsWith(".rollback")))
      .toEqual([])
  })

  test("rejects an unrelated source revision during accepted projection recovery", async () => {
    const path = await target("lada", "before\n")
    const candidate = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add-conflict",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })
    await writeFile(path, "other\n")

    await expect(recoverAndPublishSourceCandidates("matter-add-conflict", [{
      targetPath: path,
      beforeRevision: candidate.beforeRevision,
      afterRevision: candidate.afterRevision,
    }])).rejects.toMatchObject({code: "source_revision_mismatch"})
    expect(await readFile(path, "utf8")).toBe("other\n")
  })

  test("rejects non-meta targets and conflicting prepared bytes", async () => {
    const invalid = join(root, "lada.ts")
    await writeFile(invalid, "before\n")
    await expect(prepareSourceCandidate({
      targetPath: invalid,
      operationId: "matter-add",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })).rejects.toMatchObject({code: "invalid_target"})

    const path = await target("lada", "before\n")
    const first = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add",
      expectedRevision: sourceRevision("before\n"),
      source: "after-one\n",
    })
    await expect(prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add",
      expectedRevision: sourceRevision("before\n"),
      source: "after-two\n",
    })).rejects.toMatchObject({code: "candidate_conflict"})
    expect(await readFile(path, "utf8")).toBe("before\n")
    await discardSourceCandidates([first])
  })

  test("does not remove or bypass a lock owned by another writer", async () => {
    const path = await target("lada", "before\n")
    const candidate = await prepareSourceCandidate({
      targetPath: path,
      operationId: "matter-add",
      expectedRevision: sourceRevision("before\n"),
      source: "after\n",
    })
    const lock = join(dirname(path), ".meta.ts.metafor.lock")
    await writeFile(lock, "other-operation", {flag: "wx"})

    const error = publishSourceCandidates([candidate]).catch((caught) => caught)
    expect(await error).toBeInstanceOf(SourceWriteError)
    expect(await error).toMatchObject({code: "source_locked"})
    expect(await readFile(path, "utf8")).toBe("before\n")
    expect(await readFile(lock, "utf8")).toBe("other-operation")
    await discardSourceCandidates([candidate])
  })
})
