import type { Database } from "bun:sqlite"
import * as ts from "typescript"
import {
  ensureRoundTripSchema,
  sectionOrder,
  type FieldPresence,
  type FieldType,
  type LiteralType,
  type ProcessBuilder,
  type ProcessEnv,
  type ProcessEnvRow,
  type ProcessStep,
  type ReactionRow,
  type SectionName,
  type SectionRow,
  type StateRow,
  type TransitionCommentRow,
  type TransitionRow,
} from "./schema.ts"

export {
  ensureRoundTripSchema,
  roundTripSchemaSql,
  sectionOrder,
  type FieldPresence,
  type FieldType,
  type LiteralType,
  type ProcessBuilder,
  type ProcessEnv,
  type ProcessEnvRow,
  type ProcessStep,
  type ReactionRow,
  type SectionName,
  type SectionRow,
  type StateRow,
  type TransitionCommentRow,
  type TransitionRow,
} from "./schema.ts"

export interface ParseDslModuleToDbOptions {
  db: Database
  sourceText: string
  sourcePath?: string | null
  filename?: string
}

export interface ParseDslModuleToDbResult {
  name: string
  desc: string | null
  dev: boolean | null
}

interface ChainStep {
  name: SectionName
  call: ts.CallExpression
}

interface ParsedArrowCollectionSection<TBody extends ts.ObjectLiteralExpression | ts.ArrayLiteralExpression> {
  params: string
  parameterNames: string[]
  body: TBody
}

interface ParsedFieldShape {
  type: FieldType
  presence: FieldPresence
  label: string | null
  defaultType: LiteralType | null
  defaultText: string | null
  defaultNumber: string | null
  defaultBoolean: boolean | null
  enumVariants: ParsedEnumVariantValue[]
}

interface ParsedProcessShape {
  builder: ProcessBuilder
  configMultiline: boolean | null
  label: string | null
  labelPosition: number | null
  desc: string | null
  descPosition: number | null
  envPosition: number | null
  envs: ProcessEnv[]
  handlers: ParsedPendingProcessHandler[]
}

interface PendingTransition {
  id: number
  stateId: number
  targetStateName: string
  position: number
  conditions: ParsedConditionRow[]
}

interface ParsedMeta {
  name: string
  configMultiline: boolean | null
  desc: string | null
  descPosition: number | null
  dev: boolean | null
  devPosition: number | null
}

interface ParsedEnumVariantValue {
  textValue: string | null
  numberValue: string | null
}

interface ParsedFieldRow {
  id: number
  position: number
  name: string
  type: FieldType
  presence: FieldPresence
  label: string | null
  defaultType: LiteralType | null
  defaultText: string | null
  defaultNumber: string | null
  defaultBoolean: boolean | null
}

interface ParsedEnumVariantRow {
  fieldId: number
  position: number
  textValue: string | null
  numberValue: string | null
}

interface ParsedConditionRow {
  position: number
  fieldId: number
  nullValue: boolean
}

interface ParsedProcessRow {
  id: number
  position: number
  name: string
  builder: ProcessBuilder
  gapBefore: number
  configMultiline: boolean | null
  label: string | null
  labelPosition: number | null
  desc: string | null
  descPosition: number | null
  envPosition: number | null
}

interface ParsedProcessHandlerRow {
  processId: number
  position: number
  step: ProcessStep
  code: string
}

interface ParsedPendingProcessHandler {
  position: number
  step: ProcessStep
  code: string
}

const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
})

const sectionSet = new Set<SectionName>(sectionOrder)

const processEnvSet = new Set<ProcessEnv>(["browser", "node", "worker", "server", "any"])

const processStepSet = new Set<ProcessStep>(["action", "success", "error", "before"])

const printNode = (node: ts.Node, sourceFile: ts.SourceFile, hint: ts.EmitHint = ts.EmitHint.Unspecified) =>
  printer.printNode(hint, node, sourceFile).trim()

const getSourceText = (node: ts.Node, sourceFile: ts.SourceFile) => sourceFile.text.slice(node.getStart(sourceFile), node.end).trim()

const isMultilineNode = (node: ts.Node, sourceFile: ts.SourceFile) => sourceFile.text.slice(node.getStart(sourceFile), node.end).includes("\n")

const formatDiagnostic = (diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  if (diagnostic.start === undefined) return message

  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
  return `${position.line + 1}:${position.character + 1} ${message}`
}

const assertNoParseDiagnostics = (sourceFile: ts.SourceFile) => {
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  if (diagnostics.length === 0) return

  const message = diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, sourceFile)).join("; ")
  throw new Error(`TypeScript parse failed: ${message}`)
}

const isSectionName = (value: string): value is SectionName => sectionSet.has(value as SectionName)

const unwrapParenthesized = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (ts.isParenthesizedExpression(current)) current = current.expression
  return current
}

const getPropertyNameText = (name: ts.PropertyName, sourceFile: ts.SourceFile) => {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isStringLiteralLike(name)) return name.text
  return printNode(name, sourceFile)
}

