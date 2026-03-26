import type { Database } from "bun:sqlite"
import * as ts from "typescript"
import {
  dslSectionOrder,
  ensureDslRoundTripSchema,
  type DslBodyKind,
  type DslFieldKind,
  type DslFieldModifierKind,
  type DslFieldRow,
  type DslModuleRow,
  type DslProcessKind,
  type DslProcessRow,
  type DslReactionRow,
  type DslSectionName,
  type DslSectionRow,
  type DslStateEntryRow,
  type DslStateRow,
} from "./schema.ts"

export {
  dslRoundTripSchemaSql,
  dslSectionOrder,
  ensureDslRoundTripSchema,
  type DslBodyKind,
  type DslFieldKind,
  type DslFieldModifierKind,
  type DslFieldRow,
  type DslModuleRow,
  type DslProcessKind,
  type DslProcessRow,
  type DslReactionRow,
  type DslSectionName,
  type DslSectionRow,
  type DslStateEntryRow,
  type DslStateRow,
} from "./schema.ts"

export interface ParseDslModuleToDbOptions {
  db: Database
  sourceText: string
  moduleKey?: string
  sourcePath?: string | null
  filename?: string
}

export interface ParseDslModuleToDbResult extends DslModuleRow {}

interface ChainStep {
  name: DslSectionName
  call: ts.CallExpression
}

interface ProcessStepCall {
  name: string
  call: ts.CallExpression
}

interface ParsedArrowCollectionSection<TBody extends ts.ObjectLiteralExpression | ts.ArrayLiteralExpression> {
  paramsSource: string
  parameterNames: string[]
  body: TBody
}

const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
})

const dslSectionSet = new Set<DslSectionName>(dslSectionOrder)

const printNode = (node: ts.Node, sourceFile: ts.SourceFile, hint: ts.EmitHint = ts.EmitHint.Unspecified) =>
  printer.printNode(hint, node, sourceFile).trim()

const getSourceText = (node: ts.Node, sourceFile: ts.SourceFile) => sourceFile.text.slice(node.getStart(sourceFile), node.end).trim()

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

const isDslSectionName = (value: string): value is DslSectionName => dslSectionSet.has(value as DslSectionName)

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

const getOnlyArgument = (call: ts.CallExpression, sectionName: DslSectionName | "MetaFor") => {
  if (call.arguments.length !== 1) {
    throw new Error(`${sectionName} expects exactly one argument, received ${call.arguments.length}`)
  }

  const [argument] = call.arguments
  if (!argument) throw new Error(`${sectionName} is missing its argument`)
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
    paramsSource: argument.parameters.map((parameter) => getSourceText(parameter, sourceFile)).join(", "),
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
    paramsSource: argument.parameters.map((parameter) => getSourceText(parameter, sourceFile)).join(", "),
    parameterNames: getIdentifierParameterNames(argument.parameters, sourceFile),
    body,
  }
}

const collectChainSteps = (expression: ts.Expression): { metaForCall: ts.CallExpression; steps: ChainStep[] } => {
  const steps: ChainStep[] = []
  let current: ts.Expression = expression

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const sectionName = current.expression.name.text
    if (!isDslSectionName(sectionName)) {
      throw new Error(`Unsupported MetaFor chain section: ${sectionName}`)
    }

    steps.unshift({ name: sectionName, call: current })
    current = current.expression.expression
  }

  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression) || current.expression.text !== "MetaFor") {
    throw new Error("Expected export default MetaFor(...) chain")
  }

  return { metaForCall: current, steps }
}

const getExportAssignment = (sourceFile: ts.SourceFile) => {
  const exportAssignments = sourceFile.statements.filter(ts.isExportAssignment)
  if (exportAssignments.length !== 1) {
    throw new Error(`Expected exactly one export default assignment, found ${exportAssignments.length}`)
  }

  const [exportAssignment] = exportAssignments
  if (!exportAssignment) throw new Error("Missing export default assignment")
  return exportAssignment
}

