import {
  equalNodeJsonValue,
  ownNodeJsonValue,
  type NodeJsonValue,
} from "./parameter.ts"

export const JSON_PATCH_LIMITS = Object.freeze({
  operations: 256,
  pathLength: 4_096,
  depth: 128,
})

export type JsonPatchOperation =
  | Readonly<{op: "add" | "replace" | "test"; path: string; value: NodeJsonValue}>
  | Readonly<{op: "remove"; path: string}>

export type JsonPatchErrorCode =
  | "invalid_patch"
  | "invalid_json"
  | "invalid_pointer"
  | "invalid_array_index"
  | "path_not_found"
  | "test_failed"
  | "limit_exceeded"

export class JsonPatchError extends Error {
  constructor(
    readonly code: JsonPatchErrorCode,
    message: string,
    readonly operationIndex: number | null = null,
    readonly path: string | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "JsonPatchError"
  }
}

type MutableJsonObject = {[key: string]: NodeJsonValue}
type MutableJsonContainer = NodeJsonValue[] | MutableJsonObject

type NormalizedJsonPatchOperation =
  | Readonly<{
      op: "add" | "replace" | "test"
      path: string
      tokens: readonly string[]
      value: NodeJsonValue
    }>
  | Readonly<{
      op: "remove"
      path: string
      tokens: readonly string[]
    }>

const CANONICAL_ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/

/** Encodes one RFC 6901 reference token without adding a leading slash. */
export function encodeJsonPointerToken(value: string): string {
  if (typeof value !== "string") throw new TypeError("JSON Pointer token must be a string")
  return value.replaceAll("~", "~0").replaceAll("/", "~1")
}

/**
 * Applies one bounded RFC 6902 subset to an owned clone and returns frozen JSON.
 * A failed operation never changes the supplied source or publishes partial work.
 */
export function applyJsonPatch(
  source: NodeJsonValue,
  operations: readonly JsonPatchOperation[],
): NodeJsonValue {
  const ownedSource = ownStrictJson(source, "JSON Patch source", null, null)
  const normalized = normalizeOperations(operations)
  let current = structuredClone(ownedSource) as NodeJsonValue

  for (const [operationIndex, operation] of normalized.entries()) {
    current = applyOperation(current, operation, operationIndex)
  }

  return ownStrictJson(current, "JSON Patch result", null, null)
}

function normalizeOperations(operations: readonly JsonPatchOperation[]): readonly NormalizedJsonPatchOperation[] {
  if (!Array.isArray(operations) || Object.getPrototypeOf(operations) !== Array.prototype) {
    fail("invalid_patch", "JSON Patch operations must be a plain array")
  }
  if (operations.length > JSON_PATCH_LIMITS.operations) {
    fail("limit_exceeded", `JSON Patch exceeds ${JSON_PATCH_LIMITS.operations} operations`)
  }

  const normalized: NormalizedJsonPatchOperation[] = []
  for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
    if (!Object.hasOwn(operations, operationIndex)) {
      fail("invalid_patch", "JSON Patch operations must not be sparse", operationIndex)
    }
    const operation = operations[operationIndex] as unknown
    if (!isPlainDataObject(operation)) {
      fail("invalid_patch", "JSON Patch operation must be a plain data object", operationIndex)
    }
    const op = plainDataMember(operation, "op", operationIndex, null)
    const path = plainDataMember(operation, "path", operationIndex, null)
    if (typeof op !== "string" || typeof path !== "string") {
      fail("invalid_patch", "JSON Patch operation requires string op and path", operationIndex)
    }
    const tokens = decodeJsonPointer(path, operationIndex)
    if (op === "remove") {
      requireExactKeys(operation, ["op", "path"], operationIndex, path)
      normalized.push(Object.freeze({op, path, tokens}))
      continue
    }
    if (op !== "add" && op !== "replace" && op !== "test") {
      fail("invalid_patch", `Unsupported JSON Patch operation: ${op}`, operationIndex, path)
    }
    requireExactKeys(operation, ["op", "path", "value"], operationIndex, path)
    const value = ownStrictJson(operation.value, `JSON Patch ${op} value`, operationIndex, path)
    normalized.push(Object.freeze({op, path, tokens, value}))
  }
  return Object.freeze(normalized)
}

