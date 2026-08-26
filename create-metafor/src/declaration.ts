import {parseSync, Visitor, type OxcError} from "oxc-parser"
import type {
  ArrayExpression,
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Function as FunctionNode,
  Node,
  ObjectExpression,
  ObjectProperty,
  Program,
} from "@oxc-project/types"
import {dirname, resolve} from "node:path"
import type {
  MetaBulkDeclaration,
  MetaDeclarationRequest,
  MetaMassDeclaration,
  MetaOptionalFieldDeclaration,
  MetaProcessDeclaration,
  MetaReactionDeclaration,
  MetaSourcePrecondition,
  MetaStateDeclaration,
} from "shared/protocol/metafor/authoring"
import type {MetaAddress} from "@metafor/types/metafor/graph"
import type {
  BulkSchema,
  MetaFieldDSL,
  MetaMassDSL,
  MetaProcessDSL,
  MetaReactionDSL,
  MetaSuperpositionDSL,
} from "@metafor/types/metafor/schema"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {normalizeFunctionString, parseFunction, updateAppendArg} from "../dsl/action.ts"

export type DeclarationPatchErrorCode =
  | "meta_missing"
  | "unsupported_fields_source"
  | "field_missing"
  | "field_duplicated"
  | "field_not_optional"
  | "field_not_tail"
  | "unsupported_declaration_source"
  | "declaration_missing"
  | "declaration_duplicated"
  | "declaration_not_tail"
  | "declaration_referenced"
  | "invalid_declaration"

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
  name?: string
  description?: string
  fields: readonly MetaFieldDSL[]
  states?: readonly MetaSuperpositionDSL[]
  mass?: readonly MetaMassDSL[]
  processes?: readonly MetaProcessDSL[]
  reactions?: readonly MetaReactionDSL[]
  bulk?: BulkSchema
}

export interface DeclarationSourceEdit {
  address: MetaAddress
  targetPath: string
  relativePath?: "meta.ts" | `actions/${string}.ts`
  expectedRevision?: MetaSourcePrecondition
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

const unwrap = (value: Expression): Expression => {
  let current = value
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression"
  ) current = current.expression
  return current
}

const returnedExpression = (value: Expression): Expression | null => {
  const callback = unwrap(value)
  if (callback.type === "ArrowFunctionExpression" && callback.body.type !== "BlockStatement") {
    return unwrap(callback.body)
  }
  if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") return null
  if (!callback.body || callback.body.type !== "BlockStatement") return null
  const returned = callback.body.body.filter((statement) => statement.type === "ReturnStatement")
  return returned.length === 1 && returned[0]!.argument
    ? unwrap(returned[0]!.argument!)
    : null
}