const parseFieldInitializer = (
  initializer: ts.Expression,
  fieldFactoryName: string,
  sourceFile: ts.SourceFile,
): Pick<DslFieldRow, "fieldKind" | "enumValuesJson" | "modifierKind" | "modifierArgSource"> => {
  let current = initializer
  let modifierKind: DslFieldModifierKind = null
  let modifierArgSource: string | null = null

  if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const maybeModifier = current.expression.name.text
    if (maybeModifier === "optional" || maybeModifier === "required") {
      modifierKind = maybeModifier
      modifierArgSource = current.arguments[0] ? getSourceText(current.arguments[0], sourceFile) : null
      current = current.expression.expression
    }
  }

  if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === fieldFactoryName) {
    return {
      fieldKind: current.name.text as DslFieldKind,
      enumValuesJson: null,
      modifierKind,
      modifierArgSource,
    }
  }

  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    ts.isIdentifier(current.expression.expression) &&
    current.expression.expression.text === fieldFactoryName &&
    current.expression.name.text === "enum"
  ) {
    const enumValues = current.arguments.map((argument) => {
      if (!ts.isStringLiteralLike(argument)) {
        throw new Error(`field.enum values must be string literals, received ${getSourceText(argument, sourceFile)}`)
      }

      return argument.text
    })

    return {
      fieldKind: "enum",
      enumValuesJson: JSON.stringify(enumValues),
      modifierKind,
      modifierArgSource,
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

const parseProcessInitializer = (
  initializer: ts.Expression,
  processName: string,
  destroyName: string | undefined,
  sourceFile: ts.SourceFile,
): Pick<DslProcessRow, "processKind" | "configSource" | "actionSource" | "successSource" | "errorSource" | "beforeSource"> => {
  const stepCalls: ProcessStepCall[] = []
  let current: ts.Expression = initializer

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    stepCalls.unshift({ name: current.expression.name.text as DslSectionName, call: current })
    current = current.expression.expression
  }

  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression)) {
    throw new Error(`Unsupported process authoring form: ${getSourceText(initializer, sourceFile)}`)
  }

  let processKind: DslProcessKind
  if (current.expression.text === processName) {
    processKind = "process"
  } else if (destroyName && current.expression.text === destroyName) {
    processKind = "destroy"
  } else {
    throw new Error(`Unsupported process builder: ${current.expression.text}`)
  }

  if (current.arguments.length > 1) {
    throw new Error(`Process builder accepts at most one config argument, received ${current.arguments.length}`)
  }

  const parsed: Pick<DslProcessRow, "processKind" | "configSource" | "actionSource" | "successSource" | "errorSource" | "beforeSource"> = {
    processKind,
    configSource: current.arguments[0] ? getSourceText(current.arguments[0], sourceFile) : null,
    actionSource: null,
    successSource: null,
    errorSource: null,
    beforeSource: null,
  }

  for (const step of stepCalls) {
    const [argument] = step.call.arguments
    switch (step.name) {
      case "action":
        parsed.actionSource = argument ? getSourceText(argument, sourceFile) : null
        break
      case "success":
        parsed.successSource = argument ? getSourceText(argument, sourceFile) : null
        break
      case "error":
        parsed.errorSource = argument ? getSourceText(argument, sourceFile) : null
        break
      case "before":
        parsed.beforeSource = argument ? getSourceText(argument, sourceFile) : null
        break
      default:
        throw new Error(`Unsupported process step: ${step.name}`)
    }
  }

  return parsed
}

