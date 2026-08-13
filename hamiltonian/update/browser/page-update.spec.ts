import {expect, test} from "bun:test"
import {
  HamiltonianPageUpdateController,
  mainRealmRequiresReload,
  sourceRevisionRequiresReload,
} from "./page-update.js"

test("reloads a version only when replacing an active main in the current page realm", () => {
  expect(mainRealmRequiresReload(true, "v1:hash-a", "v2:hash-b")).toBeTrue()
  expect(mainRealmRequiresReload(true, "v2:hash-b", "v2:hash-b")).toBeFalse()
  expect(mainRealmRequiresReload(true, null, "v2:hash-b")).toBeTrue()
  expect(mainRealmRequiresReload(false, "v1:hash-a", "v2:hash-b")).toBeFalse()
  expect(mainRealmRequiresReload(false, null, "v2:hash-b")).toBeFalse()
})

test("reloads one time for each non-empty served-code revision", () => {
  expect(sourceRevisionRequiresReload(null, "source:hash-a")).toBeTrue()
  expect(sourceRevisionRequiresReload("source:hash-a", "source:hash-a")).toBeFalse()
  expect(sourceRevisionRequiresReload("source:hash-a", "source:hash-b")).toBeTrue()
  expect(sourceRevisionRequiresReload("source:hash-a", "")).toBeFalse()
})

test("stores the navigation baseline and reloads exactly once for a new source revision", () => {
  const storage = new FakeStorage()
  let reloads = 0
  const controller = createController({
    storage,
    reloadPage: () => { reloads += 1 },
  })

  expect(controller.acceptNavigationSourceRevision(undefined)).toBeFalse()
  expect(controller.acceptNavigationSourceRevision("")).toBeFalse()
  expect(controller.acceptNavigationSourceRevision("source:hash-a")).toBeTrue()
  expect(storage.snapshot()).toEqual({"hamiltonian-source-revision": "source:hash-a"})

  expect(controller.acceptSourceRevision("")).toBeFalse()
  expect(controller.acceptSourceRevision("source:hash-a")).toBeFalse()
  expect(controller.acceptSourceRevision("source:hash-b")).toBeTrue()
  expect(controller.acceptSourceRevision("source:hash-b")).toBeFalse()
  expect(reloads).toBe(1)
  expect(storage.snapshot()).toEqual({
    "hamiltonian-main-reload-reason": "source source:hash-b",
    "hamiltonian-source-revision": "source:hash-b",
  })
})

test("imports, validates, and activates one exact release idempotently", async () => {
  const storage = new FakeStorage()
  const imports: string[] = []
  const births: string[] = []
  const reconciled: Array<string | null> = []
  const controller = createController({
    storage,
    importModule: async (moduleUrl) => {
      imports.push(moduleUrl)
      return versionModule("v1")
    },
    birthDedicatedWorker: async (release) => { births.push(release.fingerprint) },
    reconcileMain: async (release) => {
      reconciled.push(release?.fingerprint ?? null)
      return false
    },
  })
  const release = versionRelease("v1", "hash-a")

  const first = await controller.activateVersion(release)
  const duplicate = await controller.activateVersion(release)

  expect(first?.fingerprint).toBe("v1:hash-a")
  expect(duplicate).toBe(first)
  expect(controller.currentRelease).toBe(first)
  expect(imports).toEqual(["/versions/v1/module.js"])
  expect(births).toEqual(["v1:hash-a"])
  expect(reconciled).toEqual(["v1:hash-a"])
  expect(storage.snapshot()).toEqual({"hamiltonian-main-version": "v1:hash-a"})
})

test("rejects a module whose version or embodiment export is invalid", async () => {
  for (const imported of [
    {version: "v2", createEmbodiment() {}},
    {version: "v1"},
  ]) {
    const storage = new FakeStorage()
    let birthed = false
    const controller = createController({
      storage,
      importModule: async () => imported,
      birthDedicatedWorker: async () => { birthed = true },
    })

    await expect(controller.activateVersion(versionRelease("v1", "hash-a")))
      .rejects.toThrow("main realm received an invalid version module")
    expect(controller.currentRelease).toBeNull()
    expect(storage.snapshot()).toEqual({})
    expect(birthed).toBeFalse()
  }
})

