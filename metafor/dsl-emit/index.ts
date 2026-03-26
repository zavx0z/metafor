import type { Database } from "bun:sqlite"
import * as prettier from "prettier"
import * as ts from "typescript"
import {
  ensureDslRoundTripSchema,
  type DslFieldRow,
  type DslProcessRow,
  type DslReactionRow,
  type DslSectionName,
  type DslSectionRow,
  type DslStateEntryRow,
  type DslStateRow,
} from "@metafor/dsl-parse"

export interface EmitDslModuleFromDbOptions {
  db: Database
  moduleKey: string
  format?: boolean
  filepath?: string
}

const getRequiredRow = <T>(row: T | null | undefined, message: string): T => {
  if (!row) throw new Error(message)
  return row
}

const indentBlock = (source: string, spaces: number) => {
  const prefix = " ".repeat(spaces)
  return source
    .split("\n")
    .map((line) => (line.length === 0 ? line : `${prefix}${line}`))
    .join("\n")
}

const identifierPattern = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u

const renderPropertyName = (name: string) =>
  identifierPattern.test(name) ? name : JSON.stringify(name)

const wrapArrowParams = (paramsSource: string | null) => `(${paramsSource ?? ""})`

const parseParameterNames = (paramsSource: string | null) =>
  (paramsSource ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

const renderObjectLiteral = (memberSources: string[]) => {
  if (memberSources.length === 0) return "{}"
  return `{\n${memberSources.map((memberSource) => indentBlock(memberSource, 2)).join("\n")}\n}`
}

const renderArrayLiteral = (elementSources: string[]) => {
  if (elementSources.length === 0) return "[]"
  return `[\n${elementSources.map((elementSource) => indentBlock(elementSource, 2)).join("\n")}\n]`
}

const renderFieldProperty = (fieldRow: DslFieldRow, fieldFactoryName: string) => {
  let source =
    fieldRow.fieldKind === "enum"
      ? `${fieldFactoryName}.enum(${JSON.parse(fieldRow.enumValuesJson ?? "[]").map((value: string) => JSON.stringify(value)).join(", ")})`
      : `${fieldFactoryName}.${fieldRow.fieldKind}`

  if (fieldRow.modifierKind) {
    source += fieldRow.modifierArgSource === null ? `.${fieldRow.modifierKind}()` : `.${fieldRow.modifierKind}(${fieldRow.modifierArgSource})`
  }

  return `${renderPropertyName(fieldRow.fieldKey)}: ${source},`
}

const renderStateProperty = (stateRow: DslStateRow, entries: DslStateEntryRow[]) => {
  if (entries.length === 0) {
    return `${renderPropertyName(stateRow.stateName)}: {},`
  }

  const entrySources = entries.map((entry) => {
    if (entry.entryKind === "comment") {
      return entry.commentSource ?? ""
    }

    return `${renderPropertyName(entry.targetState ?? "")}: ${entry.conditionSource ?? "{}"},`
  })

  return `${renderPropertyName(stateRow.stateName)}: {\n${indentBlock(entrySources.join("\n"), 2)}\n},`
}

const renderProcessProperty = (processRow: DslProcessRow, processName: string, destroyName: string | undefined) => {
  const builderName = processRow.processKind === "process" ? processName : destroyName
  if (!builderName) {
    throw new Error(`Missing destroy builder parameter for process ${processRow.processKey}`)
  }

  let source = `${renderPropertyName(processRow.processKey)}: ${builderName}(${processRow.configSource ?? ""})`
  if (processRow.actionSource) source += `.action(${processRow.actionSource})`
  if (processRow.successSource) source += `.success(${processRow.successSource})`
  if (processRow.errorSource) source += `.error(${processRow.errorSource})`
  if (processRow.beforeSource) source += `.before(${processRow.beforeSource})`
  return `${source},`
}

const renderFieldsArgument = (sectionRow: DslSectionRow, fieldRows: DslFieldRow[]) => {
  const [fieldFactoryName = "field"] = parseParameterNames(sectionRow.paramsSource)
  if (fieldRows.length === 0) return `${wrapArrowParams(sectionRow.paramsSource)} => ({})`
  return `${wrapArrowParams(sectionRow.paramsSource)} => (${renderObjectLiteral(fieldRows.map((fieldRow) => renderFieldProperty(fieldRow, fieldFactoryName)))})`
}

const renderSuperpositionArgument = (stateRows: DslStateRow[], stateEntryRows: DslStateEntryRow[]) => {
  const stateEntries = new Map<number, DslStateEntryRow[]>()
  for (const stateEntryRow of stateEntryRows) {
    const list = stateEntries.get(stateEntryRow.stateOrder) ?? []
    list.push(stateEntryRow)
    stateEntries.set(stateEntryRow.stateOrder, list)
  }

  return renderObjectLiteral(
    stateRows.map((stateRow) => renderStateProperty(stateRow, stateEntries.get(stateRow.stateOrder) ?? [])),
  )
}

const renderProcessesArgument = (sectionRow: DslSectionRow, processRows: DslProcessRow[]) => {
  const [processName = "process", destroyName] = parseParameterNames(sectionRow.paramsSource)
  if (processRows.length === 0) return `${wrapArrowParams(sectionRow.paramsSource)} => ({})`

  let body = ""
  for (const [index, processRow] of processRows.entries()) {
    if (index > 0) {
      body += "\n".repeat(Math.max(1, processRow.gapBefore + 1))
    }

    body += indentBlock(renderProcessProperty(processRow, processName, destroyName), 2)
  }

  return `${wrapArrowParams(sectionRow.paramsSource)} => ({\n${body}\n})`
}

const renderReactionsArgument = (sectionRow: DslSectionRow, reactionRows: DslReactionRow[]) =>
  `${wrapArrowParams(sectionRow.paramsSource)} => ${renderArrayLiteral(reactionRows.map((reactionRow) => `${reactionRow.reactionSource},`))}`

const formatDiagnostic = (diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  if (diagnostic.start === undefined) return message

  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
  return `${position.line + 1}:${position.character + 1} ${message}`
}

const validateTypeScriptModule = (source: string, filepath: string) => {
  const sourceFile = ts.createSourceFile(filepath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  if (diagnostics.length === 0) return

  const message = diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, sourceFile)).join("; ")
  throw new Error(`Emitted TypeScript is invalid: ${message}`)
}

