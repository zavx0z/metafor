import type { BulkRuntimeField, BulkRuntimeSnapshot, BulkRuntimeValue } from "@metafor/types/bulk/runtime"
import type { ActorSnapshotMessage, ForceSnapshotEffect } from "@metafor/types/bulk/protocol"
import type { Particle } from "@metafor/types/force/particle"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

const upsertById = <T extends {id: number}>(entries: T[], entry: T): T[] =>
	[...entries.filter((item) => item.id !== entry.id), entry]

const forceString = (value: unknown): string | null => {
	if (typeof value !== "string") return null
	const text = value.trim()
	return text.length > 0 ? text : null
}

const forceFieldType = (value: unknown): BulkRuntimeField["type"] | null => {
	const type = forceString(value)
	if (type === "string" || type === "number" || type === "boolean" || type === "array" || type === "enum") return type
	return null
}

const findSnapshotFieldById = (
	snapshot: BulkRuntimeSnapshot,
	wimp: string,
	fieldId: number,
): BulkRuntimeField | null =>
	snapshot.fields.find((field) => field.wimp === wimp && field.id === fieldId) ?? null

const nextNumericId = (entries: Array<{id: number}>): number =>
	entries.reduce((max, entry) => Math.max(max, Number.isSafeInteger(entry.id) ? entry.id : 0), 0) + 1

const createSnapshotField = (
	snapshot: BulkRuntimeSnapshot,
	wimp: string,
	fieldId: number,
	rawPatch: Record<string, unknown>,
): BulkRuntimeField => {
	const key = forceString(rawPatch.key)
	const type = forceFieldType(rawPatch.type)
	const label = forceString(rawPatch.label)
	const field: BulkRuntimeField = {
		id: fieldId,
		wimp,
		key: key ?? `field-${fieldId}`,
		type: type ?? "string",
		label: label ?? key,
	}
	snapshot.fields = [...snapshot.fields, field]
	return field
}

const forceEnumValues = (value: unknown): string[] | null => {
	if (!Array.isArray(value)) return null
	const values = value.map((item) => forceString(item)).filter((item): item is string => item !== null)
	return values.length === 0 ? null : values
}

const replaceSnapshotFieldEnumVariants = (
	snapshot: BulkRuntimeSnapshot,
	fieldId: number,
	values: string[],
): void => {
	let nextId = nextNumericId(snapshot.fieldEnumVariants)
	snapshot.fieldEnumVariants = [
		...snapshot.fieldEnumVariants.filter((variant) => variant.field !== fieldId),
		...values.map((itemValue, position) => ({
			id: nextId++,
			field: fieldId,
			position,
			itemValue,
		})),
	]
}

const removeSnapshotFieldEntries = (
	snapshot: BulkRuntimeSnapshot,
	wimp: string,
	fields: BulkRuntimeField[],
): void => {
	const fieldIds = new Set(fields.map((field) => field.id))
	const actorIds = new Set(snapshot.actors.filter((actor) => actor.wimp === wimp).map((actor) => actor.id))
	const valueIds = new Set(
		snapshot.actorValues
			.filter((entry) => actorIds.has(entry.actor) && fieldIds.has(entry.field))
			.map((entry) => entry.value),
	)
	snapshot.fields = snapshot.fields.filter((field) => !fieldIds.has(field.id))
	snapshot.fieldEnumVariants = snapshot.fieldEnumVariants.filter((variant) => !fieldIds.has(variant.field))
	snapshot.actorValues = snapshot.actorValues.filter((entry) => !(actorIds.has(entry.actor) && fieldIds.has(entry.field)))
	snapshot.values = snapshot.values.filter((entry) => !valueIds.has(entry.id))
	snapshot.valueItems = snapshot.valueItems.filter((entry) => !valueIds.has(entry.value))
}

const strongerEffect = (left: ForceSnapshotEffect, right: ForceSnapshotEffect): ForceSnapshotEffect => {
	if (left === "rebuild" || right === "rebuild") return "rebuild"
	if (left === "partial" || right === "partial") return "partial"
	return "none"
}

