/**
 Сообщение для обмена данными между акторами

 @property meta - Метаданные сообщения
 @property meta.tag - Имя типа актора
 @property meta.timestamp - Время отправки сообщения
 @property patches - Патч для применения к актору
 */
export type Message = {
  meta: MetaDataMessage
  patch: JsonPatch
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

export type JsonPatch = { op: "replace" | "add" | "remove" | "test"; path: "/context" | "/state" | "/"; value?: any }
