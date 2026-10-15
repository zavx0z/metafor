import {expect, test} from "bun:test"
import {chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {readDevelopmentConfiguration} from "../server/development-config"
import type {DevelopmentConfiguration} from "../shared/development"

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "development-config-")))
  const source = join(directory, "source")
  await mkdir(source)
  const filename = join(directory, "development.json")
  const sidecar = `${filename}.capabilities.json`
  const base = {version: 1, id: "workspace-one", rootPackage: "metafor", roots: [{name: "metafor", directory: source, writable: true}],
    stateDirectory: join(directory, "state"), machine: {enabled: true, hostId: "local", revision: "machine-one"},
    execution: {connectionId: "local", approvalMode: "ask", connections: [{id: "local", label: "Local", enabled: true,
      provider: "codex", peer: {peerId: "fixture-peer", executorId: "fixture-executor"}}]}} satisfies DevelopmentConfiguration
  const capabilities = {version: 1, workspaceId: base.id, preparation: {enabled: true, revision: "prepare-one", inputRoots: [source]},
    scenarios: {compilerPath: join(directory, "compiler", "tsserver.js"), compilerSha256: "a".repeat(64)}}
  const original = `${JSON.stringify(base, null, 2)}\n`
  await writeFile(filename, original, {mode: 0o600})
  return {filename, sidecar, base, capabilities, original,
    read: () => readDevelopmentConfiguration({COSMOS_DEVELOPMENT_CONFIG: filename}),
    write: (value: unknown = capabilities) => writeFile(sidecar, JSON.stringify(value), {mode: 0o600}),
    close: () => rm(directory, {recursive: true, force: true})}
}

test("absent capability sidecar keeps the original v1 assignment and base bytes", async () => {
  const f = await fixture()
  try {
    expect(await readDevelopmentConfiguration({})).toBeNull()
    expect(await f.read()).toEqual(f.base)
    expect(await readFile(f.filename, "utf8")).toBe(f.original)
  } finally {await f.close()}
})

test("workspace-bound sidecar supplies new grants without changing rollback-readable base", async () => {
  const f = await fixture()
  try {
    await f.write()
    const first = await f.read()
    expect(first).toEqual({...f.base, preparation: f.capabilities.preparation, scenarios: f.capabilities.scenarios})
    expect(await readFile(f.filename, "utf8")).toBe(f.original)
    expect(Object.keys(JSON.parse(await readFile(f.filename, "utf8"))).sort()).toEqual(
      ["execution", "id", "machine", "rootPackage", "roots", "stateDirectory", "version"])
    await f.write({...f.capabilities, preparation: {...f.capabilities.preparation, revision: "prepare-two"}})
    expect((await f.read())?.preparation?.revision).toBe("prepare-two")
    expect(await f.read()).not.toEqual(first)
    await rm(f.sidecar)
    expect(await f.read()).toEqual(f.base)
  } finally {await f.close()}
})

test("capability sidecar rejects foreign workspace, public mode and symlinks", async () => {
  const f = await fixture()
  try {
    await f.write({...f.capabilities, workspaceId: "workspace-two"})
    await expect(f.read()).rejects.toThrow("workspace assignment")
    await f.write()
    await chmod(f.sidecar, 0o644)
    await expect(f.read()).rejects.toThrow("owned private regular file")
    await rm(f.sidecar)
    await symlink(f.filename, f.sidecar)
    await expect(f.read()).rejects.toThrow()
  } finally {await f.close()}
})

test("new grants belong only to sidecar and its exact schema cannot replace base authority", async () => {
  const f = await fixture()
  try {
    await writeFile(f.filename, JSON.stringify({...f.base, preparation: f.capabilities.preparation}))
    await expect(f.read()).rejects.toThrow("workspace assignment")
    await writeFile(f.filename, f.original)
    await f.write({...f.capabilities, machine: f.base.machine})
    await expect(f.read()).rejects.toThrow("capabilities workspace assignment")
    await f.write({...f.capabilities, preparation: {...f.capabilities.preparation, inputRoots: ["relative"]}})
    await expect(f.read()).rejects.toThrow("preparation capability")
    await f.write({...f.capabilities, scenarios: {...f.capabilities.scenarios, compilerSha256: "invalid"}})
    await expect(f.read()).rejects.toThrow("scenario compiler")
  } finally {await f.close()}
})
