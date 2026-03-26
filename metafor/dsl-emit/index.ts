import type { Database } from "bun:sqlite"
import * as prettier from "prettier"
import * as ts from "typescript"
import {
  ensureDslRoundTripSchema,
  type DslModuleRow,
  type DslSectionName,
  type DslSectionRow,
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

const formatDiagnostic = (diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  if (diagnostic.start === undefined) return message

  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
  return `${position.line + 1}:${position.character + 1} ${message}`
}

const validateTypeScriptModule = (source: string, filepath: string) => {
  const sourceFile = ts.createSourceFile(filepath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (sourceFile.parseDiagnostics.length === 0) return

  const message = sourceFile.parseDiagnostics.map((diagnostic) => formatDiagnostic(diagnostic, sourceFile)).join("; ")
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
      .get(options.moduleKey) as DslModuleRow | undefined,
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
  source += `\n${renderSectionCall("fields", fieldsSection.argumentSource)}`
  source += `\n${renderSectionCall("superposition", superpositionSection.argumentSource)}`
  source += `\n${renderSectionCall("mass", massSection.argumentSource)}`
  source += `\n${renderSectionCall("processes", processesSection.argumentSource)}`
  source += `\n${renderSectionCall("reactions", reactionsSection.argumentSource)}`
  source += `\n${renderSectionCall("matter", matterSection.argumentSource)}`
  source += `\n${renderSectionCall("bulk", bulkSection.argumentSource)}\n`

  const filepath = options.filepath ?? moduleRow.sourcePath ?? `${moduleRow.metaName}.ts`
  validateTypeScriptModule(source, filepath)

  if (!options.format) return source
  return formatTypeScriptSource(source, filepath)
}
