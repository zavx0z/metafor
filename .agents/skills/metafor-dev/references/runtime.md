# Runtime contour

Читайте этот файл только при запуске или диагностике development-контура.

## Force health

`GET /health` Force возвращает состояние `ForceLifecycle`:

```json
{
  "ok": true,
  "domain": "force",
  "state": "running",
  "requiredDomains": ["dark", "boundary", "matrix", "energy", "bulk"],
  "connectedDomains": ["dark", "boundary", "matrix", "energy", "bulk"],
  "error": null
}
```

Identity физического доменного канала передаётся в HTTP Upgrade. После открытия
WebSocket transport несёт только Particle без register/readiness frames и не
испускает bootstrap Particle от самого факта подключения.

Service-plane Монад открывает локальный канал через `POST /monad/channels`.
Identity, method capabilities и callback объявляются только при создании.
Полученный токен используется в Bearer header для `POST /monad/rpc` и
`DELETE /monad/channel`; identity не повторяется в URL или RPC payload.
Отдельной provider registration нет: один постоянный канал одновременно несёт
исходящие call и входящие routed call/response. Эти routes доступны, пока Force
ещё `starting`, и не зависят от общего Particle relay gate. Текущий физический
adapter — REST; те же `MonadChannel`, `MonadRpcPeer` и `MonadRouter` допускают
последующий WebRTC DataChannel.

## Карта сервисов

| Домен    | Порт | Health        |
| -------- | ---- | ------------- |
| Force    | 4000 | `GET /health` |
| Boundary | 4001 | `GET /health` |
| Dark     | 4002 | `GET /health` |
| Matrix   | 4003 | `GET /health` |
| Bulk     | 4004 | `GET /health` |
| Energy   | 4005 | `GET /health` |

Штатный полный запуск: `bun run dev:world`. Skill запускает его с
`METAFOR_WEAK_BACKEND=gpu` и компактными impulse-логами, если переменные не
переопределены явно.

## Правила владения

- `owner: interpreter` — процессы зарегистрированы Interpreter для текущего
  repository root. Это предпочтительный контур разработки с breakpoint и
  отдельным выводом доменов; использовать его без смены владельца.
- `owner: metafor-dev` — process group запущена MetaFor Dev. Только её разрешено
  останавливать через `run world stop`.
- `owner: external` — отвечающие порты не принадлежат одному подтверждённому
  владельцу. Такой контур автоматически не останавливается.
- `owner: none` — нет ни отвечающих сервисов, ни зарегистрированных процессов
  Interpreter. Только в этом состоянии разрешён `run world start`.
- Смешанный контур, где Interpreter объясняет не все отвечающие домены,
  безопасно классифицируется как `external`.
- Нельзя закрывать Interpreter-процессы только для того, чтобы заменить
  `owner: interpreter` на `owner: metafor-dev`.

## Состояние

- Boundary по умолчанию использует `.metafor/dev.sqlite`.
- `run meta-read <src>` отправляет входной `inflaton/test` через Force и запускает
  чтение `cluster/<src>/meta.ts` в Dark. Корневой Atom имеет `src`
  `<owner>/<repository>`, внутренний —
  `<owner>/<repository>/<meta-package>`. Сам `test` остаётся входной операцией и
  не испускается Dark как завершающий маркер.
- У Dark нет настраиваемого meta root: физический resolver всегда один —
  `<repository>/cluster`. Каждый `inflaton/test` выполняет свежее чтение модуля,
  а не возвращает прежний ESM-cache.
- `run meta-remove <owner>/<repository>` отправляет через тот же agent ingress
  обычный `inflaton/remove path=wimp`. Dark сохраняет протокол и provenance;
  Boundary удаляет корневой WIMP вместе с внутренними WIMP этого репозитория,
  не затрагивая другие репозитории.
- `run dark-history read` открывает отдельный MonadChannel инструмента и читает
  сохранённые patches через `dark.history.read`. Ответ группируется по `ts`:
  одинаковый `ts` является одним параллельным time step, дополнительного
  sequence нет.
- `run dark-history clear --confirm` вызывает `dark.history.clear` и очищает
  только журнал Dark. Это не reset canonical Boundary или локальных Stores
  других доменов.
- `run world reset --confirm` является полным dev-reset: только после остановки
  принадлежащего MetaFor Dev контура удаляются `.metafor/dev.sqlite`, его
  `-wal`/`-shm` и `.metafor/dark-history.jsonl`, затем мир запускается заново.
  Live-RPC очистки Boundary запрещён, потому что оставил бы Matrix/Energy со
  старыми Stores. Каталог evidence и физический `cluster/` не удаляются.
- Пустой Bulk после успешного запуска является допустимым исходным состоянием.
- Boundary health должен показывать `rpc: "ready"` после открытия MonadChannel.
- Energy health должен показывать `initialized: true` и `rpc: "ready"`: это
  доказывает, что initial Boundary projection локально гидратирован до открытия
  Energy ForceChannel.
- Matrix health должен показывать `initialized: true` и `rpc: "ready"`;
  основной backend — GPU.
- `fields=${...}` direct scalar binding хранится Boundary как один shared Value
  и `atom_field_source`. При cold start Matrix восстанавливает shared layout из
  `valueId`; равные payload без общей identity не entangle.
- In-place replacement `fieldsBinding` materialized Matter edge перестраивает
  Boundary source/value relation; Atom Graviton заставляет Matrix заново
  подготовить packed shared layout и CPU/GPU Weak до следующего такта.
- Structured logs являются диагностикой транспорта, но не источником
  визуальной или онтологической истины.

## Диагностика

1. Запустить `metafor-dev.mjs doctor`.
2. При `partial` проверить listeners `4000–4005` и команды процессов.
3. Если контур принадлежит skill, получить ограниченный хвост через
   `metafor-dev.mjs run world logs 80`.
4. Не перезапускать здоровые сервисы для получения более подробных логов.
5. После исправления повторить health, затем браузерную приёмку.
