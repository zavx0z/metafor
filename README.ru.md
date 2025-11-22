# MetaFor

<div align="center">
  <img src="shared/img/metafor.gif" alt="metafor" width="444" />
</div>

**Русский** | [English](README.md)

## Зачем

MetaFor — вычислительное поле для акторов-конечных автоматов. Каждое приложение разбивается на атомы, которые живут по законам [Quantum Theory of Programming](atom/doc/qTp.md): взаимодействия детерминируются топологией поля, а не ручным связыванием модулей. Цель фреймворка — дать человеку и агентам единое пространство, где:

- процессы и ветвления видны целиком;
- можно управлять временем (останавливать/замедлять EM);
- каждый атом сохраняет изоляцию, но реагирует на чужие импульсы.

> ⚠️ Проект активно развивается. API фиксируются в Typedoc пакетов, README описывает принципы.

## Поле и силы

### Фотон/импульс как носитель информации

- Каждый импульс (`Photon`) в MetaFor — аналог реального фотона: он переносит данные о событии через поле.
- Информация кодируется в измеримых свойствах:
  - **Интенсивность** → количество патчей в `photon.impulses` (может означать «яркость» события).
  - **Частота / длина волны** → пара `meta` + `atom`, задающая «цвет» источника (какой актор и схема излучили импульс).
  - **Поляризация** → `path` и `op` (JSON Patch), описывающие направление и тип изменения.
  - **Фаза** → `timestamp` и порядок в стеке EM, определяющие относительное положение импульса во времени.
  - **Суперпозиция** → состояние атома, в которое прилетает импульс; реакция выступает «детектором», решающим резонировать или нет.
- Благодаря такой кодировке любой актор может декодировать данные без прямой ссылки на отправителя — достаточно прочитать свойства фотона.

### Позиционные пути

Гравитация (`Gravity`) в MetaFor работает как искривление пространства-времени в ОТО: она задаёт геометрию, по которой акторы вынуждены двигаться. Именно `Gravity`:

1. **Формирует топологию** — каждый уровень пути добавляет новое измерение мультивселенной. Вектор пространства данных строится по координате `0/1/2`, и актор получает собственную «геодезическую линию».
2. **Фиксирует путь** — `self.path` доступен реакциям, истории и наблюдателям, чтобы понимать положение и возможные переходы внутри этой многомерной сетки.
3. **Резервирует пространство** — если путь задаётся вручную (`Atom.fromSchema({ path })`), `Gravity` через `Field.fields` создаёт слот заранее, иначе искривление нарушится.

В такой модели потомки видят друг друга рекурсивно (по вектору пути), но не получают доступа к родителю и его скрытым параметрам: контекст хранит то, что остаётся закрытым для восходящих связей и раскрывается только через фотон.

Гравитация тем самым превращает набор акторов в галактику: траектории не хаотичны, а подчинены общему искривлению поля.

### Расширенные фильтры реакций

- `reaction().filter(({ self, context }) => ...)` видит только `SelfInfo` (без `destroy`), что исключает случайное уничтожение актора во время фильтрации.
- В `equal` прилетает полный `Self` и можно вызвать `self.destroy()`.
- Фильтры описываются декларативно: `meta`, `atom`, `path`, `op`, `value`, `timestamp` с такими же условиями, как в `states`.

### Иерархия

- `Fields` управляет топологией: родитель, порядок, последовательность.
- Сиблинги и дети добавляются методами `Field.fields.reserveSibling` / `reserveByIndexPath`. Для разработчика поверх этого есть `Atom.createSibling` и `Atom.append`.
- История импульсов (`Photon`) фиксируется глобально: можно восстановить состояние по чекпоинтам.

## Архитектура актора

### 1. Context — только примитивы

```ts
.context((types) => ({
  name: types.string.required("Гость"),
  age: types.number.required(18),
  tags: types.array.required(["default"]),
  role: types.enum("user", "admin", "moderator").required("user"),
  isActive: types.boolean.required(true),
}))
```

- допустимы `string | number | boolean | enum | array`;
- `optional` поля по умолчанию `null`;
- метаданные добавляются вызовом `({ label: "..." })`.

### 2. Core — сложные структуры

```ts
.core((ref) => ({
  users: new Map<number, User>(),
  cache: new LRUCache(),
  socket: null as WebSocket | null,
  formRef: ref(),
}))
```

- хранит объекты, классы, сервисы и ссылки на DOM (`ref()` только для DOM);
- доступен во всех процессах, реакциях и во view.

### 3. States — суперпозиция

