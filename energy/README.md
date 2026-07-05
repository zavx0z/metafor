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
- Energy v0 ждёт timeout и публикует actor-addressed `w+`;
- отдельного `energy/server.ts`, bridge protocol и dev server `3006` больше нет.

Каноническое завершение процесса для Matrix — это Force `w+` или `w-` с
`path = actor ID` и `value.fields[fieldId]`. Energy пока не исполняет DSL
process action: default timeout — примерно `2000ms`, для тестов его можно
ускорить через `ENERGY_TIMEOUT_MS=1`.

`energy/index.ts` остаётся тонким публичным входом для типов и парсера
`readEnergyEnv`, без runtime-side-effect.

`ENERGY_ID` задаёт id исполнителя; если env нет, используется стабильный
`energy-local`. Реальное исполнение DSL action, process descriptor, `wrapperSrc`,
dynamic import, env resolver и success/error handlers остаются следующим этапом.
