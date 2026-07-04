import type { BulkLayoutSettings } from "@bulk/gravity/layout"
import type {
  BulkRenderSettings,
  BulkSettingsConfig,
  PersistedSettingsRecord,
  SettingsIndexedDbOptions,
  SettingsSnapshot,
} from "./settings.t.ts"

export type {
  BulkRenderSettings,
  BulkSettingsConfig,
  SettingsIndexedDbOptions,
  SettingsSnapshot,
} from "./settings.t.ts"

export const BULK_SETTINGS_REVISION = 7
export const DEFAULT_BULK_SCENE_SRC = "zavx0z/linux"

export const DEFAULT_BULK_SETTINGS: BulkSettingsConfig = {
  src: DEFAULT_BULK_SCENE_SRC,
  layout: {
    orbitEdgeGapMm: 0,
    rootInnerDiameterMm: 1000,
    rootSphereRadiusMm: 1470,
  },
  render: {
    animationEnabled: true,
    detailDensityFactor: 2,
    detailLevelMultiplier: 1,
    labelVisibleLevels: 2,
    baseDepth: 0,
    labelFontSizeMm: 77,
    labelSurfaceOffsetMm: 19,
    torusCrossRingRotationDeg: 44,
    torusRadialSegments: 14,
    torusTubularSegments: 48,
    wireframeOpacity: 0.18,
  },
}

export const BULK_LAYOUT_SETTING_KEYS = [
  "orbitEdgeGapMm",
  "rootInnerDiameterMm",
  "rootSphereRadiusMm",
] as const satisfies readonly (keyof BulkLayoutSettings)[]

export const BULK_RENDER_SETTING_KEYS = [
  "animationEnabled",
  "detailDensityFactor",
  "detailLevelMultiplier",
  "labelVisibleLevels",
  "baseDepth",
  "labelFontSizeMm",
  "labelSurfaceOffsetMm",
  "torusCrossRingRotationDeg",
  "torusRadialSegments",
  "torusTubularSegments",
  "wireframeOpacity",
] as const satisfies readonly (keyof BulkRenderSettings)[]

const SETTINGS_DB_NAME = "metafor-bulk-settings"
const SETTINGS_DB_VERSION = 1
const SETTINGS_STORE = "settings"
const SETTINGS_ID = "display"

const getIndexedDbFactory = (options: SettingsIndexedDbOptions): IDBFactory => {
  if (options.indexedDb) return options.indexedDb
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this runtime.")
  }

  return indexedDB
}

const openSettingsDb = async (options: SettingsIndexedDbOptions): Promise<IDBDatabase> => {
  const databaseName = options.databaseName ?? SETTINGS_DB_NAME
  const factory = getIndexedDbFactory(options)

  return await new Promise((resolve, reject) => {
    const request = factory.open(databaseName, SETTINGS_DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB database ${databaseName}`))
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

const pickKnownSettings = <T extends string>(keys: readonly T[], value: unknown): Partial<Record<T, boolean | number>> => {
  if (!value || typeof value !== "object") return {}

  const record = value as Record<string, unknown>
  const next: Partial<Record<T, boolean | number>> = {}

  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === "boolean" || (typeof candidate === "number" && Number.isFinite(candidate))) {
      next[key] = candidate
    }
  }

  return next
}

const normalizeSceneSrc = (value: unknown): string => {
  const src = typeof value === "string" ? value.trim() : ""
  return src.length > 0 ? src : DEFAULT_BULK_SCENE_SRC
}

const toPersistedRecord = (snapshot: SettingsSnapshot): PersistedSettingsRecord => ({
  id: SETTINGS_ID,
  revision: BULK_SETTINGS_REVISION,
  src: normalizeSceneSrc(snapshot.src),
  layoutSettings: pickKnownSettings(BULK_LAYOUT_SETTING_KEYS, snapshot.layoutSettings) as Partial<BulkLayoutSettings>,
  renderSettings: pickKnownSettings(BULK_RENDER_SETTING_KEYS, snapshot.renderSettings) as Partial<BulkRenderSettings>,
})

const seedDefaultsRecord = (): PersistedSettingsRecord => ({
  id: SETTINGS_ID,
  revision: BULK_SETTINGS_REVISION,
  src: normalizeSceneSrc(DEFAULT_BULK_SETTINGS.src),
  layoutSettings: pickKnownSettings(BULK_LAYOUT_SETTING_KEYS, DEFAULT_BULK_SETTINGS.layout) as Partial<BulkLayoutSettings>,
  renderSettings: pickKnownSettings(BULK_RENDER_SETTING_KEYS, DEFAULT_BULK_SETTINGS.render) as Partial<BulkRenderSettings>,
})

export const loadSettings = async (options: SettingsIndexedDbOptions = {}): Promise<SettingsSnapshot | null> => {
  const database = await openSettingsDb(options)

  try {
    const transaction = database.transaction(SETTINGS_STORE, "readonly")
    const store = transaction.objectStore(SETTINGS_STORE)
    const rawRecord = await resolveRequest(store.get(SETTINGS_ID))
    await completeTransaction(transaction)

    const isCurrentRecord =
      rawRecord && typeof rawRecord === "object" &&
      (rawRecord as Partial<PersistedSettingsRecord>).revision === BULK_SETTINGS_REVISION

    if (!isCurrentRecord) {
      const seed = seedDefaultsRecord()
      const writeTransaction = database.transaction(SETTINGS_STORE, "readwrite")
      writeTransaction.objectStore(SETTINGS_STORE).put(seed)
      await completeTransaction(writeTransaction)
      return {
        src: seed.src,
        layoutSettings: { ...seed.layoutSettings },
        renderSettings: { ...seed.renderSettings },
      }
    }

    return {
      src: normalizeSceneSrc((rawRecord as Partial<PersistedSettingsRecord>).src),
      layoutSettings: pickKnownSettings(
        BULK_LAYOUT_SETTING_KEYS,
        (rawRecord as Partial<PersistedSettingsRecord>).layoutSettings,
      ) as Partial<BulkLayoutSettings>,
      renderSettings: pickKnownSettings(
        BULK_RENDER_SETTING_KEYS,
        (rawRecord as Partial<PersistedSettingsRecord>).renderSettings,
      ) as Partial<BulkRenderSettings>,
    }
  } finally {
    database.close()
  }
}

export const saveSettings = async (
  snapshot: SettingsSnapshot,
  options: SettingsIndexedDbOptions = {},
): Promise<void> => {
  const database = await openSettingsDb(options)

  try {
    const transaction = database.transaction(SETTINGS_STORE, "readwrite")
    transaction.objectStore(SETTINGS_STORE).put(toPersistedRecord(snapshot))
    await completeTransaction(transaction)
  } finally {
    database.close()
  }
}
