/** Runtime-проекция мира для визуализации Bulk. */

export type DbParticleKind = "wimp" | "fuzzy" | "axion" | "macho"

export type DbFieldValueKind = "text" | "number" | "bool" | "other"

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

export interface DbWorldRows {
  rootSrc: string
  particles: DbParticleShellRow[]
  fields: DbFieldOrbitRow[]
}

export interface DbWorldRowSink {
  clearWorld(rootSrc: string): Promise<void> | void
  insertParticleShell(rootSrc: string, row: DbParticleShellRow): Promise<void> | void
  insertFieldOrbit(rootSrc: string, row: DbFieldOrbitRow): Promise<void> | void
}
