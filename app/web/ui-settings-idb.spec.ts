import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { loadPersistedAppWebUiSettings, savePersistedAppWebUiSettings } from "./ui-settings-idb.ts"

const createIndexedDbTarget = () => ({
  indexedDb: new IDBFactory(),
  databaseName: `metafor-app-web-ui-${crypto.randomUUID()}`,
})

describe("app/web ui settings indexeddb", () => {
  test("возвращает null, если настройки ещё не сохранялись", async () => {
    const target = createIndexedDbTarget()

    expect(await loadPersistedAppWebUiSettings(target)).toBeNull()
  })

  test("сохраняет и восстанавливает только известные numeric ui-настройки", async () => {
    const target = createIndexedDbTarget()

    await savePersistedAppWebUiSettings(
      {
        layoutSettings: {
          levelSizeMultiplier: 1.6,
          rootInnerDiameterMm: 1440,
        },
        renderSettings: {
          detailDensityFactor: 2.4,
          labelVisibleLevels: 5,
          torusCrossRingRotationDeg: -33,
          wireframeOpacity: 0.42,
        },
      },
      target,
    )

    expect(await loadPersistedAppWebUiSettings(target)).toEqual({
      layoutSettings: {
        levelSizeMultiplier: 1.6,
        rootInnerDiameterMm: 1440,
      },
      renderSettings: {
        detailDensityFactor: 2.4,
        labelVisibleLevels: 5,
        torusCrossRingRotationDeg: -33,
        wireframeOpacity: 0.42,
      },
    })
  })

  test("отбрасывает нечисловой и неизвестный мусор при чтении", async () => {
    const target = createIndexedDbTarget()

    await savePersistedAppWebUiSettings(
      {
        layoutSettings: {
          levelSizeMultiplier: 2.2,
        },
        renderSettings: {
          torusTubularSegments: 44,
        },
      },
      target,
    )

    const database = target.indexedDb.open(target.databaseName, 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      database.onsuccess = () => resolve(database.result)
      database.onerror = () => reject(database.error ?? new Error("Failed to open IndexedDB"))
    })

    try {
      const transaction = db.transaction("ui_settings", "readwrite")
      const store = transaction.objectStore("ui_settings")
      const request = store.put({
        id: "display_settings",
        revision: 2,
        layoutSettings: {
          levelSizeMultiplier: 2.2,
          rootInnerDiameterMm: "bad",
          hacked: 999,
        },
        renderSettings: {
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
      layoutSettings: {
        levelSizeMultiplier: 2.2,
      },
      renderSettings: {
        torusTubularSegments: 44,
      },
    })
  })
})
