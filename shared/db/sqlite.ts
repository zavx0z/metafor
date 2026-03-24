import { Database } from "bun:sqlite"
import {
  createEmptySharedDbTabularSnapshot,
  normalizeSharedDbTabularData,
  prepareSharedDbTabularData,
  sharedDbRequiredBackendIndexes,
} from "./backend.ts"
import type { SharedDbBackend } from "./backend.t.ts"
import type {
  SharedDbBraneRecord,
  SharedDbEntanglementSeedBlockMemberRecord,
  SharedDbEntanglementSeedBlockRecord,
  SharedDbEntanglementSeedFieldMemberRecord,
  SharedDbEntanglementSeedFieldRecord,
  SharedDbFieldRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbRuntimeSeedData,
  SharedDbStateSeedConditionRecord,
  SharedDbStateSeedStateRecord,
  SharedDbStateSeedTransitionRecord,
  SharedDbTabularData,
} from "./db.t.ts"

/** Опции открытия SQLite backend для shared/db. */
export interface SharedDbSqliteBackendOptions {
  /** Путь к SQLite-файлу. По умолчанию используется `:memory:`. */
  filename?: string
}

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS branes (
  "index" INTEGER PRIMARY KEY,
  darkWimpId TEXT NOT NULL,
  src TEXT NOT NULL,
  name TEXT
);

