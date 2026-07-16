import type { MatrixCollapse } from "./data.ts"

export interface MatrixGravityStore {
  activeAtomIds: number[]
  atomIdToBraneIndex: Map<number, number>
  braneIndexToAtomId: number[]
  wimpSrcByAtomId: Map<number, string>
  atomIdsByWimpSrc: Map<string, number[]>
  structuralDirty: boolean
  hasAtom(atomId: number): boolean
  getBraneIndexByAtomId(atomId: number): number | undefined
  getAtomId(braneIndex: number): number | undefined
  getWimpSrcByAtomId(atomId: number): string | undefined
  getAtomIdsByWimpSrc(wimpSrc: string): number[]
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
