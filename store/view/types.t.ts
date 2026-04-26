/**
 * View-layer canonical relational record types.
 *
 * Эти типы описывают view-проекцию canonical relational DB:
 * wimps + wimp_fields + wimp_edges + field_values + field_sources + wimp_states +
 * entanglement family (entanglements + entanglement_members + entanglement_fields +
 * entanglement_field_members).
 *
 * Они существуют отдельно от meta-level record types — meta-сторона живёт в
 * `store/db/db.t.ts`. View-слой знает про meta только через FK-id (metaId, metaFieldId,
 * metaStateId), но не про сами meta-таблицы.
 */

export interface DbWimpRecord {
  id: string
  metaId: string
  wimpOrder: number
  massOverride?: unknown
}

export interface DbWimpFieldRecord {
  id: string
  ownerWimpId: string
  metaFieldId: string
  fieldOrder: number
}

export interface DbWimpEdgeRecord {
  id: string
  parentWimpId: string | null
  childWimpId: string
  edgeOrder: number
}

export interface DbFieldValueRecord {
  id: string
  ownerWimpFieldId: string
  value: unknown
}

export interface DbFieldSourceRecord {
  id: string
  childWimpFieldId: string
  parentWimpFieldId: string
}

export interface DbWimpStateRecord {
  id: string
  ownerWimpId: string
  metaStateId: string
}

export interface DbEntanglementRecord {
  id: string
  membershipKey: string
  provenance: string
}

export interface DbEntanglementMemberRecord {
  id: string
  ownerEntanglementId: string
  wimpId: string
  memberOrder: number
}

export interface DbEntanglementFieldRecord {
  id: string
  ownerEntanglementId: string
  fieldOrder: number
  semanticKey: string
  fieldName: string
  provenance: string
  representativeWimpFieldId: string
  payloadIds: string[]
  semanticKeys: string[]
}

export interface DbEntanglementFieldMemberRecord {
  id: string
  ownerEntanglementFieldId: string
  ownerWimpId: string
  wimpFieldId: string
  memberOrder: number
}

export interface DbWimpRows {
  wimp: DbWimpRecord
  fields: DbWimpFieldRecord[]
  values: DbFieldValueRecord[]
  sources: DbFieldSourceRecord[]
  state: DbWimpStateRecord
}

export interface DbEntanglementFamilyRows {
  entanglement: DbEntanglementRecord
  members: DbEntanglementMemberRecord[]
  field: DbEntanglementFieldRecord
  fieldMembers: DbEntanglementFieldMemberRecord[]
}
