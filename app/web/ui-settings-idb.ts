import { APP_CONFIG_DEFAULTS, APP_CONFIG_REVISION } from "./app-config.ts"
import {
  APP_WEB_LAYOUT_SETTING_KEYS,
  APP_WEB_RENDER_SETTING_KEYS,
  type AppWebLayoutSettings,
  type AppWebRenderSettings,
} from "./settings.ts"

export interface AppWebUiSettingsSnapshot {
  layoutSettings: Partial<AppWebLayoutSettings>
  renderSettings: Partial<AppWebRenderSettings>
}

export interface AppWebUiSettingsIndexedDbOptions {
  databaseName?: string
  indexedDb?: IDBFactory
}

type PersistedAppWebUiSettingsRecord = AppWebUiSettingsSnapshot & {
  id: string
  revision: number
}

const APP_WEB_UI_SETTINGS_DB_NAME = "metafor-app-web-ui"
const APP_WEB_UI_SETTINGS_DB_VERSION = 1
const APP_WEB_UI_SETTINGS_STORE = "ui_settings"
const APP_WEB_UI_SETTINGS_ID = "display_settings"

const getIndexedDbFactory = (options: AppWebUiSettingsIndexedDbOptions): IDBFactory => {
  if (options.indexedDb) return options.indexedDb
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this runtime.")
  }

  return indexedDB
}

const openUiSettingsDb = async (options: AppWebUiSettingsIndexedDbOptions): Promise<IDBDatabase> => {
  const databaseName = options.databaseName ?? APP_WEB_UI_SETTINGS_DB_NAME
  const factory = getIndexedDbFactory(options)

  return await new Promise((resolve, reject) => {
    const request = factory.open(databaseName, APP_WEB_UI_SETTINGS_DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(APP_WEB_UI_SETTINGS_STORE)) {
        database.createObjectStore(APP_WEB_UI_SETTINGS_STORE, { keyPath: "id" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to open IndexedDB database ${databaseName}`))
  })
}

const resolveRequest = async <T>(request: IDBRequest<T>): Promise<T> =>
  await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })

const completeTransaction = async (transaction: IDBTransaction): Promise<void> =>
  await new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })

const pickNumericSettings = <T extends string>(keys: readonly T[], value: unknown): Partial<Record<T, number>> => {
  if (!value || typeof value !== "object") return {}

  const record = value as Record<string, unknown>
  const next: Partial<Record<T, number>> = {}

  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      next[key] = candidate
    }
  }

  return next
}

const toPersistedRecord = (snapshot: AppWebUiSettingsSnapshot): PersistedAppWebUiSettingsRecord => ({
  id: APP_WEB_UI_SETTINGS_ID,
  revision: APP_CONFIG_REVISION,
  layoutSettings: pickNumericSettings(APP_WEB_LAYOUT_SETTING_KEYS, snapshot.layoutSettings),
  renderSettings: pickNumericSettings(APP_WEB_RENDER_SETTING_KEYS, snapshot.renderSettings),
})

const seedDefaultsRecord = (): PersistedAppWebUiSettingsRecord => ({
  id: APP_WEB_UI_SETTINGS_ID,
  revision: APP_CONFIG_REVISION,
  layoutSettings: pickNumericSettings(APP_WEB_LAYOUT_SETTING_KEYS, APP_CONFIG_DEFAULTS.layout),
  renderSettings: pickNumericSettings(APP_WEB_RENDER_SETTING_KEYS, APP_CONFIG_DEFAULTS.render),
})

export const loadPersistedAppWebUiSettings = async (
  options: AppWebUiSettingsIndexedDbOptions = {},
): Promise<AppWebUiSettingsSnapshot | null> => {
  const database = await openUiSettingsDb(options)

  try {
    const transaction = database.transaction(APP_WEB_UI_SETTINGS_STORE, "readonly")
    const store = transaction.objectStore(APP_WEB_UI_SETTINGS_STORE)
    const rawRecord = await resolveRequest(store.get(APP_WEB_UI_SETTINGS_ID))
    await completeTransaction(transaction)

    const isCurrentRecord =
      rawRecord && typeof rawRecord === "object" &&
      (rawRecord as Partial<PersistedAppWebUiSettingsRecord>).revision === APP_CONFIG_REVISION

    if (!isCurrentRecord) {
      // Записи нет, она устарела или повреждена — seed-им дефолты в IDB сразу,
      // чтобы IDB оставался единственным источником значений для UI.
      const seed = seedDefaultsRecord()
      const writeTransaction = database.transaction(APP_WEB_UI_SETTINGS_STORE, "readwrite")
      writeTransaction.objectStore(APP_WEB_UI_SETTINGS_STORE).put(seed)
      await completeTransaction(writeTransaction)
      return {
        layoutSettings: { ...seed.layoutSettings },
        renderSettings: { ...seed.renderSettings },
      }
    }

    return {
      layoutSettings: pickNumericSettings(
        APP_WEB_LAYOUT_SETTING_KEYS,
        (rawRecord as Partial<PersistedAppWebUiSettingsRecord>).layoutSettings,
      ),
      renderSettings: pickNumericSettings(
        APP_WEB_RENDER_SETTING_KEYS,
        (rawRecord as Partial<PersistedAppWebUiSettingsRecord>).renderSettings,
      ),
    }
  } finally {
    database.close()
  }
}

export const savePersistedAppWebUiSettings = async (
  snapshot: AppWebUiSettingsSnapshot,
  options: AppWebUiSettingsIndexedDbOptions = {},
): Promise<void> => {
  const database = await openUiSettingsDb(options)

  try {
    const transaction = database.transaction(APP_WEB_UI_SETTINGS_STORE, "readwrite")
    transaction.objectStore(APP_WEB_UI_SETTINGS_STORE).put(toPersistedRecord(snapshot))
    await completeTransaction(transaction)
  } finally {
    database.close()
  }
}
