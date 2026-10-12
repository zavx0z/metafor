/**
Сервер сравнивает целевой состав с фактическими browser artifacts.
Результат содержит только получение и удаление; выполнение обновления остаётся
у browser release. Примеры вызывают существующий публичный server-вход пакета.
*/
import {describe, expect, test} from "bun:test"
import {releaseDelta} from "../server/index.ts"
import {
  lazy,
  previousLazy,
  previousLazyRemoval,
  previousRemoval,
  previousVisual,
  service,
  theme,
  visual,
  visualRemoval,
} from "./fixture"

describe.each<{
  name: string
  props: {desired: Parameters<typeof releaseDelta>[0]; current: Parameters<typeof releaseDelta>[1]}
  expected: ReturnType<typeof releaseDelta>
}>([
  {
    name: "Пустой состав",
    props: {desired: [], current: []},
    expected: {update: [], remove: []},
  },
  {
    name: "Первая установка",
    props: {desired: [visual, service], current: []},
    expected: {update: [visual, service], remove: []},
  },
  {
    name: "Установленный состав уже совпадает",
    props: {desired: [visual, service], current: [visual, service]},
    expected: {update: [], remove: []},
  },
  {
    name: "Новая версия",
    props: {desired: [visual, service], current: [previousVisual, service]},
    expected: {update: [visual], remove: [previousRemoval]},
  },
  {
    name: "Исправление hash по тому же адресу",
    props: {desired: [visual], current: [{...visual, sha256: "f".repeat(64)}]},
    expected: {update: [visual], remove: []},
  },
  {
    name: "Исправление размера по тому же адресу",
    props: {desired: [visual], current: [{...visual, size: 43}]},
    expected: {update: [visual], remove: []},
  },
  {
    name: "Удаление пакета",
    props: {desired: [service], current: [visual, service]},
    expected: {update: [], remove: [visualRemoval]},
  },
  {
    name: "Удаление всего установленного состава",
    props: {desired: [], current: [previousVisual, visual]},
    expected: {update: [], remove: [previousRemoval, visualRemoval]},
  },
  {
    name: "Завершение перекрытия двух версий",
    props: {desired: [visual], current: [previousVisual, visual]},
    expected: {update: [], remove: [previousRemoval]},
  },
  {
    name: "Получение обязательного ресурса с сохранением текущего lazy artifact",
    props: {desired: [visual, theme], current: [visual, lazy, previousLazy]},
    expected: {update: [theme], remove: [previousLazyRemoval]},
  },
])("$name", ({props, expected}) => {
  const input = structuredClone(props)
  const result = releaseDelta(input.desired, input.current)

  test("Полный ответ", () => {
    expect(result, "Ответ содержит только отличия фактического состава от целевого").toEqual(expected)
  })

  test("Получение artifacts", () => {
    expect(result.update, "Новые и повреждённые entries перечислены в порядке целевого состава").toEqual(expected.update)
  })

  test("Удаление прежних entries", () => {
    expect(result.remove, "Удаляются прежние версии и отсутствующие packages в порядке фактического состава").toEqual(expected.remove)
  })

  test("Сохранность исходных состояний", () => {
    expect(input, "Сравнение не изменяет переданные целевой и фактический составы").toEqual(props)
  })
})
