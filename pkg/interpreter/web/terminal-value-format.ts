const MAX_DEPTH = 5
const MAX_PROPERTIES = 1000
const MAX_STRING_LENGTH = 260

export type PropertyLoader = (objectId: string) => Promise<unknown>

type FormatContext = {
  loadProperties: PropertyLoader
  seen: Set<string>
}

type PropertyDescriptorLike = {
  name: string
  value?: Record<string, unknown>
  get?: Record<string, unknown>
  set?: Record<string, unknown>
  wasThrown?: boolean
  enumerable?: boolean
}

export async function formatTerminalExpressionResult(result: unknown, loadProperties: PropertyLoader): Promise<string> {
  const remote = responseRemoteObject(result)
  if (remote !== null) {
    return await formatRemoteObject(remote, {
      loadProperties,
      seen: new Set<string>(),
    }, 0)
  }
  return formatPlainValue(result)
}

function responseRemoteObject(result: unknown): Record<string, unknown> | null {
  const object = asRecord(result)
  if (object === null) return null
  const remote = asRecord(object["result"])
  return remote
}

async function formatRemoteObject(remote: Record<string, unknown>, context: FormatContext, depth: number): Promise<string> {
  if (remote["wasThrown"] === true) return `${ansiRed("thrown")} ${remoteDescription(remote)}`
  if ("value" in remote) return formatPlainValue(remote["value"])
  if (typeof remote["unserializableValue"] === "string") return ansiOrange(remote["unserializableValue"])

  const type = typeof remote["type"] === "string" ? remote["type"] : ""
  const subtype = typeof remote["subtype"] === "string" ? remote["subtype"] : ""
  if (type === "undefined") return ansiMuted("undefined")
  if (subtype === "null") return ansiMuted("null")
  if (type === "function") return ansiViolet(functionPreview(remoteDescription(remote)))

  const objectId = typeof remote["objectId"] === "string" ? remote["objectId"] : undefined
  if (objectId !== undefined && depth < MAX_DEPTH) {
    const expanded = await formatExpandableObject(remote, objectId, context, depth)
    if (expanded !== null) return expanded
  }

  const description = remoteDescription(remote)
  if (description.length > 0) return ansiBlue(description)
  return type.length > 0 ? ansiBlue(type) : formatPlainValue(remote)
}

async function formatExpandableObject(
  remote: Record<string, unknown>,
  objectId: string,
  context: FormatContext,
  depth: number,
): Promise<string | null> {
  if (context.seen.has(objectId)) return ansiMuted("[Circular]")
  context.seen.add(objectId)
  try {
    const descriptors = propertyDescriptors(await context.loadProperties(objectId))
    const visible = visibleProperties(descriptors, typeof remote["subtype"] === "string" ? remote["subtype"] : "")
    if (visible.length === 0) return null
    if (remote["subtype"] === "array") return await formatArrayProperties(visible, context, depth)
    return await formatObjectProperties(visible, context, depth)
  } catch {
    return null
  } finally {
    context.seen.delete(objectId)
  }
}

async function formatObjectProperties(properties: PropertyDescriptorLike[], context: FormatContext, depth: number): Promise<string> {
  const shown = properties.slice(0, MAX_PROPERTIES)
  const pad = "  ".repeat(depth)
  const childPad = "  ".repeat(depth + 1)
  const lines: string[] = [ansiMuted("{")]
  for (let index = 0; index < shown.length; index++) {
    const property = shown[index]
    if (property === undefined) continue
    const comma = index === shown.length - 1 && shown.length === properties.length ? "" : ansiMuted(",")
    lines.push(`${childPad}${formatPropertyName(property.name)}${ansiMuted(":")} ${await formatPropertyValue(property, context, depth + 1)}${comma}`)
  }
  if (shown.length < properties.length) {
    lines.push(`${childPad}${ansiMuted(`... ${properties.length - shown.length} more`)}`)
  }
  lines.push(`${pad}${ansiMuted("}")}`)
  return lines.join("\n")
}

async function formatArrayProperties(properties: PropertyDescriptorLike[], context: FormatContext, depth: number): Promise<string> {
  const indexed = properties
    .filter((property) => /^\d+$/.test(property.name))
    .sort((a, b) => Number(a.name) - Number(b.name))
  if (indexed.length === 0) return ansiMuted("[]")

  const shown = indexed.slice(0, MAX_PROPERTIES)
  const pad = "  ".repeat(depth)
  const childPad = "  ".repeat(depth + 1)
  const lines: string[] = [ansiMuted("[")]
  for (let index = 0; index < shown.length; index++) {
    const property = shown[index]
    if (property === undefined) continue
    const comma = index === shown.length - 1 && shown.length === indexed.length ? "" : ansiMuted(",")
    lines.push(`${childPad}${await formatPropertyValue(property, context, depth + 1)}${comma}`)
  }
  if (shown.length < indexed.length) {
    lines.push(`${childPad}${ansiMuted(`... ${indexed.length - shown.length} more`)}`)
  }
  lines.push(`${pad}${ansiMuted("]")}`)
  return lines.join("\n")
}

