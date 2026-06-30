const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

export type ForceFieldId = number

/**
 * Протокол Force публикует патчи полей через `value.fields`.
 * Нормализатор живёт у Boundary как общий контрактный слой и не принимает
 * словарь Bulk manifest `value.fieldParticles`.
 */
export const resolveForceFieldsPayload = (value: unknown): Record<string, unknown> | null => {
	if (!isRecord(value)) return null
	const fields = value.fields
	return isRecord(fields) ? fields : null
}

/**
 * В Force v0 ключ внутри `value.fields` является ID поля внутри области WIMP.
 * Key/order-адресация намеренно не поддерживается: ключ поля является изменяемой
 * метаинформацией, а порядок является layout-метаданными, не адресом протокола.
 */
export const resolveForceFieldId = (address: string): ForceFieldId | null => {
	if (!/^[1-9]\d*$/.test(address)) return null
	const id = Number(address)
	return Number.isSafeInteger(id) ? id : null
}