const getOnlyArgument = (call: ts.CallExpression, name: SectionName | "MetaFor") => {
  if (call.arguments.length !== 1) {
    throw new Error(`${name} expects exactly one argument, received ${call.arguments.length}`)
  }

  const [argument] = call.arguments
  if (!argument) throw new Error(`${name} is missing its argument`)
  return argument
}

const getIdentifierParameterNames = (parameters: readonly ts.ParameterDeclaration[], sourceFile: ts.SourceFile) =>
  parameters.map((parameter) => {
    if (!ts.isIdentifier(parameter.name)) {
      throw new Error(`Only identifier parameters are supported in authoring round-trip, received ${printNode(parameter, sourceFile)}`)
    }

    return parameter.name.text
  })

const parseArrowObjectSection = (
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  sectionName: "fields" | "processes",
): ParsedArrowCollectionSection<ts.ObjectLiteralExpression> => {
  const argument = getOnlyArgument(call, sectionName)
  if (!ts.isArrowFunction(argument)) {
    throw new Error(`${sectionName} must receive an arrow function`)
  }

  if (ts.isBlock(argument.body)) {
    throw new Error(`${sectionName} must use an expression body`)
  }

  const body = unwrapParenthesized(argument.body)
  if (!ts.isObjectLiteralExpression(body)) {
    throw new Error(`${sectionName} must return an object literal`)
  }

  return {
    params: argument.parameters.map((parameter) => getSourceText(parameter, sourceFile)).join(", "),
    parameterNames: getIdentifierParameterNames(argument.parameters, sourceFile),
    body,
  }
}

const parseArrowArraySection = (call: ts.CallExpression, sourceFile: ts.SourceFile): ParsedArrowCollectionSection<ts.ArrayLiteralExpression> => {
  const argument = getOnlyArgument(call, "reactions")
  if (!ts.isArrowFunction(argument)) {
    throw new Error("reactions must receive an arrow function")
  }

  if (ts.isBlock(argument.body)) {
    throw new Error("reactions must use an expression body")
  }

  const body = unwrapParenthesized(argument.body)
  if (!ts.isArrayLiteralExpression(body)) {
    throw new Error("reactions must return an array literal")
  }

  return {
    params: argument.parameters.map((parameter) => getSourceText(parameter, sourceFile)).join(", "),
    parameterNames: getIdentifierParameterNames(argument.parameters, sourceFile),
    body,
  }
}

const collectChainSteps = (expression: ts.Expression): { metaForCall: ts.CallExpression; steps: ChainStep[] } => {
  const steps: ChainStep[] = []
  let current: ts.Expression = expression

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const name = current.expression.name.text
    if (!isSectionName(name)) {
      throw new Error(`Unsupported MetaFor chain section: ${name}`)
    }

    steps.unshift({ name, call: current })
    current = current.expression.expression
  }

  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression) || current.expression.text !== "MetaFor") {
    throw new Error("Expected export default MetaFor(...) chain")
  }

  return { metaForCall: current, steps }
}

const getBooleanLiteral = (expression: ts.Expression) => {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  return null
}

const parseCanonicalImport = (statement: ts.Statement) => {
  if (!ts.isImportDeclaration(statement)) {
    throw new Error('The first statement must be `import { MetaFor } from "@metafor/dsl"`')
  }

  if (!ts.isStringLiteralLike(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "@metafor/dsl") {
    throw new Error('The only allowed top-level import is `import { MetaFor } from "@metafor/dsl"`')
  }

  const importClause = statement.importClause
  if (!importClause || importClause.isTypeOnly || importClause.name || !importClause.namedBindings || !ts.isNamedImports(importClause.namedBindings)) {
    throw new Error('The only allowed top-level import is `import { MetaFor } from "@metafor/dsl"`')
  }

  const elements = importClause.namedBindings.elements
  if (elements.length !== 1) {
    throw new Error('The only allowed top-level import is `import { MetaFor } from "@metafor/dsl"`')
  }

  const [element] = elements
  if (!element || element.isTypeOnly || element.propertyName || element.name.text !== "MetaFor") {
    throw new Error('The only allowed top-level import is `import { MetaFor } from "@metafor/dsl"`')
  }
}

const getCanonicalExportAssignment = (sourceFile: ts.SourceFile) => {
  if (sourceFile.statements.length !== 2) {
    throw new Error('A MetaFor authoring module must contain exactly one canonical import and one `export default MetaFor(...)` chain')
  }

  const [importStatement, exportStatement] = sourceFile.statements
  if (!importStatement || !exportStatement) {
    throw new Error("Missing required top-level statements")
  }

  parseCanonicalImport(importStatement)
  if (!ts.isExportAssignment(exportStatement)) {
    throw new Error("The second statement must be `export default MetaFor(...)`")
  }

  return exportStatement
}

const parseMetaConfig = (
  node: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): Pick<ParsedMeta, "configMultiline" | "desc" | "descPosition" | "dev" | "devPosition"> => {
  if (!node) {
    return {
      configMultiline: null,
      desc: null,
      descPosition: null,
      dev: null,
      devPosition: null,
    }
  }

  const expression = unwrapParenthesized(node)
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(`MetaFor config must be an object literal, received ${getSourceText(node, sourceFile)}`)
  }

  let desc: string | null = null
  let descPosition: number | null = null
  let dev: boolean | null = null
  let devPosition: number | null = null

  for (const [position, property] of expression.properties.entries()) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error("MetaFor config must contain property assignments only")
    }

    const name = getPropertyNameText(property.name, sourceFile)
    if (name === "desc") {
      if (!ts.isStringLiteralLike(property.initializer)) {
        throw new Error("MetaFor config `desc` must be a string literal")
      }

      desc = property.initializer.text
      descPosition = position
      continue
    }

    if (name === "dev") {
      const value = getBooleanLiteral(property.initializer)
      if (value === null) {
        throw new Error("MetaFor config `dev` must be a boolean literal")
      }

      dev = value
      devPosition = position
      continue
    }

    throw new Error(`Unsupported MetaFor config property: ${name}`)
  }

  return {
    configMultiline: isMultilineNode(expression, sourceFile),
    desc,
    descPosition,
    dev,
    devPosition,
  }
}

