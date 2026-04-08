/** Настройки top-down раскладки shell-иерархии для materialization в `app/web`. */
export interface AppWebLayoutSettings {
  /** Коэффициент уменьшения canonical shell size от root-уровня вглубь. Должен быть `> 0`. */
  levelSizeMultiplier: number
  /** Внутренний диаметр root-тора в миллиметрах. То же отношение переносится на внутренние уровни. */
  rootInnerDiameterMm: number
  /** Фазовый поворот поперечных колец тора в градусах. */
  torusCrossRingRotationDeg: number
}

/** Настройки плотности wireframe-детализации для WebGPU viewport. */
export interface AppWebRenderSettings {
  /** Множитель детализации для root-уровня. */
  detailDensityFactor: number
  /** Ослабление детализации на каждый уровень внутрь. Должен быть `> 0`. */
  detailLevelMultiplier: number
}

/** Нередактируемый layout-контракт `app/web`: базовые размеры snapshot-а и посадка viewport. */
export interface AppWebLayoutConfig {
  snapshot: {
    deepestFieldSphereRadiusMm: number
    orbitItemSpacingFactor: number
    rootOuterDiameterMm: number
  }
  viewport: {
    axesSizeMm: number
    camera: {
      far: number
      fovRad: number
      near: number
      position: { x: number; y: number; z: number }
      target: { x: number; y: number; z: number }
    }
    grid: {
      centerColorHex: number
      colorHex: number
      divisions: number
      sizeMm: number
    }
    levelsMm: {
      eye: number
      elbow: number
      floor: number
    }
    shellFallbackMm: {
      radius: number
      tube: number
    }
  }
}

export type AppWebSettingSection = "layout" | "render"
export type AppWebLayoutSettingKey = keyof AppWebLayoutSettings
export type AppWebRenderSettingKey = keyof AppWebRenderSettings
export type AppWebSettingKey = AppWebLayoutSettingKey | AppWebRenderSettingKey

/** Метаданные одной числовой настройки `app/web`, доступной по стабильному ключу. */
export interface AppWebNumericSettingConfig {
  defaultValue: number
  /** Короткое пояснение для пользователя, которое показывается рядом с настройкой. */
  description: string
  label: string
  min?: number
  section: AppWebSettingSection
  step?: number
}

/** Базовый top-down закон размеров для root-shell и внутренних уровней. */
export const DEFAULT_APP_WEB_LAYOUT_SETTINGS: AppWebLayoutSettings = {
  // Во сколько раз каждый следующий вложенный уровень меньше предыдущего.
  levelSizeMultiplier: 4,
  // Размер отверстия root-тора в миллиметрах.
  rootInnerDiameterMm: 1000,
  // Начальный угол поворота поперечных колец тора.
  torusCrossRingRotationDeg: 0,
}

