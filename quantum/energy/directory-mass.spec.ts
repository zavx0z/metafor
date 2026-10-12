import {expect, test} from "bun:test"
import {mkdtemp, realpath, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {MassDirectoryHandle} from "@metafor/types/metafor/mass"
import {createFilesystemEnergyMassStore, EnergyMassCatalog, EnergyMassGate} from "./mass"

const artifact = {id: 1, key: "workspace", keyId: "33333333-3333-4333-8333-333333333333", format: "directory" as const, label: null, description: null}
const context = (atomId: number) => ({energyId: "test", atomId, wimp: "fixture", state: "ready"})

test("directory writer is exclusive by global key and retired token stays busy until its release", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-directory-")))
  const store = createFilesystemEnergyMassStore(new EnergyMassGate(), new EnergyMassCatalog(root))
  store.authorize!(context(1), [artifact])
  store.authorize!(context(2), [{...artifact, id: 2}])
  const first = store.get(context(1)).workspace as MassDirectoryHandle
  const sibling = store.get(context(2)).workspace as MassDirectoryHandle
  const lease = await first.acquire()
  try {
    await writeFile(join(lease.path, "profile.txt"), "persisted")
    store.authorize!(context(1), [{...artifact, label: "republished"}])
    expect(lease.signal.aborted).toBeFalse()
    await expect(sibling.acquire()).rejects.toThrow("busy")
    store.authorize!(context(1), [])
    expect(lease.signal.aborted).toBeTrue()
    await expect(first.acquire()).rejects.toThrow("not live")
    await expect(sibling.acquire()).rejects.toThrow("busy")
    await lease.release()
    const next = await sibling.acquire()
    try {
      await lease.release()
      await expect(sibling.acquire()).rejects.toThrow("busy")
      expect(await Bun.file(join(next.path, "profile.txt")).text()).toBe("persisted")
      store.clear!()
      expect(next.signal.aborted).toBeTrue()
    } finally {await next.release()}
    const cold = createFilesystemEnergyMassStore(new EnergyMassGate(), new EnergyMassCatalog(root))
    cold.authorize!(context(1), [artifact])
    const resumed = await (cold.get(context(1)).workspace as MassDirectoryHandle).acquire()
    expect(await Bun.file(join(resumed.path, "profile.txt")).text()).toBe("persisted")
    await resumed.release()
    cold.clear!()
  } finally {await lease.release(); store.clear!(); await rm(root, {recursive: true, force: true})}
})

test("directory paths reject target and ancestor symlinks without touching outside bytes", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-directory-safety-")))
  const outside = join(root, "outside")
  const {mkdir} = await import("node:fs/promises")
  await mkdir(outside)
  await writeFile(join(outside, "untouched"), "original")
  const massRoot = join(root, "mass")
  await mkdir(massRoot)
  await symlink(outside, join(massRoot, `${artifact.keyId}.dir`))
  const gate = new EnergyMassGate()
  const guard = {gate, atom: 1, generation: gate.authorize(1, artifact.id, artifact.keyId)}
  try {
    await expect(new EnergyMassCatalog(massRoot).handle(artifact, guard).acquire()).rejects.toThrow("real directories")
    await symlink(outside, join(root, "linked"))
    await expect(new EnergyMassCatalog(join(root, "linked", "mass")).handle(artifact, guard).acquire()).rejects.toThrow("real directories")
    expect(await Bun.file(join(outside, "untouched")).text()).toBe("original")
    await expect(new EnergyMassCatalog(massRoot).read(artifact.keyId, "directory" as never)).rejects.toThrow("temporarily unsupported")
  } finally {await rm(root, {recursive: true, force: true})}
})

test("Atom removal retires live directory lease before Meta destroy releases its exact token", async () => {
  const {EnergyCatalogStore} = await import("./graph/catalog")
  const {startEnergyProtocol, createInMemoryEnergyRuntimeStore} = await import("./energy")
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-directory-removal-")))
  const store = createFilesystemEnergyMassStore(new EnergyMassGate(), new EnergyMassCatalog(root))
  const energyStore = createInMemoryEnergyRuntimeStore()
  const done = Promise.withResolvers<void>()
  const name = `__directoryRemoval${crypto.randomUUID().replaceAll("-", "")}`
  const globals = globalThis as unknown as Record<string, unknown>
  globals[name] = done.promise
  const force: import("./types/protocol").EnergyForce = {onImpulse: () => {}, impulse: () => {}}
  const protocol = startEnergyProtocol({force, catalog: new EnergyCatalogStore(), massStore: store, energyStore, energyId: "test"})
  const emit = (part: import("shared/protocol/force/particle").Particle) => force.onImpulse({parts: [part]})
  let next: import("@metafor/types/metafor/mass").MassDirectoryLease | undefined
  try {
    await emit({part: "graviton", op: "add", path: "atom/1", ts: 1, value: {
      atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "fixture", position: 0},
      mass: [artifact, {...artifact, id: 3, key: "stats", keyId: "44444444-4444-4444-8444-444444444444", format: "json"}], values: [], valueRecords: [], state: {atom: 1, metaState: null},
    }})
    for (const [localId, state, descriptor] of [
      [1, "ready", {type: "action", action: {src: "./ready", wrapperSrc: "async ({mass,energy}) => {await mass.stats.write({done:true}); energy.lease = await mass.workspace.acquire()}", readFields: []}}],
      [2, "destroyed", {type: "finally", before: {src: `async ({energy,mass}) => {energy.retired = energy.lease.signal.aborted; energy.stats = await mass.stats.readJson(); await globalThis.${name}; await energy.lease.release()}`, readFields: []}}],
    ] as const) await emit({part: "graviton", op: "add", path: "process", ts: 1, value: {id: localId, localId, wimp: "fixture", state, descriptor: {...descriptor, env: ["server"]}}})
    await emit({part: "photon", op: "test", path: 1, from: "directory-ready", ts: 1, value: "ready"})
    await emit({part: "z", op: "copy", path: 1, from: "test", ts: 1, value: {processExecutionId: "directory-ready", fields: {}}})
    await protocol.quiesce()
    const energy = energyStore.get(context(1))
    const lease = energy.lease as import("@metafor/types/metafor/mass").MassDirectoryLease
    expect(lease).toBeDefined()
    await emit({part: "graviton", op: "remove", path: "atom/1", ts: 1, value: {id: 1}})
    expect(lease.signal.aborted).toBeTrue()
    store.authorize!(context(2), [{...artifact, id: 2}])
    const sibling = store.get(context(2)).workspace as MassDirectoryHandle
    await expect(sibling.acquire()).rejects.toThrow("busy")
    done.resolve()
    await protocol.quiesce()
    expect(energy.retired).toBeTrue()
    expect(energy.stats).toEqual({done:true})
    next = await sibling.acquire()
    await lease.release()
    await expect(sibling.acquire()).rejects.toThrow("busy")
  } finally {
    done.resolve()
    await protocol.quiesce()
    await next?.release()
    protocol.close()
    store.clear!()
    delete globals[name]
    await rm(root, {recursive: true, force: true})
  }
})
