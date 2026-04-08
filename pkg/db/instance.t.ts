export type DbParticleKind = "wimp" | "fuzzy" | "axion" | "macho"

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

export interface DbFieldOrbitSnapshot {
  id: string
  particleId: string
  fieldKey: string
  fieldLabel: string
  fieldOrder: number
  valueText: string | null
  localX: number
  localY: number
  localZ: number
  sphereRadius: number
  colorR: number
  colorG: number
  colorB: number
}

export interface DbWorldSnapshot {
  rootSrc: string
  particles: DbParticleShellSnapshot[]
  fields: DbFieldOrbitSnapshot[]
}