/** Единый layout-контракт `app/web`, из которого `instance-layout` и `bulk` читают базовую геометрию. */
export const appWebLayoutConfig: AppWebLayoutConfig = {
  snapshot: {
    deepestFieldSphereRadiusMm: 50,
    orbitItemSpacingFactor: 1.12,
    rootOuterDiameterMm: 4000,
  },
  viewport: {
    axesSizeMm: 1000,
    camera: {
      fovRad: (2 * Math.PI) / 5,
      near: 10,
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
    shellFallbackMm: {
      radius: 200,
      tube: 140,
    },
  },
}

/** Базовый закон детализации viewport. `detailDensityFactor = 2` означает двойную базовую детализацию у root. */
export const DEFAULT_APP_WEB_RENDER_SETTINGS: AppWebRenderSettings = {
  // Базовая плотность wireframe-сетки у root-уровня.
  detailDensityFactor: 2,
  // Насколько быстро детализация уменьшается на каждом внутреннем уровне.
  detailLevelMultiplier: 1.5,
}

/** Классификация настроек `app/web` по ключам. Используется UI и runtime-слоями как единая карта. */
export const APP_WEB_SETTINGS_BY_KEY: Record<AppWebSettingKey, AppWebNumericSettingConfig> = {
  // Базовая детализация wireframe у root-уровня.
  detailDensityFactor: {
    section: "render",
    label: "Detail Overall",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.detailDensityFactor,
    description: "Задает базовую плотность wireframe-сетки для корневого уровня.",
    min: 0.05,
    step: 0.05,
  },
  // Ослабление детализации на каждом следующем уровне внутрь.
  detailLevelMultiplier: {
    section: "render",
    label: "Detail Per Level",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.detailLevelMultiplier,
    description: "Уменьшает детализацию на каждом следующем вложенном уровне.",
    min: 0.5,
    step: 0.05,
  },
  // Масштаб уменьшения shell-ов от root вглубь иерархии.
  levelSizeMultiplier: {
    section: "layout",
    label: "Size Per Level",
    defaultValue: DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
    description: "Показывает, во сколько раз каждый внутренний уровень меньше предыдущего.",
    min: 1.1,
    step: 0.1,
  },
  // Внутренний диаметр root-тора и базовое отношение отверстия для внутренних уровней.
  rootInnerDiameterMm: {
    section: "layout",
    label: "Root Inner Diameter Mm",
    defaultValue: DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootInnerDiameterMm,
    description: "Определяет размер отверстия root-тора и то же соотношение для внутренних уровней.",
    min: 10,
    step: 10,
  },
  // Поворот поперечных колец wireframe-тора по фазе.
  torusCrossRingRotationDeg: {
    section: "layout",
    label: "Torus Cross Ring Rotation Deg",
    defaultValue: DEFAULT_APP_WEB_LAYOUT_SETTINGS.torusCrossRingRotationDeg,
    description: "Поворачивает поперечные кольца wireframe-тора на заданный угол.",
    step: 1,
  },
}

/** Список layout-ключей, которые должны уходить в `dark` и layout-law snapshot-а. */
export const APP_WEB_LAYOUT_SETTING_KEYS = [
  "levelSizeMultiplier",
  "rootInnerDiameterMm",
  "torusCrossRingRotationDeg",
] as const satisfies readonly AppWebLayoutSettingKey[]

/** Список render-ключей, которые должны применяться только в WebGPU viewport. */
export const APP_WEB_RENDER_SETTING_KEYS = [
  "detailDensityFactor",
  "detailLevelMultiplier",
] as const satisfies readonly AppWebRenderSettingKey[]

/**
 * Нормализует частичные layout-настройки в безопасный top-down контракт shell-раскладки.
 *
 * Некорректные и неположительные значения заменяются на {@link DEFAULT_APP_WEB_LAYOUT_SETTINGS}.
 */
export const normalizeAppWebLayoutSettings = (
  settings: Partial<AppWebLayoutSettings> = {},
): AppWebLayoutSettings => ({
  levelSizeMultiplier:
    Number.isFinite(settings.levelSizeMultiplier) && (settings.levelSizeMultiplier ?? 0) > 0
      ? settings.levelSizeMultiplier!
      : DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
  rootInnerDiameterMm:
    Number.isFinite(settings.rootInnerDiameterMm) && (settings.rootInnerDiameterMm ?? 0) > 0
      ? settings.rootInnerDiameterMm!
      : DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootInnerDiameterMm,
  torusCrossRingRotationDeg:
    Number.isFinite(settings.torusCrossRingRotationDeg)
      ? settings.torusCrossRingRotationDeg!
      : DEFAULT_APP_WEB_LAYOUT_SETTINGS.torusCrossRingRotationDeg,
})

/**
 * Нормализует частичные render-настройки в безопасный контракт wireframe-детализации.
 *
 * Некорректные и неположительные значения заменяются на {@link DEFAULT_APP_WEB_RENDER_SETTINGS}.
 */
export const normalizeAppWebRenderSettings = (
  settings: Partial<AppWebRenderSettings> = {},
): AppWebRenderSettings => ({
  detailDensityFactor:
    Number.isFinite(settings.detailDensityFactor) && (settings.detailDensityFactor ?? 0) > 0
      ? settings.detailDensityFactor!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.detailDensityFactor,
  detailLevelMultiplier:
    Number.isFinite(settings.detailLevelMultiplier) && (settings.detailLevelMultiplier ?? 0) > 0
      ? settings.detailLevelMultiplier!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.detailLevelMultiplier,
})
