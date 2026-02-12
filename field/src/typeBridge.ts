import { TYPE } from "./common"
import { FieldType, type FieldTypeValue } from "./context"

/**
 * Мост совместимости между новой системой типов бран (FieldType)
 * и legacy-системой типов байткода/шейдера (TYPE).
 *
 * Почему нужен маппинг:
 * - FieldType используется в самописываемых бранах + глобальной куче.
 * - TYPE зафиксирован в формате байткода и в WGSL classify-шейдере.
 *
 * Особый случай:
 * - SHARED_PTR не имеет прямого аналога в TYPE.
 * - Для обратной совместимости кодируется как UINT (fallback),
 *   а фактическое чтение таких полей делается рекурсивно в шейдере.
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
