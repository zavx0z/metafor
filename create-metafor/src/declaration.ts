import ts from "typescript"
import type {
  MetaDeclarationRequest,
  MetaOptionalFieldDeclaration,
} from "@metafor/types/metafor/authoring"
import type {MetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldDSL} from "@metafor/types/metafor/schema"
import type {ForceMessageInput} from "shared/protocol/force/message"

export type DeclarationPatchErrorCode =
  | "meta_missing"
  | "unsupported_fields_source"
  | "field_missing"
  | "field_duplicated"
  | "field_not_optional"
  | "field_not_tail"

export class DeclarationPatchError extends Error {
  override readonly name = "DeclarationPatchError"

  constructor(readonly code: DeclarationPatchErrorCode, message: string) {
    super(message)
  }
}

export interface DeclarationMetaSnapshot {
  address: MetaAddress
  targetPath: string
  source: string
  fields: readonly MetaFieldDSL[]
}

export interface DeclarationSourceEdit {
  address: MetaAddress
  targetPath: string
  beforeSource: string
  afterSource: string
}

export interface MetaDeclarationPatchPlan {
  particle: ForceMessageInput
  sourceEdits: DeclarationSourceEdit[]
}

type FieldsObjectRange = {
  start: number
  end: number
  callIndent: string
}

const unwrap = (value: ts.Expression): ts.Expression => {
  let current = value
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression
  return current
}

const returnedExpression = (value: ts.Expression): ts.Expression | null => {
  const callback = unwrap(value)
  if (ts.isArrowFunction(callback) && !ts.isBlock(callback.body)) return unwrap(callback.body)
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null
  if (!ts.isBlock(callback.body)) return null
  const returned = callback.body.statements.filter(ts.isReturnStatement)
  return returned.length === 1 && returned[0]!.expression
    ? unwrap(returned[0]!.expression!)
    : null
}

