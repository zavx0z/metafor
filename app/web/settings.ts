/** Настройки top-down раскладки shell-иерархии для materialization в `app/web`. */
export interface AppWebLayoutSettings {
  /** Коэффициент уменьшения canonical shell size от root-уровня вглубь. Должен быть `> 0`. */
  levelSizeMultiplier: number
  /** Внутренний диаметр root-тора в миллиметрах. То же отношение переносится на внутренние уровни. */
  rootInnerDiameterMm: number
  /** Диаметр peer-sphere на root-уровне в миллиметрах в пределах level-contract. */
  rootSphereRadiusMm: number
}

/** Настройки плотности wireframe-детализации для WebGPU viewport. */
export interface AppWebRenderSettings {
  /** Множитель детализации для root-уровня. */
  detailDensityFactor: number
  /** Ослабление детализации на каждый уровень внутрь. Должен быть `> 0`. */
  detailLevelMultiplier: number
  /** Сколько уровней иерархии подписей показывать, начиная от root-уровня. */
  labelVisibleLevels: number
  /** Текущий базовый уровень (глубина) viewport-а для отсчёта видимости. */
  baseDepth: number
  /** Размер подписи у shell/sphere в миллиметрах. */
  labelFontSizeMm: number
  /** Отступ подписи от поверхности объекта в миллиметрах. */
  labelSurfaceOffsetMm: number
  /** Наклон продольных линий тора в градусах относительно базовой раскладки. */
  torusCrossRingRotationDeg: number
  /** Количество продольных колец (линий) тора. */
  torusRadialSegments: number
  /** Количество сегментов (сглаженность) одного кольца тора. */
  torusTubularSegments: number
  /** Прозрачность wireframe-сетки (0..1). */
  wireframeOpacity: number
}

