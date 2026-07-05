# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает `Boundary`/SQLite и не держит Matrix store.

Текущий этап создаёт локальный Force pipeline:

- `energy/energy.ts` открывает общий `BroadcastChannel("force")`;
- `photon` от Matrix является сигналом входа actor в state;
- Energy отвечает на `photon` через `z test` с `value.energy`;
- Matrix выбирает первого валидного Energy и отдаёт frozen snapshot через
  `z copy` с `from = Energy id`;
- Energy принимает только `z copy`, где `from` совпадает с его `ENERGY_ID`;
- если `z copy.value.process` содержит action descriptor, Energy проверяет env,
  исполняет `wrapperSrc`/dynamic import и публикует actor-addressed `w+`;
- если descriptor отсутствует, Energy ждёт timeout и публикует actor-addressed
  `w+` как fallback;
- если action падает или env не подходит, Energy публикует actor-addressed `w-`;
- отдельного `energy/server.ts`, bridge protocol и dev server `3006` больше нет.

Каноническое завершение процесса для Matrix — это Force `w+` или `w-` с
`path = actor ID` и `value.fields[fieldId]`. На текущем этапе success/error
handlers ещё не применяются, поэтому успешный action возвращает пустой
`fields: {}`. Timeout fallback по умолчанию — примерно `2000ms`, для тестов его
можно ускорить через `ENERGY_TIMEOUT_MS=1`.

`energy/index.ts` остаётся тонким публичным входом для типов и парсера
`readEnergyEnv`, без runtime-side-effect.

`ENERGY_ID` задаёт id исполнителя; если env нет, используется стабильный
`energy-local`. `ENERGY_RUNTIME_KIND` или `ENERGY_ENV` задают runtime env для
descriptor env check; default — `server`. Success/error handlers поверх action
result остаются следующим этапом.
