const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Force protocol still publishes field patches under `value.fields`.
 * Bulk manifest vocabulary uses field particles internally, but this adapter must
 * not accept or normalize a renamed protocol key.
 */
export const resolveForceFieldsPayload = (value: unknown): Record<string, unknown> | null => {
	if (!isRecord(value)) return null
	const fields = value.fields
	return isRecord(fields) ? fields : null
}
