export type JsonObject = Record<string, unknown>

export type ProtocolLocation = {
  scriptId?: string
  lineNumber?: number
  columnNumber?: number
}

export type RemoteObject = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  unserializableValue?: string
  description?: string
  objectId?: string
  preview?: unknown
}

export type PropertyDescriptor = {
  name?: string
  value?: RemoteObject
  get?: RemoteObject
  set?: RemoteObject
  wasThrown?: boolean
  enumerable?: boolean
  configurable?: boolean
  writable?: boolean
  isOwn?: boolean
}

export type Scope = {
  type?: string
  name?: string
  object?: RemoteObject
  location?: ProtocolLocation
}

export type CallFrame = {
  callFrameId?: string
  functionName?: string
  location?: ProtocolLocation
  scopeChain?: Scope[]
  this?: RemoteObject
}

export type RemoteSnapshot = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  unserializableValue?: string
  description?: string
  objectId?: string
  preview?: unknown
  properties?: Record<string, PropertySnapshot>
  propertyOverflow?: number
  propertyError?: string
}

export type PropertySnapshot = RemoteSnapshot & {
  get?: RemoteSnapshot
  set?: RemoteSnapshot
  wasThrown?: boolean
  enumerable?: boolean
  configurable?: boolean
  writable?: boolean
  isOwn?: boolean
}

export type ScopeSnapshot = {
  type: "local" | "closure"
  name?: string
  objectId?: string
  properties: Record<string, PropertySnapshot>
  error?: string
}

export type FrameSnapshot = {
  index: number
  function: string
  url: string
  line: number
  column: number
  sourceKind?: "runtime" | "sourcemap"
  scriptId?: string
  callFrameId?: string
  scopes: {
    local: ScopeSnapshot[]
    closure: ScopeSnapshot[]
  }
}

export type InterpreterDump = {
  timestamp: string
  reason: string
  hitBreakpoints: string[]
  frames: FrameSnapshot[]
}
