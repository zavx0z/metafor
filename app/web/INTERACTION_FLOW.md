# App Web Interaction Flow

## Участники

- `app/web/server.ts` поднимает `dark`, `boundary` и `bulk` worker-ы на общем file-backed SQLite backend `app/web/tmp/metafor-app.sqlite`
- `dark` materialize-ит graph/meta/wimp structure в DB и шлёт protocol patches через единый channel
- `boundary` держит materialized runtime, пишет state/field changes обратно в DB и публикует `Photon`
- `bulk` слушает `Photon`, claim-ит process через `part: "+z"`, release/reject отдаёт через `part: "-z"`, исполняет action и возвращает W-result через `part: "w"`

## Materialize

1. Клиент открывает `/ws` и шлёт `{ type: "materialize", src }`
2. Server пересоздаёт runtime и очищает `metafor-app.sqlite`
3. `dark` materialize-ит meta graph в DB
4. `boundary` получает structural patches, проходит barrier rebuild и поднимает runtime поверх той же SQLite
5. UI получает snapshot и protocol stream уже из server-side runtime

## Value / State Flow

1. Клиент шлёт через `/ws` `{ type: "protocol", patches }`, где каждый patch содержит `part`
2. Server bridge публикует `{ patches }` в единый protocol channel
3. `boundary.setValues()` обновляет runtime field values, пишет их в SQLite и делает `weakRunStep()`
4. Если state сменился, `boundary` публикует `Photon`
5. Если state не сменился, но update затронул process-bound state, `boundary` всё равно retrigger-ит текущий state
6. Retrigger считается не только для прямой браны, но и для всех бран, которые делят тот же runtime field через `source` / entanglement
7. Для W result retrigger не делается только для той же браны, которая только что завершила свой process; соседние process-bound браны retrigger-ятся

## Bulk x Weak

1. `bulk` получает `Photon`
2. Отправляет coordination patch `part: "+z", op: "test", value: { coordination: "claim" }`
3. Исполняет action module из meta process
4. Возвращает:
   - `part: "w"` field patches, если process дал success patches
   - `part: "w"` result/error marker, если process вернул domain error
5. `boundary.applyWeakResultPacket()` применяет patches, снимает lock, пишет DB и, если нужно, двигает brane в следующий state

## Пример `git commit -m hi`

1. `zavx0z/git.command` получает `git commit -m hi`
2. Root process `определение операции` пишет `operation=history` и `args="-m hi"`
3. Shared `args` доезжает до `zavx0z/git-history-commit`
4. `boundary` retrigger-ит child state `парсинг опций`
5. Child process парсит `-m hi`, пишет `message="hi"` и переводит brane в `коммит с сообщением`
6. Commit action запускает реальный `git commit -m hi`
7. Если git возвращает stderr, это приходит как domain error в `error` field и brane переходит в `ошибка`

## Storage Notes

- SQLite работает в file-backed режиме с `WAL`
- После persist вызывается `flush()` / `wal_checkpoint`, чтобы следующий worker видел свежие данные
- Истина для state и field values теперь одна: file DB, а не отдельные in-memory копии по worker-ам
