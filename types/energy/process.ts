export type ProcessRuntimeKind =
  | "server"
  | "browser-main"
  | "worker"
  | "service-worker"
  | "desktop-main"
  | "unknown"

export interface ProcessEnv {
  kind: ProcessRuntimeKind
  id: string
  labels?: string[]
  capabilities?: string[]
}

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
