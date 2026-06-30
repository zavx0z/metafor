const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

export type ForceFieldId = number

export const resolveForceFieldsPayload = (value: unknown): Record<string, unknown> | null => {
	if (!isRecord(value)) return null
	const fields = value.fields
	return isRecord(fields) ? fields : null
}

export const resolveForceFieldId = (address: string): ForceFieldId | null => {
	if (address.length === 0) return null
	const id = Number(address)
	if (!Number.isSafeInteger(id) || id <= 0) return null
	return String(id) === address ? id : null
}
