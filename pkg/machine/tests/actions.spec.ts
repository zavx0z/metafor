import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

const userActor = Atom("Пользователь").states("АНОНИМНЫЙ", "РЕГИСТРАЦИЯ", "АВТОРИЗАЦИЯ", "АВТОРИЗОВАН"
).context({
  nickname: t.string({title: "Имя", nullable: true}),
  email: t.string({title: "Email", nullable: true}),
  password: t.string({title: "Пароль", nullable: true})
}).collapses([
  {
    from: "АНОНИМНЫЙ",
    to: [{
      state: "АВТОРИЗАЦИЯ",
      trigger: {email: {isNull: false}, password: {isNull: false}}
    }],
  },
  {
    from: "АВТОРИЗАЦИЯ",
    action: "login",
    to: [{
      state: 'АВТОРИЗОВАН',
      trigger: {nickname: {isNull: false}}
    }]
  }
])

describe('Actions', () => {

  test('При входе в состояние выполняется действие', async () => {
    const user = userActor.core().actions({
      login: ({update}) => {
        const nickname = "zavx0z"
        update({nickname})
      }
    }).reactions([]).create({
      state: "АНОНИМНЫЙ",
      context: {email: "zavx0z@ya.ru", password: "123456"}
    })
    await Bun.sleep(200)
    expect(user.state).toBe("АВТОРИЗОВАН")
    expect(user.context.nickname).toBe('zavx0z')
  })

  test('Асинхронное действие', async () => {
    const user = userActor.core().actions({
      login: async ({update}) => {
        await new Promise(resolve => setTimeout(resolve, 100))
        update({nickname: "async_user"})
      }
    }).reactions([]).create({
      state: "АНОНИМНЫЙ",
      context: {nickname: null}
    })
    user.update({email: "test@test.com", password: "password"})
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(user.state).toBe('АВТОРИЗОВАН')
    expect(user.context.nickname).toBe('async_user')
  })

  test('Действие может обновлять несколько полей контекста', () => {
    const user = userActor.core().actions({
      login: ({update}) => {
        update({
          nickname: "multi_update",
          email: "updated@email.com"
        })
      }
    }).reactions([]).create({
      state: "АНОНИМНЫЙ",
      context: {
        nickname: null,
        email: null
      }
    })
    user.update({email: "initial@email.com", password: "password"})
    expect(user.context.nickname).toBe('multi_update')
    expect(user.context.email).toBe('updated@email.com')
  })

  test('Действие не выполняется если триггеры не сработали', () => {
    let actionCalled = false
    const user = userActor.core().actions({
      login: ({update}) => {
        actionCalled = true
        update({nickname: "should_not_update"})
      }
    }).reactions([]).create({state: "АНОНИМНЫЙ", context: {nickname: null}})
    user.update({email: "test@test.com"})
    expect(user.state).toBe('АНОНИМНЫЙ')
    expect(actionCalled).toBe(false)
    expect(user.context.nickname).toBeNull()
  })
})
