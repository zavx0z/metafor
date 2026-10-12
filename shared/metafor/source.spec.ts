import {afterEach, beforeEach, expect, test} from "bun:test"
import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {canonicalMetaSource, createMetaSourceResolver, defaultMetaSourceResolver, resolveRootMetaSource} from "./source"

let root: string
beforeEach(() => {root = mkdtempSync(join(tmpdir(), "metafor-package-source-"))})
afterEach(() => {rmSync(root, {recursive: true, force: true})})
function pkg(path: string, name: string, manifest: Record<string, unknown> = {}, entry = "meta.ts") {
  const directory = join(root, path)
  mkdirSync(directory, {recursive: true})
  writeFileSync(join(directory, "package.json"), JSON.stringify({name, ...manifest}))
  mkdirSync(join(directory, entry, ".."), {recursive: true})
  writeFileSync(join(directory, entry), "throw new Error('discovery must not execute Meta')\n")
  return directory
}

test("package name defines identity in arbitrary directories without Git", () => {
  const directory = pkg("arbitrary-place", "@owner/capsule", {repository: "https://example.invalid/unrelated.git"})
  const resolver = createMetaSourceResolver({root})
  expect(resolver.discover()).toEqual([{address: "@owner/capsule", directory, metaPath: join(directory, "meta.ts")}])
  expect(resolver.resolveDirectory("@owner/capsule")).toBe(directory)
  expect(() => resolver.resolveDirectory("owner/capsule")).toThrow("package.json#name")
  expect(canonicalMetaSource("capsule")).toBeTrue()
  expect(canonicalMetaSource("@owner/capsule")).toBeTrue()
  expect(canonicalMetaSource("owner/capsule")).toBeFalse()
})

test("root file and directory preserve exact entry, nearest package and sibling workspaces", () => {
  const repository = pkg("repo", "application", {workspaces: ["parts/*"]})
  const browser = pkg("repo/parts/browser", "@app/browser")
  const nested = join(browser, "declaration")
  mkdirSync(nested)
  writeFileSync(join(nested, "meta.ts"), "must not execute")
  pkg("sibling", "sibling", {workspaces: ["units/*"]})
  const remote = pkg("sibling/units/runtime", "@sibling/runtime")
  const selected = resolveRootMetaSource(nested)
  expect(selected.source).toBe("@app/browser")
  expect(selected.resolver.resolveMetaPath("@app/browser")).toBe(join(nested, "meta.ts"))
  expect(selected.resolver.resolveDirectory("application")).toBe(repository)
  expect(selected.resolver.resolveDirectory("@sibling/runtime")).toBe(remote)
  expect(resolveRootMetaSource(join(nested, "meta.ts")).source).toBe("@app/browser")
})

test("honors public ./meta entry and declared installed dependency only", () => {
  const app = pkg("app", "app", {dependencies: {"@dep/meta": "1"}})
  const dependency = pkg("app/node_modules/@dep/meta", "@dep/meta", {exports: {"./meta": {bun: "./declaration.ts"}}}, "declaration.ts")
  pkg("app/node_modules/hidden", "hidden")
  const resolver = resolveRootMetaSource(app).resolver
  expect(resolver.resolveMetaPath("@dep/meta")).toBe(join(dependency, "declaration.ts"))
  expect(() => resolver.resolveDirectory("hidden")).toThrow("not available")
})

test("dependency lookup stays lazy and registered workspace links preserve package ownership", () => {
  const app = pkg("app", "app", {workspaces: ["parts/*"], dependencies: {"@app/child": "workspace:*", broken: "1", external: "1"}})
  const child = pkg("app/parts/child", "@app/child")
  mkdirSync(join(app, "node_modules/@app"), {recursive: true})
  symlinkSync(child, join(app, "node_modules/@app/child"))
  mkdirSync(join(app, "node_modules/broken"))
  writeFileSync(join(app, "node_modules/broken/package.json"), "invalid JSON must remain unread")
  const external = pkg("unregistered/nested", "external")
  symlinkSync(external, join(app, "node_modules/external"))
  const resolver = resolveRootMetaSource(app).resolver
  expect(resolver.discover()).toHaveLength(2)
  expect(resolver.resolveDirectory("@app/child")).toBe(child)
  expect(resolver.resolveDirectory("app")).toBe(app)
  expect(() => resolver.resolveDirectory("external")).toThrow("not a registered workspace")
})

