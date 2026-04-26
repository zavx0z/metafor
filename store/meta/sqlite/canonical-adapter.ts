/**
 * Адаптер DSL-relational meta → canonical `DbMetaRows`.
 *
 * Используется legacy-потребителями (в основном `boundary/database.ts`),
 * которые ожидают `DbMetaRows` форму. Адаптер позволяет материализации
 * писать meta только в DSL-relational схему (через `relation()`), не дублируя
 * запись в canonical `meta_*` таблицах.
 *
 * Покрывает: meta, fields, states, transitions, processes, reactions, matter.
 * matter-граф реконструируется из DSL-relational `matter_particle*` через
 * `getMatterParticles` → конвертацию `MatterParticlePlan[]` в DSL-shape →
 * `appendMetaMatter` (тот же path-based deriveUuid что и в materialize, →
 * id-стабильность между двумя путями записи).
 */

import type { Database } from "bun:sqlite"
import type { MatterParticlePlan } from "@dark/types/dark"
import type { DbMetaRows } from "../../db/backend.t.ts"
import { createEmptyDbData } from "../../db/backend.ts"
import { deriveUuid } from "../../db/uuid.ts"
import {
  appendMetaMatter,
  materializeMetaRows,
  type DbMetaBundle,
  type DbMetaFieldBundle,
} from "../../materialize.ts"
import { readDarkParticleModel } from "./read.ts"
import { getMatterParticles } from "./matter/get.ts"

/**
 * Конвертирует runtime-форму `MatterParticlePlan` (что выдаёт
 * `getMatterParticles` из DSL-relational) в DSL-shape, который ожидает
 * `appendMetaMatter`: массив объектов `{ type, ...props, child?: array }`.
 *
 * Mapping:
 * - `kind` → `type`
 * - `children` → `child`
 * - остальные поля копируются (camelCase сохраняется)
 */
const convertMatterPlansToDslShape = (plans: MatterParticlePlan[]): unknown[] =>
  plans.map((plan) => {
    const child = plan.children ? convertMatterPlansToDslShape(plan.children) : undefined
    if (plan.kind === "wimp") {
      return {
        type: "wimp",
        src: plan.src,
        ...(plan.fieldsBinding !== undefined ? { fieldsBinding: plan.fieldsBinding } : {}),
        ...(plan.massBinding !== undefined ? { massBinding: plan.massBinding } : {}),
        ...(child !== undefined ? { child } : {}),
      }
    }
    if (plan.kind === "fuzzy") {
      return {
        type: "fuzzy",
        fuzzyKind: plan.fuzzyKind,
        ...(plan.predicateBinding !== undefined ? { predicateBinding: plan.predicateBinding } : {}),
        ...(child !== undefined ? { child } : {}),
      }
    }
    if (plan.kind === "axion") {
      return {
        type: "axion",
        predicateBinding: plan.predicateBinding,
        ...(child !== undefined ? { child } : {}),
      }
    }
    return {
      type: "macho",
      collectionBinding: plan.collectionBinding,
      ...(child !== undefined ? { child } : {}),
    }
  })

/**
 * Читает meta из DSL-relational схемы по `src` и собирает `DbMetaRows`,
 * совместимый с canonical-meta-форматом.
 *
 * Возвращает `null`, если меты с таким `src` нет в DSL-relational схеме
 * (вместо `throw`, для совместимости с `backend.readMetaRows`).
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
    // matter здесь пропущен — реконструируется отдельно ниже
  }

  const { rows } = materializeMetaRows(bundle)

  // Реконструкция matter из DSL-relational matter_particle*/matter_binding* таблиц.
  // Тот же path-based deriveUuid → id-совместимость с canonical materialize.
  const plans = getMatterParticles(database, src)
  if (plans.length > 0) {
    const matterShape = convertMatterPlansToDslShape(plans)
    const tempData = createEmptyDbData()
    appendMetaMatter(tempData, metaId, matterShape as DbMetaBundle["matter"], { nextMatterNodeOrder: 0 })
    rows.matterNodes = tempData.metaMatterNodes
    rows.matterEdges = tempData.metaMatterEdges
  }

  return rows
}
