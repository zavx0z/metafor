const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Протокол Force публикует патчи полей через `value.fields`.
 * Нормализатор живёт у Boundary как общий контрактный слой и не принимает
 * словарь терминов Bulk manifest как форму Force payload.
 * Ключи этого объекта являются только положительными числовыми ID внутренних
 * элементов WIMP. Адресация по `key` или порядку не принимается: `key` является
 * изменяемой метаинформацией, а порядок полей не является логической сущностью.
 */
export const resolveForceFieldsPayload = (value: unknown): Record<string, unknown> | null => {
	if (!isRecord(value)) return null
	const fields = value.fields
	return isRecord(fields) ? fields : null
}

/**
 * В Force v0 ключ внутри `value.fields` является ID поля внутри области WIMP.
 * Адресация по `key` или порядку намеренно не поддерживается: ключ поля является
 * изменяемой метаинформацией, а порядок не является адресом протокола.
 */
export const resolveForceFieldId = (address: string): number | null => {
	if (!/^[1-9]\d*$/.test(address)) return null
	const id = Number(address)
	return Number.isSafeInteger(id) ? id : null
}
