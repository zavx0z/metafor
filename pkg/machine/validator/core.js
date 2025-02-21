/**
 * Проверяет корректность ядра атома
 * @template {Record<string, any>} I
 * @template {import('../types/index.ts').ContextDefinition} C
 * @param {import('../types/index.ts').CoreDefinition<I, C>} core
 */
export const validateCore = (core) => {
  if (typeof core !== "function") console.error("Ядро должно быть функцией")
}