const fieldsObjectRange = (source: string): FieldsObjectRange => {
  const file = parsedSource(source)
  const objects: ObjectExpression[] = []
  new Visitor({
    CallExpression(node) {
      if (memberName(node.callee) !== "fields" || node.arguments.length !== 1) return
      const argument = node.arguments[0]
      if (!argument || argument.type === "SpreadElement") return
      const returned = returnedExpression(argument)
      if (returned?.type === "ObjectExpression") objects.push(returned)
    },
  }).visit(file.program)
  if (objects.length !== 1) {
    throw new DeclarationPatchError(
      "unsupported_fields_source",
      "meta.ts must contain exactly one .fields callback returning an object literal",
    )
  }
  const object = objects[0]!
  if (object.properties.some((property) => property.type !== "Property")) {
    throw new DeclarationPatchError(
      "unsupported_fields_source",
      "Field source accepts only explicit property assignments",
    )
  }
  const start = object.start
  const end = object.end
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

type ExpressionRange = {start: number; end: number; indent: string}

type ParsedSource = {
  program: Program
  errors: readonly OxcError[]
}

const parsedSource = (source: string, path = "meta.ts"): ParsedSource => {
  const parsed = parseSync(path, source, {preserveParens: true})
  return {program: parsed.program, errors: parsed.errors}
}

const memberName = (value: Expression): string | null =>
  value.type === "MemberExpression" &&
  !value.computed &&
  value.property.type === "Identifier"
    ? value.property.name
    : null

const nodeIndent = (source: string, start: number): string => {
  const lineStart = source.lastIndexOf("\n", start) + 1
  return /^\s*/.exec(source.slice(lineStart, start))?.[0] ?? ""
}

const chainCalls = (source: string, method: string): {file: ParsedSource; calls: CallExpression[]} => {
  const file = parsedSource(source)
  const calls: CallExpression[] = []
  new Visitor({
    CallExpression(node) {
      if (memberName(node.callee) === method) calls.push(node)
    },
  }).visit(file.program)
  return {file, calls}
}

const callbackLiteralRange = (
  source: string,
  method: "mass" | "reactions",
  kind: "object" | "array",
): {range: ExpressionRange; expression: ObjectExpression | ArrayExpression; file: ParsedSource} => {
  const {file, calls} = chainCalls(source, method)
  if (calls.length !== 1 || calls[0]!.arguments.length !== 1) {
    throw new DeclarationPatchError("unsupported_declaration_source", `meta.ts must contain one canonical .${method} callback`)
  }
  const argument = calls[0]!.arguments[0]!
  const returned = argument.type === "SpreadElement" ? null : returnedExpression(argument)
  const matches = kind === "object"
    ? returned?.type === "ObjectExpression"
    : returned?.type === "ArrayExpression"
  if (!returned || !matches) {
    throw new DeclarationPatchError("unsupported_declaration_source", `.${method} callback must return an explicit ${kind} literal`)
  }
  const expression = returned as ObjectExpression | ArrayExpression
  return {
    file,
    expression,
    range: {start: expression.start, end: expression.end, indent: nodeIndent(source, expression.start)},
  }
}

const stateObjectLiteral = (snapshot: DeclarationMetaSnapshot): {
  file: ParsedSource
  expression: ObjectExpression
  range: ExpressionRange
} => {
  const {file, calls} = chainCalls(snapshot.source, "superposition")
  if (calls.length !== 1 || calls[0]!.arguments.length !== 1) {
    throw new DeclarationPatchError("unsupported_declaration_source", "meta.ts must contain one canonical .superposition object")
  }
  const argument = calls[0]!.arguments[0]!
  const expression = argument.type === "SpreadElement" ? null : unwrap(argument)
  if (!expression || expression.type !== "ObjectExpression") {
    throw new DeclarationPatchError("unsupported_declaration_source", ".superposition must receive an explicit object literal")
  }
  if (expression.properties.some((property) => property.type !== "Property")) {
    throw new DeclarationPatchError("unsupported_declaration_source", "State source accepts explicit property assignments only")
  }
  const states = snapshot.states ?? []
  if (expression.properties.length !== states.length) {
    throw new DeclarationPatchError("unsupported_declaration_source", "State source and normalized declaration differ")
  }
  expression.properties.forEach((property, index) => {
    if (property.type !== "Property") return
    const name = property.key.type === "Identifier" ||
      (property.key.type === "Literal" && typeof property.key.value === "string")
      ? property.key.type === "Identifier" ? property.key.name : property.key.value
      : null
    if (name !== states[index]!.name) {
      throw new DeclarationPatchError("unsupported_declaration_source", "State source order differs from normalized declaration")
    }
  })
  return {
    file,
    expression,
    range: {
      start: expression.start,
      end: expression.end,
      indent: nodeIndent(snapshot.source, expression.start),
    },
  }
}

const replaceRange = (source: string, range: ExpressionRange, replacement: string): string =>
  source.slice(0, range.start) + replacement + source.slice(range.end)

const indentBlock = (value: string, indent: string): string =>
  value.split("\n").map((line, index) => index === 0 ? line : `${indent}${line}`).join("\n")

const metadataSource = (snapshot: DeclarationMetaSnapshot, metadata: {name: string; description?: string}): string => {
  const file = parsedSource(snapshot.source)
  const calls: CallExpression[] = []
  new Visitor({
    CallExpression(node) {
      if (node.callee.type === "Identifier" && node.callee.name === "MetaFor") calls.push(node)
    },
  }).visit(file.program)
  const call = calls[0]
  const firstArgument = call?.arguments[0]
  const firstExpression = firstArgument && firstArgument.type !== "SpreadElement"
    ? unwrap(firstArgument)
    : null
  if (
    calls.length !== 1 || !call || call.arguments.length < 1 || call.arguments.length > 2 ||
    !firstExpression || firstExpression.type !== "Literal" || typeof firstExpression.value !== "string"
  ) {
    throw new DeclarationPatchError("unsupported_declaration_source", "meta.ts must contain one canonical MetaFor(name, config?) call")
  }
  const first = call.arguments[0]!
  const last = call.arguments.at(-1)!
  const args = `${json(metadata.name)}${metadata.description === undefined ? "" : `, { desc: ${json(metadata.description)} }`}`
  return snapshot.source.slice(0, first.start) + args + snapshot.source.slice(last.end)
}

const renderState = (state: MetaSuperpositionDSL, indent: string): string =>
  `${propertyKey(state.name)}: ${indentBlock(JSON.stringify(state.transitions ?? null, null, 2), indent)}`

const appendStateSource = (snapshot: DeclarationMetaSnapshot, state: MetaSuperpositionDSL): string => {
  const {expression, range} = stateObjectLiteral(snapshot)
  if (expression.properties.length === 0) {
    const childIndent = `${range.indent}  `
    return replaceRange(
      snapshot.source,
      range,
      `{\n${childIndent}${renderState(state, childIndent)},\n${range.indent}}`,
    )
  }
  const close = range.end - 1
  const last = expression.properties.at(-1)!
  const between = snapshot.source.slice(last.end, close)
  const comma = between.includes(",") ? "" : ","
  const childIndent = `${range.indent}  `
  return snapshot.source.slice(0, last.end) + comma +
    snapshot.source.slice(last.end, close) +
    `  ${renderState(state, childIndent)},\n${range.indent}` +
    snapshot.source.slice(close)
}

const replaceStateSource = (
  snapshot: DeclarationMetaSnapshot,
  index: number,
  state: MetaSuperpositionDSL,
): string => {
  const {expression, range} = stateObjectLiteral(snapshot)
  const property = expression.properties[index]!
  const childIndent = `${range.indent}  `
  return snapshot.source.slice(0, property.start) + renderState(state, childIndent) +
    snapshot.source.slice(property.end)
}

const removeStateSource = (snapshot: DeclarationMetaSnapshot, index: number): string => {
  const {expression, range} = stateObjectLiteral(snapshot)
  if (expression.properties.length === 1) return replaceRange(snapshot.source, range, "{}")
  const property = expression.properties[index]!
  const start = property.start
  const lineStart = snapshot.source.lastIndexOf("\n", start) + 1
  const relativeStart = lineStart + range.indent.length
  return snapshot.source.slice(0, relativeStart) + snapshot.source.slice(range.end - 1)
}

const renderMass = (mass: MetaMassDSL): string => {
  const entries: string[] = []
  if (mass.label !== undefined) entries.push(`label: ${json(mass.label)}`)
  if (mass.description !== undefined) entries.push(`description: ${json(mass.description)}`)
  return `mass.${mass.format}(${entries.length === 0 ? "" : `{ ${entries.join(", ")} }`})`
}

const massSource = (snapshot: DeclarationMetaSnapshot, declarations: readonly MetaMassDSL[]): string => {
  const {range, expression} = callbackLiteralRange(snapshot.source, "mass", "object")
  if ((expression as ObjectExpression).properties.some((property) => property.type !== "Property")) {
    throw new DeclarationPatchError("unsupported_declaration_source", "Mass source accepts explicit property assignments only")
  }
  const childIndent = `${range.indent}  `
  const object = declarations.length === 0
    ? "{}"
    : `{\n${declarations.map((mass) => `${childIndent}${propertyKey(mass.key)}: ${renderMass(mass)},`).join("\n")}\n${range.indent}}`
  return replaceRange(snapshot.source, range, object)
}

const reactionSourceEntries = (snapshot: DeclarationMetaSnapshot): string[] => {
  const reactions = snapshot.reactions ?? []
  const {expression} = callbackLiteralRange(snapshot.source, "reactions", "array")
  const array = expression as ArrayExpression
  if (array.elements.some((element) => element?.type === "SpreadElement") || array.elements.length !== reactions.length) {
    throw new DeclarationPatchError("unsupported_declaration_source", "Reaction source must contain one explicit tuple per normalized Reaction")
  }
  return array.elements.map((element) => {
    if (!element) throw new DeclarationPatchError("unsupported_declaration_source", "Reaction source cannot contain array holes")
    return snapshot.source.slice(element.start, element.end)
  })
}

const renderReaction = (reaction: MetaReactionDeclaration): string => {
  const mass = reaction.massRead.length === 0 && reaction.massWrite.length === 0
    ? []
    : [`mass: ${json({read: reaction.massRead, write: reaction.massWrite})}`]
  const config = [
    `key: ${json(reaction.key)}`,
    `label: ${json(reaction.label)}`,
    ...(reaction.description === undefined ? [] : [`desc: ${json(reaction.description)}`]),
    ...mass,
  ].join(", ")
  return `[${json(reaction.states)}, reaction({ ${config} }).filter(${json(reaction.sources)}).equal(${reaction.src})]`
}

const reactionsSource = (snapshot: DeclarationMetaSnapshot, entries: readonly string[]): string => {
  const {range} = callbackLiteralRange(snapshot.source, "reactions", "array")
  const childIndent = `${range.indent}  `
  const array = entries.length === 0
    ? "[]"
    : `[\n${entries.map((entry) => `${childIndent}${indentBlock(entry, childIndent)},`).join("\n")}\n${range.indent}]`
  return replaceRange(snapshot.source, range, array)
}

const processSourceEntries = (snapshot: DeclarationMetaSnapshot): string[] => {
  const processes = snapshot.processes ?? []
  const {calls} = chainCalls(snapshot.source, "processes")
  const call = calls[0]
  const argument = call?.arguments[0]
  const callback = argument && argument.type !== "SpreadElement" ? unwrap(argument) : null
  if (calls.length !== 1 || !call || call.arguments.length !== 1 || !callback || callback.type !== "ArrowFunctionExpression") {
    throw new DeclarationPatchError("unsupported_declaration_source", "meta.ts must contain one canonical .processes arrow callback")
  }
  const names = callback.params.map((parameter) => parameter.type === "Identifier" ? parameter.name : null)
  if (
    names.some((name) => name === null) || names.length > 2 ||
    (names[0] !== undefined && names[0] !== "process") ||
    (names[1] !== undefined && names[1] !== "destroy")
  ) {
    throw new DeclarationPatchError("unsupported_declaration_source", ".processes callback parameters must be process and destroy")
  }
  const expression = returnedExpression(callback)
  if (!expression || expression.type !== "ArrayExpression" || expression.elements.some((element) => element?.type === "SpreadElement")) {
    throw new DeclarationPatchError("unsupported_declaration_source", ".processes callback must return one explicit array")
  }
  if (expression.elements.length !== processes.length) {
    throw new DeclarationPatchError("unsupported_declaration_source", "Process source and normalized declaration differ")
  }
  return expression.elements.map((element) => {
    if (!element) throw new DeclarationPatchError("unsupported_declaration_source", "Process source cannot contain array holes")
    return snapshot.source.slice(element.start, element.end)
  })
}

const processesSource = (snapshot: DeclarationMetaSnapshot, entries: readonly string[]): string => {
  const {calls} = chainCalls(snapshot.source, "processes")
  const call = calls[0]
  const argument = call?.arguments[0]
  const callback = argument && argument.type !== "SpreadElement" ? unwrap(argument) : null
  const returned = callback ? returnedExpression(callback) : null
  if (!call || !callback || callback.type !== "ArrowFunctionExpression" || !returned || returned.type !== "ArrayExpression") {
    throw new DeclarationPatchError("unsupported_declaration_source", "meta.ts must contain one canonical .processes arrow callback")
  }
  const range = {
    start: returned.start,
    end: returned.end,
    indent: nodeIndent(snapshot.source, returned.start),
  }
  const childIndent = `${range.indent}  `
  const array = entries.length === 0
    ? "[]"
    : `[\n${entries.map((entry) => `${childIndent}${indentBlock(entry, childIndent)},`).join("\n")}\n${range.indent}]`
  let source = replaceRange(snapshot.source, range, array)
  const parametersStart = callback.start
  const parametersEnd = snapshot.source.indexOf("=>", callback.start)
  if (parametersEnd < 0 || parametersEnd >= callback.body.start) {
    throw new DeclarationPatchError("unsupported_declaration_source", ".processes callback arrow is missing")
  }
  source = source.slice(0, parametersStart) + "(process, destroy) " + source.slice(parametersEnd)
  return source
}

const processConfig = (process: MetaProcessDeclaration): string => {
  const entries = [
    ...(process.label === undefined ? [] : [`label: ${json(process.label)}`]),
    ...(process.description === undefined ? [] : [`desc: ${json(process.description)}`]),
    ...(process.env === undefined ? [] : [`env: ${json(process.env)}`]),
  ]
  return entries.length === 0 ? "" : `, { ${entries.join(", ")} }`
}

const processWrapper = (
  type: MetaProcessDeclaration["type"],
  artifact: NonNullable<MetaProcessDeclaration["artifact"]>,
): string => {
  const importPath = `./${artifact.path}`
  const access = artifact.exportName === "default"
    ? "action.default"
    : `action.${artifact.exportName}`
  const bindings = type === "finally"
    ? ["energy", "mass", "signal"]
    : ["energy", "field", "mass", "self", "signal", "value"]
  return `async ({ ${bindings.join(", ")} }) => {\n  const action = await import(${json(importPath)});\n  return ${access}({ ${bindings.join(", ")} });\n}`
}

const renderProcess = (
  process: MetaProcessDeclaration,
  wrapper: string,
): string => {
  const head = process.type === "finally" ? "destroy" : "process"
  let source = `${head}(${json(process.key)}${processConfig(process)})`
  if (process.type === "finally") return `${source}.before(${wrapper})`
  source += `.action(${wrapper})`
  if (process.successSource !== undefined) source += `.success(${process.successSource})`
  if (process.errorSource !== undefined) source += `.error(${process.errorSource})`
  return source
}

const bulkSource = (snapshot: DeclarationMetaSnapshot, bulk?: BulkSchema): string => {
  const {calls} = chainCalls(snapshot.source, "bulk")
  const call = calls[0]
  if (calls.length !== 1 || !call || call.arguments.length > 1) {
    throw new DeclarationPatchError("unsupported_declaration_source", "meta.ts must contain one canonical .bulk() call")
  }
  const open = call.callee.end + 1
  const close = call.end - 1
  const replacement = bulk === undefined
    ? ""
    : `{\n${nodeIndent(snapshot.source, call.start)}  view: ({ css }) => css\`${bulk.view.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${")}\`,\n${nodeIndent(snapshot.source, call.start)}}`
  return snapshot.source.slice(0, open) + replacement + snapshot.source.slice(close)
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

const listIndex = <T>(
  address: MetaAddress,
  entity: string,
  list: readonly T[],
  key: string,
  read: (value: T) => string,
): number => {
  const matches = list.flatMap((item, index) => read(item) === key ? [index] : [])
  if (matches.length === 0) throw new DeclarationPatchError("declaration_missing", `${entity} ${address}/${key} is absent`)
  if (matches.length !== 1) throw new DeclarationPatchError("declaration_duplicated", `${entity} ${address}/${key} is duplicated`)
  return matches[0]!
}

const assertDeclarationTail = (address: MetaAddress, entity: string, index: number, length: number): void => {
  if (index !== length - 1) {
    throw new DeclarationPatchError("declaration_not_tail", `${entity} ${address}#${index + 1} must be the last declaration`)
  }
}

const stateCounts = (state: MetaSuperpositionDSL): [number, number] => {
  const transitions = state.transitions && typeof state.transitions === "object" && !Array.isArray(state.transitions)
    ? Object.values(state.transitions as Record<string, unknown>)
    : []
  return [transitions.length, transitions.reduce<number>((count, wave) =>
    count + (wave && typeof wave === "object" && !Array.isArray(wave) ? Object.keys(wave).length : 0), 0)]
}

const stateReferenced = (snapshot: DeclarationMetaSnapshot, name: string, excluding: number): boolean => {
  for (const [index, state] of (snapshot.states ?? []).entries()) {
    if (index === excluding || !state.transitions || typeof state.transitions !== "object") continue
    if (Object.hasOwn(state.transitions as object, name)) return true
  }
  if ((snapshot.processes ?? []).some((process) => process.key === name)) return true
  return (snapshot.reactions ?? []).some((reaction) => (reaction.states ?? []).includes(name))
}

const stateValue = (
  address: MetaAddress,
  fields: readonly MetaFieldDSL[],
  states: readonly MetaSuperpositionDSL[],
  selected: number,
): Record<string, unknown> => {
  const stateIds = new Map(states.map((state, index) => [state.name, index + 1] as const))
  const fieldIds = new Map(fields.map((field, index) => [field.key, index + 1] as const))
  let transitionId = 0
  let conditionId = 0
  for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
    const state = states[stateIndex]!
    const transitions: Record<string, unknown>[] = []
    const entries = state.transitions && typeof state.transitions === "object" && !Array.isArray(state.transitions)
      ? Object.entries(state.transitions as Record<string, unknown>)
      : []
    for (let position = 0; position < entries.length; position++) {
      const [targetName, rawWave] = entries[position]!
      const to = stateIds.get(targetName)
      if (!to) throw new DeclarationPatchError("invalid_declaration", `State ${address}/${state.name} references missing State ${targetName}`)
      const id = ++transitionId
      const conditions: Record<string, unknown>[] = []
      const wave = rawWave && typeof rawWave === "object" && !Array.isArray(rawWave)
        ? Object.entries(rawWave as Record<string, unknown>)
        : []
      for (let conditionPosition = 0; conditionPosition < wave.length; conditionPosition++) {
        const [fieldKey, predicate] = wave[conditionPosition]!
        const field = fieldIds.get(fieldKey)
        if (!field) throw new DeclarationPatchError("invalid_declaration", `State ${address}/${state.name} references missing Field ${fieldKey}`)
        conditions.push({id: ++conditionId, position: conditionPosition, field, predicate: structuredClone(predicate)})
      }
      if (stateIndex === selected) transitions.push({id, position, to, conditions})
    }
    if (stateIndex === selected) {
      return {wimp: address, id: stateIndex + 1, name: state.name, position: stateIndex, transitions}
    }
  }
  throw new DeclarationPatchError("declaration_missing", `State ${address}#${selected + 1} is absent`)
}

const massValue = (address: MetaAddress, declarations: readonly MetaMassDSL[], index: number): Record<string, unknown> => ({
  wimp: address,
  id: index + 1,
  ...structuredClone(declarations[index]!),
})

const functionExpression = (source: string, label: string): void => {
  const file = parsedSource(`const __value = (${source})`)
  const statement = file.program.body[0]
  const declaration = statement?.type === "VariableDeclaration"
    ? statement.declarations[0]
    : undefined
  const expression = declaration?.init ? unwrap(declaration.init) : undefined
  if (
    file.errors.length > 0 || file.program.body.length !== 1 || !expression ||
    (expression.type !== "ArrowFunctionExpression" && expression.type !== "FunctionExpression")
  ) {
    throw new DeclarationPatchError("invalid_declaration", `${label} must be one function expression`)
  }
}

const functionUsage = (source: string, label: string, allowWrite: boolean): {read: string[]; write: string[]} => {
  functionExpression(source, label)
  return parseFunction({toString: () => source} as unknown as Function, allowWrite)
}

const validateProcessArtifactSource = (
  path: string,
  source: string,
  exportName: string,
): void => {
  const file = parseSync(path, source)
  if (file.errors.length > 0) {
    throw new DeclarationPatchError("invalid_declaration", `Process artifact ${path} contains invalid TypeScript syntax`)
  }
  const exported = file.module.staticExports.some(({entries}) => entries.some(({exportName: exportedName}) =>
    exportName === "default"
      ? exportedName.kind === "Default"
      : exportedName.kind === "Name" && exportedName.name === exportName
  ))
  if (!exported) {
    throw new DeclarationPatchError("invalid_declaration", `Process artifact ${path} does not export ${exportName}`)
  }
}

const normalizedHandler = (
  source: string | undefined,
  initiator: "s" | "e",
  label: string,
): {src: string; read?: string[]; write?: string[]} | undefined => {
  if (source === undefined) return undefined
  const usage = functionUsage(source, label, true)
  return {
    src: normalizeFunctionString(updateAppendArg(source, json(initiator))),
    ...(usage.read.length === 0 ? {} : {read: usage.read}),
    ...(usage.write.length === 0 ? {} : {write: usage.write}),
  }
}

const normalizedProcess = (
  request: MetaProcessDeclaration,
  fields: readonly MetaFieldDSL[],
  wrapper: string,
  previous?: MetaProcessDSL,
): MetaProcessDSL => {
  functionExpression(wrapper, "Process action wrapper")
  const common = {
    type: request.type,
    ...(request.label === undefined ? {} : {label: request.label}),
    ...(request.description === undefined ? {} : {desc: request.description}),
    ...(request.env === undefined ? {} : {env: [...request.env]}),
  }
  if (request.type === "finally") {
    return {
      key: request.key,
      declaration: {
        ...common,
        type: "finally",
        before: {src: normalizeFunctionString(wrapper)},
      },
    }
  }
  const previousAction = previous?.declaration.type === "action"
    ? previous.declaration.action
    : undefined
  const artifact = request.artifact
  const action = artifact
    ? {
        src: `./${artifact.path}`,
        importSpecifier: artifact.exportName,
        wrapperSrc: normalizeFunctionString(wrapper),
        read: fields.map((field) => field.key),
      }
    : previousAction
      ? {
          ...structuredClone(previousAction),
          wrapperSrc: normalizeFunctionString(wrapper),
          read: fields.map((field) => field.key),
        }
      : null
  if (!action) throw new DeclarationPatchError("invalid_declaration", "New action Process requires one owned artifact")
  const success = normalizedHandler(request.successSource, "s", "Process success handler")
  const error = normalizedHandler(request.errorSource, "e", "Process error handler")
  return {
    key: request.key,
    declaration: {
      ...common,
      type: "action",
      action,
      ...(success === undefined ? {} : {success}),
      ...(error === undefined ? {} : {error}),
    },
  }
}

const processValue = (
  address: MetaAddress,
  fields: readonly MetaFieldDSL[],
  processes: readonly MetaProcessDSL[],
  index: number,
): Record<string, unknown> => {
  const fieldIds = new Map(fields.map((field, position) => [field.key, position + 1] as const))
  const process = processes[index]!
  const input = process.declaration
  const ids = (keys: readonly string[] | undefined, label: string): number[] =>
    (keys ?? []).map((key) => {
      const id = fieldIds.get(key)
      if (!id) throw new DeclarationPatchError("invalid_declaration", `Process ${address}/${process.key} ${label} references missing Field ${key}`)
      return id
    })
  const value: Record<string, unknown> = {
    wimp: address,
    id: index + 1,
    key: process.key,
    type: input.type,
    env: [...(input.env ?? [])],
    label: input.label ?? null,
    desc: input.desc ?? null,
  }
  if (input.type === "finally") {
    const {read, ...before} = input.before
    value.before = {...before, read: ids(read, "before handler")}
  } else {
    const {read, ...action} = input.action
    value.action = {...action, read: ids(read, "action")}
    value.success = null
    value.error = null
    if (input.success) {
      const {read: handlerRead, write, ...handler} = input.success
      value.success = {...handler, read: ids(handlerRead, "success handler"), write: ids(write, "success handler")}
    }
    if (input.error) {
      const {read: handlerRead, write, ...handler} = input.error
      value.error = {...handler, read: ids(handlerRead, "error handler"), write: ids(write, "error handler")}
    }
  }
  return value
}

const processWrapperFrom = (process: MetaProcessDSL): string => {
  const wrapper = process.declaration.type === "finally"
    ? process.declaration.before.src
    : process.declaration.action.wrapperSrc
  if (!wrapper) throw new DeclarationPatchError("invalid_declaration", `Process ${process.key} has no recoverable wrapper source`)
  return wrapper
}

const processArtifactPathFrom = (process: MetaProcessDSL): string => {
  const source = process.declaration.type === "finally"
    ? /import\s*\(\s*["']\.\/(actions\/[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.ts)["']\s*\)/.exec(process.declaration.before.src)?.[1]
    : /^\.\/(actions\/[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.ts)$/.exec(process.declaration.action.src)?.[1]
  if (!source) throw new DeclarationPatchError("invalid_declaration", `Process ${process.key} does not own one canonical action artifact`)
  return source
}

const normalizedReaction = (reaction: MetaReactionDeclaration): MetaReactionDSL => {
  functionExpression(reaction.src, "Reaction src")
  return {
    key: reaction.key,
    label: reaction.label,
    desc: reaction.description ?? null,
    sources: structuredClone(reaction.sources),
    src: normalizeFunctionString(updateAppendArg(reaction.src, json(`r:${reaction.key}`))),
    read: [...reaction.read],
    write: [...reaction.write],
    massRead: [...reaction.massRead],
    massWrite: [...reaction.massWrite],
    states: [...reaction.states],
  }
}

const reactionValue = (
  address: MetaAddress,
  fields: readonly MetaFieldDSL[],
  states: readonly MetaSuperpositionDSL[],
  mass: readonly MetaMassDSL[],
  reactions: readonly MetaReactionDSL[],
  index: number,
): Record<string, unknown> => {
  const fieldByKey = new Map(fields.map((field, position) => [field.key, {id: position + 1, type: field.type}] as const))
  const stateIds = new Map(states.map((state, position) => [state.name, position + 1] as const))
  const massKeys = new Set(mass.map((declaration) => declaration.key))
  const reaction = reactions[index]!
  const fieldIds = (keys: readonly string[] | undefined, label: string, write = false): number[] =>
    (keys ?? []).map((key) => {
      const field = fieldByKey.get(key)
      if (!field) throw new DeclarationPatchError("invalid_declaration", `Reaction ${address}/${reaction.key} references missing ${label} ${key}`)
      if (write && (field.type === "enum" || field.type === "array")) {
        throw new DeclarationPatchError(
          "invalid_declaration",
          `Reaction ${address}/${reaction.key} cannot write topology Field ${key}`,
        )
      }
      return field.id
    })
  const stateReferences = (keys: readonly string[] | undefined): number[] => (keys ?? []).map((key) => {
    const id = stateIds.get(key)
    if (!id) throw new DeclarationPatchError("invalid_declaration", `Reaction ${address}/${reaction.key} references missing State ${key}`)
    return id
  })
  const massReferences = (keys: readonly string[] | undefined, label: string): string[] =>
    (keys ?? []).map((key) => {
      if (!massKeys.has(key)) {
        throw new DeclarationPatchError("invalid_declaration", `Reaction ${address}/${reaction.key} references missing ${label} ${key}`)
      }
      return key
    })
  return {
    wimp: address,
    id: index + 1,
    key: reaction.key,
    label: reaction.label,
    desc: reaction.desc ?? null,
    sources: structuredClone(reaction.sources),
    src: reaction.src,
    read: fieldIds(reaction.read, "Field"),
    write: fieldIds(reaction.write, "Field", true),
    massRead: massReferences(reaction.massRead, "Mass"),
    massWrite: massReferences(reaction.massWrite, "Mass"),
    states: stateReferences(reaction.states),
  }
}

const genericEdit = (snapshot: DeclarationMetaSnapshot, afterSource: string): DeclarationSourceEdit => ({
  address: snapshot.address,
  targetPath: snapshot.targetPath,
  beforeSource: snapshot.source,
  afterSource,
})

type NonFieldDeclarationRequest = Exclude<MetaDeclarationRequest, {entity: "field"}>

const planOtherDeclarationPatch = (
  request: NonFieldDeclarationRequest,
  snapshots: ReadonlyMap<MetaAddress, DeclarationMetaSnapshot>,
  timestamp: number,
): MetaDeclarationPatchPlan => {
  if (request.entity === "metadata") {
    const current = snapshot(snapshots, request.address)
    return {
      particle: {parts: [{
        part: "inflaton", op: "replace", path: "wimp", ts: timestamp,
        value: {src: current.address, name: request.metadata.name, desc: request.metadata.description ?? null},
      }]},
      sourceEdits: [genericEdit(current, metadataSource(current, request.metadata))],
    }
  }

  if (request.entity === "state") {
    if (request.operation === "add") {
      const current = snapshot(snapshots, request.address)
      const states = [...(current.states ?? []).map((state) => structuredClone(state)), structuredClone(request.state)]
      if (states.slice(0, -1).some((state) => state.name === request.state.name)) {
        throw new DeclarationPatchError("declaration_duplicated", `State ${current.address}/${request.state.name} already exists`)
      }
      return {
        particle: {parts: [{part: "inflaton", op: "add", path: "state", ts: timestamp, value: stateValue(current.address, current.fields, states, states.length - 1)}]},
        sourceEdits: [genericEdit(current, appendStateSource(current, states.at(-1)!))],
      }
    }
    if (request.operation === "replace") {
      const current = snapshot(snapshots, request.address)
      const before = current.states ?? []
      const index = listIndex(current.address, "State", before, request.name, (state) => state.name)
      if (request.state.name !== request.name && before.some((state) => state.name === request.state.name)) {
        throw new DeclarationPatchError("declaration_duplicated", `State ${current.address}/${request.state.name} already exists`)
      }
      if (request.state.name !== request.name && stateReferenced(current, request.name, index)) {
        throw new DeclarationPatchError("declaration_referenced", `State ${current.address}/${request.name} is referenced`)
      }
      const countsBefore = stateCounts(before[index]!)
      const nextState: MetaSuperpositionDSL = structuredClone(request.state)
      const countsAfter = stateCounts(nextState)
      if ((countsBefore[0] !== countsAfter[0] || countsBefore[1] !== countsAfter[1]) && index !== before.length - 1) {
        assertDeclarationTail(current.address, "State", index, before.length)
      }
      const states = before.map((state) => structuredClone(state))
      states[index] = nextState
      return {
        particle: {parts: [{part: "inflaton", op: "replace", path: "state", ts: timestamp, value: stateValue(current.address, current.fields, states, index)}]},
        sourceEdits: [genericEdit(current, replaceStateSource(current, index, states[index]!))],
      }
    }
    const source = snapshot(snapshots, request.operation === "move" ? request.fromAddress : request.address)
    const states = source.states ?? []
    const name = request.name
    const index = listIndex(source.address, "State", states, name, (state) => state.name)
    assertDeclarationTail(source.address, "State", index, states.length)
    if (stateReferenced(source, name, index)) throw new DeclarationPatchError("declaration_referenced", `State ${source.address}/${name} is referenced`)
    if (request.operation === "remove") {
      return {
        particle: {parts: [{part: "inflaton", op: "remove", path: "state", ts: timestamp, value: {wimp: source.address, id: index + 1}}]},
        sourceEdits: [genericEdit(source, removeStateSource(source, index))],
      }
    }
    if (stateCounts(states[index]!)[0] !== 0) {
      throw new DeclarationPatchError("declaration_referenced", `Moved State ${source.address}/${name} must not own transitions`)
    }
    const target = snapshot(snapshots, request.toAddress)
    if ((target.states ?? []).some((state) => state.name === name)) throw new DeclarationPatchError("declaration_duplicated", `State ${target.address}/${name} already exists`)
    const targetStates = [...(target.states ?? []).map((state) => structuredClone(state)), structuredClone(states[index]!)]
    return {
      particle: {parts: [{
        part: "inflaton", op: "move", path: "state", from: `${source.address}#${index + 1}`, ts: timestamp,
        value: stateValue(target.address, target.fields, targetStates, targetStates.length - 1),
      }]},
      sourceEdits: [genericEdit(source, removeStateSource(source, index)), genericEdit(target, appendStateSource(target, targetStates.at(-1)!))]
        .sort((left, right) => left.address.localeCompare(right.address)),
    }
  }

  if (request.entity === "mass") {
    const keyOf = (item: MetaMassDSL): string => item.key
    if (request.operation === "add") {
      const current = snapshot(snapshots, request.address)
      const declarations = [...(current.mass ?? []).map((item) => structuredClone(item)), structuredClone(request.mass)]
      if (declarations.slice(0, -1).some((item) => item.key === request.mass.key)) throw new DeclarationPatchError("declaration_duplicated", `Mass ${current.address}/${request.mass.key} already exists`)
      return {
        particle: {parts: [{part: "inflaton", op: "add", path: "mass", ts: timestamp, value: massValue(current.address, declarations, declarations.length - 1)}]},
        sourceEdits: [genericEdit(current, massSource(current, declarations))],
      }
    }
    if (request.operation === "replace") {
      const current = snapshot(snapshots, request.address)
      const declarations = (current.mass ?? []).map((item) => structuredClone(item))
      const index = listIndex(current.address, "Mass", declarations, request.key, keyOf)
      if (request.mass.key !== request.key && declarations.some((item) => item.key === request.mass.key)) throw new DeclarationPatchError("declaration_duplicated", `Mass ${current.address}/${request.mass.key} already exists`)
      declarations[index] = structuredClone(request.mass)
      return {
        particle: {parts: [{part: "inflaton", op: "replace", path: "mass", ts: timestamp, value: massValue(current.address, declarations, index)}]},
        sourceEdits: [genericEdit(current, massSource(current, declarations))],
      }
    }
    const source = snapshot(snapshots, request.operation === "move" ? request.fromAddress : request.address)
    const declarations = source.mass ?? []
    const index = listIndex(source.address, "Mass", declarations, request.key, keyOf)
    assertDeclarationTail(source.address, "Mass", index, declarations.length)
    if (request.operation === "remove") {
      const next = declarations.slice(0, index).map((item) => structuredClone(item))
      return {
        particle: {parts: [{part: "inflaton", op: "remove", path: "mass", ts: timestamp, value: {wimp: source.address, id: index + 1}}]},
        sourceEdits: [genericEdit(source, massSource(source, next))],
      }
    }
    const target = snapshot(snapshots, request.toAddress)
    if ((target.mass ?? []).some((item) => item.key === request.key)) throw new DeclarationPatchError("declaration_duplicated", `Mass ${target.address}/${request.key} already exists`)
    const sourceMass = declarations.slice(0, index).map((item) => structuredClone(item))
    const targetMass = [...(target.mass ?? []).map((item) => structuredClone(item)), structuredClone(declarations[index]!)]
    return {
      particle: {parts: [{part: "inflaton", op: "move", path: "mass", from: `${source.address}#${index + 1}`, ts: timestamp, value: massValue(target.address, targetMass, targetMass.length - 1)}]},
      sourceEdits: [genericEdit(source, massSource(source, sourceMass)), genericEdit(target, massSource(target, targetMass))]
        .sort((left, right) => left.address.localeCompare(right.address)),
    }
  }

  if (request.entity === "process") {
    const current = snapshot(snapshots, request.address)
    const processes = (current.processes ?? []).map((item) => structuredClone(item))
    const entries = processSourceEntries(current)
    if (!(current.states ?? []).some((state) => state.name === request.process.key)) {
      throw new DeclarationPatchError("invalid_declaration", `Process ${current.address}/${request.process.key} references missing State`)
    }
    let index: number
    let wrapper: string
    if (request.operation === "add") {
      if (processes.some((item) => item.key === request.process.key)) {
        throw new DeclarationPatchError("declaration_duplicated", `Process ${current.address}/${request.process.key} already exists`)
      }
      validateProcessArtifactSource(
        request.process.artifact.path,
        request.process.artifact.source,
        request.process.artifact.exportName,
      )
      wrapper = processWrapper(request.process.type, request.process.artifact)
      processes.push(normalizedProcess(request.process, current.fields, wrapper))
      entries.push(renderProcess(request.process, wrapper))
      index = processes.length - 1
    } else {
      index = listIndex(current.address, "Process", processes, request.key, (item) => item.key)
      const previous = processes[index]!
      if (request.process.key !== request.key) {
        throw new DeclarationPatchError("invalid_declaration", "Process replace must preserve its State key")
      }
      if (request.process.type !== previous.declaration.type) {
        throw new DeclarationPatchError("invalid_declaration", "Process replace must preserve action or finally type")
      }
      if (request.process.artifact) {
        if (request.process.artifact.path !== processArtifactPathFrom(previous)) {
          throw new DeclarationPatchError("invalid_declaration", "Process replace must preserve its owned artifact path")
        }
        validateProcessArtifactSource(
          request.process.artifact.path,
          request.process.artifact.source,
          request.process.artifact.exportName,
        )
        wrapper = processWrapper(request.process.type, request.process.artifact)
      } else {
        wrapper = processWrapperFrom(previous)
      }
      processes[index] = normalizedProcess(request.process, current.fields, wrapper, previous)
      entries[index] = renderProcess(request.process, wrapper)
    }
    const sourceEdits: DeclarationSourceEdit[] = [
      genericEdit(current, processesSource(current, entries)),
    ]
    const artifact = request.process.artifact
    if (artifact) {
      sourceEdits.push({
        address: current.address,
        targetPath: resolve(dirname(current.targetPath), artifact.path),
        relativePath: artifact.path,
        expectedRevision: artifact.revision,
        beforeSource: "",
        afterSource: artifact.source,
      })
    }
    return {
      particle: {parts: [{
        part: "inflaton",
        op: request.operation,
        path: "process",
        ts: timestamp,
        value: processValue(current.address, current.fields, processes, index),
      }]},
      sourceEdits: sourceEdits.sort((left, right) => left.targetPath.localeCompare(right.targetPath)),
    }
  }

  if (request.entity === "reaction") {
    const keyOf = (item: MetaReactionDSL): string => item.key
    if (request.operation === "add" || request.operation === "replace") {
      const current = snapshot(snapshots, request.address)
      const reactions = (current.reactions ?? []).map((item) => structuredClone(item))
      const entries = reactionSourceEntries(current)
      const next = normalizedReaction(request.reaction)
      if (request.operation === "add") {
        if (reactions.some((item) => item.key === next.key)) throw new DeclarationPatchError("declaration_duplicated", `Reaction ${current.address}/${next.key} already exists`)
        reactions.push(next)
        entries.push(renderReaction(request.reaction))
      } else {
        const index = listIndex(current.address, "Reaction", reactions, request.key, keyOf)
        if (next.key !== request.key && reactions.some((item) => item.key === next.key)) throw new DeclarationPatchError("declaration_duplicated", `Reaction ${current.address}/${next.key} already exists`)
        reactions[index] = next
        entries[index] = renderReaction(request.reaction)
      }
      const index = request.operation === "add" ? reactions.length - 1 : listIndex(current.address, "Reaction", reactions, next.key, keyOf)
      return {
        particle: {parts: [{part: "inflaton", op: request.operation, path: "reaction", ts: timestamp, value: reactionValue(current.address, current.fields, current.states ?? [], current.mass ?? [], reactions, index)}]},
        sourceEdits: [genericEdit(current, reactionsSource(current, entries))],
      }
    }
    const source = snapshot(snapshots, request.operation === "move" ? request.fromAddress : request.address)
    const reactions = source.reactions ?? []
    const entries = reactionSourceEntries(source)
    const index = listIndex(source.address, "Reaction", reactions, request.key, keyOf)
    assertDeclarationTail(source.address, "Reaction", index, reactions.length)
    if (request.operation === "remove") {
      return {
        particle: {parts: [{part: "inflaton", op: "remove", path: "reaction", ts: timestamp, value: {wimp: source.address, id: index + 1}}]},
        sourceEdits: [genericEdit(source, reactionsSource(source, entries.slice(0, index)))],
      }
    }
    if (!/\bkey\s*:/.test(entries[index]!)) throw new DeclarationPatchError("invalid_declaration", `Reaction ${source.address}/${request.key} has no authored semantic key`)
    const target = snapshot(snapshots, request.toAddress)
    if ((target.reactions ?? []).some((item) => item.key === request.key)) throw new DeclarationPatchError("declaration_duplicated", `Reaction ${target.address}/${request.key} already exists`)
    const targetEntries = [...reactionSourceEntries(target), entries[index]!]
    const targetReactions = [...(target.reactions ?? []).map((item) => structuredClone(item)), structuredClone(reactions[index]!)]
    return {
      particle: {parts: [{part: "inflaton", op: "move", path: "reaction", from: `${source.address}#${index + 1}`, ts: timestamp, value: reactionValue(target.address, target.fields, target.states ?? [], target.mass ?? [], targetReactions, targetReactions.length - 1)}]},
      sourceEdits: [genericEdit(source, reactionsSource(source, entries.slice(0, index))), genericEdit(target, reactionsSource(target, targetEntries))]
        .sort((left, right) => left.address.localeCompare(right.address)),
    }
  }

  if (request.operation === "add" || request.operation === "replace") {
    const current = snapshot(snapshots, request.address)
    if (request.operation === "add" && current.bulk !== undefined) throw new DeclarationPatchError("declaration_duplicated", `Bulk ${current.address} already exists`)
    if (request.operation === "replace" && current.bulk === undefined) throw new DeclarationPatchError("declaration_missing", `Bulk ${current.address} is absent`)
    return {
      particle: {parts: [{part: "inflaton", op: request.operation, path: "bulk", ts: timestamp, value: {wimp: current.address, id: 1, view: request.bulk.view}}]},
      sourceEdits: [genericEdit(current, bulkSource(current, request.bulk))],
    }
  }
  const source = snapshot(snapshots, request.operation === "move" ? request.fromAddress : request.address)
  if (source.bulk === undefined) throw new DeclarationPatchError("declaration_missing", `Bulk ${source.address} is absent`)
  if (request.operation === "remove") {
    return {
      particle: {parts: [{part: "inflaton", op: "remove", path: "bulk", ts: timestamp, value: {wimp: source.address, id: 1}}]},
      sourceEdits: [genericEdit(source, bulkSource(source))],
    }
  }
  const target = snapshot(snapshots, request.toAddress)
  if (target.bulk !== undefined) throw new DeclarationPatchError("declaration_duplicated", `Bulk ${target.address} already exists`)
  return {
    particle: {parts: [{part: "inflaton", op: "move", path: "bulk", from: `${source.address}#1`, ts: timestamp, value: {wimp: target.address, id: 1, ...structuredClone(source.bulk)}}]},
    sourceEdits: [genericEdit(source, bulkSource(source)), genericEdit(target, bulkSource(target, source.bulk))]
      .sort((left, right) => left.address.localeCompare(right.address)),
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
  if (request.entity !== "field") return planOtherDeclarationPatch(request, snapshots, timestamp)
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