test("a follower activates a new release without reload and can later reconcile main", async () => {
  const storage = new FakeStorage({"hamiltonian-main-reload-reason": "source source:hash-b"})
  const importedVersions: string[] = []
  const births: string[] = []
  let reconciledMain = false
  let reloads = 0
  const controller = createController({
    storage,
    importModule: async (moduleUrl) => {
      const version = moduleUrl.includes("v2") ? "v2" : "v1"
      importedVersions.push(version)
      return versionModule(version)
    },
    reloadPage: () => { reloads += 1 },
    birthDedicatedWorker: async (release) => { births.push(release.fingerprint) },
    reconcileMain: async () => reconciledMain,
  })

  await controller.activateVersion(versionRelease("v1", "hash-a"))
  await controller.activateVersion(versionRelease("v2", "hash-b"))
  reconciledMain = true
  await controller.reconcileCurrent()

  expect(importedVersions).toEqual(["v1", "v2"])
  expect(births).toEqual(["v1:hash-a", "v2:hash-b"])
  expect(controller.currentRelease?.fingerprint).toBe("v2:hash-b")
  expect(reloads).toBe(0)
  expect(storage.snapshot()).toEqual({"hamiltonian-main-version": "v2:hash-b"})
})

test("an active main records a new fingerprint and reloads without importing it", async () => {
  const storage = new FakeStorage()
  let hasMain = false
  let reloads = 0
  const imports: string[] = []
  const controller = createController({
    storage,
    hasMainEmbodiment: () => hasMain,
    reloadPage: () => { reloads += 1 },
    importModule: async (moduleUrl) => {
      imports.push(moduleUrl)
      return versionModule("v1")
    },
  })
  await controller.activateVersion(versionRelease("v1", "hash-a"))
  hasMain = true

  expect(await controller.activateVersion(versionRelease("v2", "hash-b"))).toBeNull()
  expect(imports).toEqual(["/versions/v1/module.js"])
  expect(controller.currentRelease?.fingerprint).toBe("v1:hash-a")
  expect(reloads).toBe(1)
  expect(storage.snapshot()).toEqual({
    "hamiltonian-main-reload-reason": "version v2",
    "hamiltonian-main-version": "v2:hash-b",
  })
})

test("rebirth and manual reload require the current exact release and active main", async () => {
  const storage = new FakeStorage()
  let hasMain = false
  let births = 0
  let reloads = 0
  const controller = createController({
    storage,
    hasMainEmbodiment: () => hasMain,
    reloadPage: () => { reloads += 1 },
    birthDedicatedWorker: async () => { births += 1 },
  })

  expect(await controller.rebirthDedicatedWorker()).toBeFalse()
  expect(controller.reloadCurrentMain("manual rebirth")).toBeFalse()
  await controller.activateVersion(versionRelease("v1", "hash-a"))
  expect(await controller.rebirthDedicatedWorker()).toBeTrue()
  expect(births).toBe(2)
  expect(controller.reloadCurrentMain("manual rebirth")).toBeFalse()
  hasMain = true
  expect(controller.reloadCurrentMain("manual rebirth")).toBeTrue()
  expect(reloads).toBe(1)
  expect(storage.getItem("hamiltonian-main-reload-reason")).toBe("manual rebirth")
})

interface ControllerOptions {
  storage?: FakeStorage
  importModule?: (moduleUrl: string) => Promise<unknown>
  reloadPage?: () => void
  hasMainEmbodiment?: () => boolean
  birthDedicatedWorker?: (release: LoadedRelease) => Promise<void>
  reconcileMain?: (release: LoadedRelease | null) => Promise<boolean>
}

interface LoadedRelease {
  version: string
  moduleUrl: string
  sha256: string
  fingerprint: string
  loaded: {version: string; createEmbodiment(options: unknown): unknown}
}

function createController(options: ControllerOptions = {}) {
  return new HamiltonianPageUpdateController({
    storage: options.storage ?? new FakeStorage(),
    importModule: options.importModule ?? (async () => versionModule("v1")),
    reloadPage: options.reloadPage ?? (() => {}),
    hasMainEmbodiment: options.hasMainEmbodiment ?? (() => false),
    birthDedicatedWorker: options.birthDedicatedWorker ?? (async () => {}),
    reconcileMain: options.reconcileMain ?? (async () => false),
  })
}

function versionRelease(version: string, sha256: string) {
  return {version, moduleUrl: `/versions/${version}/module.js`, sha256}
}

function versionModule(version: string) {
  return {version, createEmbodiment() { return {start() {}, stop() {}} }}
}

class FakeStorage {
  readonly values: Map<string, string>

  constructor(initial: Record<string, string> = {}) {
    this.values = new Map(Object.entries(initial))
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.values].sort(([left], [right]) => left.localeCompare(right)))
  }
}
