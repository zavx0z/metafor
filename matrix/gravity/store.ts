import type { MatrixGravityStore } from "@metafor/types/matrix"


export const gravity$: MatrixGravityStore = {
  activeActorIds: [],
  actorIdToBraneIndex: new Map(),
  braneIndexToActorId: [],
  wimpSrcByActorId: new Map(),
  actorIdsByWimpSrc: new Map(),
  structuralDirty: false,

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