export const applyHiggsFieldsPartToSnapshot = (
	snapshot: BulkRuntimeSnapshot,
	part: Particle,
): ForceSnapshotEffect => {
	if (part.part !== "higgs") return "none"
	const wimp = forceString(part.path)
	const fields = resolveForceFieldsPayload(part.value)
	if (wimp === null || fields === null) return "none"

	let effect: ForceSnapshotEffect = "none"
	for (const [address, rawPatch] of Object.entries(fields)) {
		const fieldId = resolveForceFieldId(address)
		// Legacy-адресация по key намеренно удалена из v0-нормализатора:
		// ключи являются изменяемой метаинформацией.
		if (fieldId === null) continue

		if (part.op === "remove") {
			const field = findSnapshotFieldById(snapshot, wimp, fieldId)
			if (field === null) continue
			removeSnapshotFieldEntries(snapshot, wimp, [field])
			effect = strongerEffect(effect, "rebuild")
			continue
		}

		if (part.op !== "replace" || !isRecord(rawPatch)) continue

		const existing = findSnapshotFieldById(snapshot, wimp, fieldId)
		const current = existing ?? createSnapshotField(snapshot, wimp, fieldId, rawPatch)
		const type = forceFieldType(rawPatch.type)
		const key = forceString(rawPatch.key)
		const label = forceString(rawPatch.label)
		const enumValues = forceEnumValues(rawPatch.values)
		const next: BulkRuntimeField = {
			...current,
			...(key !== null ? {key} : {}),
			...(type !== null ? {type} : {}),
			...(label !== null ? {label} : key !== null ? {label: key} : {}),
		}
		snapshot.fields = upsertById(snapshot.fields, next)
		if (enumValues !== null) replaceSnapshotFieldEnumVariants(snapshot, next.id, enumValues)
		else if (type !== null && type !== "enum") {
			snapshot.fieldEnumVariants = snapshot.fieldEnumVariants.filter((variant) => variant.field !== next.id)
		}
		effect = strongerEffect(effect, existing === null ? "rebuild" : "partial")
	}

	return effect
}

const actorIdFromForcePath = (path: unknown): number | null => {
	if (typeof path === "number" && Number.isSafeInteger(path) && path > 0) return path
	if (typeof path !== "string" || !/^\d+$/.test(path)) return null
	const id = Number(path)
	return Number.isSafeInteger(id) && id > 0 ? id : null
}

const rawValueKind = (field: BulkRuntimeField, value: unknown): BulkRuntimeValue["kind"] => {
	if (value === null) return "null"
	if (typeof value === "boolean") return "boolean"
	if (typeof value === "number") return "number"
	if (Array.isArray(value)) return "list"
	if (field.type === "enum" && typeof value === "string") return "enum"
	return "string"
}

