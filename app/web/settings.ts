import type {
  LevelDetailSettings,
  LevelLabelSettings,
  LevelSettings,
} from "@bulk/gravity/level"
import {
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings as toLevelGeometrySettingsFromBulk,
  type BulkLayoutSettings,
} from "@bulk/gravity/layout"
import {
  BULK_LAYOUT_SETTING_KEYS,
  BULK_RENDER_SETTING_KEYS,
  DEFAULT_BULK_SETTINGS,
  type BulkRenderSettings,
} from "bulk/settings"

/** Layout-контракт UI: viewport-камера, сетка, fallback torus geometry. Snapshot-константы хранятся в `@bulk/gravity/layout`. */
export interface AppWebLayoutConfig {
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
    torusFallbackMm: {
      radius: number
      tube: number
    }
  }
}

export type AppWebSettingSection = "layout" | "render"
export type AppWebSettingGroup = "animation" | "detail" | "geometry" | "labels" | "torus"
export type AppWebLayoutSettingKey = keyof BulkLayoutSettings
export type AppWebRenderSettingKey = keyof BulkRenderSettings
export type AppWebSettingKey = AppWebLayoutSettingKey | AppWebRenderSettingKey

/** Метаданные одной UI-настройки `app/web`, доступной по стабильному ключу. */
export interface AppWebSettingConfig {
  defaultValue: boolean | number
  /** Короткое пояснение для пользователя, которое показывается рядом с настройкой. */
  description: string
  group: AppWebSettingGroup
  label: string
  max?: number
  min?: number
  section: AppWebSettingSection
  step?: number
  type?: "checkbox" | "range"
}

/** Layout-контракт `app/web`: viewport-камера, сетка, fallback torus geometry. */
export const appWebLayoutConfig: AppWebLayoutConfig = {
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

/** Классификация настроек `app/web` по ключам. Используется UI и runtime-слоями как единая карта. */
export const APP_WEB_SETTINGS_BY_KEY: Record<AppWebSettingKey, AppWebSettingConfig> = {
  // Запуск постоянного движения космораскладки.
  animationEnabled: {
    group: "animation",
    section: "render",
    type: "checkbox",
    label: "Движение космоса",
    defaultValue: DEFAULT_BULK_SETTINGS.render.animationEnabled,
    description: "Запускает космораскладку: объекты вращаются вокруг оси и по орбитам вокруг родителя. Если выключено — постоянный цикл останавливается, а сцена рендерится по запросу.",
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
 * Проекция layout settings в domain-закон `LevelGeometrySettings` из Bulk × Gravity.
 *
 * Опциональный `rootOuterDiameterMm` позволяет вызывающему подменить snapshot-константу
 * (используется в snapshot-builder-е при materialize с нестандартным целевым диаметром).
 */
export const toLevelGeometrySettings = (
  layout: BulkLayoutSettings,
  rootOuterDiameterMm: number = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm,
) => toLevelGeometrySettingsFromBulk(layout, DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG, rootOuterDiameterMm)

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
      ? toLevelGeometrySettings(layout, rootOuterDiameterMm)
      : toLevelGeometrySettings(layout),
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
