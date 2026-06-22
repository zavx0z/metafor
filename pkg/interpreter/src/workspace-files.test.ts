import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {workspaceFilesPayload} from "./workspace-files.ts"

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, {recursive: true, force: true})
})

describe("workspaceFilesPayload", () => {
  test("uses launch cwd as root and follows imported workspace files", () => {
    const cwd = testWorkspace()
    const payload = workspaceFilesPayload(new URL("http://127.0.0.1/processes/dark-server.spec.ts/modules?limit=500"), {
      cwd,
      module: {
        id: "dark-server.spec.ts",
        label: "dark/server.spec.ts",
        modulePath: join(cwd, "dark/server.spec.ts"),
        target: {command: ["bun", "test", join(cwd, "dark/server.spec.ts")], cwd},
      },
    })

    expect(payload.root).toBe(cwd)
    expect(payload.workspacePath).toBe("")
    expect(payload.files.some((file) => file.path.endsWith("/"))).toBe(false)
    expect(payload.files.map((file) => file.path)).not.toContain("github/")
    expect(payload.files.map((file) => file.path)).toContain("dark/server.spec.ts")
    expect(payload.files.map((file) => file.path)).toContain("dark/server.ts")
    expect(payload.files.map((file) => file.path)).toContain("boundary/force.ts")
    expect(payload.files.map((file) => file.path)).toContain("boundary/sqlite.ts")
    expect(payload.files.map((file) => file.path)).toContain("boundary/index.ts")
    expect(payload.files.map((file) => file.path)).not.toContain("dark/weak/index.ts")
    expect(payload.files.some((file) => file.path.startsWith("pkg/interpreter/"))).toBe(false)
  })

  test("keeps independent import graphs for different processes", () => {
    const cwd = testWorkspace()
    const dark = workspaceFilesPayload(new URL("http://127.0.0.1/processes/dark-server.spec.ts/modules?limit=500"), {
      cwd,
      module: {
        id: "dark-server.spec.ts",
        label: "dark/server.spec.ts",
        modulePath: join(cwd, "dark/server.spec.ts"),
        target: {command: ["bun", "test", join(cwd, "dark/server.spec.ts")], cwd},
      },
    })
    const interpreter = workspaceFilesPayload(new URL("http://127.0.0.1/processes/syntax.test.ts/modules?limit=500"), {
      cwd,
      module: {
        id: "syntax.test.ts",
        label: "pkg/interpreter/src/syntax.test.ts",
        modulePath: join(cwd, "pkg/interpreter/src/syntax.test.ts"),
        target: {command: ["bun", "test", join(cwd, "pkg/interpreter/src/syntax.test.ts")], cwd},
      },
    })

    expect(dark.workspacePath).toBe("")
    expect(interpreter.workspacePath).toBe("")
    expect(dark.files.map((file) => file.path)).toContain("dark/server.spec.ts")
    expect(dark.files.map((file) => file.path)).toContain("boundary/force.ts")
    expect(interpreter.files.map((file) => file.path)).toContain("pkg/interpreter/src/syntax.test.ts")
    expect(interpreter.files.map((file) => file.path)).not.toContain("dark/server.spec.ts")
    expect(interpreter.files.map((file) => file.path)).not.toContain("boundary/force.ts")
  })

  test("falls back to command path when modulePath is unavailable", () => {
    const cwd = testWorkspace()
    const payload = workspaceFilesPayload(new URL("http://127.0.0.1/processes/dark-server.spec.ts/modules?limit=500"), {
      cwd,
      module: {
        id: "dark-server.spec.ts",
        label: "dark/server.spec.ts",
        target: {command: ["bun", "test", "--timeout=2147483647", join(cwd, "dark/server.spec.ts")], cwd},
      },
    })

    expect(payload.root).toBe(cwd)
    expect(payload.modulePath).toBe(join(cwd, "dark/server.spec.ts"))
  })

  test("filters imported catalog by query", () => {
    const cwd = testWorkspace()
    const payload = workspaceFilesPayload(new URL("http://127.0.0.1/processes/dark-server.spec.ts/modules?q=force&limit=500"), {
      cwd,
      module: {
        id: "dark-server.spec.ts",
        label: "dark/server.spec.ts",
        modulePath: join(cwd, "dark/server.spec.ts"),
        target: {command: ["bun", "test", join(cwd, "dark/server.spec.ts")], cwd},
      },
    })

    expect(payload.files.map((file) => file.path)).toEqual(["boundary/force.ts"])
  })
})

function testWorkspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), "metafor-workspace-"))
  tempRoots.push(cwd)
  writeFile(cwd, "package.json", JSON.stringify({
    name: "metafor-test",
    exports: {".": "./index.ts"},
    workspaces: ["dark", "pkg/*", "boundary"],
  }))
  writeFile(cwd, "action.spec.ts", "test('root', () => {})")
  writeFile(cwd, "index.ts", "export const MetaFor = () => null")
  writeFile(cwd, "dark/package.json", JSON.stringify({
    name: "dark",
    dependencies: {"boundary": "workspace:*"},
  }))
  writeFile(cwd, "dark/server.spec.ts", "import {FORCE} from 'boundary/force'\nawait import('./server.ts')\ntest('dark', () => FORCE)")
  writeFile(cwd, "dark/server.ts", "import {FORCE} from 'boundary/force'\nimport {MetaFor} from '..'\nimport {open} from 'boundary/sqlite'\nexport {FORCE, MetaFor, open}")
  writeFile(cwd, "dark/weak/index.ts", "export {}")
  writeFile(cwd, "boundary/package.json", JSON.stringify({
    name: "boundary",
    exports: {".": "./index.ts", "./force": "./force.ts", "./sqlite": "./sqlite.ts"},
  }))
  writeFile(cwd, "boundary/index.ts", "export type Boundary = {ready: boolean}")
  writeFile(cwd, "boundary/force.ts", "export const FORCE = 'force'")
  writeFile(cwd, "boundary/sqlite.ts", "import type {Boundary} from './index.ts'\nexport const open = async (): Promise<Boundary> => ({ready: true})")
  writeFile(cwd, "github/person/meta.ts", "export const meta = 'person'")
  writeFile(cwd, "pkg/interpreter/package.json", "{}")
  writeFile(cwd, "pkg/interpreter/src/syntax.test.ts", "test('syntax', () => {})")
  writeFile(cwd, "pkg/interpreter/src/server.ts", "export {}")
  return cwd
}

function writeFile(root: string, path: string, text: string): void {
  const fullPath = join(root, path)
  mkdirSync(dirname(fullPath), {recursive: true})
  writeFileSync(fullPath, text)
}
