export interface MatrixEntanglementMapping {
  localFields: [number, unknown][][]
  braneEntangledMap: number[][]
  entangledFields: Map<string, [number, unknown][]>
}

export interface PreparedEntanglementBlock {
  key?: string
  braneIndices: number[]
  fields: PreparedEntanglementField[]
}

export interface PreparedEntanglementProjection {
  blocks: PreparedEntanglementBlock[]
}

export interface PreparedEntanglementField {
  fieldIndex: number
  fieldName: string
  payloadIds: string[]
  semanticKeys: string[]
  representativeBraneIndex?: number
}
