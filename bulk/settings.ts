import type { LevelDetailSettings, LevelLabelSettings, LevelSettings } from "@metafor/types/bulk/level"
import type { BulkLayoutSettings } from "@metafor/types/bulk/layout"
import type {
  BulkLayoutConfig,
  BulkRenderSettings,
  BulkSettingConfig,
  BulkSettingKey,
  BulkSettingsConfig,
  PersistedSettingsRecord,
  SettingsIndexedDbOptions,
  SettingsSnapshot,
} from "@metafor/types/bulk/settings"
import {
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  toLevelGeometrySettings,
} from "@bulk/gravity/layout"

export const BULK_SETTINGS_REVISION = 8
export const DEFAULT_BULK_SCENE_SRC = "zavx0z/linux"

export const DEFAULT_BULK_SETTINGS: BulkSettingsConfig = {
  src: DEFAULT_BULK_SCENE_SRC,
  layout: {
    orbitEdgeGapMm: 0,
    rootInnerDiameterMm: 1000,
    rootSphereRadiusMm: 1470,
  },
  render: {
    animationEnabled: false,
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

/** Layout-контракт Bulk: viewport-камера, сетка, fallback torus geometry. */
export const bulkLayoutConfig: BulkLayoutConfig = {
  viewport: {
    axesSizeMm: 1000,
    camera: {
      fovRad: (2 * Math.PI) / 5,
      // FIXME(deep-space): текущий диапазон near/far рассчитан на сцену, где
      // 1 world unit = 1 mm. Для более глубокого пространства нельзя просто
      // увеличивать `far`: отдельно понадобятся dynamic near/far, split frustum
      // или origin rebasing. Пока не реализовывать — только фиксируем ограничение.
      near: 1,
      far: 100000,
      position: { x: 3975.6752784123818, y: -2981.756458809286, z: 1650 },
      target: { x: 0, y: 0, z: 1100 },
    },
    grid: {
      sizeMm: 8000,
      divisions: 16,
      centerColorHex: 0x444444,
      colorHex: 0x888888,
    },
    levelsMm: {
      floor: 0,
      elbow: 1100,
      eye: 1650,
    },
    torusFallbackMm: {
      radius: 200,
      tube: 140,
    },
  },
}

/** Классификация Bulk-настроек по ключам. Используется UI и runtime-слоями как единая карта. */
export const BULK_SETTINGS_BY_KEY: Record<BulkSettingKey, BulkSettingConfig> = {
  // Запуск постоянного движения космораскладки.
  animationEnabled: {
    group: "animation",
    section: "render",
    type: "checkbox",
    label: "Движение космоса",
    defaultValue: DEFAULT_BULK_SETTINGS.render.animationEnabled,
    description: "Запускает космораскладку: объекты вращаются вокруг оси и по орбитам вокруг родителя. Если выключено - постоянный цикл останавливается, а сцена рендерится по запросу.",
  },
  // Базовая детализация wireframe у root-уровня.
  detailDensityFactor: {
    group: "detail",
    section: "render",
    label: "Детализация root",
    defaultValue: DEFAULT_BULK_SETTINGS.render.detailDensityFactor,
    description: "Задает базовую плотность wireframe-сетки для корневого уровня.",
    min: 0.05,
    max: 6,
    step: 0.05,
  },
  // Ослабление детализации на каждом следующем уровне внутрь.
  detailLevelMultiplier: {
    group: "detail",
    section: "render",
    label: "Детализация внутрь",
    defaultValue: DEFAULT_BULK_SETTINGS.render.detailLevelMultiplier,
    description: "Уменьшает детализацию на каждом следующем вложенном уровне.",
    min: 0.5,
    max: 3,
    step: 0.05,
  },
  // Сколько уровней подписей рендерить от root-уровня внутрь.
  labelVisibleLevels: {
    group: "labels",
    section: "render",
    label: "Глубина подписей",
    defaultValue: DEFAULT_BULK_SETTINGS.render.labelVisibleLevels,
    description: "Ограничивает глубину показа подписей, начиная от корневого уровня.",
    min: 1,
    max: 8,
    step: 1,
  },
  // Размер шрифта для подписей торов и сфер.
  labelFontSizeMm: {
    group: "labels",
    section: "render",
    label: "Размер шрифта, мм",
    defaultValue: DEFAULT_BULK_SETTINGS.render.labelFontSizeMm,
    description: "Задает размер шрифта подписей на торах и сферах.",
    min: 1,
    max: 1000,
    step: 1,
  },
  // Отступ текста от поверхности объекта наружу.
  labelSurfaceOffsetMm: {
    group: "labels",
    section: "render",
    label: "Отступ подписи, мм",
    defaultValue: DEFAULT_BULK_SETTINGS.render.labelSurfaceOffsetMm,
    description: "Отодвигает подпись от поверхности объекта, чтобы текст не врезался в wireframe.",
    min: 0,
    max: 1000,
    step: 1,
  },
  // Базовый уровень viewport для отсчёта видимости.
  baseDepth: {
    group: "detail",
    section: "render",
    label: "Базовая глубина",
    defaultValue: DEFAULT_BULK_SETTINGS.render.baseDepth,
    description: "Текущий базовый уровень viewport для отсчёта видимости (0 = root, -1 = все уровни).",
    min: -1,
    max: 16,
    step: 1,
  },
  // Количество колец (линий) тора.
  torusRadialSegments: {
    group: "torus",
    section: "render",
    label: "Число линий тора",
    defaultValue: DEFAULT_BULK_SETTINGS.render.torusRadialSegments,
    description: "Задает количество продольных колец (линий) тора.",
    min: 3,
    max: 128,
    step: 1,
  },
  // Сглаженность (сегменты) одного кольца тора.
  torusTubularSegments: {
    group: "torus",
    section: "render",
    label: "Сглаженность линий",
    defaultValue: DEFAULT_BULK_SETTINGS.render.torusTubularSegments,
    description: "Задает количество сегментов в каждом кольце тора.",
    min: 3,
    max: 128,
    step: 1,
  },
  // Прозрачность wireframe-сетки.
  wireframeOpacity: {
    group: "detail",
    section: "render",
    label: "Прозрачность сетки",
    defaultValue: DEFAULT_BULK_SETTINGS.render.wireframeOpacity,
    description: "Задает общую прозрачность для всех wireframe-объектов: Dark particles и field particles.",
    min: 0,
    max: 1,
    step: 0.01,
  },
  // Зазор между краями объектов на орбитах.
  orbitEdgeGapMm: {
    group: "geometry",
    section: "layout",
    label: "Зазор орбит, мм",
    defaultValue: DEFAULT_BULK_SETTINGS.layout.orbitEdgeGapMm,
    description: "Задает расстояние между краями объектов на орбитах и от внутренней кромки parent-тора до первого объекта.",
    min: 0,
    max: 1000,
    step: 1,
  },
  // Внутренний диаметр root-тора и базовое отношение отверстия для внутренних уровней.
  rootInnerDiameterMm: {
    group: "geometry",
    section: "layout",
    label: "Внутренний диаметр root, мм",
    defaultValue: DEFAULT_BULK_SETTINGS.layout.rootInnerDiameterMm,
    description: "Определяет размер отверстия root-тора и то же соотношение для внутренних уровней.",
    min: 10,
    max: 3900,
    step: 10,
  },
  // Радиус сферы поля на root-уровне.
  rootSphereRadiusMm: {
    group: "geometry",
    section: "layout",
    label: "Размер root-сферы, мм",
    defaultValue: DEFAULT_BULK_SETTINGS.layout.rootSphereRadiusMm,
    description: "Задает диаметр сфер полей на корневом уровне и пропорционально уменьшает их вглубь.",
    min: 10,
    max: DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm,
    step: 10,
  },
  // Наклон продольных линий тора без вывода их с поверхности тора.
  torusCrossRingRotationDeg: {
    group: "torus",
    section: "render",
    label: "Наклон линий тора, град",
    defaultValue: DEFAULT_BULK_SETTINGS.render.torusCrossRingRotationDeg,
    description: "Наклоняет продольные линии тора, не деформируя их по высоте вне поверхности.",
    min: -180,
    max: 180,
    step: 1,
  },
}

const TORUS_MAX_SEGMENTS = 96
const SPHERE_BASE_WIDTH_SEGMENTS = 16
const SPHERE_BASE_HEIGHT_SEGMENTS = 12
const SPHERE_MAX_WIDTH_SEGMENTS = 64
const SPHERE_MAX_HEIGHT_SEGMENTS = 48

/**
 * Проекция layout settings в domain-закон `LevelGeometrySettings` из Bulk x Gravity.
 *
 * Опциональный `rootOuterDiameterMm` позволяет вызывающему подменить snapshot-константу
 * (используется в snapshot-builder-е при materialize с нестандартным целевым диаметром).
 */
export const toBulkLevelGeometrySettings = (
  layout: BulkLayoutSettings,
  rootOuterDiameterMm: number = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm,
) => toLevelGeometrySettings(layout, DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG, rootOuterDiameterMm)

/** Проекция render settings в domain-закон `LevelDetailSettings`. */
export const toLevelDetailSettings = (render: BulkRenderSettings): LevelDetailSettings => ({
  detailDensityFactor: render.detailDensityFactor,
  detailLevelMultiplier: render.detailLevelMultiplier,
  torusRadialSegments: render.torusRadialSegments,
  torusTubularSegments: render.torusTubularSegments,
  torusMaxSegments: TORUS_MAX_SEGMENTS,
  sphereBaseWidthSegments: SPHERE_BASE_WIDTH_SEGMENTS,
  sphereBaseHeightSegments: SPHERE_BASE_HEIGHT_SEGMENTS,
  sphereMaxWidthSegments: SPHERE_MAX_WIDTH_SEGMENTS,
  sphereMaxHeightSegments: SPHERE_MAX_HEIGHT_SEGMENTS,
})

/** Проекция render settings в domain-закон `LevelLabelSettings`. */
export const toLevelLabelSettings = (render: BulkRenderSettings): LevelLabelSettings => ({
  baseDepth: render.baseDepth,
  fontSizeMm: render.labelFontSizeMm,
  surfaceOffsetMm: render.labelSurfaceOffsetMm,
  visibleLevels: render.labelVisibleLevels,
})

/** Составная проекция layout/render settings в `LevelSettings` для `createLevelResolver`. */
export const toLevelSettings = (
  layout: BulkLayoutSettings,
  render: BulkRenderSettings,
  rootOuterDiameterMm?: number,
): LevelSettings => ({
  geometry:
    rootOuterDiameterMm !== undefined
      ? toBulkLevelGeometrySettings(layout, rootOuterDiameterMm)
      : toBulkLevelGeometrySettings(layout),
  detail: toLevelDetailSettings(render),
  label: toLevelLabelSettings(render),
})

/**
 * Нормализует частичные render-настройки в безопасный контракт wireframe-детализации.
 *
 * Некорректные и неположительные значения заменяются на `DEFAULT_BULK_SETTINGS.render`.
 */
export const normalizeBulkRenderSettings = (
  settings: Partial<BulkRenderSettings> = {},
): BulkRenderSettings => ({
  animationEnabled:
    typeof settings.animationEnabled === "boolean"
      ? settings.animationEnabled
      : DEFAULT_BULK_SETTINGS.render.animationEnabled,
  detailDensityFactor:
    Number.isFinite(settings.detailDensityFactor) && (settings.detailDensityFactor ?? 0) > 0
      ? settings.detailDensityFactor!
      : DEFAULT_BULK_SETTINGS.render.detailDensityFactor,
  detailLevelMultiplier:
    Number.isFinite(settings.detailLevelMultiplier) && (settings.detailLevelMultiplier ?? 0) > 0
      ? settings.detailLevelMultiplier!
      : DEFAULT_BULK_SETTINGS.render.detailLevelMultiplier,
  labelVisibleLevels:
    Number.isFinite(settings.labelVisibleLevels) && (settings.labelVisibleLevels ?? 0) > 0
      ? Math.max(1, Math.round(settings.labelVisibleLevels!))
      : DEFAULT_BULK_SETTINGS.render.labelVisibleLevels,
  baseDepth:
    Number.isFinite(settings.baseDepth) && (settings.baseDepth ?? -1) >= -1
      ? Math.floor(settings.baseDepth!)
      : DEFAULT_BULK_SETTINGS.render.baseDepth,
  labelFontSizeMm:
    Number.isFinite(settings.labelFontSizeMm) && (settings.labelFontSizeMm ?? 0) > 0
      ? settings.labelFontSizeMm!
      : DEFAULT_BULK_SETTINGS.render.labelFontSizeMm,
  labelSurfaceOffsetMm:
    Number.isFinite(settings.labelSurfaceOffsetMm) && (settings.labelSurfaceOffsetMm ?? 0) >= 0
      ? settings.labelSurfaceOffsetMm!
      : DEFAULT_BULK_SETTINGS.render.labelSurfaceOffsetMm,
  torusCrossRingRotationDeg:
    Number.isFinite(settings.torusCrossRingRotationDeg)
      ? settings.torusCrossRingRotationDeg!
      : DEFAULT_BULK_SETTINGS.render.torusCrossRingRotationDeg,
  torusRadialSegments:
    Number.isFinite(settings.torusRadialSegments) && (settings.torusRadialSegments ?? 0) > 0
      ? Math.max(3, Math.round(settings.torusRadialSegments!))
      : DEFAULT_BULK_SETTINGS.render.torusRadialSegments,
  torusTubularSegments:
    Number.isFinite(settings.torusTubularSegments) && (settings.torusTubularSegments ?? 0) > 0
      ? Math.max(3, Math.round(settings.torusTubularSegments!))
      : DEFAULT_BULK_SETTINGS.render.torusTubularSegments,
  wireframeOpacity:
    Number.isFinite(settings.wireframeOpacity) && (settings.wireframeOpacity ?? 0) >= 0
      ? Math.max(0, Math.min(1, settings.wireframeOpacity!))
      : DEFAULT_BULK_SETTINGS.render.wireframeOpacity,
})

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
