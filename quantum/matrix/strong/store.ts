import type { MatrixStrongStore } from "@metafor/types/matrix/strong"

export const strong$: MatrixStrongStore = {
  runtimeFieldIndexByWimpFieldId: new Map(),
  wimpFieldIdsByRuntimeFieldIndex: [],
  braneIndexByWimpFieldId: new Map(),
  topologyWimpFieldIds: new Set(),
  runtimeFieldIndexByAtomFieldId: new Map(),
  atomFieldIdsByRuntimeFieldIndex: [],
  topologyAtomFieldIds: new Set(),
}
