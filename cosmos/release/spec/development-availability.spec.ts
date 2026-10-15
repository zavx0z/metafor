import {expect, test} from "bun:test"
import {createOptionalDevelopment} from "../server/development-availability"
import {configuredOptionalDevelopment} from "../server/development"
import {mkdtemp, mkdir, writeFile, realpath, rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"

test("optional source failure remains visible, preserves the host and retries only on explicit intent", async () => {
  let attempts = 0, closed = 0, failures = 0, authorized = true
  const source = await createOptionalDevelopment({
    async initialize() {
      attempts++
      if (attempts === 1) throw new Error("PRIVATE TOKEN /private/authority.json")
      return {async fetch() {return Response.json({packages: ["metafor"]})}, async subscribe() {return () => {}}, async close() {closed++}}
    },
    authorize() {if (!authorized) throw new Error("Unauthorized")},
    failed() {failures++},
  })
  const request = () => new Request("http://localhost/cosmos/development/catalog")
  try {
    for (let count = 0; count < 3; count++) {
      const response = await source.fetch(request(), {})
      expect(response.status).toBe(503)
      const message = await response.text()
      expect(message).toContain("workspace_unavailable")
      expect(message).not.toContain("PRIVATE")
    }
    expect(attempts).toBe(1)
    expect(failures).toBe(1)
    await expect(source.subscribe({}, () => {})).rejects.toThrow("обновите каталог")
    authorized = false
    expect((await source.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", body: "{}"}), {})).status).toBe(403)
    expect(attempts).toBe(1)
    authorized = true
    expect((await source.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", body: "{}"}), {})).status).toBe(200)
    expect(await (await source.fetch(request(), {})).json()).toEqual({packages: ["metafor"]})
    expect(attempts).toBe(2)
  } finally {await source.close()}
  expect(closed).toBe(1)
})

test("broken assigned package manifest does not reject optional initialization and repairs through one explicit retry", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cosmos-optional-development-")))
  const root = join(directory, "source"), config = join(directory, "authority.json")
  await mkdir(root)
  await writeFile(join(root, "package.json"), "{ broken-manifest")
  await writeFile(config, JSON.stringify({version: 1, id: "own", rootPackage: "metafor", roots: [{name: "metafor", directory: root, writable: true}],
    stateDirectory: join(directory, "state"), execution: {connectionId: "fixture", connections: [{id: "fixture", label: "Fixture", enabled: true,
      provider: "codex", peer: {peerId: "assigned-peer", executorId: "assigned-executor"}}]}}), {mode: 0o600})
  const host = {requestIP: () => ({address: "127.0.0.1"})}
  let surface: Awaited<ReturnType<typeof configuredOptionalDevelopment>> | undefined
  try {
    surface = await configuredOptionalDevelopment({COSMOS_DEVELOPMENT_CONFIG: config}, null)
    const unavailable = await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)
    expect(unavailable.status).toBe(503)
    expect(await unavailable.text()).not.toContain(directory)
    await writeFile(join(root, "package.json"), JSON.stringify({name: "metafor"}))
    expect((await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)).status).toBe(503)
    const retry = await surface.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", headers: {origin: "http://localhost"}, body: "{}"}), host)
    expect(retry.status).toBe(200)
    const response = await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)
    expect(response.status).toBe(200)
    expect((await response.json()).packages[0]).toMatchObject({name: "metafor", resolution: "source"})
  } finally {await surface?.close(); await rm(directory, {recursive: true, force: true})}
})
