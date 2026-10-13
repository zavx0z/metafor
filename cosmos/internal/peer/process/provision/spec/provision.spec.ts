import {expect, test} from "bun:test"
import {chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import provision, {type MetaforCosmosInternalPeerProcessProvision as Provision} from ".."

test("finite preparation writes only complete private Mass bytes, releases before ACK and rejects replay conflicts/prefixes", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "network-provision-")))
  const incoming = join(root, "inbox")
  const mass = join(root, "mass")
  await mkdir(incoming)
  await mkdir(mass)
  const previous = Bun.env.COSMOS_NETWORK_PREPARATION_FILE
  const token = "test-only-private-preparation-credential"
  let hits = 0
  const broker = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => {hits++; return new Response()}})
  let leases = 0
  let released = true
  let failRelease = false
  const input: Provision.Input = {requestId: "prepare-one", energy: {}, signal: new AbortController().signal,
    mass: {configuration: {async acquire() {
      leases++; released = false
      return {path: mass, signal: new AbortController().signal, async release() {if (failRelease) throw new Error("release failed"); released = true}}
    }}},
  }
  try {
    const source = join(incoming, "peer.json")
    await writeFile(source, JSON.stringify({id: "prepared", signalingUrl: `ws://127.0.0.1:${broker.port}/peer`, tokenFile: "token", allowedPeers: [], iceServers: []}), {mode: 0o600})
    await writeFile(join(incoming, "token"), token, {mode: 0o600})
    Bun.env.COSMOS_NETWORK_PREPARATION_FILE = source
    expect(await provision(input)).toEqual({ackId: "prepare-one", status: "prepared", error: null})
    expect(released).toBeTrue()
    expect(hits).toBe(0)
    const configuration = join(mass, "peer.json")
    const bytes = await readFile(configuration)
    expect(JSON.parse(bytes.toString()).tokenFile).toBe("token")
    expect((await stat(configuration)).mode & 0o777).toBe(0o600)
    expect((await stat(join(mass, "token"))).mode & 0o777).toBe(0o600)
    const before = await stat(configuration)
    input.requestId = "prepare-two"
    expect(await provision(input)).toEqual({ackId: "prepare-two", status: "prepared", error: null})
    expect((await stat(configuration)).mtimeMs).toBe(before.mtimeMs)
    expect((await stat(configuration)).ino).toBe(before.ino)
    const retainedPins = '{"schema":"metafor/peer-world-pins/v1","version":1,"worlds":{}}'
    await writeFile(join(mass, "oracle-world-pins.json"), retainedPins, {mode: 0o600})
    expect((await provision(input)).status).toBe("prepared")
    expect(await Bun.file(join(mass, "oracle-world-pins.json")).text()).toBe(retainedPins)
    const retainedIntents = '{"schema":"metafor/profile-intents/v1","version":1,"requests":[]}'
    await writeFile(join(mass, "oracle-profile-intents.json"), retainedIntents, {mode: 0o600})
    expect((await provision(input)).status).toBe("prepared")
    expect(await Bun.file(join(mass, "oracle-profile-intents.json")).text()).toBe(retainedIntents)
    await rm(join(mass, "oracle-profile-intents.json"))
    await rm(join(mass, "oracle-world-pins.json"))
    await writeFile(join(incoming, "token"), "test-only-different-credential")
    const conflict = await provision(input)
    expect(conflict.status).toBe("failed")
    expect(JSON.stringify(conflict)).not.toContain(token)
    expect(JSON.stringify(conflict)).not.toContain(root)
    expect(await readFile(configuration)).toEqual(bytes)
    expect(released).toBeTrue()
    await rm(configuration)
    expect((await provision(input)).status).toBe("failed")
    expect(await Bun.file(configuration).exists()).toBeFalse()
    await rm(join(mass, "token"))
    const priorLeases = leases
    await chmod(source, 0o644)
    expect((await provision(input)).status).toBe("failed")
    expect(leases).toBe(priorLeases)
    await chmod(source, 0o600)
    await rm(join(incoming, "token"))
    await symlink(join(root, "foreign-token"), join(incoming, "token"))
    await writeFile(join(root, "foreign-token"), token, {mode: 0o600})
    expect((await provision(input)).status).toBe("failed")
    expect(leases).toBe(priorLeases)
    await rm(join(incoming, "token"))
    await writeFile(join(incoming, "token"), token, {mode: 0o600})
    failRelease = true
    expect((await provision(input)).status).toBe("failed")
    expect(released).toBeFalse()
    expect(hits).toBe(0)
  } finally {
    if (previous === undefined) delete Bun.env.COSMOS_NETWORK_PREPARATION_FILE
    else Bun.env.COSMOS_NETWORK_PREPARATION_FILE = previous
    await broker.stop(true)
    await rm(root, {recursive: true, force: true})
  }
})
