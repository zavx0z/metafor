export interface EnergyHandlerDescriptor {
  src: string
  readFields: Array<[fieldId: number, key: string]>
  writeFields: Array<[fieldId: number, key: string]>
}

export interface EnergyProcessDescriptor {
  type: "action"
  key: string
  env: string[]
  action: {
    src: string
    importSpecifier?: string
    wrapperSrc?: string
    readFields: Array<[fieldId: number, key: string]>
  }
  success?: EnergyHandlerDescriptor
  error?: EnergyHandlerDescriptor
}

export interface EnergyRuntimeSnapshot {
  version: 1
  actors: Array<[actorId: number, wimp: string]>
  processes: Array<{
    wimp: string
    state: string
    descriptor: EnergyProcessDescriptor
  }>
}
