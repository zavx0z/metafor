# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает `Boundary`/SQLite и не держит Matrix store.

Текущий этап создаёт локальный Force pipeline:

- `energy/energy.ts` открывает общий `BroadcastChannel("force")`;
- `z` process-task обрабатывается прямо в подписке;
- Energy отвечает `z` claim-сообщением в тот же канал;
- отдельного `energy/server.ts`, bridge protocol и dev server `3006` больше нет.

Каноническое завершение процесса для Matrix — это Force `w+` или `w-`. Energy
пока только claim-ит task через `z` и не исполняет action.

`energy/index.ts` остаётся тонким публичным входом для типов и парсера
`readEnergyEnv`, без runtime-side-effect.

Реальное исполнение DSL action и миграция legacy process protocol остаются
следующим этапом.
