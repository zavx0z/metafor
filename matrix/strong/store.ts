import type { MatrixStrongStore } from "@metafor/types/matrix/strong"

export const strong$: MatrixStrongStore = {
  runtimeFieldIndexByWimpFieldId: new Map(),
  wimpFieldIdsByRuntimeFieldIndex: [],
  braneIndexByWimpFieldId: new Map(),
  topologyWimpFieldIds: new Set(),
  runtimeFieldIndexByActorFieldId: new Map(),
  actorFieldIdsByRuntimeFieldIndex: [],
  topologyActorFieldIds: new Set(),
}
