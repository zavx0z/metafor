# Graph, Monad и Force: текущий TODO

Этот файл содержит только невыполненную работу. Завершённые пункты и журналы
прошлых запусков удалены. Архитектурная основа находится в
[`graph-monad-force-plan.md`](graph-monad-force-plan.md).

## Правила исполнения

* Брать пункт с наивысшим приоритетом в состоянии `READY`, зависимости которого
  завершены.
* `WAITING` означает незавершённую зависимость.
* `GATE` означает необходимость отдельного решения владельца.
* Перед изменением пометить пункт `IN_PROGRESS` и указать текущую задачу.
* `DONE` в этом файле не хранится: после подтверждения результат переносится в
  документ-владелец и пункт удаляется.
* Проверка должна доказывать пользовательский или доменный результат, а не
  только успешную сборку.

## P0 — расхождения повторного аудита

### AUD-003 — Закрыть ошибки вычисляемых атрибутов шаблона

* Status: `READY`
* Dependencies: none
* Scope:
    * не заменять имена переменных внутри строковых литералов;
    * проверять каждый вычисленный Matter `src` по закону двух сегментов;
    * исключить исполнение недопустимого вычисленного адреса;
    * добавить прямые проверки parser -> Matter schema.

### AUD-004 — Сериализовать начальные чтения Boundary

* Status: `READY`
* Dependencies: none
* Scope:
    * `initialState`, `initialProjection`, `replay` и `graphSnapshot` читают один
      согласованный момент;
    * чтение не может смешать строки до и после materialize;
    * Bulk initial получает согласованный Store foundation;
    * добавить проверку чтения одновременно с записью.

### AUD-005 — Утвердить атомарную границу результата и Matter-топологии

* Status: `GATE`
* Dependencies: none
* Owner decision:
    * либо Field result и производная topology записываются одной SQLite
      transaction;
    * либо документ-владелец задаёт явное промежуточное состояние и
      обязательное восстановление.
* Acceptance:
    * ошибка topology projection не оставляет неописанный частичный мир;
    * комментарий, код и проверки описывают одну границу commit.

### AUD-006 — Привести документы, типы и TypeDoc к рабочему API

* Status: `READY`
* Dependencies: none
* Scope:
    * удалить старые `dark.history.read/clear` из публичной поверхности либо
      явно отделить их как нерабочий исторический слой;
    * создать полный документ-владелец Dark и включить его в карту документов;
    * добавить TypeDoc для Dark Force, Boundary и прямого Bulk Store;
    * устранить предупреждения TypeDoc Engine.

### AUD-007 — Закрыть доверительную границу Force

* Status: `GATE`
* Dependencies: none
* Owner decision: ранее отложено; не выполнять без нового разрешения.
* Scope перед сетевым использованием:
    * локальная или аутентифицированная граница `/force` и `/ws`;
    * полная проверка формы одной Particle до lifecycle;
    * server-side источник для WebSocket;
    * исключительность или явный закон нескольких соединений домена;
    * ограничение размера и давления отправки;
    * неверный внешний запрос не переводит Вселенную в `error`.

### AUD-008 — Утвердить версионные переходы схемы Boundary

* Status: `GATE`
* Dependencies: none
* Owner decision:
    * либо Boundary отказывается открывать неизвестную старую схему;
    * либо каждая поддерживаемая версия получает явный последовательный переход
      с доказанной резервной копией и проверкой результата.
* Acceptance:
    * версия хранится явно, а не угадывается только по составу колонок;
    * открытие базы не удаляет канонические данные без утверждённого пути;
    * ручной `bun run boundary:backup` остаётся обязательным перед изменением
      схемы или кода перехода;
    * проверены текущая, поддерживаемая старая и неизвестная версии.

### AUD-009 — Гарантировать закрытие Boundary

* Status: `READY`
* Dependencies: none
* Scope:
    * ошибка WAL checkpoint не пропускает `sql.close()`;
    * первая ошибка завершения остаётся наблюдаемой;
    * повторный `close()` безопасен;
    * добавить прямую проверку ошибки checkpoint и освобождения соединения.

### AUD-010 — Убрать двойное перемещение UI-поверхности

* Status: `READY`
* Dependencies: none
* Scope:
    * `moveRect` и `setRect` не вызываются вместе для одного перемещения;
    * исправить одинаковый путь в `pkg/ui/elements/runtime.ts` и
      `bulk/web/index.ts`;
    * проверить перемещение без изменения размера и запасной путь без
      `moveRect`.

### AUD-011 — Сделать инверсию Matrix4 устойчивой

* Status: `READY`
* Dependencies: none
* Scope:
    * определить допустимый порог почти нулевого определителя;
    * не выпускать бесконечные и нечисловые координаты;
    * проверить вырожденную и плохо обусловленную матрицы.

### AUD-012 — Добавить полное завершение Renderer

* Status: `READY`
* Dependencies: none
* Scope:
    * единый повторяемый `dispose()` освобождает принадлежащие Renderer ресурсы
      видеокарты и очищает кеши;
    * владельцы области просмотра вызывают его после освобождения собственной
      геометрии;
    * повторное создание области просмотра не удерживает ресурсы прежней.

### AUD-013 — Автоматически проверять каждое изменение

* Status: `WAITING`
* Dependencies: `AUD-006`
* Scope:
    * серверная проверка запускает `typecheck`, ожидаемые ошибки типов и тесты;
    * сборка TypeDoc Matrix и Engine обязательна и не скрывает предупреждения;
    * Markdown и пробелы в diff проверяются автоматически.

### AUD-014 — Утвердить закон публикации корневого пакета

