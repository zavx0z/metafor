import {Atom, t} from "../atom.js"

export const atom = Atom("Авторизация").states(
  "АНОНИМ",
  "АВТОРИЗАЦИЯ", "ОШИБКА АВТОРИЗАЦИИ", "АВТОРИЗОВАН",
  "РЕГИСТРАЦИЯ", "ОШИБКА РЕГИСТРАЦИИ", "ЗАРЕГИСТРИРОВАН",
  "ВОССТАНОВЛЕНИЕ", "ОШИБКА ВОССТАНОВЛЕНИЯ", "ВОССТАНОВЛЕН"
).context({
  id: t.number({title: "ID пользователя", nullable: true}),
  nickname: t.string({title: "Никнейм", nullable: true}),
  email: t.string({title: "Email", nullable: true}),
  active: t.boolean({title: "Активен", nullable: true}),
  role: t.string({title: "Роль", nullable: true}),
  password: t.string({title: "Пароль", nullable: true}),
  error: t.string({title: "Ошибка", nullable: true}),
}).collapses([
  {
    from: "АНОНИМ",
    action: "clear",
    to: [
      {state: "АВТОРИЗАЦИЯ", trigger: {email: {isNull: false}, password: {isNull: false}}},
      {state: "РЕГИСТРАЦИЯ", trigger: {email: {isNull: false}, nickname: {isNull: false}}},
      {state: "ВОССТАНОВЛЕНИЕ", trigger: {email: {isNull: false}, password: {isNull: true}}},
    ],
  },
  {
    from: "АВТОРИЗАЦИЯ",
    action: "login",
    to: [
      {state: "АВТОРИЗОВАН", trigger: {nickname: {isNull: false}}},
      {state: "ОШИБКА АВТОРИЗАЦИИ", trigger: {error: {isNull: false}}},
    ],
  },
  {
    from: "ОШИБКА АВТОРИЗАЦИИ",
    to: [
      {state: "АНОНИМ", trigger: {error: {isNull: true}}},
    ],
  },
  {
    from: "АВТОРИЗОВАН",
    to: [
      {state: "АНОНИМ", trigger: {id: {isNull: true}}},
    ],
  },
  {
    from: "РЕГИСТРАЦИЯ",
    action: "register",
    to: [
      {state: "ЗАРЕГИСТРИРОВАН", trigger: {nickname: {isNull: false}}},
      {state: "ОШИБКА РЕГИСТРАЦИИ", trigger: {error: {isNull: false}}},
    ],
  },
  {
    from: "ОШИБКА РЕГИСТРАЦИИ",
    to: [
      {state: "АНОНИМ", trigger: {error: {isNull: true}}},
    ],
  },
  {
    from: "ЗАРЕГИСТРИРОВАН",
    to: [
      {state: "АВТОРИЗАЦИЯ", trigger: {email: {isNull: false}, password: {isNull: false}}},
    ],
  },
  {
    from: "ВОССТАНОВЛЕНИЕ",
    action: "restore",
    to: [
      {state: "ВОССТАНОВЛЕН", trigger: {email: {isNull: false}}},
      {state: "ОШИБКА ВОССТАНОВЛЕНИЯ", trigger: {error: {isNull: false}}},
    ],
  },
  {
    from: "ОШИБКА ВОССТАНОВЛЕНИЯ",
    to: [
      {state: "АНОНИМ", trigger: {error: {isNull: true}}},
    ],
  },
  {
    from: "ВОССТАНОВЛЕН",
    to: [
      {state: "АВТОРИЗАЦИЯ", trigger: {email: {isNull: false}, password: {isNull: false}}},
    ],
  }
]).core({
  data: /** @type {string|null} */ (null)
}).actions({
  clear: ({update, core, context}) => {
    context.id = null
    core.data = ''
    update({email: null, password: null, error: null})
  },
  login: async ({context, update}) => {
    try {
      const response = await fetch("http://localhost:3333/secure/login", {
        method: "POST",
        body: JSON.stringify({email: context.email, password: context.password}),
      })
      const data = await response.json()
      await Bun.sleep(1000)
      update({nickname: data.nickname})
    } catch (error) {
      // @ts-ignore
      update({error: error.message})
    }
  },
}).create({
  id: "secure",
  state: "АНОНИМ",
  graph: true
})