const parseFieldLabel = (node: ts.Expression, sourceFile: ts.SourceFile) => {
  const expression = unwrapParenthesized(node)
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(`Field options must be an object literal, received ${getSourceText(node, sourceFile)}`)
  }

  let label: string | null = null
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error("Field options must contain property assignments only")
    }

    const name = getPropertyNameText(property.name, sourceFile)
    if (name !== "label") {
      throw new Error(`Unsupported field option: ${name}`)
    }

    if (!ts.isStringLiteralLike(property.initializer)) {
      throw new Error("Field option `label` must be a string literal")
    }

    label = property.initializer.text
  }

  return label
}

const parseLiteralValue = (
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): Pick<ParsedFieldShape, "defaultType" | "defaultText" | "defaultNumber" | "defaultBoolean"> => {
  const node = unwrapParenthesized(expression)

  if (ts.isStringLiteralLike(node)) {
    return {
      defaultType: "string",
      defaultText: node.text,
      defaultNumber: null,
      defaultBoolean: null,
    }
  }

  if (ts.isNumericLiteral(node) || (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))) {
    return {
      defaultType: "number",
      defaultText: null,
      defaultNumber: getSourceText(node, sourceFile),
      defaultBoolean: null,
    }
  }

  const booleanValue = getBooleanLiteral(node)
  if (booleanValue !== null) {
    return {
      defaultType: "boolean",
      defaultText: null,
      defaultNumber: null,
      defaultBoolean: booleanValue,
    }
  }

  if (ts.isArrayLiteralExpression(node) && node.elements.length === 0) {
    return {
      defaultType: "array",
      defaultText: null,
      defaultNumber: null,
      defaultBoolean: null,
    }
  }

  throw new Error(`Unsupported field default literal: ${getSourceText(expression, sourceFile)}`)
}

const parseEnumVariant = (expression: ts.Expression, sourceFile: ts.SourceFile): ParsedEnumVariantValue => {
  const node = unwrapParenthesized(expression)
  if (ts.isStringLiteralLike(node)) {
    return {
      textValue: node.text,
      numberValue: null,
    }
  }

  if (ts.isNumericLiteral(node) || (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))) {
    return {
      textValue: null,
      numberValue: getSourceText(node, sourceFile),
    }
  }

  throw new Error(`field.enum values must be string or number literals, received ${getSourceText(expression, sourceFile)}`)
}

const parseFieldInitializer = (initializer: ts.Expression, fieldFactoryName: string, sourceFile: ts.SourceFile): ParsedFieldShape => {
  let current = initializer
  let presence: FieldPresence = null
  let label: string | null = null
  let defaultType: LiteralType | null = null
  let defaultText: string | null = null
  let defaultNumber: string | null = null
  let defaultBoolean: boolean | null = null

  if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const modifier = current.expression.name.text
    if (modifier === "optional" || modifier === "required") {
      presence = modifier
      if (modifier === "optional") {
        if (current.arguments.length > 1) {
          throw new Error(`field.${modifier} accepts zero or one options argument, received ${current.arguments.length}`)
        }

        if (current.arguments[0]) {
          label = parseFieldLabel(current.arguments[0], sourceFile)
        }
      } else {
        if (current.arguments.length < 1 || current.arguments.length > 2) {
          throw new Error(`field.${modifier} accepts a default literal and optional options, received ${current.arguments.length}`)
        }

        const [defaultNode, optionsNode] = current.arguments
        if (!defaultNode) {
          throw new Error("field.required is missing its default literal")
        }

        const parsedDefault = parseLiteralValue(defaultNode, sourceFile)
        defaultType = parsedDefault.defaultType
        defaultText = parsedDefault.defaultText
        defaultNumber = parsedDefault.defaultNumber
        defaultBoolean = parsedDefault.defaultBoolean

        if (optionsNode) {
          label = parseFieldLabel(optionsNode, sourceFile)
        }
      }

      current = current.expression.expression
    }
  }

  if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === fieldFactoryName) {
    return {
      type: current.name.text as FieldType,
      presence,
      label,
      defaultType,
      defaultText,
      defaultNumber,
      defaultBoolean,
      enumVariants: [],
    }
  }

  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    ts.isIdentifier(current.expression.expression) &&
    current.expression.expression.text === fieldFactoryName &&
    current.expression.name.text === "enum"
  ) {
    return {
      type: "enum",
      presence,
      label,
      defaultType,
      defaultText,
      defaultNumber,
      defaultBoolean,
      enumVariants: current.arguments.map((argument) => parseEnumVariant(argument, sourceFile)),
    }
  }

  throw new Error(`Unsupported field authoring form: ${getSourceText(initializer, sourceFile)}`)
}

