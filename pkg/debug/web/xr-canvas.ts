/**
 * Re-export UiCanvas/UiCard из @metafor/ui под старыми именами,
 * чтобы остальной код debug-пакета не пришлось править разом.
 *
 * Логика канваса (renderer + scene + viewPoint + input routing) живёт в
 * pkg/ui/src/canvas.ts; здесь — только alias'ы.
 */

export {UiCanvas as XrCanvas, type UiCard as XrCard, type CardRect, type CardLayoutFn} from "@metafor/ui"
