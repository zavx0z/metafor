import type {
  SharedDbData,
  SharedDbEntanglementFieldMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbMetaFieldRecord,
  SharedDbMetaRecord,
  SharedDbWimpFieldRecord,
  SharedDbWimpRecord,
} from "./db.t.ts"

export const getSharedDbMetaById = (data: SharedDbData, metaId: string): SharedDbMetaRecord | undefined =>
  data.metas.find((meta) => meta.id === metaId)

export const getSharedDbMetaFields = (data: SharedDbData, metaId: string): SharedDbMetaFieldRecord[] =>
  data.metaFields
    .filter((field) => field.ownerMetaId === metaId)
    .sort((left, right) => left.fieldOrder - right.fieldOrder)

export const getSharedDbWimpById = (data: SharedDbData, wimpId: string): SharedDbWimpRecord | undefined =>
  data.wimps.find((wimp) => wimp.id === wimpId)

export const getSharedDbWimpFields = (data: SharedDbData, wimpId: string): SharedDbWimpFieldRecord[] =>
  data.wimpFields
    .filter((field) => field.ownerWimpId === wimpId)
    .sort((left, right) => left.fieldOrder - right.fieldOrder)

export const getSharedDbFieldValue = (data: SharedDbData, wimpFieldId: string): SharedDbFieldValueRecord | undefined =>
  data.fieldValues.find((row) => row.ownerWimpFieldId === wimpFieldId)

export const getSharedDbFieldSource = (
  data: SharedDbData,
  childWimpFieldId: string,
): SharedDbFieldSourceRecord | undefined => data.fieldSources.find((row) => row.childWimpFieldId === childWimpFieldId)

export const getSharedDbDependentFieldSources = (
  data: SharedDbData,
  parentWimpFieldId: string,
): SharedDbFieldSourceRecord[] => data.fieldSources.filter((row) => row.parentWimpFieldId === parentWimpFieldId)

export const getSharedDbEntanglementById = (
  data: SharedDbData,
  entanglementId: string,
): SharedDbEntanglementRecord | undefined => data.entanglements.find((row) => row.id === entanglementId)

export const getSharedDbEntanglementMembers = (
  data: SharedDbData,
  entanglementId: string,
): SharedDbEntanglementMemberRecord[] =>
  data.entanglementMembers
    .filter((row) => row.ownerEntanglementId === entanglementId)
    .sort((left, right) => left.memberOrder - right.memberOrder)

export const getSharedDbEntanglementFields = (
  data: SharedDbData,
  entanglementId: string,
): SharedDbEntanglementFieldRecord[] =>
  data.entanglementFields
    .filter((row) => row.ownerEntanglementId === entanglementId)
    .sort((left, right) => left.fieldOrder - right.fieldOrder)

export const getSharedDbEntanglementFieldMembers = (
  data: SharedDbData,
  entanglementFieldId: string,
): SharedDbEntanglementFieldMemberRecord[] =>
  data.entanglementFieldMembers
    .filter((row) => row.ownerEntanglementFieldId === entanglementFieldId)
    .sort((left, right) => left.memberOrder - right.memberOrder)
