/**
Читатель фактического browser state проверяет форму identities.
Чтение сообщения не доказывает наличие bytes или полноту установленного выпуска.
*/
import {describe, expect, test} from "bun:test"
import {parseReleaseCurrentMessage} from "../server/index.ts"
import {lazy, previousVisual, service, theme, visual, worker} from "./fixture"

describe.each<{
  name: string
  props: unknown
  expected: ReturnType<typeof parseReleaseCurrentMessage>
}>([
  {
    name: "Пустое фактическое состояние",
    props: {type: "release-current", current: []},
    expected: {type: "release-current", current: []},
  },
  {
    name: "Корневые и некорневые artifacts",
    props: {type: "release-current", current: [visual, service, theme, lazy]},
    expected: {type: "release-current", current: [visual, service, theme, lazy]},
  },
  {
    name: "Перекрытие разных версий",
    props: {type: "release-current", current: [previousVisual, visual]},
    expected: {type: "release-current", current: [previousVisual, visual]},
  },
  {
    name: "Browser Worker предметного пакета",
    props: {type: "release-current", current: [worker]},
    expected: {type: "release-current", current: [worker]},
  },
  {name: "Отсутствующее состояние", props: {type: "release-current"}, expected: null},
  {name: "Повтор точного entry", props: {type: "release-current", current: [visual, {...visual}]}, expected: null},
  {name: "Один адрес с разными hash", props: {type: "release-current", current: [visual, {...visual, sha256: "f".repeat(64)}]}, expected: null},
  {name: "Лишнее поле сообщения", props: {type: "release-current", current: [], id: "request"}, expected: null},
  {name: "Endpoint вместо вычисляемого адреса", props: {type: "release-current", current: [{...visual, endpoint: "/code"}]}, expected: null},
  {name: "Серверная среда", props: {type: "release-current", current: [{...visual, env: "server"}]}, expected: null},
  {name: "Неизвестный namespace", props: {type: "release-current", current: [{...visual, name: "@foreign/visual"}]}, expected: null},
  {name: "Неполная версия", props: {type: "release-current", current: [{...visual, version: "1.2"}]}, expected: null},
  {name: "Неверный hash", props: {type: "release-current", current: [{...visual, sha256: "changed"}]}, expected: null},
  {name: "Нулевой размер", props: {type: "release-current", current: [{...visual, size: 0}]}, expected: null},
  {name: "Дробный размер", props: {type: "release-current", current: [{...visual, size: 1.5}]}, expected: null},
  {name: "Размер за пределом точного целого", props: {type: "release-current", current: [{...visual, size: Number.MAX_SAFE_INTEGER + 1}]}, expected: null},
  {name: "Явный ключ корневого artifact", props: {type: "release-current", current: [{...visual, artifact: "."}]}, expected: null},
  {name: "Выход artifact за пределы пакета", props: {type: "release-current", current: [{...visual, artifact: "./../private.js"}]}, expected: null},
])("$name", ({props, expected}) => {
  const input = structuredClone(props)
  const result = parseReleaseCurrentMessage(input)

  test("Результат чтения", () => {
    expect(result, "Current допускает разные сохранённые версии, но отвергает повтор адреса и некорректные identities").toEqual(expected)
  })

  test("Исходное сообщение", () => {
    expect(input, "Валидация не исправляет и не изменяет полученное сообщение").toEqual(props)
  })
})
