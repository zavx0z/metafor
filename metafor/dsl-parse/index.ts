import type { Database } from "bun:sqlite"
import * as ts from "typescript"
import {
  dslSectionOrder,
  ensureDslRoundTripSchema,
  type DslBodyKind,
  type DslFieldRow,
  type DslModuleRow,
  type DslProcessRow,
  type DslReactionRow,
  type DslSectionName,
  type DslSectionRow,
  type DslStateRow,
} from "./schema.ts"

export {
  dslRoundTripSchemaSql,
  dslSectionOrder,
  ensureDslRoundTripSchema,
  type DslBodyKind,
  type DslFieldRow,
  type DslModuleRow,
  type DslProcessRow,
  type DslReactionRow,
  type DslSectionName,
  type DslSectionRow,
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

const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
})

const dslSectionSet = new Set<DslSectionName>(dslSectionOrder)

const printNode = (node: ts.Node, sourceFile: ts.SourceFile, hint: ts.EmitHint = ts.EmitHint.Unspecified) =>
  printer.printNode(hint, node, sourceFile).trim()

const printExpression = (node: ts.Expression, sourceFile: ts.SourceFile) => printNode(node, sourceFile, ts.EmitHint.Expression)

const getSourceText = (node: ts.Node, sourceFile: ts.SourceFile) => sourceFile.text.slice(node.getStart(sourceFile), node.end).trim()

const formatDiagnostic = (diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  if (diagnostic.start === undefined) return message

  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
  return `${position.line + 1}:${position.character + 1} ${message}`
}

const assertNoParseDiagnostics = (sourceFile: ts.SourceFile) => {
  if (sourceFile.parseDiagnostics.length === 0) return

  const message = sourceFile.parseDiagnostics.map((diagnostic) => formatDiagnostic(diagnostic, sourceFile)).join("; ")
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

const parseArrowObjectSection = (call: ts.CallExpression, sourceFile: ts.SourceFile, sectionName: "fields" | "processes") => {
  const argument = getOnlyArgument(call, sectionName)
  if (!ts.isArrowFunction(argument)) {
    throw new Error(`${sectionName} must receive an arrow function`)
  }

  const body = unwrapParenthesized(argument.body)
  if (!ts.isObjectLiteralExpression(body)) {
    throw new Error(`${sectionName} must return an object literal`)
  }

  return {
    paramsSource: argument.parameters.map((parameter) => printNode(parameter, sourceFile)).join(", "),
    argumentSource: getSourceText(argument, sourceFile),
    body,
  }
}

const parseArrowArraySection = (call: ts.CallExpression, sourceFile: ts.SourceFile, sectionName: "reactions") => {
  const argument = getOnlyArgument(call, sectionName)
  if (!ts.isArrowFunction(argument)) {
    throw new Error(`${sectionName} must receive an arrow function`)
  }

  const body = unwrapParenthesized(argument.body)
  if (!ts.isArrayLiteralExpression(body)) {
    throw new Error(`${sectionName} must return an array literal`)
  }

  return {
    paramsSource: argument.parameters.map((parameter) => printNode(parameter, sourceFile)).join(", "),
    argumentSource: getSourceText(argument, sourceFile),
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
      pushSection("fields", "arrow-object", parsed.paramsSource, parsed.argumentSource)

      for (const [fieldOrder, property] of parsed.body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("fields body must contain property assignments only")

        fieldRows.push({
          moduleKey: moduleRow.moduleKey,
          fieldOrder,
          fieldKey: getPropertyNameText(property.name, sourceFile),
          fieldSource: printNode(property, sourceFile),
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

      pushSection("superposition", "object", null, getSourceText(argument, sourceFile))

      for (const [stateOrder, property] of body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("superposition body must contain property assignments only")

        stateRows.push({
          moduleKey: moduleRow.moduleKey,
          stateOrder,
          stateName: getPropertyNameText(property.name, sourceFile),
          stateSource: printNode(property, sourceFile),
        })
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
      pushSection("processes", "arrow-object", parsed.paramsSource, parsed.argumentSource)

      for (const [processOrder, property] of parsed.body.properties.entries()) {
        if (!ts.isPropertyAssignment(property)) throw new Error("processes body must contain property assignments only")

        processRows.push({
          moduleKey: moduleRow.moduleKey,
          processOrder,
          processKey: getPropertyNameText(property.name, sourceFile),
          processSource: printNode(property, sourceFile),
        })
      }
      continue
    }

    if (step.name === "reactions") {
      const parsed = parseArrowArraySection(step.call, sourceFile, "reactions")
      pushSection("reactions", "arrow-array", parsed.paramsSource, parsed.argumentSource)

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
      `INSERT INTO dsl_fields (moduleKey, fieldOrder, fieldKey, fieldSource)
       VALUES (?, ?, ?, ?)`,
    )
    for (const fieldRow of fieldRows) {
      insertField.run(fieldRow.moduleKey, fieldRow.fieldOrder, fieldRow.fieldKey, fieldRow.fieldSource)
    }

    const insertState = options.db.query(
      `INSERT INTO dsl_states (moduleKey, stateOrder, stateName, stateSource)
       VALUES (?, ?, ?, ?)`,
    )
    for (const stateRow of stateRows) {
      insertState.run(stateRow.moduleKey, stateRow.stateOrder, stateRow.stateName, stateRow.stateSource)
    }

    const insertProcess = options.db.query(
      `INSERT INTO dsl_processes (moduleKey, processOrder, processKey, processSource)
       VALUES (?, ?, ?, ?)`,
    )
    for (const processRow of processRows) {
      insertProcess.run(processRow.moduleKey, processRow.processOrder, processRow.processKey, processRow.processSource)
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