function applyOperation(
  current: NodeJsonValue,
  operation: NormalizedJsonPatchOperation,
  operationIndex: number,
): NodeJsonValue {
  if (operation.tokens.length === 0) {
    if (operation.op === "remove") {
      fail("invalid_pointer", "Removing the JSON document root is not supported", operationIndex, operation.path)
    }
    if (operation.op === "test") {
      requireTest(current, operation.value, operationIndex, operation.path)
      return current
    }
    return cloneJson(operation.value)
  }

  const {parent, key} = resolveParent(current, operation.tokens, operationIndex, operation.path)
  if (Array.isArray(parent)) {
    applyArrayOperation(parent, key, operation, operationIndex)
  } else {
    applyObjectOperation(parent, key, operation, operationIndex)
  }
  return current
}

function resolveParent(
  root: NodeJsonValue,
  tokens: readonly string[],
  operationIndex: number,
  path: string,
): Readonly<{parent: MutableJsonContainer; key: string}> {
  let current = root
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = arrayIndex(token, operationIndex, path)
      if (index >= current.length) fail("path_not_found", `JSON Patch array member is missing: ${token}`, operationIndex, path)
      current = current[index]!
      continue
    }
    if (!isMutableJsonObject(current) || !Object.hasOwn(current, token)) {
      fail("path_not_found", `JSON Patch object member is missing: ${token}`, operationIndex, path)
    }
    current = current[token]!
  }
  if (!Array.isArray(current) && !isMutableJsonObject(current)) {
    fail("path_not_found", "JSON Patch parent is not a container", operationIndex, path)
  }
  return {parent: current, key: tokens.at(-1)!}
}

function applyArrayOperation(
  parent: NodeJsonValue[],
  key: string,
  operation: NormalizedJsonPatchOperation,
  operationIndex: number,
): void {
  if (operation.op === "add") {
    if (key === "-") {
      parent.push(cloneJson(operation.value))
      return
    }
    const index = arrayIndex(key, operationIndex, operation.path)
    if (index > parent.length) {
      fail("path_not_found", `JSON Patch add index is ahead: ${key}`, operationIndex, operation.path)
    }
    parent.splice(index, 0, cloneJson(operation.value))
    return
  }
  if (key === "-") {
    fail("invalid_array_index", "JSON Pointer '-' is valid only for array add", operationIndex, operation.path)
  }
  const index = arrayIndex(key, operationIndex, operation.path)
  if (index >= parent.length) {
    fail("path_not_found", `JSON Patch array member is missing: ${key}`, operationIndex, operation.path)
  }
  if (operation.op === "remove") {
    parent.splice(index, 1)
  } else if (operation.op === "replace") {
    parent[index] = cloneJson(operation.value)
  } else {
    requireTest(parent[index]!, operation.value, operationIndex, operation.path)
  }
}

function applyObjectOperation(
  parent: MutableJsonObject,
  key: string,
  operation: NormalizedJsonPatchOperation,
  operationIndex: number,
): void {
  const exists = Object.hasOwn(parent, key)
  if (operation.op === "add") {
    defineJsonMember(parent, key, cloneJson(operation.value))
    return
  }
  if (!exists) fail("path_not_found", `JSON Patch object member is missing: ${key}`, operationIndex, operation.path)
  if (operation.op === "remove") {
    delete parent[key]
  } else if (operation.op === "replace") {
    defineJsonMember(parent, key, cloneJson(operation.value))
  } else {
    requireTest(parent[key]!, operation.value, operationIndex, operation.path)
  }
}

function requireTest(
  actual: NodeJsonValue,
  expected: NodeJsonValue,
  operationIndex: number,
  path: string,
): void {
  if (!equalNodeJsonValue(actual, expected)) {
    fail("test_failed", `JSON Patch test failed: ${path || "<root>"}`, operationIndex, path)
  }
}

function decodeJsonPointer(path: string, operationIndex: number): readonly string[] {
  if (path.length > JSON_PATCH_LIMITS.pathLength) {
    fail("limit_exceeded", `JSON Pointer exceeds ${JSON_PATCH_LIMITS.pathLength} characters`, operationIndex, path)
  }
  if (path === "") return Object.freeze([])
  if (!path.startsWith("/")) {
    fail("invalid_pointer", "JSON Pointer must be empty or start with '/'", operationIndex, path)
  }
  const tokens = path.slice(1).split("/").map((token) => {
    if (/~(?:[^01]|$)/.test(token)) {
      fail("invalid_pointer", `JSON Pointer contains an invalid escape: ${path}`, operationIndex, path)
    }
    const decoded = token.replaceAll("~1", "/").replaceAll("~0", "~")
    return decoded
  })
  if (tokens.length > JSON_PATCH_LIMITS.depth) {
    fail("limit_exceeded", `JSON Pointer exceeds ${JSON_PATCH_LIMITS.depth} tokens`, operationIndex, path)
  }
  return Object.freeze(tokens)
}