const getLeadingCommentSources = (node: ts.Node, sourceFile: ts.SourceFile) =>
  (ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? []).map((range) =>
    sourceFile.text.slice(range.pos, range.end).trim(),
  )

const countBlankLines = (source: string) => {
  const normalized = source.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  if (lines.length < 3) return 0
  return lines.slice(1, -1).filter((line) => line.trim().length === 0).length
}

const parseConditions = (
  initializer: ts.Expression,
  fieldIdByName: Map<string, number>,
  sourceFile: ts.SourceFile,
): ParsedConditionRow[] => {
  const expression = unwrapParenthesized(initializer)
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(`Transition conditions must be an object literal, received ${getSourceText(initializer, sourceFile)}`)
  }

  return expression.properties.map((property, position) => {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error("Transition conditions must contain property assignments only")
    }

    const fieldName = getPropertyNameText(property.name, sourceFile)
    const fieldId = fieldIdByName.get(fieldName)
    if (fieldId === undefined) {
      throw new Error(`Unknown field in superposition: ${fieldName}`)
    }

    const conditionNode = unwrapParenthesized(property.initializer)
    if (conditionNode.kind === ts.SyntaxKind.NullKeyword) {
      return {
        position,
        fieldId,
        nullValue: true,
      }
    }

    if (!ts.isObjectLiteralExpression(conditionNode)) {
      throw new Error(`Unsupported condition form for field ${fieldName}: ${getSourceText(property.initializer, sourceFile)}`)
    }

    if (conditionNode.properties.length !== 1) {
      throw new Error(`Condition objects must contain exactly one property, received ${getSourceText(conditionNode, sourceFile)}`)
    }

    const [conditionProperty] = conditionNode.properties
    if (!conditionProperty || !ts.isPropertyAssignment(conditionProperty) || getPropertyNameText(conditionProperty.name, sourceFile) !== "null") {
      throw new Error(`Unsupported condition object for field ${fieldName}: ${getSourceText(conditionNode, sourceFile)}`)
    }

    const nullValue = getBooleanLiteral(conditionProperty.initializer)
    if (nullValue === null) {
      throw new Error(`Condition \`null\` must be a boolean literal, received ${getSourceText(conditionProperty.initializer, sourceFile)}`)
    }

    return {
      position,
      fieldId,
      nullValue,
    }
  })
}

const parseProcessConfig = (
  node: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): Pick<ParsedProcessShape, "configMultiline" | "label" | "labelPosition" | "desc" | "descPosition" | "envPosition" | "envs"> => {
  if (!node) {
    return {
      configMultiline: null,
      label: null,
      labelPosition: null,
      desc: null,
      descPosition: null,
      envPosition: null,
      envs: [],
    }
  }

  const expression = unwrapParenthesized(node)
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(`Process config must be an object literal, received ${getSourceText(node, sourceFile)}`)
  }

  let label: string | null = null
  let labelPosition: number | null = null
  let desc: string | null = null
  let descPosition: number | null = null
  let envPosition: number | null = null
  let envs: ProcessEnv[] = []

  for (const [position, property] of expression.properties.entries()) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error("Process config must contain property assignments only")
    }

    const name = getPropertyNameText(property.name, sourceFile)
    if (name === "label") {
      if (!ts.isStringLiteralLike(property.initializer)) {
        throw new Error("Process config `label` must be a string literal")
      }

      label = property.initializer.text
      labelPosition = position
      continue
    }

    if (name === "desc") {
      if (!ts.isStringLiteralLike(property.initializer)) {
        throw new Error("Process config `desc` must be a string literal")
      }

      desc = property.initializer.text
      descPosition = position
      continue
    }

    if (name === "env") {
      const envNode = unwrapParenthesized(property.initializer)
      if (!ts.isArrayLiteralExpression(envNode)) {
        throw new Error("Process config `env` must be an array literal")
      }

      envs = envNode.elements.map((element) => {
        if (!ts.isStringLiteralLike(element) || !processEnvSet.has(element.text as ProcessEnv)) {
          throw new Error(`Unsupported process env: ${getSourceText(element, sourceFile)}`)
        }

        return element.text as ProcessEnv
      })
      envPosition = position
      continue
    }

    throw new Error(`Unsupported process config property: ${name}`)
  }

  return {
    configMultiline: isMultilineNode(expression, sourceFile),
    label,
    labelPosition,
    desc,
    descPosition,
    envPosition,
    envs,
  }
}

