/**
 * Адаптер DSL-relational meta → canonical `DbMetaRows`.
 *
 * Используется **легаси-потребителями** (в основном `boundary/database.ts`),
 * которые ожидают `DbMetaRows` форму. Цель адаптера — позволить материализации
 * писать meta только в DSL-relational схему (через `relation()`), не дублируя
 * запись в canonical `meta_*` таблицах, при этом сохраняя совместимость с
 * read-side legacy code.
 *
 * **Текущее ограничение:** адаптер не реконструирует `matterNodes` / `matterEdges`
 * — это требует обратного преобразования `MatterParticlePlan[]` → `MatterEntry[]`,
 * не реализованного в `read.ts`. До реализации matter-конверсии адаптер
 * не должен использоваться вместо `backend.readMetaRows()` в местах, где
 * boundary читает matter (см. boundary/database.ts → `appendMetaMatter`).
 *
 * После того как matter-конверсия будет добавлена и адаптер начнёт обслуживать
 * read-side полностью, canonical `meta_*` DDL/таблицы можно будет удалить
 * из `store/db`.
 */

import type { Database } from "bun:sqlite"
import type { DbMetaRows } from "../../db/backend.t.ts"
import { deriveUuid } from "../../db/uuid.ts"
import { materializeMetaRows, type DbMetaBundle, type DbMetaFieldBundle } from "../../materialize.ts"
import { readDarkParticleModel } from "./read.ts"

/**
 * Читает meta из DSL-relational схемы по `src` и собирает `DbMetaRows`,
 * совместимый с canonical-meta-форматом.
 *
 * Возвращает `null`, если меты с таким `src` нет в DSL-relational схеме
 * (вместо `throw`, для совместимости с `backend.readMetaRows`).
 *
 * **Caveat:** `matterNodes` и `matterEdges` всегда пусты до реализации
 * matter-конверсии. Если потребителю нужен matter-граф — пока что читай
 * через canonical `backend.readMetaRows()`.
 */
export const readCanonicalMetaRows = (database: Database, src: string): DbMetaRows | null => {
  let model
  try {
    model = readDarkParticleModel(database, src)
  } catch {
    return null
  }

  const metaId = deriveUuid("meta", src)
  const fields: DbMetaFieldBundle[] = Object.entries(model.meta.fieldSchemas).map(([fieldKey, schema], fieldOrder) => ({
    id: deriveUuid("meta-field", metaId, fieldKey, fieldOrder),
    key: fieldKey,
    schema: {
      type: schema.type,
      required: schema.required ?? false,
      topology: schema.topology ?? false,
      ...(schema.label !== undefined ? { label: schema.label } : {}),
      ...(schema.values !== undefined ? { values: schema.values } : {}),
    },
  }))

  const bundle: DbMetaBundle = {
    id: metaId,
    src,
    ...(model.meta.name !== undefined ? { name: model.meta.name } : {}),
    fields,
    ...(model.meta.superposition !== undefined ? { superposition: model.meta.superposition } : {}),
    ...(model.meta.processes !== undefined ? { processes: model.meta.processes } : {}),
    ...(model.meta.reactions !== undefined ? { reactions: model.meta.reactions } : {}),
    ...(model.meta.bulk !== undefined ? { bulk: model.meta.bulk } : {}),
    ...(model.meta.mass !== undefined ? { mass: model.meta.mass } : {}),
    // matter intentionally omitted — TODO: matter-conversion из model.particles
  }

  return materializeMetaRows(bundle).rows
}
