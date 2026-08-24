/**
 * Bun platform part visual package.
 *
 * Текущая реализация объявляет только environment и не создаёт visual runtime
 * или side effects. Это существующая package part, а не обещание отдельной
 * server-визуализации.
 *
 * @packageDocumentation
 */

/** Точный Bun environment этого platform entrypoint. */
export const environment = "server" as const
