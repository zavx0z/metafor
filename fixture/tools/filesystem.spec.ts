import {afterEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, symlink, utimes, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import filesystemList from "./filesystem.list.ts"
import filesystemMetadata from "./filesystem.metadata.ts"
import filesystemRead from "./filesystem.read.ts"
import {FILESYSTEM_FIXTURE_MAX_BYTES} from "./filesystem.ts"

const temporaryDirectories: string[] = []

const createScopedRoot = async (): Promise<{directory: string; root: string}> => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-filesystem-tools-"))
  const root = join(directory, "root")
  temporaryDirectories.push(directory)
  await mkdir(root)
  return {directory, root}
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})))
})

describe("scoped filesystem fixture actions", () => {
  test("filesystem.read stores base64 content in mass and returns only control state", async () => {
    const {root} = await createScopedRoot()
    const content = Buffer.from("MetaFor\0fixture")
    await writeFile(join(root, "input.bin"), content)
    const mass: Record<string, unknown> = {filesystemRoot: root}

    const control = await filesystemRead({value: {path: "input.bin"}, mass})

    expect(control).toEqual({ok: true})
    expect(control).not.toHaveProperty("dataBase64")
    expect(mass.result).toEqual({dataBase64: content.toString("base64")})
  })

  test("filesystem.list stores deterministically sorted entry names and kinds", async () => {
    const {root} = await createScopedRoot()
    await mkdir(join(root, "z-directory"))
    await writeFile(join(root, "b.txt"), "b")
    await writeFile(join(root, "a.txt"), "a")
    await symlink(join(root, "a.txt"), join(root, "m-link"))
    const mass: Record<string, unknown> = {filesystemRoot: root}

    const control = await filesystemList({value: {path: "."}, mass})

    expect(control).toEqual({ok: true})
    expect(control).not.toHaveProperty("entries")
    expect(mass.result).toEqual({
      entries: [
        {name: "a.txt", kind: "file"},
        {name: "b.txt", kind: "file"},
        {name: "m-link", kind: "symlink"},
        {name: "z-directory", kind: "directory"},
      ],
    })
  })

  test("filesystem.metadata stores compact file metadata in mass", async () => {
    const {root} = await createScopedRoot()
    const path = join(root, "artifact.txt")
    const mtime = new Date("2024-01-02T03:04:05.000Z")
    await writeFile(path, "four")
    await utimes(path, mtime, mtime)
    const mass: Record<string, unknown> = {filesystemRoot: root}

    const control = await filesystemMetadata({value: {path: "artifact.txt"}, mass})

    expect(control).toEqual({ok: true})
    expect(control).not.toHaveProperty("size")
    expect(mass.result).toEqual({size: 4, type: "file", mtime: mtime.toISOString()})
  })

  test("all actions reject lexical path escape without writing a mass result", async () => {
    const {directory, root} = await createScopedRoot()
    await writeFile(join(directory, "outside.txt"), "outside")

    for (const action of [filesystemRead, filesystemList, filesystemMetadata]) {
      const mass: Record<string, unknown> = {filesystemRoot: root}
      await expect(action({value: {path: "../outside.txt"}, mass})).rejects.toThrow("filesystem path escapes root")
      expect(mass).not.toHaveProperty("result")
    }
  })

  test("all actions reject paths that escape through symlinks", async () => {
    const {directory, root} = await createScopedRoot()
    const outsideDirectory = join(directory, "outside")
    await mkdir(outsideDirectory)
    await writeFile(join(outsideDirectory, "outside.txt"), "outside")
    await symlink(outsideDirectory, join(root, "escape"))

    const attempts = [
      () => filesystemRead({value: {path: "escape/outside.txt"}, mass: {filesystemRoot: root}}),
      () => filesystemList({value: {path: "escape"}, mass: {filesystemRoot: root}}),
      () => filesystemMetadata({value: {path: "escape/outside.txt"}, mass: {filesystemRoot: root}}),
    ]
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow("filesystem path escapes root")
    }
  })

  test("caller input cannot replace the trusted filesystem capability root", async () => {
    const {directory, root} = await createScopedRoot()
    await writeFile(join(directory, "outside.txt"), "outside")
    const mass: Record<string, unknown> = {filesystemRoot: root}

    await expect(filesystemRead({
      value: {root: directory, path: "outside.txt"},
      mass,
    })).rejects.toThrow()
    expect(mass).not.toHaveProperty("result")
  })

  test("filesystem actions require a trusted capability root in mass", async () => {
    await expect(filesystemRead({value: {path: "etc/hosts"}, mass: {}})).rejects.toThrow(
      "filesystem capability root must be an absolute path in mass.filesystemRoot",
    )
  })

  test("filesystem.read rejects payloads larger than the in-memory fixture limit", async () => {
    const {root} = await createScopedRoot()
    await writeFile(join(root, "large.bin"), Buffer.alloc(FILESYSTEM_FIXTURE_MAX_BYTES + 1))
    const mass: Record<string, unknown> = {filesystemRoot: root}

    await expect(filesystemRead({value: {path: "large.bin"}, mass})).rejects.toThrow(
      `filesystem.read exceeds ${FILESYSTEM_FIXTURE_MAX_BYTES} byte fixture limit`,
    )
    expect(mass).not.toHaveProperty("result")
  })
})
