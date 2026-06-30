# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает `Boundary`/SQLite и не держит Matrix store.

Текущий этап создаёт только серверный shell и bridge protocol:

- подключение к AppWeb bridge `/energy/ws`;
- получение `force` и будущих `process-task` сообщений;
- публикация `hello`, `claim`, `process-result` и `force`;
- helpers для целевого `w+`/`w-` результата без legacy field-path и без legacy actor-name.

Реальное исполнение DSL action и миграция legacy process protocol остаются
следующим этапом.
