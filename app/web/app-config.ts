import type { BulkLayoutSettings } from "@bulk/gravity/layout"

/**
 * Единственный источник правды для дефолтов app/web UI и runtime-настроек.
 *
 * Используется:
 * - `app/web/settings.ts` как `DEFAULT_APP_WEB_*_SETTINGS`,
 * - `app/web/ui-settings-idb.ts` для seed-а IndexedDB при первом открытии,
 * - `APP_WEB_SETTINGS_BY_KEY[*].defaultValue`.
 *
 * Нельзя «зашить» дефолты ещё где-то — добавляй сюда и реэкспортируй.
 */

/** Настройки top-down раскладки shell-иерархии (layout-секция). */
export interface AppConfigLayout extends BulkLayoutSettings {}

/** Настройки рендера viewport-а (детализация, подписи, тор, прозрачность). */
export interface AppConfigRender {
  animationEnabled: boolean
  detailDensityFactor: number
  detailLevelMultiplier: number
  labelVisibleLevels: number
  baseDepth: number
  labelFontSizeMm: number
  labelSurfaceOffsetMm: number
  torusCrossRingRotationDeg: number
  torusRadialSegments: number
  torusTubularSegments: number
  wireframeOpacity: number
}

/** Полный config app/web — то, что попадает в IDB как seed на первом open. */
export interface AppConfig {
  src: string
  layout: AppConfigLayout
  render: AppConfigRender
}

/**
 * Маркер версии. Бамп — invalidates persisted IDB-запись и пере-seedит дефолты
 * у всех уже открывавших страницу. Бампать ВСЕГДА при изменении любого значения
 * в {@link APP_CONFIG_DEFAULTS}.
 */
export const APP_CONFIG_REVISION = 6

/** Дефолтный root-source сцены app/web. */
export const DEFAULT_APP_WEB_SCENE_SRC = "zavx0z/git"

/** Дефолты, которые seedятся в IDB при первом open и применяются после bump revision. */
export const APP_CONFIG_DEFAULTS: AppConfig = {
  src: DEFAULT_APP_WEB_SCENE_SRC,
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
