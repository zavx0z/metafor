# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает `Boundary`/SQLite и не держит Matrix store.

Текущий этап создаёт только серверный shell и bridge protocol:

- подключение к AppWeb bridge `/energy/ws`;
- получение `force` и `process-task` сообщений;
- публикация `hello`, `claim`, `process-result` и `force`;
- helpers для целевого `w+`/`w-` результата без legacy field-path и без legacy actor-name.

`process-result` является только telemetry/debug-сообщением bridge. Каноническое
завершение процесса для Matrix — это Force `w+` или `w-`. Energy получает task,
claim-ит его через `z` и не исполняет action до `claim-accepted`.

Реальное исполнение DSL action и миграция legacy process protocol остаются
следующим этапом.
