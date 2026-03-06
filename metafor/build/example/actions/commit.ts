/**
 * Пример action-модуля для коммита изменений.
 */

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
 * @param params - Параметры действия: field, value, mass, self
 * @returns Promise с результатом коммита
 */
export default async function action({ field, value }: any): Promise<CommitResult> {
  // field — декларация полей (схема)
  // value — значения полей (данные)
  const commitValue = value as unknown as CommitValue

  // Имитация коммита
  console.log("Коммит:", commitValue.src)

  return { success: true }
}