```ts
.states({
  idle: { loading: { userId: { gt: 0 } }, error: {} },
  loading: { success: { data: { notEq: null } }, error: {} },
  success: { idle: {}, editing: { mode: { eq: "edit" } } },
  error: { idle: {}, retry: { retryCount: { lt: 3 } } },
})
```

- условия используют те же операторы, что и реакции (`eq`, `gt`, `between`, `pattern`, `includes`, `isEmpty` и т. д.);
- автомат проверяется на циклы безусловных переходов (`validateNoUnconditionalCycles`).

### 4. Processes — поведение на входе в состояние

```ts
.processes((process) => ({
  loading: process({ label: "Загрузка" })
    .action(async ({ context }) => fetch(`/api/${context.userId}`))
    .success(({ update, data }) => update({ userName: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
  destroy: process.destroy({ label: "Очистка" }).before(({ core }) => core.socket?.close()),
}))
```

- имя процесса = имя состояния (кроме `destroy`);
- `action` может быть асинхронным, `success`/`error` — всегда синхронные;
- `destroy` оформляется отдельной цепочкой `process.destroy()`.

### 5. Reactions — отклик на чужие импульсы

```ts
.reactions((reaction) => [
  [
    ["idle", "loading"],
    reaction({ label: "Сообщение от child-user" })
      .filter(({ context }) => ({
        meta: "child-user",
        op: "replace",
        path: "/context",
        value: { userId: { gt: 0 } },
      }))
      .equal(({ update, patch, self }) => {
        update({ selectedUserId: patch.value.userId })
        if (patch.value.userId === 0) self.destroy()
      }),
  ],
])
```

- фильтры не используют `["*"]` — явно перечисляем состояния;
- реакция активна только в заданных состояниях.

### 6. View — представление

```ts
.view({
  render: ({ context, state, html, update }) => html`
    <div class="component state-${state}">
      ${state === "idle"
        ? html`<button onclick=${() => update({ userId: 123 })}>Загрузить</button>`
        : state === "loading"
        ? html`<div class="spinner">Загрузка…</div>`
        : html`<div>${context.userName}</div>`}
    </div>
  `,
  style: ({ css }) => css`.component { padding: 16px; }`,
})
```

- контекст и core можно прокидывать дочерним атомам через атрибуты `context`/`core`;
- в представлении нельзя создавать тяжёлые объекты на каждый рендер — используем core.

## Передача данных между компонентами

```ts
render: ({ context, core, html }) => html`
  <meta-user-details context=${{ userId: context.selectedUserId }}></meta-user-details>
  <meta-messenger
    core=${{
      socket: core.socket,
      apiService: core.apiService,
    }}></meta-messenger>
`
```

- контекст передаётся как сериализуемый объект;
- core можно делиться частично, если требуется общий ресурс.

## Создание компонента MetaFor

```ts
const userProfile = MetaFor("user-profile")
  .context((types) => ({
    userId: types.number.required(0),
    userName: types.string.required(""),
  }))
  .states({
    idle: { loading: { userId: { gt: 0 } } },
    loading: { success: {}, error: {} },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core((ref) => ({ users: new Map(), formRef: ref() }))
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => fetch(`/api/users/${context.userId}`).then((r) => r.json()))
      .success(({ update, data }) => update({ userName: data.name })),
  }))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`<div>${context.userName}</div>`,
  })
```

## Экосистема пакетов

| Пакет              | Смысл                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `@metafor/meta`    | Язык описания акторов. Здесь формулируются правила поля.           |
| `@metafor/atom`    | Материализация схем. Схема становится реальной частицей.           |
| `@metafor/inspect` | Взгляд наблюдателя. Можно остановить время и увидеть стек фотонов. |
| `@metafor/virtual` | Пространственное восприятие. Видно, как поле резонирует и дышит.   |

Перед релизом обновляйте Typedoc (`bun run docs`), чтобы карта этих областей оставалась точной.

## Как мыслить разработчику

1. **Опишите актор** как частью поля, а не как контроллером. Важно понять, что он знает, какие орбиты имеет, какие импульсы готов принять.
2. **Дайте полю жить** — материализуйте схемы и позвольте EM/Field управлять путями и временем.
3. **Наблюдайте** через Inspect/Virtual, тормозите время, исследуйте историю — вы экспериментатор, а не только автор кода.
4. **Фиксируйте знания** — Typedoc, тесты и README становятся хроникой, а не просто документацией: они описывают подход и причины решений.

## Статус проекта

- MetaFor в активной разработке; несовместимые изменения возможны.
- В продакшене используйте на свой риск, закрепляя версии пакетов.