const rawValueText = (value: unknown): string | null => {
	if (value === null || value === undefined) return null
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

const upsertActorFieldValue = (
	snapshot: BulkRuntimeSnapshot,
	actorId: number,
	field: BulkRuntimeField,
	value: unknown,
): void => {
	const existing = snapshot.actorValues.find((entry) => entry.actor === actorId && entry.field === field.id)
	const valueId = existing?.value ?? nextNumericId(snapshot.values)
	const kind = rawValueKind(field, value)
	const valueRecord: BulkRuntimeValue = {
		id: valueId,
		kind,
		booleanValue: kind === "boolean" ? (value === true ? 1 : 0) : null,
		numberValue: kind === "number" && typeof value === "number" ? value : null,
		textValue: kind === "string" ? rawValueText(value) : null,
		enumValue: kind === "enum" && typeof value === "string" ? value : null,
	}
	snapshot.actorValues = [
		...snapshot.actorValues.filter((entry) => !(entry.actor === actorId && entry.field === field.id)),
		{actor: actorId, field: field.id, value: valueId},
	]
	snapshot.values = upsertById(snapshot.values, valueRecord)
	snapshot.valueItems = [
		...snapshot.valueItems.filter((entry) => entry.value !== valueId),
		...(Array.isArray(value)
			? value.map((item, position) => ({value: valueId, position, itemValue: rawValueText(item) ?? ""}))
			: []),
	]
}

const removeActorFieldValue = (
	snapshot: BulkRuntimeSnapshot,
	actorId: number,
	field: BulkRuntimeField,
): void => {
	const existing = snapshot.actorValues.find((entry) => entry.actor === actorId && entry.field === field.id)
	if (!existing) return
	snapshot.actorValues = snapshot.actorValues.filter((entry) => !(entry.actor === actorId && entry.field === field.id))
	snapshot.values = snapshot.values.filter((entry) => entry.id !== existing.value)
	snapshot.valueItems = snapshot.valueItems.filter((entry) => entry.value !== existing.value)
}

export const applyGluonFieldsPartToSnapshot = (
	snapshot: BulkRuntimeSnapshot,
	part: Particle,
): ForceSnapshotEffect => {
	if (part.part !== "gluon") return "none"
	const actorId = actorIdFromForcePath(part.path)
	const actor = actorId === null ? undefined : snapshot.actors.find((entry) => entry.id === actorId)
	const fields = resolveForceFieldsPayload(part.value)
	if (!actor || fields === null) return "none"

	let effect: ForceSnapshotEffect = "none"
	for (const [address, rawValue] of Object.entries(fields)) {
		const fieldId = resolveForceFieldId(address)
		// Legacy-адресация по key намеренно удалена из v0-нормализатора:
		// ключи являются изменяемой метаинформацией.
		if (fieldId === null) continue
		const field = findSnapshotFieldById(snapshot, actor.wimp, fieldId)
		if (field === null) continue
		if (part.op === "remove") removeActorFieldValue(snapshot, actor.id, field)
		else if (part.op === "replace") upsertActorFieldValue(snapshot, actor.id, field, rawValue)
		else continue
		effect = strongerEffect(effect, "partial")
	}

	return effect
}

const actorSnapshotMessage = (value: unknown): ActorSnapshotMessage | null => {
	if (!isRecord(value) || !isRecord(value.actor) || !Array.isArray(value.values) || !Array.isArray(value.valueRecords)) return null
	return {
		actor: value.actor as unknown as ActorSnapshotMessage["actor"],
		values: value.values as ActorSnapshotMessage["values"],
		valueRecords: value.valueRecords as ActorSnapshotMessage["valueRecords"],
		valueItems: Array.isArray(value.valueItems) ? value.valueItems as ActorSnapshotMessage["valueItems"] : [],
	}
}

const applyActorSnapshotPart = (snapshot: BulkRuntimeSnapshot, value: unknown): boolean => {
	const actorSnapshot = actorSnapshotMessage(value)
	if (!actorSnapshot) return false
	const enumValueByVariant = new Map(snapshot.fieldEnumVariants.map((variant) => [variant.id, variant.itemValue] as const))
	const valueIds = new Set(actorSnapshot.values.map((entry) => entry.value))
	snapshot.actors = upsertById(snapshot.actors, actorSnapshot.actor)
	snapshot.actorValues = [
		...snapshot.actorValues.filter((entry) => entry.actor !== actorSnapshot.actor.id),
		...actorSnapshot.values,
	]
	snapshot.values = [
		...snapshot.values.filter((entry) => !valueIds.has(entry.id)),
		...actorSnapshot.valueRecords.map((entry) => ({
			id: entry.id,
			kind: entry.kind,
			booleanValue: typeof entry.boolean === "boolean" ? (entry.boolean ? 1 : 0) : null,
			numberValue: typeof entry.number === "number" ? entry.number : null,
			textValue: typeof entry.text === "string" ? entry.text : null,
			enumValue: typeof entry.variant === "number" ? enumValueByVariant.get(entry.variant) ?? null : null,
		})),
	]
	snapshot.valueItems = [
		...snapshot.valueItems.filter((entry) => !valueIds.has(entry.value)),
		...actorSnapshot.valueItems,
	]
	return true
}

const applyTopologyPart = (snapshot: BulkRuntimeSnapshot, part: Particle): boolean => {
	if (part.path !== "fuzzy" && part.path !== "axion" && part.path !== "macho") return false
	if (!isRecord(part.value) || typeof part.value.id !== "number") return false
	const topology = part.value
	const id = topology.id as number
	if (part.op === "remove") {
		snapshot.topologies = snapshot.topologies.filter((entry) => entry.id !== id)
		return true
	}
	if (part.op !== "add" && part.op !== "replace") return false
	snapshot.topologies = upsertById(snapshot.topologies, {
		id,
		parentActor: typeof topology.parentActor === "number" ? topology.parentActor : null,
		parentTopology: typeof topology.parentTopology === "number" ? topology.parentTopology : null,
		kind: part.path,
		position: typeof topology.position === "number" ? topology.position : 0,
	})
	return true
}

export const applyForcePartToSnapshot = (
	snapshot: BulkRuntimeSnapshot,
	part: Particle,
): ForceSnapshotEffect => {
	const higgsEffect = applyHiggsFieldsPartToSnapshot(snapshot, part)
	if (higgsEffect !== "none") return higgsEffect
	const gluonEffect = applyGluonFieldsPartToSnapshot(snapshot, part)
	if (gluonEffect !== "none") return gluonEffect
	if (part.part !== "graviton") return "none"
	if (part.path === "actor") return applyActorSnapshotPart(snapshot, part.value) ? "rebuild" : "none"
	return applyTopologyPart(snapshot, part) ? "rebuild" : "none"
}