const fieldsObjectRange = (source: string): FieldsObjectRange => {
  const file = ts.createSourceFile("meta.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const objects: ts.ObjectLiteralExpression[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "fields" &&
      node.arguments.length === 1
    ) {
      const returned = returnedExpression(node.arguments[0]!)
      if (returned && ts.isObjectLiteralExpression(returned)) objects.push(returned)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (objects.length !== 1) {
    throw new DeclarationPatchError(
      "unsupported_fields_source",
      "meta.ts must contain exactly one .fields callback returning an object literal",
    )
  }
  const object = objects[0]!
  if (object.properties.some((property) => !ts.isPropertyAssignment(property))) {
    throw new DeclarationPatchError(
      "unsupported_fields_source",
      "Field source accepts only explicit property assignments",
    )
  }
  const start = object.getStart(file)
  const end = object.getEnd()
  const lineStart = source.lastIndexOf("\n", start) + 1
  const callIndent = /^\s*/.exec(source.slice(lineStart, start))?.[0] ?? ""
  return {start, end, callIndent}
}

const json = (value: unknown): string => {
  const rendered = JSON.stringify(value)
  if (rendered === undefined) throw new DeclarationPatchError("unsupported_fields_source", "Field contains non-JSON data")
  return rendered
}

const options = (field: MetaFieldDSL): string | null => {
  const entries: string[] = []
  if (typeof field.label === "string") entries.push(`label: ${json(field.label)}`)
  if (field.id === true) entries.push("id: true")
  if (field.type === "array" && typeof field.data === "string") entries.push(`data: ${json(field.data)}`)
  return entries.length === 0 ? null : `{ ${entries.join(", ")} }`
}

const renderField = (field: MetaFieldDSL): string => {
  const config = options(field)
  const hasDefault = Object.hasOwn(field, "default") && field.default !== undefined
  const args = [
    ...(hasDefault ? [json(field.default)] : []),
    ...(config ? [config] : []),
  ].join(", ")
  if (field.type === "enum") {
    const values = (field.values ?? []).map(json).join(", ")
    return `field.enum(${values}).${field.required === true ? "required" : "optional"}(${args})`
  }
  return `field.${field.type}.${field.required === true ? "required" : "optional"}(${args})`
}

const propertyKey = (key: string): string =>
  /^[$A-Z_a-z][$\w]*$/u.test(key) ? key : json(key)

const replaceFieldsObject = (snapshot: DeclarationMetaSnapshot, fields: readonly MetaFieldDSL[]): string => {
  const range = fieldsObjectRange(snapshot.source)
  const childIndent = `${range.callIndent}  `
  const object = fields.length === 0
    ? "{}"
    : `{\n${fields.map((field) => `${childIndent}${propertyKey(field.key)}: ${renderField(field)},`).join("\n")}\n${range.callIndent}}`
  return snapshot.source.slice(0, range.start) + object + snapshot.source.slice(range.end)
}

const cloneField = (field: MetaFieldDSL): MetaFieldDSL => structuredClone(field)

const requestField = (field: MetaOptionalFieldDeclaration): MetaFieldDSL => structuredClone(field) as MetaFieldDSL

const snapshot = (
  snapshots: ReadonlyMap<MetaAddress, DeclarationMetaSnapshot>,
  address: MetaAddress,
): DeclarationMetaSnapshot => {
  const current = snapshots.get(address)
  if (!current) throw new DeclarationPatchError("meta_missing", `Meta snapshot is missing: ${address}`)
  return current
}

const fieldIndex = (current: DeclarationMetaSnapshot, key: string): number => {
  const matches = current.fields.flatMap((field, index) => field.key === key ? [index] : [])
  if (matches.length === 0) throw new DeclarationPatchError("field_missing", `Field ${current.address}/${key} is absent`)
  if (matches.length !== 1) throw new DeclarationPatchError("field_duplicated", `Field ${current.address}/${key} is duplicated`)
  return matches[0]!
}

const assertOptional = (current: DeclarationMetaSnapshot, index: number): void => {
  if (current.fields[index]!.required === true) {
    throw new DeclarationPatchError(
      "field_not_optional",
      `Field ${current.address}/${current.fields[index]!.key} is required`,
    )
  }
}

const assertTail = (current: DeclarationMetaSnapshot, index: number): void => {
  if (index !== current.fields.length - 1) {
    throw new DeclarationPatchError(
      "field_not_tail",
      `Field ${current.address}/${current.fields[index]!.key} must be the last declared Field`,
    )
  }
}

const sameStrings = (left: readonly string[] | undefined, right: readonly string[] | undefined): boolean =>
  (left ?? []).length === (right ?? []).length && (left ?? []).every((value, index) => value === right?.[index])

const variantDescriptors = (fields: readonly MetaFieldDSL[], fieldPosition: number): Array<{
  id: number
  position: number
  value: string
}> => {
  let id = 0
  for (let index = 0; index < fields.length; index++) {
    const values = fields[index]!.type === "enum" ? fields[index]!.values ?? [] : []
    if (index === fieldPosition) return values.map((value, position) => ({id: ++id, position, value}))
    id += values.length
  }
  return []
}

const fieldValue = (
  address: MetaAddress,
  fields: readonly MetaFieldDSL[],
  index: number,
): Record<string, unknown> => {
  const field = fields[index]!
  const {values: _values, ...definition} = structuredClone(field)
  return {
    wimp: address,
    id: index + 1,
    ...definition,
    variants: variantDescriptors(fields, index),
  }
}

const edit = (snapshot: DeclarationMetaSnapshot, fields: readonly MetaFieldDSL[]): DeclarationSourceEdit => ({
  address: snapshot.address,
  targetPath: snapshot.targetPath,
  beforeSource: snapshot.source,
  afterSource: replaceFieldsObject(snapshot, fields),
})

export const planMetaDeclarationPatch = (
  request: MetaDeclarationRequest,
  inputs: readonly DeclarationMetaSnapshot[],
  timestamp = Date.now(),
): MetaDeclarationPatchPlan => {
  const snapshots = new Map(inputs.map((input) => [input.address, input] as const))
  if (request.operation === "add") {
    const current = snapshot(snapshots, request.address)
    if (current.fields.some((field) => field.key === request.field.key)) {
      throw new DeclarationPatchError("field_duplicated", `Field ${current.address}/${request.field.key} already exists`)
    }
    const fields = [...current.fields.map(cloneField), requestField(request.field)]
    return {
      particle: {parts: [{part: "inflaton", op: "add", path: "field", ts: timestamp, value: fieldValue(current.address, fields, fields.length - 1)}]},
      sourceEdits: [edit(current, fields)],
    }
  }

  if (request.operation === "replace") {
    const current = snapshot(snapshots, request.address)
    const index = fieldIndex(current, request.key)
    assertOptional(current, index)
    if (request.field.key !== request.key && current.fields.some((field) => field.key === request.field.key)) {
      throw new DeclarationPatchError("field_duplicated", `Field ${current.address}/${request.field.key} already exists`)
    }
    if (!sameStrings(current.fields[index]!.values, request.field.type === "enum" ? request.field.values : undefined)) {
      assertTail(current, index)
    }
    const fields = current.fields.map(cloneField)
    fields[index] = requestField(request.field)
    return {
      particle: {parts: [{part: "inflaton", op: "replace", path: "field", ts: timestamp, value: fieldValue(current.address, fields, index)}]},
      sourceEdits: [edit(current, fields)],
    }
  }

  if (request.operation === "remove") {
    const current = snapshot(snapshots, request.address)
    const index = fieldIndex(current, request.key)
    assertOptional(current, index)
    assertTail(current, index)
    const fields = current.fields.slice(0, index).map(cloneField)
    return {
      particle: {parts: [{part: "inflaton", op: "remove", path: "field", ts: timestamp, value: {wimp: current.address, id: index + 1}}]},
      sourceEdits: [edit(current, fields)],
    }
  }

  const source = snapshot(snapshots, request.fromAddress)
  const target = snapshot(snapshots, request.toAddress)
  const index = fieldIndex(source, request.key)
  assertOptional(source, index)
  assertTail(source, index)
  if (target.fields.some((field) => field.key === request.key)) {
    throw new DeclarationPatchError("field_duplicated", `Field ${target.address}/${request.key} already exists`)
  }
  const moved = cloneField(source.fields[index]!)
  const sourceFields = source.fields.slice(0, index).map(cloneField)
  const targetFields = [...target.fields.map(cloneField), moved]
  return {
    particle: {parts: [{
      part: "inflaton",
      op: "move",
      path: "field",
      from: `${source.address}#${index + 1}`,
      ts: timestamp,
      value: fieldValue(target.address, targetFields, targetFields.length - 1),
    }]},
    sourceEdits: [edit(source, sourceFields), edit(target, targetFields)]
      .sort((left, right) => left.address.localeCompare(right.address)),
  }
}