const parseProcessInitializer = (
  initializer: ts.Expression,
  processName: string,
  destroyName: string | undefined,
  sourceFile: ts.SourceFile,
): ParsedProcessShape => {
  const stepCalls: Array<{ step: ProcessStep; call: ts.CallExpression }> = []
  let current: ts.Expression = initializer

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const step = current.expression.name.text
    if (!processStepSet.has(step as ProcessStep)) {
      throw new Error(`Unsupported process step: ${step}`)
    }

    stepCalls.unshift({ step: step as ProcessStep, call: current })
    current = current.expression.expression
  }

  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression)) {
    throw new Error(`Unsupported process authoring form: ${getSourceText(initializer, sourceFile)}`)
  }

  let builder: ProcessBuilder
  if (current.expression.text === processName) {
    builder = "process"
  } else if (destroyName && current.expression.text === destroyName) {
    builder = "destroy"
  } else {
    throw new Error(`Unsupported process builder: ${current.expression.text}`)
  }

  if (current.arguments.length > 1) {
    throw new Error(`Process builder accepts at most one config argument, received ${current.arguments.length}`)
  }

  const config = parseProcessConfig(current.arguments[0], sourceFile)
  const handlers: ParsedPendingProcessHandler[] = []
  const seenSteps = new Set<ProcessStep>()

  for (const [position, stepCall] of stepCalls.entries()) {
    if (seenSteps.has(stepCall.step)) {
      throw new Error(`Duplicate process step: ${stepCall.step}`)
    }

    seenSteps.add(stepCall.step)

    if (builder === "process" && stepCall.step === "before") {
      throw new Error("process() does not support before(...)")
    }

    if (builder === "destroy" && stepCall.step !== "before") {
      throw new Error(`destroy() only supports before(...), received ${stepCall.step}(...)`)
    }

    if (stepCall.call.arguments.length !== 1 || !stepCall.call.arguments[0]) {
      throw new Error(`Process step ${stepCall.step} expects exactly one handler`)
    }

    handlers.push({
      position,
      step: stepCall.step,
      code: getSourceText(stepCall.call.arguments[0], sourceFile),
    })
  }

  return {
    builder,
    configMultiline: config.configMultiline,
    label: config.label,
    labelPosition: config.labelPosition,
    desc: config.desc,
    descPosition: config.descPosition,
    envPosition: config.envPosition,
    envs: config.envs,
    handlers,
  }
}

