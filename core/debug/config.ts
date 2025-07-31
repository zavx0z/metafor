/**
 * Конфигурация отладки для MetaFor
 * @module Debug
 */

/**
 * Интерфейс для конфигурации отладки
 */
export interface DebugConfig {
  /** Включить отладку MetaFor */
  debugMetaFor: boolean
  /** Включить отладку HTML */
  debugHtml: boolean
  /** Включить отладку событий */
  debugEvents: boolean
  /** Предупреждения HTML */
  htmlWarnings: Set<string>
  /** Поддержка полифиллов */
  htmlPolyfillSupport?: (Template: any, ChildPart: any) => void
  /** Поддержка полифиллов в режиме разработки */
  htmlPolyfillSupportDevMode?: (Template: any, ChildPart: any) => void
  /** Эмиссия событий отладки */
  emitHtmlDebugLogEvents: boolean
}

/**
 * Глобальная конфигурация отладки
 */
export const debugConfig: DebugConfig = {
  debugMetaFor: false,
  debugHtml: false,
  debugEvents: false,
  htmlWarnings: new Set(),
  emitHtmlDebugLogEvents: false,
}

/**
 * Включить отладку MetaFor
 */
export function enableMetaForDebug(): void {
  debugConfig.debugMetaFor = true
}

/**
 * Включить отладку HTML
 */
export function enableHtmlDebug(): void {
  debugConfig.debugHtml = true
}

/**
 * Включить отладку событий
 */
export function enableEventDebug(): void {
  debugConfig.debugEvents = true
}

/**
 * Проверить, включена ли отладка MetaFor
 */
export function isMetaForDebugEnabled(): boolean {
  return debugConfig.debugMetaFor
}

/**
 * Проверить, включена ли отладка HTML
 */
export function isHtmlDebugEnabled(): boolean {
  return debugConfig.debugHtml
}

/**
 * Проверить, включена ли отладка событий
 */
export function isEventDebugEnabled(): boolean {
  return debugConfig.debugEvents
}

/**
 * Добавить предупреждение HTML
 */
export function addHtmlWarning(warning: string): void {
  debugConfig.htmlWarnings.add(warning)
}

/**
 * Проверить, есть ли предупреждение HTML
 */
export function hasHtmlWarning(warning: string): boolean {
  return debugConfig.htmlWarnings.has(warning)
}

/**
 * Установить поддержку полифиллов
 */
export function setHtmlPolyfillSupport(support: (Template: any, ChildPart: any) => void): void {
  debugConfig.htmlPolyfillSupport = support
}

/**
 * Установить поддержку полифиллов в режиме разработки
 */
export function setHtmlPolyfillSupportDevMode(support: (Template: any, ChildPart: any) => void): void {
  debugConfig.htmlPolyfillSupportDevMode = support
}

/**
 * Получить поддержку полифиллов
 */
export function getHtmlPolyfillSupport(): ((Template: any, ChildPart: any) => void) | undefined {
  return debugConfig.debugHtml ? debugConfig.htmlPolyfillSupportDevMode : debugConfig.htmlPolyfillSupport
}

/**
 * Включить эмиссию событий отладки
 */
export function enableHtmlDebugLogEvents(): void {
  debugConfig.emitHtmlDebugLogEvents = true
}

/**
 * Проверить, включена ли эмиссия событий отладки
 */
export function isHtmlDebugLogEventsEnabled(): boolean {
  return debugConfig.emitHtmlDebugLogEvents
}
