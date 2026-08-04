import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  MetaCreatePatchError,
  materializeMetaCreatePatch,
} from "../src/create.ts"
import {buildMetaPackageTemplate} from "../src/template.ts"

const template = (repository: string) => buildMetaPackageTemplate({
  identity: {owner: "zavx0z", repository},
  name: repository,
  description: "Create RPC test",
  author: "zavx0z",
  errorLabel: "Error",
  htmlLang: "en",
  profile: "empty",
})

describe("atomic Create Meta source patch", () => {
  let root: string
  let cluster: string
  let owner: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "metafor-create-patch-"))
    cluster = join(root, "cluster")
    owner = join(cluster, "zavx0z")
    await mkdir(owner, {recursive: true})
  })

  afterEach(async () => {
    await rm(root, {recursive: true, force: true})
  })

  test("publishes one complete unstaged peer repository and recognizes the repeat", async () => {
    const patch = template("lada-test")
    const first = await materializeMetaCreatePatch({
      clusterRoot: cluster,
      operationId: "create-lada-test",
      template: patch,
    })
    const repeated = await materializeMetaCreatePatch({
      clusterRoot: cluster,
      operationId: "create-lada-test",
      template: patch,
    })

    expect(first).toMatchObject({
      outcome: "created",
      targetPath: join(owner, "lada-test"),
      repository: {initialized: true, branch: "main", head: null, staged: false},
    })
    expect(repeated).toEqual({...first, outcome: "already_created"})
    expect(first.files).toEqual(patch.files.map(({path}) => path))
    for (const file of patch.files) {
      expect(await readFile(join(first.targetPath, file.path), "utf8")).toBe(file.source)
    }
  })

  test("finishes an exact partially written candidate", async () => {
    const patch = template("partial")
    const candidate = join(owner, ".partial.partial-create.candidate")
    const existing = patch.files.find(({path}) => path === "src/metafor.d.ts")!
    await mkdir(dirname(join(candidate, existing.path)), {recursive: true})
    await writeFile(join(candidate, existing.path), existing.source)

    const result = await materializeMetaCreatePatch({
      clusterRoot: cluster,
      operationId: "partial-create",
      template: patch,
    })

    expect(result.outcome).toBe("created")
    expect(await readFile(join(result.targetPath, existing.path), "utf8")).toBe(existing.source)
  })

  test("does not overwrite a conflicting existing target", async () => {
    const patch = template("conflict")
    const target = join(owner, "conflict")
    await mkdir(target)
    await writeFile(join(target, "meta.ts"), "owner bytes\n")

    await expect(materializeMetaCreatePatch({
      clusterRoot: cluster,
      operationId: "target-conflict",
      template: patch,
    })).rejects.toMatchObject({code: "target_conflict"} satisfies Partial<MetaCreatePatchError>)
    expect(await readFile(join(target, "meta.ts"), "utf8")).toBe("owner bytes\n")
  })

  test("does not repair a candidate whose existing bytes conflict", async () => {
    const patch = template("candidate-conflict")
    const candidate = join(owner, ".candidate-conflict.create-conflict.candidate")
    await mkdir(candidate)
    await writeFile(join(candidate, "meta.ts"), "other patch\n")

    await expect(materializeMetaCreatePatch({
      clusterRoot: cluster,
      operationId: "create-conflict",
      template: patch,
    })).rejects.toMatchObject({code: "candidate_conflict"} satisfies Partial<MetaCreatePatchError>)
    expect(await readFile(join(candidate, "meta.ts"), "utf8")).toBe("other patch\n")
  })
})