export const formatTypeScriptSource = async (source: string, filepath: string) => {
  const resolvedConfig = await prettier.resolveConfig(filepath)
  return prettier.format(source, {
    ...(resolvedConfig ?? {}),
    filepath,
  })
}

const renderSectionCall = (sectionName: DslSectionName, argumentSource: string | null) =>
  argumentSource === null ? `  .${sectionName}()` : `  .${sectionName}(${argumentSource})`

export const emitDslModuleFromDb = async (options: EmitDslModuleFromDbOptions) => {
  ensureDslRoundTripSchema(options.db)

  const moduleRow = getRequiredRow(
    options.db
      .query(
        `SELECT moduleKey, sourcePath, metaName, metaConfigSource
         FROM dsl_modules
         WHERE moduleKey = ?`,
      )
      .get(options.moduleKey) as
      | {
          moduleKey: string
          sourcePath: string | null
          metaName: string
          metaConfigSource: string | null
        }
      | undefined,
    `Unknown module key: ${options.moduleKey}`,
  )

  const importRows = options.db
    .query(
      `SELECT importSource
       FROM dsl_imports
       WHERE moduleKey = ?
       ORDER BY importOrder`,
    )
    .all(options.moduleKey) as Array<{ importSource: string }>

  const sectionRows = options.db
    .query(
      `SELECT moduleKey, sectionName, sectionOrder, bodyKind, paramsSource, argumentSource
       FROM dsl_sections
       WHERE moduleKey = ?
       ORDER BY sectionOrder`,
    )
    .all(options.moduleKey) as DslSectionRow[]

  const fieldRows = options.db
    .query(
      `SELECT moduleKey, fieldOrder, fieldKey, fieldKind, enumValuesJson, modifierKind, modifierArgSource
       FROM dsl_fields
       WHERE moduleKey = ?
       ORDER BY fieldOrder`,
    )
    .all(options.moduleKey) as DslFieldRow[]

  const stateRows = options.db
    .query(
      `SELECT moduleKey, stateOrder, stateName
       FROM dsl_states
       WHERE moduleKey = ?
       ORDER BY stateOrder`,
    )
    .all(options.moduleKey) as DslStateRow[]

  const stateEntryRows = options.db
    .query(
      `SELECT moduleKey, stateOrder, entryOrder, entryKind, targetState, conditionSource, commentSource
       FROM dsl_state_entries
       WHERE moduleKey = ?
       ORDER BY stateOrder, entryOrder`,
    )
    .all(options.moduleKey) as DslStateEntryRow[]

  const processRows = options.db
    .query(
      `SELECT moduleKey, processOrder, processKey, processKind, gapBefore, configSource, actionSource, successSource, errorSource, beforeSource
       FROM dsl_processes
       WHERE moduleKey = ?
       ORDER BY processOrder`,
    )
    .all(options.moduleKey) as DslProcessRow[]

  const reactionRows = options.db
    .query(
      `SELECT moduleKey, reactionOrder, reactionSource
       FROM dsl_reactions
       WHERE moduleKey = ?
       ORDER BY reactionOrder`,
    )
    .all(options.moduleKey) as DslReactionRow[]

  const sections = new Map(sectionRows.map((row) => [row.sectionName, row]))
  const getSection = (sectionName: DslSectionName) =>
    getRequiredRow(sections.get(sectionName), `Missing ${sectionName} section for ${options.moduleKey}`)

  const fieldsSection = getSection("fields")
  const superpositionSection = getSection("superposition")
  const massSection = getSection("mass")
  const processesSection = getSection("processes")
  const reactionsSection = getSection("reactions")
  const matterSection = getSection("matter")
  const bulkSection = getSection("bulk")

  const metaArgs = [JSON.stringify(moduleRow.metaName)]
  if (moduleRow.metaConfigSource) metaArgs.push(moduleRow.metaConfigSource)

  let source = ""
  if (importRows.length > 0) {
    source += `${importRows.map((row) => row.importSource).join("\n")}\n\n`
  }

  source += `export default MetaFor(${metaArgs.join(", ")})`
  source += `\n${renderSectionCall("fields", renderFieldsArgument(fieldsSection, fieldRows))}`
  source += `\n${renderSectionCall("superposition", renderSuperpositionArgument(stateRows, stateEntryRows))}`
  source += `\n${renderSectionCall("mass", massSection.argumentSource)}`
  source += `\n${renderSectionCall("processes", renderProcessesArgument(processesSection, processRows))}`
  source += `\n${renderSectionCall("reactions", renderReactionsArgument(reactionsSection, reactionRows))}`
  source += `\n${renderSectionCall("matter", matterSection.argumentSource)}`
  source += `\n${renderSectionCall("bulk", bulkSection.argumentSource)}\n`

  const filepath = options.filepath ?? moduleRow.sourcePath ?? `${moduleRow.metaName}.ts`
  validateTypeScriptModule(source, filepath)

  if (!options.format) return source
  return formatTypeScriptSource(source, filepath)
}
