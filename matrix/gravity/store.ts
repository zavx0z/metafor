import type { MatrixGravityStore } from "@metafor/types/matrix/gravity"


export const gravity$: MatrixGravityStore = {
  activeAtomIds: [],
  atomIdToBraneIndex: new Map(),
  braneIndexToAtomId: [],
  wimpSrcByAtomId: new Map(),
  atomIdsByWimpSrc: new Map(),
  structuralDirty: false,

  hasAtom(atomId: number): boolean {
    return this.activeAtomIds.includes(atomId)
  },

  getBraneIndexByAtomId(atomId: number): number | undefined {
    return this.atomIdToBraneIndex.get(atomId)
  },

  getAtomId(braneIndex: number): number | undefined {
    return this.braneIndexToAtomId[braneIndex]
  },

  getWimpSrcByAtomId(atomId: number): string | undefined {
    return this.wimpSrcByAtomId.get(atomId)
  },

  getAtomIdsByWimpSrc(wimpSrc: string): number[] {
    return [...(this.atomIdsByWimpSrc.get(wimpSrc) ?? [])]
  },
}
