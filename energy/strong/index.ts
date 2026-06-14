/**
 * `@energy/strong` удерживает каноническую и согласованную store-форму Energy.
 */

import { materializeEntanglement } from "./entangled"
import type { PreparedEntanglementProjection } from "./entangled.t"
import { assembleStoredEnergyData } from "./stored"
import type { FlattenedEnergyInput } from "@energy/gravity"
import { createStoredStringInterner } from "./string-table"
import type { StoredStringTable } from "./string-table.t"
import { normalizeFieldValue } from "./normalize"
import { strong$ } from "./store"
import type { EnergyStrongStore } from "./store.t"
import type { PreparedData } from "../energy.t"

export {
  assembleStoredEnergyData,
  createStoredStringInterner,
  materializeEntanglement,
  normalizeFieldValue,
  strong$,
}
export type {
  FlattenedEnergyInput,
  PreparedEntanglementProjection,
  StoredStringTable,
  EnergyStrongStore,
  PreparedData,
}
export { FieldType } from "@energy/gravity"
