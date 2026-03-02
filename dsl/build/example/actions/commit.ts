/**
 * Пример action-модуля для коммита изменений.
 */

import type { ActionParams } from "@metafor/meta"

interface CommitValue {
  src: string
  patches: string[]
}

interface CommitResult {
  success: boolean
}

/**
 * Функция действия коммита.
 *
 * @param params - Параметры действия: value, mass, schema, self, update
 * @returns Promise с результатом коммита
 */
export default async function action({
  value,
}: ActionParams<{ src: { type: "string" }; patches: { type: "array" } }, {}>): Promise<CommitResult> {
  const commitValue = value as unknown as CommitValue

  // Имитация коммита
  console.log("Коммит:", commitValue.src)

  return { success: true }
}