* Status: `GATE`
* Dependencies: none
* Owner decision:
    * либо корневой пакет остаётся внутренним и получает `private: true`;
    * либо публикуется только явная сборка из `dist` без задач, проверок,
      отчётов и внутренних зависимостей рабочего пространства.
* Acceptance:
    * `npm pack --dry-run` содержит только утверждённую поверхность;
    * `exports`, типы и зависимости указывают на реально поставляемые файлы.

## P1 — read-only наблюдение и время

### MF-103 — Добавить read-only history и Mass observation

* Status: `WAITING`
* Dependencies: `AUD-006`
* Scope:
    * закрытые фильтры над полной принятой Dark Force Particle-history;
    * точная resolution и причинная граница;
    * отдельное чтение разрешённых Mass results;
    * отсутствие write, clear, commit и полного мира по умолчанию;
    * публичные типы, providers и проверки.

### MF-104 — Доказать первую read/observe сессию

* Status: `WAITING`
* Dependencies: `MF-103`
* Scope:
    * короткий bootstrap с rules, capabilities, revision и scoped snapshot;
    * следующий запрос получает только изменение с причинной границей;
    * ответ проверяется по первичным источникам;
    * скрытый контекст прошлой сессии не используется как истина.

### MF-109 — Добавить изолированную область исполнения поверх текущей паузы

* Status: `WAITING`
* Dependencies: `MF-103`
* Scope:
    * чтение неизменяемых причинных точек из утверждённой history;
    * создание изолированной ветви исполнения;
    * шаг вперёд и назад без изменения canonical мира;
    * отдельное подтверждение владельца для переноса результата в основной мир;
    * не выдавать уже существующие `dark.force.pause/step/stack/resume` за эту
      область исполнения.

### MF-110 — Добавить управление Pause/Stack через Interpreter

* Status: `WAITING`
* Dependencies: `MF-109`, `RPC-GATE`
* Scope:
    * создать, перечислить и отбросить ветвь исполнения;
    * шагнуть вперёд и назад;
    * отсутствие неявной записи коммита или отправки на сервер.

### RPC-GATE — Утвердить клиентский RPC-контракт

* Status: `GATE`
* Dependencies: none
* Owner decision:
    * создать `create-metafor/rules/rpc.md`;
    * определить discovery, scope, ошибки, версии и capability binding;
    * не дублировать transport law из `docs/FORCE.md`.

## P2 — structural update

### MF-200 — Утвердить structural operation contract

* Status: `WAITING`
* Dependencies: `MF-104`, `RPC-GATE`
* Scope: точные validate, plan, write, execute, round-trip и materialize phases.

### MF-201 — Реализовать быстрый валидатор предложения

* Status: `WAITING`
* Dependencies: `MF-200`
* Scope: revision, capability, graph scope, schema и запрещённые операции.

### MF-202 — Реализовать атомарную запись source

* Status: `WAITING`
* Dependencies: `MF-201`
* Scope: exact target, expected revision, temporary file, rename и проверка
  прочитанного результата.

### MF-203 — Утвердить operational journal

* Status: `GATE`
* Dependencies: `MF-200`
* Owner decision: формат, владелец хранения, срок удержания и связь с
  checkpoint/history.

### MF-204 — Материализовать через обычный путь MetaFor

* Status: `WAITING`
* Dependencies: `MF-202`, `MF-203`
* Scope: обычная нормализация, round-trip, materialization и фактическое
  наблюдение результата без горячей частичной перезагрузки доменов.

### MF-205 — Добавить повтор и согласование после частичной ошибки

* Status: `WAITING`
* Dependencies: `MF-204`
* Scope: различать failure phase, безопасно повторять и не выдавать source write
  за завершённую операцию.

### MF-206 — Доказать optional Field vertical slice

* Status: `WAITING`
* Dependencies: `MF-205`, `MF-103`
* Scope: предложение -> проверка -> source -> execution -> Boundary -> Bulk.

## P3 — Create MetaFor

### MF-300 — Выделить нематериализующий template boundary

* Status: `WAITING`
* Dependencies: `MF-200`

### MF-301 — Реализовать Create через общий structural path

* Status: `WAITING`
* Dependencies: `MF-300`, `MF-205`
* Scope: `template -> validate -> target patch -> validate -> materialize`.

### MF-302 — Доказать единый контракт Create и update

* Status: `WAITING`
* Dependencies: `MF-301`, `MF-206`
* Scope: одинаковые capability, journal, failure и owner-gated commit laws.

## P4 — отложенные расширения

### MF-400 — Dark Force v2 durability и replay

* Status: `GATE`

### MF-401 — Обобщить растворение структурного родителя

* Status: `GATE`
* Plan: [`generic-parent-dissolve.md`](generic-parent-dissolve.md)

### MF-402 — Полная модель управления версиями

* Status: `GATE`
* Scope: branches, merge, rollback, promotion и push.

### MF-403 — Общий причинный барьер

* Status: `GATE`

### MF-404 — Генератор и обновление Process

* Status: `WAITING`
* Dependencies: `MF-302`

### MF-405 — Возможности структурного агента в рабочей Вселенной

* Status: `GATE`

### MF-406 — Ограниченное самоизменение Лады

* Status: `GATE`
* Dependencies: `MF-405`

## Требования к доказательству

Для завершения пункта указывать:

* изменённый закон и его владельца;
* точные публичные типы;
* обычный пользовательский или доменный сценарий;
* выполненные команды проверки;
* фактический результат;
* известные ограничения;
* решение владельца, если пункт проходил через `GATE`.