/** Нередактируемый layout-контракт `app/web`: базовые размеры snapshot-а и посадка viewport. */
export interface AppWebLayoutConfig {
  snapshot: {
    deepestFieldSphereRadiusMm: number
    nestingCoefficient: number
    packingDensityCoefficient: number
    rootOuterDiameterMm: number
    sphereMinScaleFactor: number
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
export type AppWebSettingGroup = "detail" | "geometry" | "labels" | "torus"
export type AppWebLayoutSettingKey = keyof AppWebLayoutSettings
export type AppWebRenderSettingKey = keyof AppWebRenderSettings
export type AppWebSettingKey = AppWebLayoutSettingKey | AppWebRenderSettingKey

/** Метаданные одной числовой настройки `app/web`, доступной по стабильному ключу. */
export interface AppWebNumericSettingConfig {
  defaultValue: number
  /** Короткое пояснение для пользователя, которое показывается рядом с настройкой. */
  description: string
  group: AppWebSettingGroup
  label: string
  max?: number
  min?: number
  section: AppWebSettingSection
  step?: number
}

/** Базовый топ-даун закон размеров для root-shell и внутренних уровней. */
export const DEFAULT_APP_WEB_LAYOUT_SETTINGS: AppWebLayoutSettings = {
  // Во сколько раз каждый следующий вложенный уровень меньше предыдущего.
  levelSizeMultiplier: 2,
  // Размер отверстия root-тора в миллиметрах.
  rootInnerDiameterMm: 1000,
  // Диаметр сферы поля на root-уровне.
  rootSphereRadiusMm: 200,
}


/** Единый layout-контракт `app/web`, из которого `instance-layout` и `bulk` читают базовую геометрию. */
export const appWebLayoutConfig: AppWebLayoutConfig = {
  snapshot: {
    deepestFieldSphereRadiusMm: 50,
    nestingCoefficient: 0.1,
    packingDensityCoefficient: 1.12,
    rootOuterDiameterMm: 4000,
    sphereMinScaleFactor: 0.5,
  },
  viewport: {
    axesSizeMm: 1000,
    camera: {
      fovRad: (2 * Math.PI) / 5,
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
  detailLevelMultiplier: 1.22,
  // Сколько уровней подписей показывать от root внутрь.
  labelVisibleLevels: 2,
  // Базовый уровень viewport для отсчёта видимости (0 = root).
  baseDepth: 0,
  // Размер текста подписей на поверхности объектов.
  labelFontSizeMm: 120,
  // Насколько подпись вынесена от поверхности наружу.
  labelSurfaceOffsetMm: 40,
  // Наклон продольных линий тора по поверхности.
  torusCrossRingRotationDeg: 44,
  // Базовое количество колец тора.
  torusRadialSegments: 16,
  // Базовая сглаженность (сегменты) одного кольца тора.
  torusTubularSegments: 16,
  // Прозрачность wireframe-сетки.
  wireframeOpacity: 0.9,
}

/** Классификация настроек `app/web` по ключам. Используется UI и runtime-слоями как единая карта. */
export const APP_WEB_SETTINGS_BY_KEY: Record<AppWebSettingKey, AppWebNumericSettingConfig> = {
  // Базовая детализация wireframe у root-уровня.
  detailDensityFactor: {
    group: "detail",
    section: "render",
    label: "Детализация root",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.detailDensityFactor,
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
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.detailLevelMultiplier,
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
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.labelVisibleLevels,
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
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.labelFontSizeMm,
    description: "Задает размер шрифта подписей на торах и сферах.",
    min: 222,
    max: 1000,
    step: 1,
  },
  // Отступ текста от поверхности объекта наружу.
  labelSurfaceOffsetMm: {
    group: "labels",
    section: "render",
    label: "Отступ подписи, мм",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.labelSurfaceOffsetMm,
    description: "Отодвигает подпись от поверхности объекта, чтобы текст не врезался в wireframe.",
    min: 0,
    max: 300,
    step: 1,
  },
  // Базовый уровень viewport для отсчёта видимости.
  baseDepth: {
    group: "detail",
    section: "render",
    label: "Базовая глубина",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.baseDepth,
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
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.torusRadialSegments,
    description: "Задает количество продольных колец (линий) тора.",
    min: 3,
    max: 64,
    step: 1,
  },
  // Сглаженность (сегменты) одного кольца тора.
  torusTubularSegments: {
    group: "torus",
    section: "render",
    label: "Сглаженность линий",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.torusTubularSegments,
    description: "Задает количество сегментов в каждом кольце тора.",
    min: 3,
    max: 96,
    step: 1,
  },
  // Прозрачность wireframe-сетки.
  wireframeOpacity: {
    group: "detail",
    section: "render",
    label: "Прозрачность сетки",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.wireframeOpacity,
    description: "Задает общую прозрачность для всех wireframe-объектов (shell и сферы).",
    min: 0,
    max: 1,
    step: 0.01,
  },
  // Масштаб уменьшения shell-ов от root вглубь иерархии.
  levelSizeMultiplier: {
    group: "geometry",
    section: "layout",
    label: "Размер по уровням",
    defaultValue: DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
    description: "Показывает, во сколько раз каждый внутренний уровень меньше предыдущего.",
    min: 1.1,
    max: 4,
    step: 0.1,
  },
  // Внутренний диаметр root-тора и базовое отношение отверстия для внутренних уровней.
  rootInnerDiameterMm: {
    group: "geometry",
    section: "layout",
    label: "Внутренний диаметр root, мм",
    defaultValue: DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootInnerDiameterMm,
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
    defaultValue: DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootSphereRadiusMm,
    description: "Задает диаметр сфер полей на корневом уровне и пропорционально уменьшает их вглубь.",
    min: 10,
    max: appWebLayoutConfig.snapshot.rootOuterDiameterMm,
    step: 10,
  },
  // Наклон продольных линий тора без вывода их с поверхности тора.
  torusCrossRingRotationDeg: {
    group: "torus",
    section: "render",
    label: "Наклон линий тора, град",
    defaultValue: DEFAULT_APP_WEB_RENDER_SETTINGS.torusCrossRingRotationDeg,
    description: "Наклоняет продольные линии тора, не деформируя их по высоте вне поверхности.",
    min: -180,
    max: 180,
    step: 1,
  },
}


/** Список layout-ключей, которые должны уходить в `dark` и layout-law snapshot-а. */
export const APP_WEB_LAYOUT_SETTING_KEYS = [
  "levelSizeMultiplier",
  "rootInnerDiameterMm",
  "rootSphereRadiusMm",
] as const satisfies readonly AppWebLayoutSettingKey[]

/** Список render-ключей, которые должны применяться только в WebGPU viewport. */
export const APP_WEB_RENDER_SETTING_KEYS = [
  "detailDensityFactor",
  "detailLevelMultiplier",
  "labelVisibleLevels",
  "labelFontSizeMm",
  "labelSurfaceOffsetMm",
  "torusCrossRingRotationDeg",
  "torusRadialSegments",
  "torusTubularSegments",
  "wireframeOpacity",
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
  rootSphereRadiusMm:
    Number.isFinite(settings.rootSphereRadiusMm) && (settings.rootSphereRadiusMm ?? 0) > 0
      ? Math.min(settings.rootSphereRadiusMm!, appWebLayoutConfig.snapshot.rootOuterDiameterMm)
      : DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootSphereRadiusMm,
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
  labelVisibleLevels:
    Number.isFinite(settings.labelVisibleLevels) && (settings.labelVisibleLevels ?? 0) > 0
      ? Math.max(1, Math.round(settings.labelVisibleLevels!))
      : DEFAULT_APP_WEB_RENDER_SETTINGS.labelVisibleLevels,
  baseDepth:
    Number.isFinite(settings.baseDepth) && (settings.baseDepth ?? -1) >= -1
      ? Math.floor(settings.baseDepth!)
      : DEFAULT_APP_WEB_RENDER_SETTINGS.baseDepth,
  labelFontSizeMm:
    Number.isFinite(settings.labelFontSizeMm) && (settings.labelFontSizeMm ?? 0) > 0
      ? settings.labelFontSizeMm!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.labelFontSizeMm,
  labelSurfaceOffsetMm:
    Number.isFinite(settings.labelSurfaceOffsetMm) && (settings.labelSurfaceOffsetMm ?? 0) >= 0
      ? settings.labelSurfaceOffsetMm!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.labelSurfaceOffsetMm,
  torusCrossRingRotationDeg:
    Number.isFinite(settings.torusCrossRingRotationDeg)
      ? settings.torusCrossRingRotationDeg!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.torusCrossRingRotationDeg,
  torusRadialSegments:
    Number.isFinite(settings.torusRadialSegments) && (settings.torusRadialSegments ?? 0) > 0
      ? Math.max(3, Math.round(settings.torusRadialSegments!))
      : DEFAULT_APP_WEB_RENDER_SETTINGS.torusRadialSegments,
  torusTubularSegments:
    Number.isFinite(settings.torusTubularSegments) && (settings.torusTubularSegments ?? 0) > 0
      ? Math.max(3, Math.round(settings.torusTubularSegments!))
      : DEFAULT_APP_WEB_RENDER_SETTINGS.torusTubularSegments,
  wireframeOpacity:
    Number.isFinite(settings.wireframeOpacity) && (settings.wireframeOpacity ?? 0) >= 0
      ? Math.max(0, Math.min(1, settings.wireframeOpacity!))
      : DEFAULT_APP_WEB_RENDER_SETTINGS.wireframeOpacity,
})
