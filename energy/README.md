# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает `Boundary`/SQLite и не держит Matrix store.

Текущий этап создаёт локальный Force pipeline с явным стартом из `dark/index.ts`:

- Dark получает `boundary.energyRuntime()` catalog и вызывает
  `startEnergyProtocol({catalog})` до `loadMatrixRuntimeSnapshot()`;
- catalog содержит actor/wimp mapping и process descriptors по `wimp + state`;
- `energy/energy.ts` открывает общий `BroadcastChannel("force")`;
- `photon/replace` от Matrix игнорируется как обычный state;
- `photon/test` от Matrix означает process-bound state;
- Energy ищет descriptor в catalog, проверяет env и отвечает через `z test` с
  `value.energy` только при совпадении;
- Matrix выбирает первого валидного Energy и отдаёт frozen snapshot через
  `z copy` с `from = Energy id`;
- `z copy.value` содержит только `fields`, без `process`;
- Energy принимает только `z copy`, где `from` совпадает с его `ENERGY_ID`;
- Energy v0 ждёт timeout и публикует actor-addressed `w+`;
- отдельного `energy/server.ts`, bridge protocol и dev server `3006` больше нет.

Каноническое завершение процесса для Matrix — это Force `w+` или `w-` с
`path = actor ID` и `value.fields[fieldId]`. Energy пока не исполняет DSL
process action: default timeout — примерно `2000ms`, для тестов его можно
ускорить через `ENERGY_TIMEOUT_MS=1`.

`energy/index.ts` остаётся тонким публичным входом для типов и парсера
`readEnergyEnv`, без runtime-side-effect.

`ENERGY_ID` задаёт id исполнителя; если env нет, используется стабильный
`energy-local`. Реальное исполнение DSL action, `wrapperSrc`, dynamic import,
env resolver и success/error handlers остаются следующим этапом.
