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
    expect(payload.files.map((file) => file.path)).toContain("dark/server.spec.ts")
    expect(payload.files.map((file) => file.path)).toContain("dark/server.ts")
    expect(payload.files.map((file) => file.path)).toContain("protocol.ts")
    expect(payload.files.map((file) => file.path)).toContain("store/server.ts")
    expect(payload.files.map((file) => file.path)).toContain("store/index.ts")
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
    expect(dark.files.map((file) => file.path)).toContain("protocol.ts")
    expect(interpreter.files.map((file) => file.path)).toContain("pkg/interpreter/src/syntax.test.ts")
    expect(interpreter.files.map((file) => file.path)).not.toContain("dark/server.spec.ts")
    expect(interpreter.files.map((file) => file.path)).not.toContain("protocol.ts")
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
    const payload = workspaceFilesPayload(new URL("http://127.0.0.1/processes/dark-server.spec.ts/modules?q=protocol&limit=500"), {
      cwd,
      module: {
        id: "dark-server.spec.ts",
        label: "dark/server.spec.ts",
        modulePath: join(cwd, "dark/server.spec.ts"),
        target: {command: ["bun", "test", join(cwd, "dark/server.spec.ts")], cwd},
      },
    })

    expect(payload.files.map((file) => file.path)).toEqual(["protocol.ts"])
  })
})

function testWorkspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), "metafor-workspace-"))
  tempRoots.push(cwd)
  writeFile(cwd, "package.json", JSON.stringify({
    name: "metafor-test",
    exports: {".": "./index.ts"},
    workspaces: ["dark", "pkg/*", "store"],
  }))
  writeFile(cwd, "action.spec.ts", "test('root', () => {})")
  writeFile(cwd, "index.ts", "export const MetaFor = () => null")
  writeFile(cwd, "protocol.ts", "export const GRAVITY_BROADCAST_CHANNEL = 'metafor.gravity'")
  writeFile(cwd, "dark/package.json", JSON.stringify({
    name: "@metafor/dark",
    dependencies: {store: "workspace:*"},
  }))
  writeFile(cwd, "dark/server.spec.ts", "import {GRAVITY_BROADCAST_CHANNEL} from '../protocol.ts'\nawait import('./server.ts')\ntest('dark', () => GRAVITY_BROADCAST_CHANNEL)")
  writeFile(cwd, "dark/server.ts", "import {GRAVITY_BROADCAST_CHANNEL} from '../protocol.ts'\nimport {MetaFor} from '..'\nimport {open} from 'store/server'\nexport {GRAVITY_BROADCAST_CHANNEL, MetaFor, open}")
  writeFile(cwd, "dark/weak/index.ts", "export {}")
  writeFile(cwd, "store/package.json", JSON.stringify({
    name: "store",
    exports: {".": "./index.ts", "./server": "./server.ts"},
  }))
  writeFile(cwd, "store/index.ts", "export type Store = {ready: boolean}")
  writeFile(cwd, "store/server.ts", "import type {Store} from './index.ts'\nexport const open = async (): Promise<Store> => ({ready: true})")
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
