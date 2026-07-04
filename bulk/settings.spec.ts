import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import {
  BULK_LAYOUT_SETTING_KEYS,
  BULK_RENDER_SETTING_KEYS,
  BULK_SETTINGS_REVISION,
  DEFAULT_BULK_SCENE_SRC,
  DEFAULT_BULK_SETTINGS,
  loadSettings,
  saveSettings,
} from "./settings.ts"

const persistedLayoutDefaults = () =>
  Object.fromEntries(BULK_LAYOUT_SETTING_KEYS.map((key) => [key, DEFAULT_BULK_SETTINGS.layout[key]]))

const persistedRenderDefaults = () =>
  Object.fromEntries(BULK_RENDER_SETTING_KEYS.map((key) => [key, DEFAULT_BULK_SETTINGS.render[key]]))

const createIndexedDbTarget = () => ({
  indexedDb: new IDBFactory(),
  databaseName: `metafor-bulk-settings-${crypto.randomUUID()}`,
})

describe("bulk settings indexeddb", () => {
  test("на пустой IDB сразу seed-ит DEFAULT_BULK_SETTINGS и возвращает их", async () => {
    const target = createIndexedDbTarget()

    expect(await loadSettings(target)).toEqual({
      src: DEFAULT_BULK_SCENE_SRC,
      layoutSettings: persistedLayoutDefaults(),
      renderSettings: persistedRenderDefaults(),
    })

    expect(await loadSettings(target)).toEqual({
      src: DEFAULT_BULK_SCENE_SRC,
      layoutSettings: persistedLayoutDefaults(),
      renderSettings: persistedRenderDefaults(),
    })
  })

  test("сохраняет и восстанавливает только известные ui-настройки", async () => {
    const target = createIndexedDbTarget()

    await saveSettings(
      {
        src: " zavx0z/custom-scene ",
        layoutSettings: {
          rootInnerDiameterMm: 1440,
        },
        renderSettings: {
          animationEnabled: false,
          baseDepth: -1,
          detailDensityFactor: 2.4,
          labelVisibleLevels: 5,
          torusCrossRingRotationDeg: -33,
          wireframeOpacity: 0.42,
        },
      },
      target,
    )

    expect(await loadSettings(target)).toEqual({
      src: "zavx0z/custom-scene",
      layoutSettings: {
        rootInnerDiameterMm: 1440,
      },
      renderSettings: {
        animationEnabled: false,
        baseDepth: -1,
        detailDensityFactor: 2.4,
        labelVisibleLevels: 5,
        torusCrossRingRotationDeg: -33,
        wireframeOpacity: 0.42,
      },
    })
  })

  test("при revision записи равной текущему BULK_SETTINGS_REVISION фильтрует мусор и возвращает чистые значения", async () => {
    const target = createIndexedDbTarget()

    const database = target.indexedDb.open(target.databaseName, 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      database.onupgradeneeded = () => {
        const upgrade = database.result
        if (!upgrade.objectStoreNames.contains("settings")) {
          upgrade.createObjectStore("settings", { keyPath: "id" })
        }
      }
      database.onsuccess = () => resolve(database.result)
      database.onerror = () => reject(database.error ?? new Error("Failed to open IndexedDB"))
    })

    try {
      const transaction = db.transaction("settings", "readwrite")
      const store = transaction.objectStore("settings")
      const request = store.put({
        id: "display",
        revision: BULK_SETTINGS_REVISION,
        src: 42,
        layoutSettings: {
          rootInnerDiameterMm: "bad",
          hacked: 999,
        },
        renderSettings: {
          animationEnabled: true,
          torusTubularSegments: 44,
          wireframeOpacity: null,
          injected: "bad",
        },
      })

      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => undefined
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to write IndexedDB payload"))
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
      })
    } finally {
      db.close()
    }

    expect(await loadSettings(target)).toEqual({
      src: DEFAULT_BULK_SCENE_SRC,
      layoutSettings: {},
      renderSettings: {
        animationEnabled: true,
        torusTubularSegments: 44,
      },
    })
  })

  test("при revision не совпадающем seed-ит дефолты, перезатирая старую запись", async () => {
    const target = createIndexedDbTarget()

    const database = target.indexedDb.open(target.databaseName, 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      database.onupgradeneeded = () => {
        const upgrade = database.result
        if (!upgrade.objectStoreNames.contains("settings")) {
          upgrade.createObjectStore("settings", { keyPath: "id" })
        }
      }
      database.onsuccess = () => resolve(database.result)
      database.onerror = () => reject(database.error ?? new Error("Failed to open IndexedDB"))
    })

    try {
      const tx = db.transaction("settings", "readwrite")
      tx.objectStore("settings").put({
        id: "display",
        revision: BULK_SETTINGS_REVISION - 1,
        src: "old/root",
        layoutSettings: { rootInnerDiameterMm: 999 },
        renderSettings: { torusTubularSegments: 999 },
      })
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("write failed"))
      })
    } finally {
      db.close()
    }

    expect(await loadSettings(target)).toEqual({
      src: DEFAULT_BULK_SCENE_SRC,
      layoutSettings: persistedLayoutDefaults(),
      renderSettings: persistedRenderDefaults(),
    })
  })
})
