/** Канонические виды particle-carrier, используемые в instance-level world snapshot. */
export type DbParticleKind = "wimp" | "fuzzy" | "axion" | "macho"
/** Render-facing scalar kind для ordinary non-topology fields. */
export type DbFieldValueKind = "number" | "text" | "bool" | "other"

/**
 * Один shell-carrier внутри instance-level world snapshot.
 *
 * Координаты и размеры выражаются в единицах engine-контракта:
 * `Z-up`, `1 world unit = 1 mm`.
 */
export interface DbParticleShellSnapshot {
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
 * Одна точка ordinary field orbit внутри instance-level world snapshot.
 *
 * Эти значения уже подготовлены для прямой materialization в `Boundary/Bulk`
 * и не восстанавливаются из JSON payload во время рендера.
 */
export interface DbFieldOrbitSnapshot {
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

/** Полный instance-level world snapshot для одного `rootSrc`. */
export interface DbWorldSnapshot {
  rootSrc: string
  particles: DbParticleShellSnapshot[]
  fields: DbFieldOrbitSnapshot[]
}
