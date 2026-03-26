import type { Database } from "bun:sqlite"
import * as prettier from "prettier"
import * as ts from "typescript"
import {
  ensureRoundTripSchema,
  type ConditionRow,
  type EnumVariantRow,
  type FieldRow,
  type MetaRow,
  type ProcessEnvRow,
  type ProcessHandlerRow,
  type ProcessRow,
  type ReactionRow,
  type SectionName,
  type SectionRow,
  type StateRow,
  type TransitionCommentRow,
  type TransitionRow,
} from "@metafor/dsl-parse"

export interface EmitDslModuleFromDbOptions {
  db: Database
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

const renderPropertyName = (name: string) => (identifierPattern.test(name) ? name : JSON.stringify(name))

const wrapArrowParams = (params: string | null) => `(${params ?? ""})`

const parseParameterNames = (params: string | null) =>
  (params ?? "")
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

const renderCompactObjectLiteral = (memberSources: string[]) => {
  if (memberSources.length === 0) return "{}"
  return `{ ${memberSources.join(", ")} }`
}

const renderMetaConfig = (metaRow: MetaRow) => {
  const members: Array<{ position: number; code: string }> = []
  if (metaRow.descPosition !== null && metaRow.desc !== null) {
    members.push({
      position: metaRow.descPosition,
      code: `desc: ${JSON.stringify(metaRow.desc)}`,
    })
  }

  if (metaRow.devPosition !== null && metaRow.dev !== null) {
    members.push({
      position: metaRow.devPosition,
      code: `dev: ${metaRow.dev ? "true" : "false"}`,
    })
  }

  if (members.length === 0) return null
  members.sort((left, right) => left.position - right.position)
  return metaRow.configMultiline ? renderObjectLiteral(members.map((member) => `${member.code},`)) : renderCompactObjectLiteral(members.map((member) => member.code))
}

const renderFieldDefault = (fieldRow: FieldRow) => {
  switch (fieldRow.defaultType) {
    case "string":
      return JSON.stringify(fieldRow.defaultText ?? "")
    case "number":
      return fieldRow.defaultNumber ?? "0"
    case "boolean":
      return fieldRow.defaultBoolean ? "true" : "false"
    case "array":
      return "[]"
    case "null":
      return "null"
    case null:
      throw new Error(`Missing default literal for required field ${fieldRow.name}`)
  }
}

const renderFieldProperty = (fieldRow: FieldRow, enumVariants: EnumVariantRow[], fieldFactoryName: string) => {
  const enumSource = enumVariants
    .map((variant) => (variant.textValue !== null ? JSON.stringify(variant.textValue) : (variant.numberValue ?? "0")))
    .join(", ")

  let source = fieldRow.type === "enum" ? `${fieldFactoryName}.enum(${enumSource})` : `${fieldFactoryName}.${fieldRow.type}`
  if (fieldRow.presence === "optional") {
    source += fieldRow.label === null ? ".optional()" : `.optional({ label: ${JSON.stringify(fieldRow.label)} })`
  }

  if (fieldRow.presence === "required") {
    const args = [renderFieldDefault(fieldRow)]
    if (fieldRow.label !== null) {
      args.push(`{ label: ${JSON.stringify(fieldRow.label)} }`)
    }

    source += `.required(${args.join(", ")})`
  }

  return `${renderPropertyName(fieldRow.name)}: ${source},`
}

const renderFieldsArgument = (sectionRow: SectionRow, fieldRows: FieldRow[], enumVariantRows: EnumVariantRow[]) => {
  const [fieldFactoryName = "field"] = parseParameterNames(sectionRow.params)
  if (fieldRows.length === 0) return `${wrapArrowParams(sectionRow.params)} => ({})`

  const enumVariantsByFieldId = new Map<number, EnumVariantRow[]>()
  for (const enumVariantRow of enumVariantRows) {
    const list = enumVariantsByFieldId.get(enumVariantRow.fieldId) ?? []
    list.push(enumVariantRow)
    enumVariantsByFieldId.set(enumVariantRow.fieldId, list)
  }

  return `${wrapArrowParams(sectionRow.params)} => (${renderObjectLiteral(
    fieldRows.map((fieldRow) => renderFieldProperty(fieldRow, enumVariantsByFieldId.get(fieldRow.id) ?? [], fieldFactoryName)),
  )})`
}

const renderTransitionConditions = (conditions: ConditionRow[], fieldsById: Map<number, FieldRow>) => {
  if (conditions.length === 0) return "{}"

  return renderCompactObjectLiteral(
    conditions.map((conditionRow) => {
      const fieldRow = getRequiredRow(fieldsById.get(conditionRow.fieldId), `Unknown field id in conditions: ${conditionRow.fieldId}`)
      const conditionSource = conditionRow.nullValue ? "null" : "{ null: false }"
      return `${renderPropertyName(fieldRow.name)}: ${conditionSource}`
    }),
  )
}

const renderStateProperty = (
  stateRow: StateRow,
  transitionCommentRows: TransitionCommentRow[],
  transitionRows: TransitionRow[],
  conditionsByTransitionId: Map<number, ConditionRow[]>,
  statesById: Map<number, StateRow>,
  fieldsById: Map<number, FieldRow>,
) => {
  const items = [
    ...transitionCommentRows.map((transitionCommentRow) => ({
      position: transitionCommentRow.position,
      source: transitionCommentRow.text,
    })),
    ...transitionRows.map((transitionRow) => ({
      position: transitionRow.position,
      source: `${renderPropertyName(getRequiredRow(statesById.get(transitionRow.targetStateId), `Unknown state id: ${transitionRow.targetStateId}`).name)}: ${renderTransitionConditions(
        conditionsByTransitionId.get(transitionRow.id) ?? [],
        fieldsById,
      )},`,
    })),
  ].sort((left, right) => left.position - right.position)

  if (items.length === 0) {
    return `${renderPropertyName(stateRow.name)}: {},`
  }

  return `${renderPropertyName(stateRow.name)}: {\n${indentBlock(items.map((item) => item.source).join("\n"), 2)}\n},`
}

const renderSuperpositionArgument = (
  stateRows: StateRow[],
  transitionCommentRows: TransitionCommentRow[],
  transitionRows: TransitionRow[],
  conditionRows: ConditionRow[],
  fieldRows: FieldRow[],
) => {
  const transitionCommentsByStateId = new Map<number, TransitionCommentRow[]>()
  for (const transitionCommentRow of transitionCommentRows) {
    const list = transitionCommentsByStateId.get(transitionCommentRow.stateId) ?? []
    list.push(transitionCommentRow)
    transitionCommentsByStateId.set(transitionCommentRow.stateId, list)
  }

  const transitionsByStateId = new Map<number, TransitionRow[]>()
  for (const transitionRow of transitionRows) {
    const list = transitionsByStateId.get(transitionRow.stateId) ?? []
    list.push(transitionRow)
    transitionsByStateId.set(transitionRow.stateId, list)
  }

  const conditionsByTransitionId = new Map<number, ConditionRow[]>()
  for (const conditionRow of conditionRows) {
    const list = conditionsByTransitionId.get(conditionRow.transitionId) ?? []
    list.push(conditionRow)
    conditionsByTransitionId.set(conditionRow.transitionId, list)
  }

  const statesById = new Map(stateRows.map((stateRow) => [stateRow.id, stateRow]))
  const fieldsById = new Map(fieldRows.map((fieldRow) => [fieldRow.id, fieldRow]))

  return renderObjectLiteral(
    stateRows.map((stateRow) =>
      renderStateProperty(
        stateRow,
        transitionCommentsByStateId.get(stateRow.id) ?? [],
        transitionsByStateId.get(stateRow.id) ?? [],
        conditionsByTransitionId,
        statesById,
        fieldsById,
      ),
    ),
  )
}

const renderProcessConfig = (processRow: ProcessRow, processEnvRows: ProcessEnvRow[]) => {
  const members: Array<{ position: number; code: string }> = []
  if (processRow.labelPosition !== null && processRow.label !== null) {
    members.push({
      position: processRow.labelPosition,
      code: `label: ${JSON.stringify(processRow.label)}`,
    })
  }

  if (processRow.descPosition !== null && processRow.desc !== null) {
    members.push({
      position: processRow.descPosition,
      code: `desc: ${JSON.stringify(processRow.desc)}`,
    })
  }

  if (processRow.envPosition !== null) {
    members.push({
      position: processRow.envPosition,
      code: `env: [${processEnvRows.map((processEnvRow) => JSON.stringify(processEnvRow.env)).join(", ")}]`,
    })
  }

  if (members.length === 0) return ""
  members.sort((left, right) => left.position - right.position)
  return processRow.configMultiline
    ? renderObjectLiteral(members.map((member) => `${member.code},`))
    : renderCompactObjectLiteral(members.map((member) => member.code))
}

const renderProcessProperty = (
  processRow: ProcessRow,
  processEnvRows: ProcessEnvRow[],
  processHandlerRows: ProcessHandlerRow[],
  processName: string,
  destroyName: string | undefined,
) => {
  const builderName = processRow.builder === "process" ? processName : destroyName
  if (!builderName) {
    throw new Error(`Missing destroy builder parameter for process ${processRow.name}`)
  }

  let source = `${renderPropertyName(processRow.name)}: ${builderName}(${renderProcessConfig(processRow, processEnvRows)})`
  for (const processHandlerRow of processHandlerRows) {
    source += `.${processHandlerRow.step}(${processHandlerRow.code})`
  }

  return `${source},`
}

const renderProcessesArgument = (
  sectionRow: SectionRow,
  processRows: ProcessRow[],
  processEnvRows: ProcessEnvRow[],
  processHandlerRows: ProcessHandlerRow[],
) => {
  const [processName = "process", destroyName] = parseParameterNames(sectionRow.params)
  if (processRows.length === 0) return `${wrapArrowParams(sectionRow.params)} => ({})`

  const processEnvsByProcessId = new Map<number, ProcessEnvRow[]>()
  for (const processEnvRow of processEnvRows) {
    const list = processEnvsByProcessId.get(processEnvRow.processId) ?? []
    list.push(processEnvRow)
    processEnvsByProcessId.set(processEnvRow.processId, list)
  }

  const processHandlersByProcessId = new Map<number, ProcessHandlerRow[]>()
  for (const processHandlerRow of processHandlerRows) {
    const list = processHandlersByProcessId.get(processHandlerRow.processId) ?? []
    list.push(processHandlerRow)
    processHandlersByProcessId.set(processHandlerRow.processId, list)
  }

  let body = ""
  for (const [index, processRow] of processRows.entries()) {
    if (index > 0) {
      body += "\n".repeat(Math.max(1, processRow.gapBefore + 1))
    }

    body += indentBlock(
      renderProcessProperty(
        processRow,
        processEnvsByProcessId.get(processRow.id) ?? [],
        processHandlersByProcessId.get(processRow.id) ?? [],
        processName,
        destroyName,
      ),
      2,
    )
  }

  return `${wrapArrowParams(sectionRow.params)} => ({\n${body}\n})`
}

const renderReactionsArgument = (sectionRow: SectionRow, reactionRows: ReactionRow[]) =>
  `${wrapArrowParams(sectionRow.params)} => ${renderArrayLiteral(reactionRows.map((reactionRow) => `${reactionRow.code},`))}`

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

const renderSectionCall = (sectionName: SectionName, code: string | null) =>
  code === null ? `  .${sectionName}()` : `  .${sectionName}(${code})`

export const emitDslModuleFromDb = async (options: EmitDslModuleFromDbOptions) => {
  ensureRoundTripSchema(options.db)

  const metaRowData = getRequiredRow(
    options.db
      .query(
        `SELECT name, configMultiline, desc, descPosition, dev, devPosition
         FROM meta
         WHERE id = 1`,
      )
      .get() as
      | {
          name: string
          configMultiline: number | null
          desc: string | null
          descPosition: number | null
          dev: number | null
          devPosition: number | null
        }
      | undefined,
    "The database does not contain a parsed MetaFor module",
  )

  const metaRow: MetaRow = {
    name: metaRowData.name,
    configMultiline: metaRowData.configMultiline === null ? null : Boolean(metaRowData.configMultiline),
    desc: metaRowData.desc,
    descPosition: metaRowData.descPosition,
    dev: metaRowData.dev === null ? null : Boolean(metaRowData.dev),
    devPosition: metaRowData.devPosition,
  }

  const sectionRows = options.db
    .query(
      `SELECT name, params, code
       FROM sections`,
    )
    .all() as SectionRow[]

  const fieldRowsRaw = options.db
    .query(
      `SELECT id, position, name, type, presence, label, defaultType, defaultText, defaultNumber, defaultBoolean
       FROM fields
       ORDER BY position`,
    )
    .all() as Array<
      Omit<FieldRow, "defaultBoolean"> & {
        defaultBoolean: number | null
      }
    >

  const fieldRows = fieldRowsRaw.map((row) => ({
    ...row,
    defaultBoolean: row.defaultBoolean === null ? null : Boolean(row.defaultBoolean),
  })) as FieldRow[]

  const enumVariantRows = options.db
    .query(
      `SELECT fieldId, position, textValue, numberValue
       FROM enum_variants
       ORDER BY fieldId, position`,
    )
    .all() as EnumVariantRow[]

  const stateRows = options.db
    .query(
      `SELECT id, position, name
       FROM states
       ORDER BY position`,
    )
    .all() as StateRow[]

  const transitionCommentRows = options.db
    .query(
      `SELECT id, stateId, position, text
       FROM transition_comments
       ORDER BY stateId, position`,
    )
    .all() as TransitionCommentRow[]

  const transitionRows = options.db
    .query(
      `SELECT id, stateId, targetStateId, position
       FROM transitions
       ORDER BY stateId, position`,
    )
    .all() as TransitionRow[]

  const conditionRowsRaw = options.db
    .query(
      `SELECT transitionId, position, fieldId, nullValue
       FROM conditions
       ORDER BY transitionId, position`,
    )
    .all() as Array<
      Omit<ConditionRow, "nullValue"> & {
        nullValue: number
      }
    >

  const conditionRows = conditionRowsRaw.map((row) => ({
    ...row,
    nullValue: Boolean(row.nullValue),
  })) as ConditionRow[]

  const processRowsRaw = options.db
    .query(
      `SELECT id, position, name, builder, gapBefore, configMultiline, label, labelPosition, desc, descPosition, envPosition
       FROM processes
       ORDER BY position`,
    )
    .all() as Array<
      Omit<ProcessRow, "configMultiline"> & {
        configMultiline: number | null
      }
    >

  const processRows = processRowsRaw.map((row) => ({
    ...row,
    configMultiline: row.configMultiline === null ? null : Boolean(row.configMultiline),
  })) as ProcessRow[]

  const processEnvRows = options.db
    .query(
      `SELECT processId, position, env
       FROM process_envs
       ORDER BY processId, position`,
    )
    .all() as ProcessEnvRow[]

  const processHandlerRows = options.db
    .query(
      `SELECT processId, position, step, code
       FROM process_handlers
       ORDER BY processId, position`,
    )
    .all() as ProcessHandlerRow[]

  const reactionRows = options.db
    .query(
      `SELECT id, position, code
       FROM reactions
       ORDER BY position`,
    )
    .all() as ReactionRow[]

  const sections = new Map(sectionRows.map((sectionRow) => [sectionRow.name, sectionRow]))
  const getSection = (sectionName: SectionName) => getRequiredRow(sections.get(sectionName), `Missing ${sectionName} section in the database`)

  const fieldsSection = getSection("fields")
  const massSection = getSection("mass")
  const processesSection = getSection("processes")
  const reactionsSection = getSection("reactions")
  const matterSection = getSection("matter")
  const bulkSection = getSection("bulk")

  const metaArgs = [JSON.stringify(metaRow.name)]
  const metaConfig = renderMetaConfig(metaRow)
  if (metaConfig !== null) metaArgs.push(metaConfig)

  let source = 'import { MetaFor } from "@metafor/dsl"\n\n'
  source += `export default MetaFor(${metaArgs.join(", ")})`
  source += `\n${renderSectionCall("fields", renderFieldsArgument(fieldsSection, fieldRows, enumVariantRows))}`
  source += `\n${renderSectionCall("superposition", renderSuperpositionArgument(stateRows, transitionCommentRows, transitionRows, conditionRows, fieldRows))}`
  source += `\n${renderSectionCall("mass", massSection.code)}`
  source += `\n${renderSectionCall("processes", renderProcessesArgument(processesSection, processRows, processEnvRows, processHandlerRows))}`
  source += `\n${renderSectionCall("reactions", renderReactionsArgument(reactionsSection, reactionRows))}`
  source += `\n${renderSectionCall("matter", matterSection.code)}`
  source += `\n${renderSectionCall("bulk", bulkSection.code)}\n`

  const filepath = options.filepath ?? `${metaRow.name}.ts`
  validateTypeScriptModule(source, filepath)

  if (!options.format) return source
  return formatTypeScriptSource(source, filepath)
}