export const parseDslModuleToDb = (options: ParseDslModuleToDbOptions): ParseDslModuleToDbResult => {
  ensureDslRoundTripSchema(options.db)

  const filename = options.filename ?? options.sourcePath ?? options.moduleKey ?? "meta.ts"
  const sourceFile = ts.createSourceFile(filename, options.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assertNoParseDiagnostics(sourceFile)

  const exportAssignment = getExportAssignment(sourceFile)
  const { metaForCall, steps } = collectChainSteps(exportAssignment.expression)

  if (steps.length !== dslSectionOrder.length || steps.some((step, index) => step.name !== dslSectionOrder[index])) {
    const actual = steps.map((step) => step.name).join(" -> ")
    const expected = dslSectionOrder.join(" -> ")
    throw new Error(`Unexpected MetaFor chain order. Expected ${expected}. Received ${actual}`)
  }

  if (metaForCall.arguments.length < 1 || metaForCall.arguments.length > 2) {
    throw new Error(`MetaFor expects one or two arguments, received ${metaForCall.arguments.length}`)
  }

  const [metaNameNode, metaConfigNode] = metaForCall.arguments
  if (!metaNameNode || !ts.isStringLiteralLike(metaNameNode)) {
    throw new Error("MetaFor first argument must be a string literal")
  }

  const moduleRow: DslModuleRow = {
    moduleKey: options.moduleKey ?? options.sourcePath ?? metaNameNode.text,
    sourcePath: options.sourcePath ?? null,
    metaName: metaNameNode.text,
    metaConfigSource: metaConfigNode ? getSourceText(metaConfigNode, sourceFile) : null,
  }

  const importSources = sourceFile.statements.filter(ts.isImportDeclaration).map((statement) => getSourceText(statement, sourceFile))

  const sectionRows: DslSectionRow[] = []
  const fieldRows: DslFieldRow[] = []
  const stateRows: DslStateRow[] = []
  const stateEntryRows: DslStateEntryRow[] = []
  const processRows: DslProcessRow[] = []
  const reactionRows: DslReactionRow[] = []

  const pushSection = (
    sectionName: DslSectionName,
    bodyKind: DslBodyKind,
    paramsSource: string | null,
    argumentSource: string | null,
  ) => {
    sectionRows.push({
      moduleKey: moduleRow.moduleKey,
      sectionName,
      sectionOrder: dslSectionOrder.indexOf(sectionName),
      bodyKind,
      paramsSource,
      argumentSource,
    })
  }

  for (const step of steps) {
    if (step.name === "fields") {
      const parsed = parseArrowObjectSection(step.call, sourceFile, "fields")
      const [fieldFactoryName] = parsed.parameterNames
      if (!fieldFactoryName) throw new Error("fields must declare a field factory parameter")

      pushSection("fields", "arrow-object", parsed.paramsSource, null)

      for (const [fieldOrder, property] of parsed.body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("fields body must contain property assignments only")

        fieldRows.push({
          moduleKey: moduleRow.moduleKey,
          fieldOrder,
          fieldKey: getPropertyNameText(property.name, sourceFile),
          ...parseFieldInitializer(property.initializer, fieldFactoryName, sourceFile),
        })
      }
      continue
    }

    if (step.name === "superposition") {
      const argument = getOnlyArgument(step.call, "superposition")
      const body = unwrapParenthesized(argument)
      if (!ts.isObjectLiteralExpression(body)) {
        throw new Error("superposition must receive an object literal")
      }

      pushSection("superposition", "object", null, null)

      for (const [stateOrder, property] of body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("superposition body must contain property assignments only")

        stateRows.push({
          moduleKey: moduleRow.moduleKey,
          stateOrder,
          stateName: getPropertyNameText(property.name, sourceFile),
        })

        const stateBody = unwrapParenthesized(property.initializer)
        if (!ts.isObjectLiteralExpression(stateBody)) {
          throw new Error(`State ${getPropertyNameText(property.name, sourceFile)} must be an object literal`)
        }

        let entryOrder = 0
        for (const entryProperty of stateBody.properties) {
          if (!ts.isPropertyAssignment(entryProperty)) {
            throw new Error("State bodies must contain property assignments only")
          }

          for (const commentSource of getLeadingCommentSources(entryProperty, sourceFile)) {
            stateEntryRows.push({
              moduleKey: moduleRow.moduleKey,
              stateOrder,
              entryOrder: entryOrder++,
              entryKind: "comment",
              targetState: null,
              conditionSource: null,
              commentSource,
            })
          }

          stateEntryRows.push({
            moduleKey: moduleRow.moduleKey,
            stateOrder,
            entryOrder: entryOrder++,
            entryKind: "transition",
            targetState: getPropertyNameText(entryProperty.name, sourceFile),
            conditionSource: getSourceText(entryProperty.initializer, sourceFile),
            commentSource: null,
          })
        }
      }
      continue
    }

    if (step.name === "mass") {
      const argument = getOnlyArgument(step.call, "mass")
      pushSection("mass", "expression", null, getSourceText(argument, sourceFile))
      continue
    }

    if (step.name === "processes") {
      const parsed = parseArrowObjectSection(step.call, sourceFile, "processes")
      const [processName, destroyName] = parsed.parameterNames
      if (!processName && parsed.body.properties.length > 0) {
        throw new Error("processes must declare a process builder parameter when the section is not empty")
      }

      pushSection("processes", "arrow-object", parsed.paramsSource, null)

      let previousPropertyEnd = parsed.body.getStart(sourceFile)
      for (const [processOrder, property] of parsed.body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("processes body must contain property assignments only")

        const gapBefore = processOrder === 0 ? 0 : countBlankLines(sourceFile.text.slice(previousPropertyEnd, property.getStart(sourceFile)))
        previousPropertyEnd = property.getEnd()

        processRows.push({
          moduleKey: moduleRow.moduleKey,
          processOrder,
          processKey: getPropertyNameText(property.name, sourceFile),
          gapBefore,
          ...parseProcessInitializer(property.initializer, processName ?? "process", destroyName, sourceFile),
        })
      }
      continue
    }

    if (step.name === "reactions") {
      const parsed = parseArrowArraySection(step.call, sourceFile)
      pushSection("reactions", "arrow-array", parsed.paramsSource, null)

      for (const [reactionOrder, element] of parsed.body.elements.entries()) {
        reactionRows.push({
          moduleKey: moduleRow.moduleKey,
          reactionOrder,
          reactionSource: getSourceText(element, sourceFile),
        })
      }
      continue
    }

    if (step.name === "matter") {
      if (step.call.arguments.length > 1) {
        throw new Error(`matter expects zero or one argument, received ${step.call.arguments.length}`)
      }

      const [argument] = step.call.arguments
      pushSection("matter", "optional-expression", null, argument ? getSourceText(argument, sourceFile) : null)
      continue
    }

    if (step.name === "bulk") {
      if (step.call.arguments.length > 1) {
        throw new Error(`bulk expects zero or one argument, received ${step.call.arguments.length}`)
      }

      const [argument] = step.call.arguments
      pushSection("bulk", "optional-expression", null, argument ? getSourceText(argument, sourceFile) : null)
    }
  }

  const write = options.db.transaction(() => {
    options.db.query(`DELETE FROM dsl_modules WHERE moduleKey = ?`).run(moduleRow.moduleKey)

    options.db
      .query(
        `INSERT INTO dsl_modules (moduleKey, sourcePath, metaName, metaConfigSource)
         VALUES (?, ?, ?, ?)`,
      )
      .run(moduleRow.moduleKey, moduleRow.sourcePath, moduleRow.metaName, moduleRow.metaConfigSource)

    const insertImport = options.db.query(
      `INSERT INTO dsl_imports (moduleKey, importOrder, importSource)
       VALUES (?, ?, ?)`,
    )
    for (const [importOrder, importSource] of importSources.entries()) {
      insertImport.run(moduleRow.moduleKey, importOrder, importSource)
    }

    const insertSection = options.db.query(
      `INSERT INTO dsl_sections (moduleKey, sectionName, sectionOrder, bodyKind, paramsSource, argumentSource)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const sectionRow of sectionRows) {
      insertSection.run(
        sectionRow.moduleKey,
        sectionRow.sectionName,
        sectionRow.sectionOrder,
        sectionRow.bodyKind,
        sectionRow.paramsSource,
        sectionRow.argumentSource,
      )
    }

    const insertField = options.db.query(
      `INSERT INTO dsl_fields (moduleKey, fieldOrder, fieldKey, fieldKind, enumValuesJson, modifierKind, modifierArgSource)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const fieldRow of fieldRows) {
      insertField.run(
        fieldRow.moduleKey,
        fieldRow.fieldOrder,
        fieldRow.fieldKey,
        fieldRow.fieldKind,
        fieldRow.enumValuesJson,
        fieldRow.modifierKind,
        fieldRow.modifierArgSource,
      )
    }

    const insertState = options.db.query(
      `INSERT INTO dsl_states (moduleKey, stateOrder, stateName)
       VALUES (?, ?, ?)`,
    )
    for (const stateRow of stateRows) {
      insertState.run(stateRow.moduleKey, stateRow.stateOrder, stateRow.stateName)
    }

    const insertStateEntry = options.db.query(
      `INSERT INTO dsl_state_entries (moduleKey, stateOrder, entryOrder, entryKind, targetState, conditionSource, commentSource)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const stateEntryRow of stateEntryRows) {
      insertStateEntry.run(
        stateEntryRow.moduleKey,
        stateEntryRow.stateOrder,
        stateEntryRow.entryOrder,
        stateEntryRow.entryKind,
        stateEntryRow.targetState,
        stateEntryRow.conditionSource,
        stateEntryRow.commentSource,
      )
    }

    const insertProcess = options.db.query(
      `INSERT INTO dsl_processes (moduleKey, processOrder, processKey, processKind, gapBefore, configSource, actionSource, successSource, errorSource, beforeSource)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const processRow of processRows) {
      insertProcess.run(
        processRow.moduleKey,
        processRow.processOrder,
        processRow.processKey,
        processRow.processKind,
        processRow.gapBefore,
        processRow.configSource,
        processRow.actionSource,
        processRow.successSource,
        processRow.errorSource,
        processRow.beforeSource,
      )
    }

    const insertReaction = options.db.query(
      `INSERT INTO dsl_reactions (moduleKey, reactionOrder, reactionSource)
       VALUES (?, ?, ?)`,
    )
    for (const reactionRow of reactionRows) {
      insertReaction.run(reactionRow.moduleKey, reactionRow.reactionOrder, reactionRow.reactionSource)
    }
  })

  write()

  return moduleRow
}