function arrayIndex(token: string, operationIndex: number, path: string): number {
  if (!CANONICAL_ARRAY_INDEX.test(token)) {
    fail("invalid_array_index", `JSON Pointer array index is not canonical: ${token}`, operationIndex, path)
  }
  const index = Number(token)
  if (!Number.isSafeInteger(index)) {
    fail("invalid_array_index", `JSON Pointer array index is not safe: ${token}`, operationIndex, path)
  }
  return index
}

function ownStrictJson(
  value: unknown,
  label: string,
  operationIndex: number | null,
  path: string | null,
): NodeJsonValue {
  validateStrictJson(value, label, 0, new Set(), operationIndex, path)
  try {
    return ownNodeJsonValue(value as NodeJsonValue, label)
  } catch (error) {
    throw new JsonPatchError("invalid_json", `${label} is not JSON-compatible`, operationIndex, path, {cause: error})
  }
}

function validateStrictJson(
  value: unknown,
  label: string,
  depth: number,
  ancestors: Set<object>,
  operationIndex: number | null,
  path: string | null,
): void {
  if (depth > JSON_PATCH_LIMITS.depth) {
    fail("limit_exceeded", `${label} exceeds JSON depth ${JSON_PATCH_LIMITS.depth}`, operationIndex, path)
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid_json", `${label} contains a non-finite number`, operationIndex, path)
    return
  }
  if (typeof value !== "object") fail("invalid_json", `${label} contains a non-JSON value`, operationIndex, path)
  if (ancestors.has(value)) fail("invalid_json", `${label} contains a cycle`, operationIndex, path)
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        fail("invalid_json", `${label} contains a non-plain array`, operationIndex, path)
      }
      const keys = Reflect.ownKeys(value)
      if (keys.length !== value.length + 1) {
        fail("invalid_json", `${label} contains a sparse array or extra properties`, operationIndex, path)
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          fail("invalid_json", `${label}[${index}] is not a JSON data element`, operationIndex, path)
        }
        validateStrictJson(descriptor.value, `${label}[${index}]`, depth + 1, ancestors, operationIndex, path)
      }
      const length = Reflect.getOwnPropertyDescriptor(value, "length")
      if (length === undefined || length.enumerable || !("value" in length) || length.value !== value.length) {
        fail("invalid_json", `${label} has an invalid array length`, operationIndex, path)
      }
      return
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      fail("invalid_json", `${label} contains a non-plain object`, operationIndex, path)
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") fail("invalid_json", `${label} contains a symbol key`, operationIndex, path)
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        fail("invalid_json", `${label}.${key} is not an enumerable data member`, operationIndex, path)
      }
      validateStrictJson(descriptor.value, `${label}.${key}`, depth + 1, ancestors, operationIndex, path)
    }
  } finally {
    ancestors.delete(value)
  }
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  operationIndex: number,
  path: string,
): void {
  const actual = Reflect.ownKeys(value)
  if (actual.length !== expected.length || actual.some((key) => typeof key !== "string" || !expected.includes(key))) {
    fail("invalid_patch", "JSON Patch operation has unexpected or missing members", operationIndex, path)
  }
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail("invalid_patch", `JSON Patch operation member is not plain data: ${key}`, operationIndex, path)
    }
  }
}

function plainDataMember(
  value: Record<string, unknown>,
  key: string,
  operationIndex: number,
  path: string | null,
): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
    fail("invalid_patch", `JSON Patch operation member is not plain data: ${key}`, operationIndex, path)
  }
  return descriptor.value
}

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isMutableJsonObject(value: NodeJsonValue): value is MutableJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function defineJsonMember(target: MutableJsonObject, key: string, value: NodeJsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

function cloneJson<T extends NodeJsonValue>(value: T): T {
  return structuredClone(value) as T
}

function fail(
  code: JsonPatchErrorCode,
  message: string,
  operationIndex: number | null = null,
  path: string | null = null,
): never {
  throw new JsonPatchError(code, message, operationIndex, path)
}
