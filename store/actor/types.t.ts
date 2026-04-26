/** Канонические виды particle-carrier для actor-level world. */
export type DbParticleKind = "wimp" | "fuzzy" | "axion" | "macho"
/** Render-facing scalar kind для ordinary non-topology fields. */
export type DbFieldValueKind = "number" | "text" | "bool" | "other"

/**
 * Одна row-запись shell-carrier в `actor_particle_shell`.
 *
 * Координаты и размеры — в единицах engine-контракта: `Z-up`, `1 world unit = 1 mm`.
 */
export interface DbParticleShellRow {
  particleId: string
  parentParticleId: string | null
  kind: DbParticleKind
  src: string | null
  metaSrc: string | null
  label: string
  depth: number
  shellOrder: number
  localX: number
  localY: number
  localZ: number
  shellScale: number
  shellRadius: number
  shellTube: number
  colorR: number
  colorG: number
  colorB: number
}

/**
 * Содержимое world-структуры под одним `rootSrc` в виде row-коллекций.
 *
 * Промежуточная форма, удобная для layout-builder-а и dev-снимков. В runtime потоке
 * данные двигаются per-row через `DbActorStore` без сборки `DbWorldRows` объекта.
 */
export interface DbWorldRows {
  rootSrc: string
  particles: DbParticleShellRow[]
  fields: DbFieldOrbitRow[]
}

/**
 * Одна row-запись точки ordinary field orbit в `actor_field_orbit`.
 *
 * Уже подготовлена для прямой materialization в `Boundary/Bulk`,
 * не пересчитывается из JSON payload во время рендера.
 */
export interface DbFieldOrbitRow {
  id: string
  particleId: string
  fieldKey: string
  fieldLabel: string
  fieldOrder: number
  fieldValueKind: DbFieldValueKind
  valueText: string | null
  localX: number
  localY: number
  localZ: number
  sphereRadius: number
  colorR: number
  colorG: number
  colorB: number
}
