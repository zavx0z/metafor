/**
 Сообщение для обмена данными между акторами

 @property meta - Метаданные сообщения
 @property meta.tag - Имя типа актора
 @property meta.timestamp - Время отправки сообщения
 @property patch - Патч для применения к актору
 @property patch.path - Путь к изменяемому свойству актора
 @property patch.op - Операция (add, remove, replace, move, copy, test)
 @property patch.value - Значение для операции
 */
export type BroadcastMessage = {
  meta: MetaDataMessage
  patches: JsonPatch[]
}

/**
   Метаданные сообщения
  
   @property tag - Имя типа актора (компонента)
   @property timestamp - Время отправки сообщения в миллисекундах
   */
export type MetaDataMessage = {
  tag: string
  timestamp?: number
}
export type JsonPatch =
  | { op: "replace"; path: string; value: any }
  | { op: "add"; path: string; value: any }
  | { op: "remove"; path: string }
  | { op: "test"; path: string; value: any }
