import { TYPE } from "./common"
import { FieldType, type FieldTypeValue } from "./context"

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