export const parseDslModuleToDb = (options: ParseDslModuleToDbOptions): ParseDslModuleToDbResult => {
  ensureRoundTripSchema(options.db)

  const filename = options.filename ?? options.sourcePath ?? "meta.ts"
  const sourceFile = ts.createSourceFile(filename, options.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assertNoParseDiagnostics(sourceFile)

  const exportAssignment = getCanonicalExportAssignment(sourceFile)
  const { metaForCall, steps } = collectChainSteps(exportAssignment.expression)

  if (steps.length !== sectionOrder.length || steps.some((step, index) => step.name !== sectionOrder[index])) {
    const actual = steps.map((step) => step.name).join(" -> ")
    const expected = sectionOrder.join(" -> ")
    throw new Error(`Unexpected MetaFor chain order. Expected ${expected}. Received ${actual}`)
  }

  if (metaForCall.arguments.length < 1 || metaForCall.arguments.length > 2) {
    throw new Error(`MetaFor expects one or two arguments, received ${metaForCall.arguments.length}`)
  }

  const [metaNameNode, metaConfigNode] = metaForCall.arguments
  if (!metaNameNode || !ts.isStringLiteralLike(metaNameNode)) {
    throw new Error("MetaFor first argument must be a string literal")
  }

  const metaRow: ParsedMeta = {
    name: metaNameNode.text,
    ...parseMetaConfig(metaConfigNode, sourceFile),
  }

  const sectionRows: SectionRow[] = []
  const fieldRows: ParsedFieldRow[] = []
  const enumVariantRows: ParsedEnumVariantRow[] = []
  const stateRows: StateRow[] = []
  const transitionCommentRows: TransitionCommentRow[] = []
  const pendingTransitions: PendingTransition[] = []
  const processRows: ParsedProcessRow[] = []
  const processEnvRows: ProcessEnvRow[] = []
  const processHandlerRows: ParsedProcessHandlerRow[] = []
  const reactionRows: ReactionRow[] = []
  const fieldIdByName = new Map<string, number>()

  const pushSection = (name: SectionName, params: string | null, code: string | null) => {
    sectionRows.push({ name, params, code })
  }

  for (const step of steps) {
    if (step.name === "fields") {
      const parsed = parseArrowObjectSection(step.call, sourceFile, "fields")
      const [fieldFactoryName] = parsed.parameterNames
      if (!fieldFactoryName) throw new Error("fields must declare a field factory parameter")

      pushSection("fields", parsed.params, null)

      for (const [position, property] of parsed.body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("fields body must contain property assignments only")

        const id = position + 1
        const fieldName = getPropertyNameText(property.name, sourceFile)
        const parsedField = parseFieldInitializer(property.initializer, fieldFactoryName, sourceFile)

        fieldRows.push({
          id,
          position,
          name: fieldName,
          type: parsedField.type,
          presence: parsedField.presence,
          label: parsedField.label,
          defaultType: parsedField.defaultType,
          defaultText: parsedField.defaultText,
          defaultNumber: parsedField.defaultNumber,
          defaultBoolean: parsedField.defaultBoolean,
        })

        fieldIdByName.set(fieldName, id)
        for (const [variantPosition, variant] of parsedField.enumVariants.entries()) {
          enumVariantRows.push({
            fieldId: id,
            position: variantPosition,
            textValue: variant.textValue,
            numberValue: variant.numberValue,
          })
        }
      }

      continue
    }

    if (step.name === "superposition") {
      const argument = getOnlyArgument(step.call, "superposition")
      const body = unwrapParenthesized(argument)
      if (!ts.isObjectLiteralExpression(body)) {
        throw new Error("superposition must receive an object literal")
      }

      pushSection("superposition", null, null)

      for (const [statePosition, property] of body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("superposition body must contain property assignments only")

        const stateId = statePosition + 1
        stateRows.push({
          id: stateId,
          position: statePosition,
          name: getPropertyNameText(property.name, sourceFile),
        })

        const stateBody = unwrapParenthesized(property.initializer)
        if (!ts.isObjectLiteralExpression(stateBody)) {
          throw new Error(`State ${getPropertyNameText(property.name, sourceFile)} must be an object literal`)
        }

        let memberPosition = 0
        for (const transitionProperty of stateBody.properties) {
          if (!ts.isPropertyAssignment(transitionProperty)) {
            throw new Error("State bodies must contain property assignments only")
          }

          for (const commentSource of getLeadingCommentSources(transitionProperty, sourceFile)) {
            transitionCommentRows.push({
              id: transitionCommentRows.length + 1,
              stateId,
              position: memberPosition++,
              text: commentSource,
            })
          }

          pendingTransitions.push({
            id: pendingTransitions.length + 1,
            stateId,
            targetStateName: getPropertyNameText(transitionProperty.name, sourceFile),
            position: memberPosition++,
            conditions: parseConditions(transitionProperty.initializer, fieldIdByName, sourceFile),
          })
        }
      }

      continue
    }

    if (step.name === "mass") {
      pushSection("mass", null, getSourceText(getOnlyArgument(step.call, "mass"), sourceFile))
      continue
    }

    if (step.name === "processes") {
      const parsed = parseArrowObjectSection(step.call, sourceFile, "processes")
      const [processName, destroyName] = parsed.parameterNames
      if (!processName && parsed.body.properties.length > 0) {
        throw new Error("processes must declare a process builder parameter when the section is not empty")
      }

      pushSection("processes", parsed.params, null)

      let previousPropertyEnd = parsed.body.getStart(sourceFile)
      for (const [position, property] of parsed.body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("processes body must contain property assignments only")

        const gapBefore = position === 0 ? 0 : countBlankLines(sourceFile.text.slice(previousPropertyEnd, property.getStart(sourceFile)))
        previousPropertyEnd = property.getEnd()

        const processId = position + 1
        const parsedProcess = parseProcessInitializer(property.initializer, processName ?? "process", destroyName, sourceFile)

        processRows.push({
          id: processId,
          position,
          name: getPropertyNameText(property.name, sourceFile),
          builder: parsedProcess.builder,
          gapBefore,
          configMultiline: parsedProcess.configMultiline,
          label: parsedProcess.label,
          labelPosition: parsedProcess.labelPosition,
          desc: parsedProcess.desc,
          descPosition: parsedProcess.descPosition,
          envPosition: parsedProcess.envPosition,
        })

        for (const [envPosition, env] of parsedProcess.envs.entries()) {
          processEnvRows.push({
            processId,
            position: envPosition,
            env,
          })
        }

        for (const handler of parsedProcess.handlers) {
          processHandlerRows.push({
            processId,
            position: handler.position,
            step: handler.step,
            code: handler.code,
          })
        }
      }

      continue
    }

    if (step.name === "reactions") {
      const parsed = parseArrowArraySection(step.call, sourceFile)
      pushSection("reactions", parsed.params, null)

      for (const [position, element] of parsed.body.elements.entries()) {
        if (!element) {
          throw new Error("reactions arrays may not contain empty items")
        }

        reactionRows.push({
          id: position + 1,
          position,
          code: getSourceText(element, sourceFile),
        })
      }

      continue
    }

    if (step.name === "matter") {
      if (step.call.arguments.length > 1) {
        throw new Error(`matter expects zero or one argument, received ${step.call.arguments.length}`)
      }

      const [argument] = step.call.arguments
      pushSection("matter", null, argument ? getSourceText(argument, sourceFile) : null)
      continue
    }

    if (step.name === "bulk") {
      if (step.call.arguments.length > 1) {
        throw new Error(`bulk expects zero or one argument, received ${step.call.arguments.length}`)
      }

      const [argument] = step.call.arguments
      pushSection("bulk", null, argument ? getSourceText(argument, sourceFile) : null)
    }
  }

  const stateIdByName = new Map(stateRows.map((stateRow) => [stateRow.name, stateRow.id]))
  const transitionRows: TransitionRow[] = []
  const conditionRows: Array<{ transitionId: number; position: number; fieldId: number; nullValue: boolean }> = []

  for (const pendingTransition of pendingTransitions) {
    const targetStateId = stateIdByName.get(pendingTransition.targetStateName)
    if (targetStateId === undefined) {
      throw new Error(`Unknown target state in superposition: ${pendingTransition.targetStateName}`)
    }

    transitionRows.push({
      id: pendingTransition.id,
      stateId: pendingTransition.stateId,
      targetStateId,
      position: pendingTransition.position,
    })

    for (const condition of pendingTransition.conditions) {
      conditionRows.push({
        transitionId: pendingTransition.id,
        position: condition.position,
        fieldId: condition.fieldId,
        nullValue: condition.nullValue,
      })
    }
  }

  const getEnumDefaultVariantPosition = (fieldRow: ParsedFieldRow) => {
    if (fieldRow.type !== "enum") {
      throw new Error(`Enum default lookup is only valid for enum fields, received ${fieldRow.name}`)
    }

    const enumVariants = enumVariantRows.filter((enumVariantRow) => enumVariantRow.fieldId === fieldRow.id)
    if (fieldRow.defaultType === "string") {
      const variant = enumVariants.find((enumVariantRow) => enumVariantRow.textValue === fieldRow.defaultText)
      if (!variant) throw new Error(`Required enum default is not present in enum variants for field ${fieldRow.name}`)
      return variant.position
    }

    if (fieldRow.defaultType === "number") {
      const variant = enumVariants.find((enumVariantRow) => enumVariantRow.numberValue === fieldRow.defaultNumber)
      if (!variant) throw new Error(`Required enum default is not present in enum variants for field ${fieldRow.name}`)
      return variant.position
    }

    throw new Error(`Unsupported required enum default for field ${fieldRow.name}`)
  }

  const writeAll = options.db.transaction(() => {
    options.db.exec(`
      DELETE FROM process_handlers;
      DELETE FROM process_envs;
      DELETE FROM conditions;
      DELETE FROM transitions;
      DELETE FROM transition_comments;
      DELETE FROM states;
      DELETE FROM enum_field_defaults;
      DELETE FROM enum_number_variants;
      DELETE FROM enum_text_variants;
      DELETE FROM enum_variants;
      DELETE FROM array_field_defaults;
      DELETE FROM boolean_field_defaults;
      DELETE FROM number_field_defaults;
      DELETE FROM string_field_defaults;
      DELETE FROM field_defaults;
      DELETE FROM fields;
      DELETE FROM processes;
      DELETE FROM reactions;
      DELETE FROM sections;
      DELETE FROM meta;
    `)

    options.db
      .query(
        `INSERT INTO meta (id, name, configMultiline, desc, descPosition, dev, devPosition)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        metaRow.name,
        metaRow.configMultiline === null ? null : Number(metaRow.configMultiline),
        metaRow.desc,
        metaRow.descPosition,
        metaRow.dev === null ? null : Number(metaRow.dev),
        metaRow.devPosition,
      )

    const insertSection = options.db.query(
      `INSERT INTO sections (name, params, code)
       VALUES (?, ?, ?)`,
    )
    for (const sectionRow of sectionRows) {
      insertSection.run(sectionRow.name, sectionRow.params, sectionRow.code)
    }

    const insertField = options.db.query(
      `INSERT INTO fields (id, position, name, type, required, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const insertFieldDefault = options.db.query(`INSERT INTO field_defaults (fieldId) VALUES (?)`)
    const insertStringFieldDefault = options.db.query(`INSERT INTO string_field_defaults (fieldId, value) VALUES (?, ?)`)
    const insertNumberFieldDefault = options.db.query(`INSERT INTO number_field_defaults (fieldId, value) VALUES (?, ?)`)
    const insertBooleanFieldDefault = options.db.query(`INSERT INTO boolean_field_defaults (fieldId, value) VALUES (?, ?)`)
    const insertArrayFieldDefault = options.db.query(`INSERT INTO array_field_defaults (fieldId) VALUES (?)`)
    const insertEnumFieldDefault = options.db.query(
      `INSERT INTO enum_field_defaults (fieldId, variantPosition)
       VALUES (?, ?)`,
    )
    const requiredEnumDefaultRows: Array<{ fieldId: number; variantPosition: number }> = []
    for (const fieldRow of fieldRows) {
      insertField.run(
        fieldRow.id,
        fieldRow.position,
        fieldRow.name,
        fieldRow.type,
        fieldRow.presence === null ? null : Number(fieldRow.presence === "required"),
        fieldRow.label,
      )

      if (fieldRow.presence !== "required") continue

      insertFieldDefault.run(fieldRow.id)

      switch (fieldRow.type) {
        case "string":
          if (fieldRow.defaultType !== "string" || fieldRow.defaultText === null) {
            throw new Error(`Required string field ${fieldRow.name} must have a string default`)
          }

          insertStringFieldDefault.run(fieldRow.id, fieldRow.defaultText)
          break
        case "number":
          if (fieldRow.defaultType !== "number" || fieldRow.defaultNumber === null) {
            throw new Error(`Required number field ${fieldRow.name} must have a number default`)
          }

          insertNumberFieldDefault.run(fieldRow.id, fieldRow.defaultNumber)
          break
        case "boolean":
          if (fieldRow.defaultType !== "boolean" || fieldRow.defaultBoolean === null) {
            throw new Error(`Required boolean field ${fieldRow.name} must have a boolean default`)
          }

          insertBooleanFieldDefault.run(fieldRow.id, Number(fieldRow.defaultBoolean))
          break
        case "array":
          if (fieldRow.defaultType !== "array") {
            throw new Error(`Required array field ${fieldRow.name} must have an empty array default`)
          }

          insertArrayFieldDefault.run(fieldRow.id)
          break
        case "enum":
          requiredEnumDefaultRows.push({
            fieldId: fieldRow.id,
            variantPosition: getEnumDefaultVariantPosition(fieldRow),
          })
          break
      }
    }

    const insertEnumVariant = options.db.query(
      `INSERT INTO enum_variants (fieldId, position)
       VALUES (?, ?)`,
    )
    const insertEnumTextVariant = options.db.query(
      `INSERT INTO enum_text_variants (fieldId, position, value)
       VALUES (?, ?, ?)`,
    )
    const insertEnumNumberVariant = options.db.query(
      `INSERT INTO enum_number_variants (fieldId, position, value)
       VALUES (?, ?, ?)`,
    )
    for (const enumVariantRow of enumVariantRows) {
      insertEnumVariant.run(enumVariantRow.fieldId, enumVariantRow.position)
      if (enumVariantRow.textValue !== null) {
        insertEnumTextVariant.run(enumVariantRow.fieldId, enumVariantRow.position, enumVariantRow.textValue)
      } else if (enumVariantRow.numberValue !== null) {
        insertEnumNumberVariant.run(enumVariantRow.fieldId, enumVariantRow.position, enumVariantRow.numberValue)
      } else {
        throw new Error(`Enum variant ${enumVariantRow.fieldId}:${enumVariantRow.position} has no typed value`)
      }
    }

    for (const requiredEnumDefaultRow of requiredEnumDefaultRows) {
      insertEnumFieldDefault.run(requiredEnumDefaultRow.fieldId, requiredEnumDefaultRow.variantPosition)
    }

    const insertState = options.db.query(
      `INSERT INTO states (id, position, name)
       VALUES (?, ?, ?)`,
    )
    for (const stateRow of stateRows) {
      insertState.run(stateRow.id, stateRow.position, stateRow.name)
    }

    const insertTransitionComment = options.db.query(
      `INSERT INTO transition_comments (id, stateId, position, text)
       VALUES (?, ?, ?, ?)`,
    )
    for (const transitionCommentRow of transitionCommentRows) {
      insertTransitionComment.run(
        transitionCommentRow.id,
        transitionCommentRow.stateId,
        transitionCommentRow.position,
        transitionCommentRow.text,
      )
    }

    const insertTransition = options.db.query(
      `INSERT INTO transitions (id, stateId, targetStateId, position)
       VALUES (?, ?, ?, ?)`,
    )
    for (const transitionRow of transitionRows) {
      insertTransition.run(transitionRow.id, transitionRow.stateId, transitionRow.targetStateId, transitionRow.position)
    }

    const insertCondition = options.db.query(
      `INSERT INTO conditions (transitionId, position, fieldId, nullValue)
       VALUES (?, ?, ?, ?)`,
    )
    for (const conditionRow of conditionRows) {
      insertCondition.run(conditionRow.transitionId, conditionRow.position, conditionRow.fieldId, Number(conditionRow.nullValue))
    }

    const insertProcess = options.db.query(
      `INSERT INTO processes (
         id,
         position,
         name,
         builder,
         gapBefore,
         configMultiline,
         label,
         labelPosition,
         desc,
         descPosition,
         envPosition
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const processRow of processRows) {
      insertProcess.run(
        processRow.id,
        processRow.position,
        processRow.name,
        processRow.builder,
        processRow.gapBefore,
        processRow.configMultiline === null ? null : Number(processRow.configMultiline),
        processRow.label,
        processRow.labelPosition,
        processRow.desc,
        processRow.descPosition,
        processRow.envPosition,
      )
    }

    const insertProcessEnv = options.db.query(
      `INSERT INTO process_envs (processId, position, env)
       VALUES (?, ?, ?)`,
    )
    for (const processEnvRow of processEnvRows) {
      insertProcessEnv.run(processEnvRow.processId, processEnvRow.position, processEnvRow.env)
    }

    const insertProcessHandler = options.db.query(
      `INSERT INTO process_handlers (processId, position, step, code)
       VALUES (?, ?, ?, ?)`,
    )
    for (const processHandlerRow of processHandlerRows) {
      insertProcessHandler.run(processHandlerRow.processId, processHandlerRow.position, processHandlerRow.step, processHandlerRow.code)
    }

    const insertReaction = options.db.query(
      `INSERT INTO reactions (id, position, code)
       VALUES (?, ?, ?)`,
    )
    for (const reactionRow of reactionRows) {
      insertReaction.run(reactionRow.id, reactionRow.position, reactionRow.code)
    }
  })

  writeAll()
  return {
    name: metaRow.name,
    desc: metaRow.desc,
    dev: metaRow.dev,
  }
}
