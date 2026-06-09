import {afterEach, expect, test} from "bun:test"
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {applyPatch, createReplaceFilePatch} from "./apply-patch.ts"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "metafor-apply-patch-"))
  tempDirs.push(dir)
  return dir
}

test("createReplaceFilePatch replaces a whole file through applyPatch", () => {
  const cwd = tempWorkspace()
  const path = join(cwd, "module.ts")
  writeFileSync(path, "const value = 1\n", "utf8")

  const patch = createReplaceFilePatch(path, "const value = 1\n", "const value = 2\n", {cwd})
  expect(patch).not.toBeNull()
  const result = applyPatch({cwd, patch: patch!})

  expect(readFileSync(path, "utf8")).toBe("const value = 2\n")
  expect(result.files[0]?.operation).toBe("update")
  expect(result.files[0]?.lineChanges).toEqual([])
})

test("applyPatch adds and deletes files inside the workspace", () => {
  const cwd = tempWorkspace()
  writeFileSync(join(cwd, "old.ts"), "export const old = true\n", "utf8")
  const result = applyPatch({
    cwd,
    patch: [
      "*** Begin Patch",
      "*** Add File: nested/new.ts",
      "+export const value = 1",
      "*** Delete File: old.ts",
      "*** End Patch",
      "",
    ].join("\n"),
  })

  expect(readFileSync(join(cwd, "nested/new.ts"), "utf8")).toBe("export const value = 1\n")
  expect(result.files.map((file) => file.operation)).toEqual(["add", "delete"])
})

test("applyPatch rejects paths outside the workspace", () => {
  const cwd = tempWorkspace()
  const outsideName = `outside-${cwd.split("/").at(-1) ?? "workspace"}.ts`
  expect(() => applyPatch({
    cwd,
    patch: [
      "*** Begin Patch",
      `*** Add File: ../${outsideName}`,
      "+export const leaked = true",
      "*** End Patch",
      "",
    ].join("\n"),
  })).toThrow("escapes workspace")
  expect(existsSync(join(cwd, "..", outsideName))).toBe(false)
})

test("applyPatch does not write earlier operations when a later hunk fails", () => {
  const cwd = tempWorkspace()
  const source = join(cwd, "source.ts")
  writeFileSync(source, "const value = 1\n", "utf8")

  expect(() => applyPatch({
    cwd,
    patch: [
      "*** Begin Patch",
      "*** Add File: created.ts",
      "+export const created = true",
      "*** Update File: source.ts",
      "@@",
      "-const value = 2",
      "+const value = 3",
      "*** End Patch",
      "",
    ].join("\n"),
  })).toThrow("patch hunk does not match")

  expect(existsSync(join(cwd, "created.ts"))).toBe(false)
  expect(readFileSync(source, "utf8")).toBe("const value = 1\n")
})

test("applyPatch reports line changes for update hunks", () => {
  const cwd = tempWorkspace()
  const path = join(cwd, "module.ts")
  writeFileSync(path, "a\nb\nc\nd\n", "utf8")

  const result = applyPatch({
    cwd,
    patch: [
      "*** Begin Patch",
      "*** Update File: module.ts",
      "@@",
      " a",
      "-b",
      " c",
      " d",
      "*** End Patch",
      "",
    ].join("\n"),
  })

  expect(readFileSync(path, "utf8")).toBe("a\nc\nd\n")
  expect(result.files[0]?.lineChanges).toEqual([{oldStart: 2, oldLines: 1, newStart: 2, newLines: 0}])
})
