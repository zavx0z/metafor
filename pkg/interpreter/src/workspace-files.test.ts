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
  test("scopes files to the launched module package root", () => {
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

    expect(payload.root).toBe(join(cwd, "dark"))
    expect(payload.workspacePath).toBe("dark")
    expect(payload.files.map((file) => file.path)).toContain("server.spec.ts")
    expect(payload.files.map((file) => file.path)).toContain("weak/index.ts")
    expect(payload.files.some((file) => file.path.startsWith("pkg/interpreter/"))).toBe(false)
  })

  test("keeps independent file roots for different modules", () => {
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

    expect(dark.workspacePath).toBe("dark")
    expect(interpreter.workspacePath).toBe("pkg/interpreter")
    expect(dark.files.map((file) => file.path)).toContain("server.spec.ts")
    expect(interpreter.files.map((file) => file.path)).toContain("src/syntax.test.ts")
    expect(interpreter.files.map((file) => file.path)).not.toContain("server.spec.ts")
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

    expect(payload.root).toBe(join(cwd, "dark"))
    expect(payload.modulePath).toBe(join(cwd, "dark/server.spec.ts"))
  })
})

function testWorkspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), "metafor-workspace-"))
  tempRoots.push(cwd)
  writeFile(cwd, "package.json", "{}")
  writeFile(cwd, "action.spec.ts", "test('root', () => {})")
  writeFile(cwd, "dark/package.json", "{}")
  writeFile(cwd, "dark/server.spec.ts", "test('dark', () => {})")
  writeFile(cwd, "dark/server.ts", "export {}")
  writeFile(cwd, "dark/weak/index.ts", "export {}")
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
