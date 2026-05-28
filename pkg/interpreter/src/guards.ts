import type {CallFrame, InspectorLocation, JsonObject, PropertyDescriptor, RemoteObject, Scope} from "./types.ts"

export function asObject(value: unknown): JsonObject | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject
  }
  return undefined
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

export function asCallFrames(value: unknown): CallFrame[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asCallFrame(item))
    .filter((item): item is CallFrame => item !== undefined)
}

export function asCallFrame(value: unknown): CallFrame | undefined {
  const object = asObject(value)
  if (object === undefined) return undefined

  const frame: CallFrame = {}
  const callFrameId = asString(object["callFrameId"])
  const functionName = asString(object["functionName"])
  const location = asLocation(object["location"])
  const scopeChain = asScopes(object["scopeChain"])
  const thisObject = asRemoteObject(object["this"])

  if (callFrameId !== undefined) frame.callFrameId = callFrameId
  if (functionName !== undefined) frame.functionName = functionName
  if (location !== undefined) frame.location = location
  if (scopeChain !== undefined) frame.scopeChain = scopeChain
  if (thisObject !== undefined) frame.this = thisObject

  return frame
}

export function asLocation(value: unknown): InspectorLocation | undefined {
  const object = asObject(value)
  if (object === undefined) return undefined

  const location: InspectorLocation = {}
  const scriptId = asString(object["scriptId"])
  const lineNumber = asNumber(object["lineNumber"])
  const columnNumber = asNumber(object["columnNumber"])

  if (scriptId !== undefined) location.scriptId = scriptId
  if (lineNumber !== undefined) location.lineNumber = lineNumber
  if (columnNumber !== undefined) location.columnNumber = columnNumber

  return location
}

export function asScopes(value: unknown): Scope[] | undefined {
  if (!Array.isArray(value)) return undefined

  return value
    .map((item) => {
      const object = asObject(item)
      if (object === undefined) return undefined

      const scope: Scope = {}
      const type = asString(object["type"])
      const name = asString(object["name"])
      const remoteObject = asRemoteObject(object["object"])
      const location = asLocation(object["location"])

      if (type !== undefined) scope.type = type
      if (name !== undefined) scope.name = name
      if (remoteObject !== undefined) scope.object = remoteObject
      if (location !== undefined) scope.location = location

      return scope
    })
    .filter((item): item is Scope => item !== undefined)
}

export function asPropertyDescriptors(value: unknown): PropertyDescriptor[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const object = asObject(item)
      if (object === undefined) return undefined

      const descriptor: PropertyDescriptor = {}
      const name = asString(object["name"])
      const valueObject = asRemoteObject(object["value"])
      const getObject = asRemoteObject(object["get"])
      const setObject = asRemoteObject(object["set"])
      const wasThrown = asBoolean(object["wasThrown"])
      const enumerable = asBoolean(object["enumerable"])
      const configurable = asBoolean(object["configurable"])
      const writable = asBoolean(object["writable"])
      const isOwn = asBoolean(object["isOwn"])

      if (name !== undefined) descriptor.name = name
      if (valueObject !== undefined) descriptor.value = valueObject
      if (getObject !== undefined) descriptor.get = getObject
      if (setObject !== undefined) descriptor.set = setObject
      if (wasThrown !== undefined) descriptor.wasThrown = wasThrown
      if (enumerable !== undefined) descriptor.enumerable = enumerable
      if (configurable !== undefined) descriptor.configurable = configurable
      if (writable !== undefined) descriptor.writable = writable
      if (isOwn !== undefined) descriptor.isOwn = isOwn

      return descriptor
    })
    .filter((item): item is PropertyDescriptor => item !== undefined)
}

export function asRemoteObject(value: unknown): RemoteObject | undefined {
  const object = asObject(value)
  if (object === undefined) return undefined

  const remoteObject: RemoteObject = {}
  const type = asString(object["type"])
  const subtype = asString(object["subtype"])
  const className = asString(object["className"])
  const unserializableValue = asString(object["unserializableValue"])
  const description = asString(object["description"])
  const objectId = asString(object["objectId"])

  if (type !== undefined) remoteObject.type = type
  if (subtype !== undefined) remoteObject.subtype = subtype
  if (className !== undefined) remoteObject.className = className
  if (object["value"] !== undefined) remoteObject.value = object["value"]
  if (unserializableValue !== undefined) remoteObject.unserializableValue = unserializableValue
  if (description !== undefined) remoteObject.description = description
  if (objectId !== undefined) remoteObject.objectId = objectId
  if (object["preview"] !== undefined) remoteObject.preview = object["preview"]

  return remoteObject
}
