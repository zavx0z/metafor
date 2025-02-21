import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

describe("Пайплайн", () => {
  const atom = Atom("Менеджер прогресса").states("IDLE", "ACTIVE", "COMPLETE"
  ).context({
    username: t.string({title: "Имя пользователя", nullable: true}),
    progress: t.number({title: "Прогресс", nullable: true}),
  }).collapses([
    {
      from: "IDLE",
      action: "idle",
      to: [
        {state: "ACTIVE", trigger: {username: {include: "user"}, progress: {gt: 0, lt: 50}}},
      ],
    },
    {
      from: "ACTIVE",
      action: "active",
      to: [
        {state: "COMPLETE", trigger: {progress: {gt: 100}}},
      ],
    },
  ]).core().actions({
    idle: ({update}) => update({username: "user123", progress: 20}),
    active: ({update}) => update({progress: 101})
  }).reactions([]).create({
    description: "Управление прогрессом пользователя",
    state: "IDLE",
    context: {
      username: "",
      progress: 0,
    },
    onCollapse: (preview, current) =>{
      console.log(preview, current)
    }
  })
  test("Обновление контекста и переход в COMPLETE", () => {
    expect(atom.context).toEqual({username: "user123", progress: 101})
    expect(atom.state).toBe("COMPLETE")
  })
})