test("rejects missing root, name, duplicate package identities and undeclared nesting", () => {
  expect(() => resolveRootMetaSource(join(root, "missing"))).toThrow("missing")
  const app = pkg("app", "application")
  expect(() => resolveRootMetaSource(join(app, "package.json"))).toThrow("meta.ts")
  pkg("app/undeclared", "undeclared")
  expect(() => createMetaSourceResolver({root}).resolveDirectory("undeclared")).toThrow("not available")
  pkg("second", "application")
  expect(() => createMetaSourceResolver({root}).discover()).toThrow("Duplicate")
  rmSync(join(root, "second"), {recursive: true})
  writeFileSync(join(app, "package.json"), "{}")
  expect(() => resolveRootMetaSource(app)).toThrow("package.json#name")
})

test("rejects source symlinks, workspace escapes and exported entry escapes", () => {
  const app = pkg("app", "app")
  symlinkSync(join(app, "meta.ts"), join(app, "linked.ts"))
  rmSync(join(app, "meta.ts"))
  symlinkSync(join(app, "linked.ts"), join(app, "meta.ts"))
  expect(() => resolveRootMetaSource(app)).toThrow("symlinks")
  rmSync(join(app, "meta.ts"))
  writeFileSync(join(app, "meta.ts"), "")
  writeFileSync(join(app, "package.json"), JSON.stringify({name: "app", workspaces: ["../*"]}))
  expect(() => createMetaSourceResolver({root}).discover()).toThrow("workspace")
  writeFileSync(join(app, "package.json"), JSON.stringify({name: "app", exports: {"./meta": "./../escape.ts"}}))
  expect(() => createMetaSourceResolver({root}).discover()).toThrow("escapes")
})

test("installed mapping preserves scoped names and legacy keys without source fallback", () => {
  pkg("source", "@owner/capsule")
  const artifacts = {"@owner/capsule": {directory: "objects/pinned", entry: "server.js"}, "owner/legacy": {directory: "legacy", entry: "entry.js"}}
  const resolver = createMetaSourceResolver({root, artifacts})
  expect(resolver.installed).toBeTrue()
  expect(resolver.resolveMetaPath("@owner/capsule")).toBe(join(root, "objects/pinned/server.js"))
  expect(resolver.resolveMetaPath("owner/legacy")).toBe(join(root, "legacy/entry.js"))
  expect(() => resolver.resolveDirectory("@owner/absent")).toThrow("not installed")
  expect(resolver.discover()).toHaveLength(2)
  expect(() => createMetaSourceResolver({root, installed: true}).resolveDirectory("owner/legacy")).toThrow("package.json#name")
  expect(() => createMetaSourceResolver({root, artifacts: {app: {directory: "../escape"}}}).resolveDirectory("app")).toThrow("escapes")
  expect(() => createMetaSourceResolver({root, artifacts: {app: {directory: ".", entry: "../outside.js"}}}).resolveMetaPath("app")).toThrow("entry escapes")
})

test("environment root selection is lazy and installed map stays isolated", () => {
  const names = ["METAFOR_ROOT_META", "METAFOR_META_SOURCE_ROOT", "METAFOR_META_ARTIFACT_ROOT", "METAFOR_META_ARTIFACT_MAP_FILE", "METAFOR_META_ARTIFACT_MAP"] as const
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]))
  try {
    for (const name of names) delete process.env[name]
    const app = pkg("app", "app")
    process.env.METAFOR_ROOT_META = app
    expect(defaultMetaSourceResolver().resolveDirectory("app")).toBe(app)
    process.env.METAFOR_META_ARTIFACT_ROOT = root
    expect(() => defaultMetaSourceResolver()).toThrow("mutually exclusive")
    delete process.env.METAFOR_ROOT_META
    const json = JSON.stringify({"@owner/capsule": {directory: "objects/pinned", entry: "server.js"}})
    const file = join(root, "meta-map.json")
    writeFileSync(file, json)
    process.env.METAFOR_META_ARTIFACT_MAP_FILE = file
    expect(defaultMetaSourceResolver().resolveMetaPath("@owner/capsule")).toBe(join(root, "objects/pinned/server.js"))
    process.env.METAFOR_META_ARTIFACT_MAP = json
    expect(() => defaultMetaSourceResolver()).toThrow("mutually exclusive")
    delete process.env.METAFOR_META_ARTIFACT_MAP_FILE
    delete process.env.METAFOR_META_ARTIFACT_ROOT
    expect(() => defaultMetaSourceResolver()).toThrow("requires installed root")
  } finally {
    for (const name of names) {
      const value = before[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
