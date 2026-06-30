import type { MatrixGravityStore } from "./store.t";


export const gravity$: MatrixGravityStore = {
  activeWimpIds: [],
  activeActorIds: [],
  wimpIdToBraneIndex: new Map(),
  actorIdToBraneIndex: new Map(),
  braneIndexToWimpId: [],
  braneIndexToActorId: [],
  wimpSrcByActorId: new Map(),
  actorIdsByWimpSrc: new Map(),
  structuralDirty: false,

  hasWimp(wimpId: number): boolean {
    return this.activeWimpIds.includes(wimpId)
  },

  getBraneIndex(wimpId: number): number | undefined {
    return this.wimpIdToBraneIndex.get(wimpId)
  },

  getWimpId(braneIndex: number): number | undefined {
    return this.braneIndexToWimpId[braneIndex]
  },

  hasActor(actorId: number): boolean {
    return this.activeActorIds.includes(actorId)
  },

  getBraneIndexByActorId(actorId: number): number | undefined {
    return this.actorIdToBraneIndex.get(actorId)
  },

  getActorId(braneIndex: number): number | undefined {
    return this.braneIndexToActorId[braneIndex]
  },

  getWimpSrcByActorId(actorId: number): string | undefined {
    return this.wimpSrcByActorId.get(actorId)
  },

  getActorIdsByWimpSrc(wimpSrc: string): number[] {
    return [...(this.actorIdsByWimpSrc.get(wimpSrc) ?? [])]
  },
}