CREATE TABLE IF NOT EXISTS fields (
  "index" INTEGER PRIMARY KEY,
  darkFieldId TEXT NOT NULL,
  ownerBraneIndex INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  schemaType TEXT NOT NULL,
  schemaRequired INTEGER NOT NULL,
  schemaTopology INTEGER NOT NULL,
  schemaLabel TEXT,
  schemaValues TEXT,
  FOREIGN KEY (ownerBraneIndex) REFERENCES branes("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_values (
  fieldIndex INTEGER PRIMARY KEY,
  valueJson TEXT NOT NULL,
  FOREIGN KEY (fieldIndex) REFERENCES fields("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_sources (
  childFieldIndex INTEGER PRIMARY KEY,
  parentFieldIndex INTEGER NOT NULL,
  FOREIGN KEY (childFieldIndex) REFERENCES fields("index") ON DELETE CASCADE,
  FOREIGN KEY (parentFieldIndex) REFERENCES fields("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entanglement_seed_blocks (
  "index" INTEGER PRIMARY KEY,
  "key" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entanglement_seed_block_members (
  "index" INTEGER PRIMARY KEY,
  blockIndex INTEGER NOT NULL,
  memberIndex INTEGER NOT NULL,
  braneIndex INTEGER NOT NULL,
  FOREIGN KEY (blockIndex) REFERENCES entanglement_seed_blocks("index") ON DELETE CASCADE,
  FOREIGN KEY (braneIndex) REFERENCES branes("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entanglement_seed_fields (
  "index" INTEGER PRIMARY KEY,
  blockIndex INTEGER NOT NULL,
  blockFieldIndex INTEGER NOT NULL,
  semanticKey TEXT NOT NULL,
  fieldName TEXT NOT NULL,
  provenance TEXT NOT NULL,
  representativeDarkFieldId TEXT NOT NULL,
  representativeBraneIndex INTEGER NOT NULL,
  payloadIdsJson TEXT NOT NULL,
  semanticKeysJson TEXT NOT NULL,
  FOREIGN KEY (blockIndex) REFERENCES entanglement_seed_blocks("index") ON DELETE CASCADE,
  FOREIGN KEY (representativeDarkFieldId) REFERENCES fields(darkFieldId) ON DELETE CASCADE,
  FOREIGN KEY (representativeBraneIndex) REFERENCES branes("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entanglement_seed_field_members (
  "index" INTEGER PRIMARY KEY,
  entanglementFieldIndex INTEGER NOT NULL,
  memberIndex INTEGER NOT NULL,
  braneIndex INTEGER NOT NULL,
  darkFieldId TEXT NOT NULL,
  FOREIGN KEY (entanglementFieldIndex) REFERENCES entanglement_seed_fields("index") ON DELETE CASCADE,
  FOREIGN KEY (braneIndex) REFERENCES branes("index") ON DELETE CASCADE,
  FOREIGN KEY (darkFieldId) REFERENCES fields(darkFieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS state_seed_states (
  "index" INTEGER PRIMARY KEY,
  ownerBraneIndex INTEGER NOT NULL,
  stateIndex INTEGER NOT NULL,
  name TEXT NOT NULL,
  initial INTEGER NOT NULL,
  FOREIGN KEY (ownerBraneIndex) REFERENCES branes("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS state_seed_transitions (
  "index" INTEGER PRIMARY KEY,
  ownerBraneIndex INTEGER NOT NULL,
  fromStateIndex INTEGER NOT NULL,
  transitionIndex INTEGER NOT NULL,
  targetStateIndex INTEGER,
  FOREIGN KEY (ownerBraneIndex) REFERENCES branes("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS state_seed_conditions (
  "index" INTEGER PRIMARY KEY,
  transitionSeedIndex INTEGER NOT NULL,
  conditionIndex INTEGER NOT NULL,
  darkFieldId TEXT NOT NULL,
  conditionJson TEXT NOT NULL,
  FOREIGN KEY (transitionSeedIndex) REFERENCES state_seed_transitions("index") ON DELETE CASCADE,
  FOREIGN KEY (darkFieldId) REFERENCES fields(darkFieldId) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS branes_by_dark_wimp_id
  ON branes(darkWimpId);

CREATE UNIQUE INDEX IF NOT EXISTS fields_by_dark_field_id
  ON fields(darkFieldId);

CREATE UNIQUE INDEX IF NOT EXISTS fields_by_owner_brane_and_key
  ON fields(ownerBraneIndex, "key");

CREATE UNIQUE INDEX IF NOT EXISTS field_values_by_field_index
  ON field_values(fieldIndex);

CREATE UNIQUE INDEX IF NOT EXISTS field_sources_by_child_field_index
  ON field_sources(childFieldIndex);

CREATE INDEX IF NOT EXISTS field_sources_by_parent_field_index
  ON field_sources(parentFieldIndex);

CREATE UNIQUE INDEX IF NOT EXISTS entanglement_seed_block_members_by_block_index
  ON entanglement_seed_block_members(blockIndex, memberIndex);

CREATE UNIQUE INDEX IF NOT EXISTS entanglement_seed_fields_by_block_index_and_block_field_index
  ON entanglement_seed_fields(blockIndex, blockFieldIndex);

CREATE UNIQUE INDEX IF NOT EXISTS entanglement_seed_field_members_by_entanglement_field_index_and_member_index
  ON entanglement_seed_field_members(entanglementFieldIndex, memberIndex);

CREATE UNIQUE INDEX IF NOT EXISTS state_seed_states_by_owner_brane_and_state_index
  ON state_seed_states(ownerBraneIndex, stateIndex);

CREATE UNIQUE INDEX IF NOT EXISTS state_seed_transitions_by_owner_brane_and_from_state_and_transition_index
  ON state_seed_transitions(ownerBraneIndex, fromStateIndex, transitionIndex);

CREATE UNIQUE INDEX IF NOT EXISTS state_seed_conditions_by_transition_seed_index_and_condition_index
  ON state_seed_conditions(transitionSeedIndex, conditionIndex);
`

const braneSelectSql = `
SELECT
  "index",
  darkWimpId,
  src,
  name
FROM branes
`

const fieldSelectSql = `
SELECT
  "index",
  darkFieldId,
  ownerBraneIndex,
  "key",
  schemaType,
  schemaRequired,
  schemaTopology,
  schemaLabel,
  schemaValues
FROM fields
`

const fieldValueSelectSql = `
SELECT
  fieldIndex,
  valueJson
FROM field_values
`

const fieldSourceSelectSql = `
SELECT
  childFieldIndex,
  parentFieldIndex
FROM field_sources
`

const entanglementSeedBlockSelectSql = `
SELECT
  "index",
  "key"
FROM entanglement_seed_blocks
ORDER BY "index"
`

const entanglementSeedBlockMemberSelectSql = `
SELECT
  "index",
  blockIndex,
  memberIndex,
  braneIndex
FROM entanglement_seed_block_members
ORDER BY "index"
`

const entanglementSeedFieldSelectSql = `
SELECT
  "index",
  blockIndex,
  blockFieldIndex,
  semanticKey,
  fieldName,
  provenance,
  representativeDarkFieldId,
  representativeBraneIndex,
  payloadIdsJson,
  semanticKeysJson
FROM entanglement_seed_fields
ORDER BY "index"
`

const entanglementSeedFieldMemberSelectSql = `
SELECT
  "index",
  entanglementFieldIndex,
  memberIndex,
  braneIndex,
  darkFieldId
FROM entanglement_seed_field_members
ORDER BY "index"
`

const stateSeedStateSelectSql = `
SELECT
  "index",
  ownerBraneIndex,
  stateIndex,
  name,
  initial
FROM state_seed_states
ORDER BY "index"
`

const stateSeedTransitionSelectSql = `
SELECT
  "index",
  ownerBraneIndex,
  fromStateIndex,
  transitionIndex,
  targetStateIndex
FROM state_seed_transitions
ORDER BY "index"
`

const stateSeedConditionSelectSql = `
SELECT
  "index",
  transitionSeedIndex,
  conditionIndex,
  darkFieldId,
  conditionJson
FROM state_seed_conditions
ORDER BY "index"
`

const serializeJson = (value: unknown): string => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error("Shared DB SQLite backend cannot store undefined values")
  }
  return json
}

const parseJson = <T>(json: string): T => JSON.parse(json) as T

const mapBraneRow = (row: Record<string, unknown> | null): SharedDbBraneRecord | undefined => {
  if (!row) return undefined
  return {
    index: Number(row.index),
    darkWimpId: String(row.darkWimpId),
    src: String(row.src),
    ...(row.name !== null && row.name !== undefined ? { name: String(row.name) } : {}),
  }
}

const mapFieldRow = (row: Record<string, unknown> | null): SharedDbFieldRecord | undefined => {
  if (!row) return undefined
  return {
    index: Number(row.index),
    darkFieldId: String(row.darkFieldId),
    ownerBraneIndex: Number(row.ownerBraneIndex),
    key: String(row.key),
    schema: {
      type: String(row.schemaType),
      required: Boolean(row.schemaRequired),
      topology: Boolean(row.schemaTopology),
      ...(row.schemaLabel !== null && row.schemaLabel !== undefined ? { label: String(row.schemaLabel) } : {}),
      ...(row.schemaValues !== null && row.schemaValues !== undefined
        ? { values: parseJson<Array<string | number>>(String(row.schemaValues)) }
        : {}),
    },
  }
}

const mapFieldValueRow = (row: Record<string, unknown> | null): SharedDbFieldValueRecord | undefined => {
  if (!row) return undefined
  return {
    fieldIndex: Number(row.fieldIndex),
    value: parseJson(String(row.valueJson)),
  }
}

const mapFieldSourceRow = (row: Record<string, unknown> | null): SharedDbFieldSourceRecord | undefined => {
  if (!row) return undefined
  return {
    childFieldIndex: Number(row.childFieldIndex),
    parentFieldIndex: Number(row.parentFieldIndex),
  }
}

const mapEntanglementSeedBlockRow = (
  row: Record<string, unknown>,
): SharedDbEntanglementSeedBlockRecord => ({
  index: Number(row.index),
  key: String(row.key),
})

const mapEntanglementSeedBlockMemberRow = (
  row: Record<string, unknown>,
): SharedDbEntanglementSeedBlockMemberRecord => ({
  index: Number(row.index),
  blockIndex: Number(row.blockIndex),
  memberIndex: Number(row.memberIndex),
  braneIndex: Number(row.braneIndex),
})

const mapEntanglementSeedFieldRow = (
  row: Record<string, unknown>,
): SharedDbEntanglementSeedFieldRecord => ({
  index: Number(row.index),
  blockIndex: Number(row.blockIndex),
  blockFieldIndex: Number(row.blockFieldIndex),
  semanticKey: String(row.semanticKey),
  fieldName: String(row.fieldName),
  provenance: String(row.provenance),
  representativeDarkFieldId: String(row.representativeDarkFieldId),
  representativeBraneIndex: Number(row.representativeBraneIndex),
  payloadIds: parseJson<string[]>(String(row.payloadIdsJson)),
  semanticKeys: parseJson<string[]>(String(row.semanticKeysJson)),
})

const mapEntanglementSeedFieldMemberRow = (
  row: Record<string, unknown>,
): SharedDbEntanglementSeedFieldMemberRecord => ({
  index: Number(row.index),
  entanglementFieldIndex: Number(row.entanglementFieldIndex),
  memberIndex: Number(row.memberIndex),
  braneIndex: Number(row.braneIndex),
  darkFieldId: String(row.darkFieldId),
})

const mapStateSeedStateRow = (row: Record<string, unknown>): SharedDbStateSeedStateRecord => ({
  index: Number(row.index),
  ownerBraneIndex: Number(row.ownerBraneIndex),
  stateIndex: Number(row.stateIndex),
  name: String(row.name),
  initial: Boolean(row.initial),
})

const mapStateSeedTransitionRow = (
  row: Record<string, unknown>,
): SharedDbStateSeedTransitionRecord => ({
  index: Number(row.index),
  ownerBraneIndex: Number(row.ownerBraneIndex),
  fromStateIndex: Number(row.fromStateIndex),
  transitionIndex: Number(row.transitionIndex),
  targetStateIndex:
    row.targetStateIndex === null || row.targetStateIndex === undefined ? null : Number(row.targetStateIndex),
})

const mapStateSeedConditionRow = (
  row: Record<string, unknown>,
): SharedDbStateSeedConditionRecord => ({
  index: Number(row.index),
  transitionSeedIndex: Number(row.transitionSeedIndex),
  conditionIndex: Number(row.conditionIndex),
  darkFieldId: String(row.darkFieldId),
  condition: parseJson(String(row.conditionJson)),
})

const cloneRuntimeSeedData = (data: SharedDbRuntimeSeedData): SharedDbRuntimeSeedData => ({
  entanglementBlocks: data.entanglementBlocks.map((block) => structuredClone(block)),
  entanglementBlockMembers: data.entanglementBlockMembers.map((member) => structuredClone(member)),
  entanglementFields: data.entanglementFields.map((field) => structuredClone(field)),
  entanglementFieldMembers: data.entanglementFieldMembers.map((member) => structuredClone(member)),
  stateSeedStates: data.stateSeedStates.map((state) => structuredClone(state)),
  stateSeedTransitions: data.stateSeedTransitions.map((transition) => structuredClone(transition)),
  stateSeedConditions: data.stateSeedConditions.map((condition) => structuredClone(condition)),
})

/**
 * Создаёт и инициализирует SQLite-схему shared/db.
 *
 * @param database Открытая SQLite база.
 */
export const initializeSharedDbSqliteSchema = (database: Database): void => {
  database.exec(schemaSql)
}

/**
 * Открывает SQLite backend для канонического shared/db контракта.
 *
 * @param options Опции открытия. По умолчанию используется in-memory SQLite.
 * @returns Shared/db backend-handle поверх SQLite.
 */
export const openSharedDbSqliteBackend = (options: SharedDbSqliteBackendOptions = {}): SharedDbBackend => {
  const database = new Database(options.filename ?? ":memory:")
  initializeSharedDbSqliteSchema(database)

  const statements = {
    selectFirstBraneIndex: database.query(`SELECT "index" FROM branes ORDER BY "index" LIMIT 1`),
    clearStateSeedConditions: database.query(`DELETE FROM state_seed_conditions`),
    clearStateSeedTransitions: database.query(`DELETE FROM state_seed_transitions`),
    clearStateSeedStates: database.query(`DELETE FROM state_seed_states`),
    clearEntanglementSeedFieldMembers: database.query(`DELETE FROM entanglement_seed_field_members`),
    clearEntanglementSeedFields: database.query(`DELETE FROM entanglement_seed_fields`),
    clearEntanglementSeedBlockMembers: database.query(`DELETE FROM entanglement_seed_block_members`),
    clearEntanglementSeedBlocks: database.query(`DELETE FROM entanglement_seed_blocks`),
    clearFieldSources: database.query(`DELETE FROM field_sources`),
    clearFieldValues: database.query(`DELETE FROM field_values`),
    clearFields: database.query(`DELETE FROM fields`),
    clearBranes: database.query(`DELETE FROM branes`),
    insertBrane: database.query(
      `INSERT INTO branes("index", darkWimpId, src, name)
       VALUES (?, ?, ?, ?)`,
    ),
    upsertBrane: database.query(
      `INSERT INTO branes("index", darkWimpId, src, name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT("index") DO UPDATE SET
         darkWimpId = excluded.darkWimpId,
         src = excluded.src,
         name = excluded.name`,
    ),
    insertField: database.query(
      `INSERT INTO fields("index", darkFieldId, ownerBraneIndex, "key", schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    upsertField: database.query(
      `INSERT INTO fields("index", darkFieldId, ownerBraneIndex, "key", schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT("index") DO UPDATE SET
         darkFieldId = excluded.darkFieldId,
         ownerBraneIndex = excluded.ownerBraneIndex,
         "key" = excluded."key",
         schemaType = excluded.schemaType,
         schemaRequired = excluded.schemaRequired,
         schemaTopology = excluded.schemaTopology,
         schemaLabel = excluded.schemaLabel,
         schemaValues = excluded.schemaValues`,
    ),
    insertFieldValue: database.query(
      `INSERT INTO field_values(fieldIndex, valueJson)
       VALUES (?, ?)`,
    ),
    insertFieldSource: database.query(
      `INSERT INTO field_sources(childFieldIndex, parentFieldIndex)
       VALUES (?, ?)`,
    ),
    upsertFieldSource: database.query(
      `INSERT INTO field_sources(childFieldIndex, parentFieldIndex)
       VALUES (?, ?)
       ON CONFLICT(childFieldIndex) DO UPDATE SET parentFieldIndex = excluded.parentFieldIndex`,
    ),
    deleteFieldSource: database.query(`DELETE FROM field_sources WHERE childFieldIndex = ?`),
    insertEntanglementSeedBlock: database.query(
      `INSERT INTO entanglement_seed_blocks("index", "key")
       VALUES (?, ?)`,
    ),
    insertEntanglementSeedBlockMember: database.query(
      `INSERT INTO entanglement_seed_block_members("index", blockIndex, memberIndex, braneIndex)
       VALUES (?, ?, ?, ?)`,
    ),
    insertEntanglementSeedField: database.query(
      `INSERT INTO entanglement_seed_fields("index", blockIndex, blockFieldIndex, semanticKey, fieldName, provenance, representativeDarkFieldId, representativeBraneIndex, payloadIdsJson, semanticKeysJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertEntanglementSeedFieldMember: database.query(
      `INSERT INTO entanglement_seed_field_members("index", entanglementFieldIndex, memberIndex, braneIndex, darkFieldId)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    insertStateSeedState: database.query(
      `INSERT INTO state_seed_states("index", ownerBraneIndex, stateIndex, name, initial)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    insertStateSeedTransition: database.query(
      `INSERT INTO state_seed_transitions("index", ownerBraneIndex, fromStateIndex, transitionIndex, targetStateIndex)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    insertStateSeedCondition: database.query(
      `INSERT INTO state_seed_conditions("index", transitionSeedIndex, conditionIndex, darkFieldId, conditionJson)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    selectBraneByIndex: database.query(`${braneSelectSql} WHERE "index" = ?`),
    selectBraneByDarkId: database.query(`${braneSelectSql} WHERE darkWimpId = ?`),
    selectFieldByIndex: database.query(`${fieldSelectSql} WHERE "index" = ?`),
    selectFieldByDarkId: database.query(`${fieldSelectSql} WHERE darkFieldId = ?`),
    selectFieldByKey: database.query(`${fieldSelectSql} WHERE ownerBraneIndex = ? AND "key" = ?`),
    selectFieldValueByIndex: database.query(`${fieldValueSelectSql} WHERE fieldIndex = ?`),
    selectFieldSourceByChildIndex: database.query(`${fieldSourceSelectSql} WHERE childFieldIndex = ?`),
    selectDependentFieldsByParentIndex: database.query(
      `${fieldSelectSql}
       INNER JOIN field_sources ON field_sources.childFieldIndex = fields."index"
       WHERE field_sources.parentFieldIndex = ?
       ORDER BY fields."index"`,
    ),
    selectAllEntanglementSeedBlocks: database.query(entanglementSeedBlockSelectSql),
    selectAllEntanglementSeedBlockMembers: database.query(entanglementSeedBlockMemberSelectSql),
    selectAllEntanglementSeedFields: database.query(entanglementSeedFieldSelectSql),
    selectAllEntanglementSeedFieldMembers: database.query(entanglementSeedFieldMemberSelectSql),
    selectAllStateSeedStates: database.query(stateSeedStateSelectSql),
    selectAllStateSeedTransitions: database.query(stateSeedTransitionSelectSql),
    selectAllStateSeedConditions: database.query(stateSeedConditionSelectSql),
    ensureFieldExists: database.query(`SELECT 1 as present FROM fields WHERE "index" = ?`),
    upsertFieldValue: database.query(
      `INSERT INTO field_values(fieldIndex, valueJson)
       VALUES (?, ?)
       ON CONFLICT(fieldIndex) DO UPDATE SET valueJson = excluded.valueJson`,
    ),
  }

  const readRuntimeSeedData = (): SharedDbRuntimeSeedData =>
    cloneRuntimeSeedData({
      entanglementBlocks: (
        statements.selectAllEntanglementSeedBlocks.all() as Array<Record<string, unknown>>
      ).map(mapEntanglementSeedBlockRow),
      entanglementBlockMembers: (
        statements.selectAllEntanglementSeedBlockMembers.all() as Array<Record<string, unknown>>
      ).map(mapEntanglementSeedBlockMemberRow),
      entanglementFields: (
        statements.selectAllEntanglementSeedFields.all() as Array<Record<string, unknown>>
      ).map(mapEntanglementSeedFieldRow),
      entanglementFieldMembers: (
        statements.selectAllEntanglementSeedFieldMembers.all() as Array<Record<string, unknown>>
      ).map(mapEntanglementSeedFieldMemberRow),
      stateSeedStates: (statements.selectAllStateSeedStates.all() as Array<Record<string, unknown>>).map(
        mapStateSeedStateRow,
      ),
      stateSeedTransitions: (
        statements.selectAllStateSeedTransitions.all() as Array<Record<string, unknown>>
      ).map(mapStateSeedTransitionRow),
      stateSeedConditions: (
        statements.selectAllStateSeedConditions.all() as Array<Record<string, unknown>>
      ).map(mapStateSeedConditionRow),
    })

  const replaceAll = database.transaction((data: SharedDbTabularData) => {
    const normalized = normalizeSharedDbTabularData(data)
    statements.clearStateSeedConditions.run()
    statements.clearStateSeedTransitions.run()
    statements.clearStateSeedStates.run()
    statements.clearEntanglementSeedFieldMembers.run()
    statements.clearEntanglementSeedFields.run()
    statements.clearEntanglementSeedBlockMembers.run()
    statements.clearEntanglementSeedBlocks.run()
    statements.clearFieldSources.run()
    statements.clearFieldValues.run()
    statements.clearFields.run()
    statements.clearBranes.run()

    for (const brane of normalized.branes) {
      statements.insertBrane.run(
        brane.index,
        brane.darkWimpId,
        brane.src,
        brane.name ?? null,
      )
    }

    for (const field of normalized.fields) {
      statements.insertField.run(
        field.index,
        field.darkFieldId,
        field.ownerBraneIndex,
        field.key,
        field.schema.type,
        Number(field.schema.required),
        Number(field.schema.topology),
        field.schema.label ?? null,
        field.schema.values !== undefined ? serializeJson(field.schema.values) : null,
      )
    }

    for (const fieldValue of normalized.fieldValues) {
      statements.insertFieldValue.run(fieldValue.fieldIndex, serializeJson(fieldValue.value))
    }

    for (const fieldSource of normalized.fieldSources) {
      statements.insertFieldSource.run(fieldSource.childFieldIndex, fieldSource.parentFieldIndex)
    }

    for (const block of normalized.entanglementBlocks) {
      statements.insertEntanglementSeedBlock.run(block.index, block.key)
    }

    for (const member of normalized.entanglementBlockMembers) {
      statements.insertEntanglementSeedBlockMember.run(
        member.index,
        member.blockIndex,
        member.memberIndex,
        member.braneIndex,
      )
    }

    for (const seedField of normalized.entanglementFields) {
      statements.insertEntanglementSeedField.run(
        seedField.index,
        seedField.blockIndex,
        seedField.blockFieldIndex,
        seedField.semanticKey,
        seedField.fieldName,
        seedField.provenance,
        seedField.representativeDarkFieldId,
        seedField.representativeBraneIndex,
        serializeJson(seedField.payloadIds),
        serializeJson(seedField.semanticKeys),
      )
    }

    for (const member of normalized.entanglementFieldMembers) {
      statements.insertEntanglementSeedFieldMember.run(
        member.index,
        member.entanglementFieldIndex,
        member.memberIndex,
        member.braneIndex,
        member.darkFieldId,
      )
    }

    for (const state of normalized.stateSeedStates) {
      statements.insertStateSeedState.run(
        state.index,
        state.ownerBraneIndex,
        state.stateIndex,
        state.name,
        Number(state.initial),
      )
    }

    for (const transition of normalized.stateSeedTransitions) {
      statements.insertStateSeedTransition.run(
        transition.index,
        transition.ownerBraneIndex,
        transition.fromStateIndex,
        transition.transitionIndex,
        transition.targetStateIndex,
      )
    }

    for (const condition of normalized.stateSeedConditions) {
      statements.insertStateSeedCondition.run(
        condition.index,
        condition.transitionSeedIndex,
        condition.conditionIndex,
        condition.darkFieldId,
        serializeJson(condition.condition),
      )
    }
  })

  const replaceRuntimeSeedsTxn = database.transaction((data: SharedDbRuntimeSeedData) => {
    statements.clearStateSeedConditions.run()
    statements.clearStateSeedTransitions.run()
    statements.clearStateSeedStates.run()
    statements.clearEntanglementSeedFieldMembers.run()
    statements.clearEntanglementSeedFields.run()
    statements.clearEntanglementSeedBlockMembers.run()
    statements.clearEntanglementSeedBlocks.run()

    for (const block of data.entanglementBlocks) {
      statements.insertEntanglementSeedBlock.run(block.index, block.key)
    }

    for (const member of data.entanglementBlockMembers) {
      statements.insertEntanglementSeedBlockMember.run(
        member.index,
        member.blockIndex,
        member.memberIndex,
        member.braneIndex,
      )
    }

    for (const seedField of data.entanglementFields) {
      statements.insertEntanglementSeedField.run(
        seedField.index,
        seedField.blockIndex,
        seedField.blockFieldIndex,
        seedField.semanticKey,
        seedField.fieldName,
        seedField.provenance,
        seedField.representativeDarkFieldId,
        seedField.representativeBraneIndex,
        serializeJson(seedField.payloadIds),
        serializeJson(seedField.semanticKeys),
      )
    }

    for (const member of data.entanglementFieldMembers) {
      statements.insertEntanglementSeedFieldMember.run(
        member.index,
        member.entanglementFieldIndex,
        member.memberIndex,
        member.braneIndex,
        member.darkFieldId,
      )
    }

    for (const state of data.stateSeedStates) {
      statements.insertStateSeedState.run(
        state.index,
        state.ownerBraneIndex,
        state.stateIndex,
        state.name,
        Number(state.initial),
      )
    }

    for (const transition of data.stateSeedTransitions) {
      statements.insertStateSeedTransition.run(
        transition.index,
        transition.ownerBraneIndex,
        transition.fromStateIndex,
        transition.transitionIndex,
        transition.targetStateIndex,
      )
    }

    for (const condition of data.stateSeedConditions) {
      statements.insertStateSeedCondition.run(
        condition.index,
        condition.transitionSeedIndex,
        condition.conditionIndex,
        condition.darkFieldId,
        serializeJson(condition.condition),
      )
    }
  })

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {
      database.close()
    },

    getRootBraneIndex() {
      const row = statements.selectFirstBraneIndex.get() as Record<string, unknown> | null
      return row ? Number(row.index) : 0
    },

    setRootBraneIndex(braneIndex) {
      if (braneIndex !== 0) {
        throw new Error(`Shared DB root brane index is derived from brane order and currently fixed to 0, got ${braneIndex}`)
      }
    },

    getRuntimeSeedData() {
      return readRuntimeSeedData()
    },

    reset() {
      replaceAll(createEmptySharedDbTabularSnapshot())
    },

    replaceData(data) {
      replaceAll(data)
    },

    writeProjection(projection: SharedDbProjection) {
      replaceAll(prepareSharedDbTabularData(projection))
    },

    upsertBrane(brane) {
      statements.upsertBrane.run(
        brane.index,
        brane.darkWimpId,
        brane.src,
        brane.name ?? null,
      )
    },

    upsertField(field) {
      statements.upsertField.run(
        field.index,
        field.darkFieldId,
        field.ownerBraneIndex,
        field.key,
        field.schema.type,
        Number(field.schema.required),
        Number(field.schema.topology),
        field.schema.label ?? null,
        field.schema.values !== undefined ? serializeJson(field.schema.values) : null,
      )
    },

    setFieldSource(childFieldIndex, parentFieldIndex) {
      if (parentFieldIndex === null) {
        statements.deleteFieldSource.run(childFieldIndex)
        return
      }

      statements.upsertFieldSource.run(childFieldIndex, parentFieldIndex)
    },

    replaceRuntimeSeedData(data) {
      replaceRuntimeSeedsTxn(data)
    },

    getBrane(braneIndex) {
      return mapBraneRow(statements.selectBraneByIndex.get(braneIndex) as Record<string, unknown> | null)
    },

    getBraneByDarkId(darkWimpId) {
      return mapBraneRow(statements.selectBraneByDarkId.get(darkWimpId) as Record<string, unknown> | null)
    },

    getField(fieldIndex) {
      return mapFieldRow(statements.selectFieldByIndex.get(fieldIndex) as Record<string, unknown> | null)
    },

    getFieldByDarkId(darkFieldId) {
      return mapFieldRow(statements.selectFieldByDarkId.get(darkFieldId) as Record<string, unknown> | null)
    },

    getFieldByKey(braneIndex, fieldKey) {
      return mapFieldRow(statements.selectFieldByKey.get(braneIndex, fieldKey) as Record<string, unknown> | null)
    },

    getFieldValue(fieldIndex) {
      return mapFieldValueRow(statements.selectFieldValueByIndex.get(fieldIndex) as Record<string, unknown> | null)
    },

    getFieldSource(childFieldIndex) {
      return mapFieldSourceRow(
        statements.selectFieldSourceByChildIndex.get(childFieldIndex) as Record<string, unknown> | null,
      )
    },

    getDependentFields(parentFieldIndex) {
      return (
        statements.selectDependentFieldsByParentIndex.all(parentFieldIndex) as Array<Record<string, unknown>>
      ).map((row) => mapFieldRow(row)!)
    },

    setFieldValue(fieldIndex, value) {
      const row = statements.ensureFieldExists.get(fieldIndex) as Record<string, unknown> | null
      if (!row) {
        throw new Error(`Field index out of range: ${fieldIndex}`)
      }

      statements.upsertFieldValue.run(fieldIndex, serializeJson(value))
    },
  }
}
