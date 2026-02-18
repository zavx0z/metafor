import { TYPE } from "../opcodes"
import { FieldType, type FieldTypeValue } from "../core/FieldRegistry"
import { getStringAtlas, type StringId } from "../strings/StringAtlas"

/**
 * Мост совместимости между системой типов бран (FieldType)
 * и системой типов байткода/шейдера (TYPE).
 *
 * Почему нужен маппинг:
 * - FieldType используется в самоописываемых бранах + глобальной куче.
 * - TYPE зафиксирован в формате байткода и в WGSL classify-шейдере.
 *
 * Особый случай:
 * - SHARED_PTR (запутанные браны) не имеет прямого аналога в TYPE.
 * - Кодируется как UINT (fallback), а фактическое чтение
 *   запутанных компонент делается рекурсивно в шейдере.
 */
export function fieldTypeToBytecodeType(fieldType: FieldTypeValue): number {
  switch (fieldType) {
    case FieldType.F32:
      return TYPE.FLOAT
    case FieldType.U32:
      return TYPE.UINT
    case FieldType.BOOL:
      return TYPE.BOOL
    case FieldType.STRING_PTR:
      return TYPE.STRING
    case FieldType.ARRAY_PTR:
      return TYPE.ARRAY
    case FieldType.SHARED_PTR:
      return TYPE.UINT
    default:
      return TYPE.UINT
  }
}

/**
 * Bitcast: float32 → u32 (для кодирования чисел с плавающей точкой в байт-коде).
 *
 * @param value - Число с плавающей точкой
 * @returns Битовое представление в виде u32
 */
export function floatToUint(value: number): number {
  const buf = new Float32Array([value])
  return new Uint32Array(buf.buffer)[0]!
}

/**
 * Bitcast: u32 → float32 (для декодирования чисел из байт-кода).
 *
 * @param value - Битовое представление u32
 * @returns Число с плавающей точкой
 */
export function uintToFloat(value: number): number {
  const buf = new Uint32Array([value])
  return new Float32Array(buf.buffer)[0]!
}

/**
 * Интернирует строку через глобальный StringAtlas.
 *
 * @param str - Строка для интернирования
 * @returns StringId и hash для записи в брану
 */
export function internString(str: string): { stringId: StringId; hash: number } {
  const atlas = getStringAtlas()
  const stringId = atlas.intern(str)
  const meta = atlas.getMeta(stringId)
  if (!meta) {
    throw new Error(`Failed to get metadata for string: ${str}`)
  }
  return { stringId, hash: meta.hash }
}