async function formatPropertyValue(property: PropertyDescriptorLike, context: FormatContext, depth: number): Promise<string> {
  if (property.wasThrown === true) return ansiRed("[Thrown]")
  if (property.value !== undefined) return await formatRemoteObject(property.value, context, depth)
  if (property.get !== undefined && property.set !== undefined) return ansiViolet("[Getter/Setter]")
  if (property.get !== undefined) return ansiViolet("[Getter]")
  if (property.set !== undefined) return ansiViolet("[Setter]")
  return ansiMuted("undefined")
}

function propertyDescriptors(response: unknown): PropertyDescriptorLike[] {
  const object = asRecord(response)
  const result = protocolDescriptorItems(object)
  const out: PropertyDescriptorLike[] = []
  for (const item of result) {
    const descriptor = asRecord(item)
    if (descriptor === null) continue
    const name = typeof descriptor["name"] === "string" ? descriptor["name"] : undefined
    if (name === undefined || name === "__proto__") continue
    const value = asRecord(descriptor["value"]) ?? undefined
    const get = asRecord(descriptor["get"]) ?? undefined
    const set = asRecord(descriptor["set"]) ?? undefined
    const property: PropertyDescriptorLike = {name}
    if (value !== undefined) property.value = value
    if (get !== undefined) property.get = get
    if (set !== undefined) property.set = set
    if (typeof descriptor["wasThrown"] === "boolean") property.wasThrown = descriptor["wasThrown"]
    if (typeof descriptor["enumerable"] === "boolean") property.enumerable = descriptor["enumerable"]
    out.push(property)
  }
  return out
}

function protocolDescriptorItems(object: Record<string, unknown> | null): unknown[] {
  if (object === null) return []
  const out: unknown[] = []
  if (Array.isArray(object["result"])) out.push(...object["result"])
  if (Array.isArray(object["properties"])) out.push(...object["properties"])
  if (Array.isArray(object["internalProperties"])) out.push(...object["internalProperties"])
  return out
}

function visibleProperties(properties: PropertyDescriptorLike[], subtype: string): PropertyDescriptorLike[] {
  const enumerable = properties.filter((property) => property.enumerable !== false)
  if (subtype === "array") return enumerable.filter((property) => property.name !== "length")
  if (enumerable.length > 0) return enumerable
  return properties.filter((property) => property.name !== "length")
}

function formatPropertyName(name: string): string {
  const text = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)
  return ansiCyan(text)
}

function formatPlainValue(value: unknown): string {
  if (value === undefined) return ansiMuted("undefined")
  if (value === null) return ansiMuted("null")
  if (typeof value === "string") return ansiGreen(JSON.stringify(truncateString(value)))
  if (typeof value === "number") return ansiOrange(Number.isFinite(value) ? String(value) : JSON.stringify(String(value)))
  if (typeof value === "boolean") return ansiOrange(value ? "true" : "false")
  if (typeof value === "bigint") return ansiOrange(`${value}n`)
  try {
    return ansiBlue(JSON.stringify(value))
  } catch {
    return ansiBlue(String(value))
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}...`
}

function functionPreview(description: string): string {
  if (description.length === 0) return "function"
  const first = description.split("\n")[0]?.trim() ?? ""
  return first.length > 0 ? first : "function"
}

function remoteDescription(remote: Record<string, unknown>): string {
  if (typeof remote["description"] === "string") return remote["description"]
  if (typeof remote["className"] === "string") return remote["className"]
  return ""
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function ansiMuted(value: string): string {
  return `\x1b[90m${value}\x1b[0m`
}

function ansiCyan(value: string): string {
  return `\x1b[36m${value}\x1b[0m`
}

function ansiGreen(value: string): string {
  return `\x1b[32m${value}\x1b[0m`
}

function ansiOrange(value: string): string {
  return `\x1b[33m${value}\x1b[0m`
}

function ansiBlue(value: string): string {
  return `\x1b[34m${value}\x1b[0m`
}

function ansiViolet(value: string): string {
  return `\x1b[35m${value}\x1b[0m`
}

function ansiRed(value: string): string {
  return `\x1b[31m${value}\x1b[0m`
}
