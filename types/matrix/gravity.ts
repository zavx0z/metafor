import type { MatrixCollapse } from "./data.ts"

export interface MatrixGravityStore {
  activeActorIds: number[]
  actorIdToBraneIndex: Map<number, number>
  braneIndexToActorId: number[]
  wimpSrcByActorId: Map<number, string>
  actorIdsByWimpSrc: Map<string, number[]>
  structuralDirty: boolean
  hasActor(actorId: number): boolean
  getBraneIndexByActorId(actorId: number): number | undefined
  getActorId(braneIndex: number): number | undefined
  getWimpSrcByActorId(actorId: number): string | undefined
  getActorIdsByWimpSrc(wimpSrc: string): number[]
}

export interface NamedSuperposition {
  [state: string]: Record<string, unknown> | null
}

export interface ConvertedSuperposition {
  states: string[]
  matrix: {
    transitions: Array<Array<MatrixCollapse>>
  }
}
