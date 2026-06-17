import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { APP_CONFIG_DEFAULTS, APP_CONFIG_REVISION, DEFAULT_APP_WEB_SCENE_SRC } from "./app-config.ts"
import { APP_WEB_LAYOUT_SETTING_KEYS, APP_WEB_RENDER_SETTING_KEYS } from "./settings.ts"
import { loadPersistedAppWebUiSettings, savePersistedAppWebUiSettings } from "./ui-settings-idb.ts"

const persistedLayoutDefaults = () =>
  Object.fromEntries(APP_WEB_LAYOUT_SETTING_KEYS.map((key) => [key, APP_CONFIG_DEFAULTS.layout[key]]))

const persistedRenderDefaults = () =>
  Object.fromEntries(APP_WEB_RENDER_SETTING_KEYS.map((key) => [key, APP_CONFIG_DEFAULTS.render[key]]))

const createIndexedDbTarget = () => ({
  indexedDb: new IDBFactory(),
  databaseName: `metafor-app-web-ui-${crypto.randomUUID()}`,
})

describe("app/web ui settings indexeddb", () => {
  test("на пустой IDB сразу seed-ит APP_CONFIG_DEFAULTS и возвращает их", async () => {
    const target = createIndexedDbTarget()

    expect(await loadPersistedAppWebUiSettings(target)).toEqual({
      src: DEFAULT_APP_WEB_SCENE_SRC,
      layoutSettings: persistedLayoutDefaults(),
      renderSettings: persistedRenderDefaults(),
    })

    // повторный load возвращает то же самое — IDB уже seeded.
    expect(await loadPersistedAppWebUiSettings(target)).toEqual({
      src: DEFAULT_APP_WEB_SCENE_SRC,
      layoutSettings: persistedLayoutDefaults(),
      renderSettings: persistedRenderDefaults(),
    })
  })

  test("сохраняет и восстанавливает только известные ui-настройки", async () => {
    const target = createIndexedDbTarget()

    await savePersistedAppWebUiSettings(
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

    expect(await loadPersistedAppWebUiSettings(target)).toEqual({
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

  test("при revision записи равной текущему APP_CONFIG_REVISION фильтрует мусор и возвращает чистые значения", async () => {
    const target = createIndexedDbTarget()

    const database = target.indexedDb.open(target.databaseName, 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      database.onupgradeneeded = () => {
        const upgrade = database.result
        if (!upgrade.objectStoreNames.contains("ui_settings")) {
          upgrade.createObjectStore("ui_settings", { keyPath: "id" })
        }
      }
      database.onsuccess = () => resolve(database.result)
      database.onerror = () => reject(database.error ?? new Error("Failed to open IndexedDB"))
    })

    try {
      const transaction = db.transaction("ui_settings", "readwrite")
      const store = transaction.objectStore("ui_settings")
      const request = store.put({
        id: "display_settings",
        revision: APP_CONFIG_REVISION,
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

    expect(await loadPersistedAppWebUiSettings(target)).toEqual({
      src: DEFAULT_APP_WEB_SCENE_SRC,
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
        if (!upgrade.objectStoreNames.contains("ui_settings")) {
          upgrade.createObjectStore("ui_settings", { keyPath: "id" })
        }
      }
      database.onsuccess = () => resolve(database.result)
      database.onerror = () => reject(database.error ?? new Error("Failed to open IndexedDB"))
    })

    try {
      const tx = db.transaction("ui_settings", "readwrite")
      tx.objectStore("ui_settings").put({
        id: "display_settings",
        revision: APP_CONFIG_REVISION - 1,
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

    expect(await loadPersistedAppWebUiSettings(target)).toEqual({
      src: DEFAULT_APP_WEB_SCENE_SRC,
      layoutSettings: persistedLayoutDefaults(),
      renderSettings: persistedRenderDefaults(),
    })
  })
})
