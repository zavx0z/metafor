# MF-428 — Артефакты

## `multi-profile-root-service-worker.png`

* Источник: точный WebGPU canvas Hamiltonian, полученный через CDP target
  отдельного Chrome-CDP в состоянии, когда одновременно работал обычный Chrome
  и Chrome-CDP с тем же `http://127.0.0.1:4400/`.
* Дата: 12 августа 2026 года.
* Версия проекта: `b0fee1ee00d2caed6f4eab1474d80e4069d6729b` плюс незакоммиченная,
  не относящаяся к этому наблюдению работа `NODES-008.5`.
* Ожидание: каждый наблюдённый Service Worker после `connect-window` находится
  внутри exact Chrome, которому принадлежат обслуживаемые им page realm.
* Фактическое наблюдение: отдельная карточка `Service Worker` находится на
  корневом уровне сцены вне контейнера `Chrome`; изображение не устанавливает
  внутреннюю причину потери parent identity.
* Чувствительные сведения: секретов нет; видны localhost, временные runtime
  identity и PID испытательного контура.
* Контрольная сумма SHA-256:
  `e571ea4a3a6d5fc98f4b170f088aa8f70fda7eb6dc92f321a91561f98a86f7c6`.

## `service-worker-card-before-mf-428-3-5.png`

* Источник: переданный владельцем crop живой ноды Service Worker в Hamiltonian;
  оригинальное имя `Снимок экрана 2026-08-12 в 17.39.57.png`.
* Дата: 12 августа 2026 года.
* Версия проекта: `a6c462a2ecf62b48aedfcae680c462f1a42eff03` плюс параллельные
  незакоммиченные изменения `NODES-008`, не относящиеся к карточке Worker.
* Ожидание владельца при передаче: compact logical Worker identity находится
  справа в шапке и не повторяется параметром; под шапкой нет описательного
  текста; видна отдельная SemVer исполняемого Worker code.
* Фактическое наблюдение: справа в шапке identifier отсутствует, строка
  `Identity` находится среди параметров, между шапкой и параметрами показано
  обрезанное описание, отдельной версии кода нет.
* Чувствительные сведения: секретов нет; видна сокращённая временная logical
  Worker identity.
* Размер: `1212 × 320`, `34669` байт.
* Контрольная сумма SHA-256:
  `344922b7a5264f40ba5cddab7472d786c39d77c13b2ab8a2cac6b6a2cc644970`.

## Исправленный live-сценарий MF-428.1

### Scope и точная адресация

Hamiltonian запущен из канонического checkout на версии
`b0fee1ee00d2caed6f4eab1474d80e4069d6729b` плюс изменения MF-428.1:

* URL: `http://127.0.0.1:4400/`;
* host version: `mf-428-ownership`;
* Chrome-CDP: `Chrome/151.0.7922.109`, process `17233`, user data dir
  `Google/Chrome-CDP`;
* normal browser-local scope: profile
  `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`, Service Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, targets
  `6BC8156021218A05194924549E76BA0D` и
  `89DF5E715892B097D32A57018E70D9B2`;
* incognito browser-local scope: profile
  `b1726b3a-2267-4e7a-b11f-f642b1030a8a`, Service Worker
  `5df2f151-55ff-4e73-9f84-3b4798deb7e6`, targets
  `31BCAB53DA714C4D50B48990D050564D` и
  `6DE7D62E5898AF673461A033D4815065`.

Все четыре exact targets вернули `document.readyState = complete`, один canvas,
одинаковые profile/Worker identity внутри каждой пары и разные identity между
парами. Reload targets `6BC8156021218A05194924549E76BA0D` и
`31BCAB53DA714C4D50B48990D050564D` прошёл с полной readiness без ожидания
`networkIdle`, которое неприменимо к постоянному control WebSocket. После
reload identity обеих пар сохранились. По `1200` мс CDP-console observation в
normal и incognito targets вернули `0` записей.

### `multi-profile-owned-workers-normal.png`

* Источник: `canvas.toDataURL("image/png")` через exact normal target
  `6BC8156021218A05194924549E76BA0D`.
* Ожидание и результат: в общей сцене две отдельные `Chrome` compound-ноды с
  разными правыми profile ID; в каждой находятся две страницы и её Service
  Worker; корневой Service Worker отсутствует. Личный canvas-transform этого
  target располагает те же поддеревья вертикально.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `13311991d4f8253841d6369d99b53f5196e504e59033b7e622d52b62c8f7a7b6`.

### `multi-profile-owned-workers-incognito.png`

* Источник: `canvas.toDataURL("image/png")` через exact incognito target
  `31BCAB53DA714C4D50B48990D050564D`.
* Ожидание и результат: обе Chrome-ноды видны рядом; справа в каждой показан
  свой сокращённый profile ID, полный ID находится в фактах, внутри каждой
  находятся две страницы и один exact Service Worker. Cross-profile ownership
  и корневого Service Worker нет.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `6229da4165dfabb649fad3e8dc0525f83291d83ea0c9aaa0952b3222adb7fa19`.

### Незасчитанная проверка

Попытка `ServiceWorker.stopAllWorkers` через `@meta/chrome` REST CDP-command
вернула `CDP -32000: ServiceWorker domain not enabled`: `enable` и `stop` попали
в разные краткоживущие CDP-сессии. Это не является evidence restart execution
и оставлено открытым в родительской MF-428.

## Исправленный live-сценарий MF-428.2

### Restart execution

Настоящий restart выполнен 12 августа 2026 года кнопкой `Stop` exact
регистрации на `chrome://serviceworker-internals/` в каждом browser-local scope:

* normal profile `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`: logical Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, execution
  `ed0e4a42-… → 40b71c0f-…`;
* incognito profile `b1726b3a-2267-4e7a-b11f-f642b1030a8a`: logical Worker
  `5df2f151-55ff-4e73-9f84-3b4798deb7e6`, execution
  `3a1ab9c8-… → 11e38947-…`.

Chrome автоматически поднял новое execution каждого зарегистрированного
Worker. Logical identity, registration и exact browser owner сохранились.

### `multi-profile-after-worker-restarts.png`

* Источник: exact normal Hamiltonian target после обоих restart, WebGPU canvas
  через `toDataURL("image/png")`.
* Ожидание и результат: две Chrome compound-ноды с разными profile ID; в каждой
  по две page realm и один logical Service Worker; root и дубликаты отсутствуют.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `3829a2886ffcb6c3207ef41dac2260e4029dd6dd5d102076061bf24f1484cc05`.

### Закрытие профиля и локализация

Первый live close подтвердил, что прежний host после уничтожения incognito
window удалял страницы, но оставлял browser root и Worker. После host-side
reachability fix retained snapshot стал чистым, однако видимая normal scene всё
ещё показывала пустой remote Chrome: page projection безусловно сохраняла
`browser-runtime` при snapshot replacement.

#### `stale-browser-root-after-host-close.png`

* Источник: exact normal target host version `mf-428-final`, CDP screenshot
  после события `browser-profile-unreachable` и чистого host snapshot.
* Наблюдение: Worker и страницы закрытого scope удалены, но сверху осталась
  пустая Chrome-нода. Это evidence второго, page-side projection defect, а не
  готового результата.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `1c7eb741cd27116de46ffdf703a1380df28d35f0cfe19f69bdb61a6b094f425c`.

### Финальная exact-target проверка закрытия

Hamiltonian host version `mf-428-projection-final` запущен из канонического
checkout поверх `c490c3d652390954e234cbf8aeda2c666b27cab2` и текущих изменений:

* normal profile `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`, Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, targets
  `6BC8156021218A05194924549E76BA0D` и
  `89DF5E715892B097D32A57018E70D9B2`;
* fresh incognito profile `90a10c48-7144-4372-a2dc-141da64fa765`, Worker
  `68c51f48-1f51-4c94-af0e-cf3590333b79`, targets
  `485F5C7E3635A724D29D9E0A81434CE0` и
  `73FAC4D99B7508297057100D084CE23B`.

Обе пары сошлись к двум окнам одного profile и одному Worker. После закрытия
exact incognito window `1285757389` host записал
`browser-profile-unreachable` для `browser:90a10c48-…`. Retained snapshot
revision `389` содержит только normal browser owner, один Worker, две page realm
и два Service Worker API transport; закрытый profile отсутствует целиком.
Normal target завершил обновление сцены с `hamiltonianLifecyclePending = 0` и
без causal gap; `1500` мс console observation вернула `0` записей.

#### `surviving-profile-after-close.png`

* Источник: `@meta/chrome` exact CDP screenshot target
  `89DF5E715892B097D32A57018E70D9B2` после завершённого layout.
* Ожидание и результат: ровно одна Chrome compound-нода `b04b5959-…`; внутри
  неё две page realm и один Service Worker. Пустого remote Chrome, root Worker,
  cross-profile нод и рёбер нет.
* Размер: `1470 × 2176` PNG.
* SHA-256:
  `6c69b65c384de4ebf163b4708a49fd74346a6ec810ffd0ac081c88f183c149fa`.

## Live-сценарий MF-428.3 — SemVer кода Service Worker

### Provenance и два изолированных профиля

Проверка выполнена 12 августа 2026 года из канонического checkout на baseline
`48ec7327e45cca2ddfde13c41f52c25ceb4863aa` плюс изменения MF-428.3. Отдельная
незакоммиченная работа `NODES-008` в проверку не входила. Hamiltonian полностью
перезапущен обычной командой `HAMILTONIAN_TOKEN=local-test
HAMILTONIAN_VERSION=mf-428-3-live bun run start` из `hamiltonian/`; listener
`127.0.0.1:4400` и оба Bun probe готовы.

Отдельный Chrome-CDP `Chrome/151.0.7922.109` одновременно держал normal и
incognito storage scope. Exact Hamiltonian targets:

* normal target `448CD67C94E66FD8B02019099F80F6E6`, profile
  `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`, logical Worker
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`;
* incognito target `4767D33E7CB4E9451D9690A6B650F186`, profile
  `9e2abb81-0978-46a7-9fd5-ce29ce223568`, logical Worker
  `093eeb45-7def-47dd-ac0c-fde43d5659e6`.

Authenticated host status одновременно показал обе разные logical identity и
для обеих `workerCodeVersion = 1.0.0`. Incognito WebGPU scene
материализовала две Chrome compound-ноды и по одному Worker внутри каждой;
обе карточки содержали `Версия кода 1.0.0`. Выбранный Worker дополнительно
показал то же значение в Inspector. Exact target завершил сцену без
`orchestration-failed`; после restart его состояние было `16 нод · 11 связей ·
живой режим`, а console observation за `1500` мс вернула `0` записей.

### Настоящий restart того же bundle

На `chrome://serviceworker-internals/` normal storage scope была нажата кнопка
`Stop` exact регистрации `http://127.0.0.1:4400/`, после чего normal target
перезагружен и поднял новое execution того же установленного bundle. Host
зафиксировал:

* logical Worker identity до и после:
  `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`;
* execution incarnation: `16ce6839-6e01-4113-a9f7-62caa585627d` →
  `2e1b06ee-3ae2-46ce-bc5c-71279a3c3cbb`;
* code version до и после: `1.0.0`;
* exact Chrome owner до и после:
  `browser:b04b5959-28a2-4ac0-ba5c-6bdba29e0091`.

После restart в retained scene остался один normal Worker без root или
дубликата. Переход на другую версию bundle (`2.0.0-rc.1+bundle.7`) отдельно
доказан host/projection regression: меняются incarnation и code version, а
logical identity и browser owner сохраняются. Server-owned установка этой
версии во все профили не утверждается и остаётся следующим срезом MF-428.4.

### `mf-428-3-two-profiles-code-version.png`

* Источник: exact CDP screenshot incognito target
  `4767D33E7CB4E9451D9690A6B650F186` до restart normal Worker.
* Ожидание и результат: две разные Chrome compound-ноды, по одному Service
  Worker в каждой; обе карточки и Inspector выбранного Worker показывают
  `Версия кода 1.0.0`. Расхождений с ожиданием нет.
* Размер: `3840 × 2176` PNG.
* SHA-256:
  `2b83f426949faef9f096a00d94061e4cc77477b28c6d7b332506c5f234073a80`.

### `mf-428-3-after-worker-restart.png`

* Источник: тот же exact target после restart normal Worker и завершённого
  topology update.
* Ожидание и результат: выбранная logical identity `45d8fde1-…` остаётся внутри
  прежнего Chrome owner, execution показывает новое `2e1b06ee-…`, а
  `Версия кода` остаётся `1.0.0`; root и дубликата Worker нет. Расхождений с
  ожиданием нет.
* Размер: `3840 × 2176` PNG.
* SHA-256:
  `ffcf66fde506727ea79a6e439647ce48dfafaa85380844091676ebbac89c146e`.

## Live-сценарий MF-428.5 — шапка Service Worker

### Provenance и точная граница доказательства

Проверка выполнена 12 августа 2026 года в каноническом checkout на baseline
`ffc70e291542838e55485c12e2b5ec91ae181c11` плюс изменения MF-428.5. После
точной проверки принадлежности Hamiltonian contour был полностью запущен из
`hamiltonian/` командой `HAMILTONIAN_TOKEN=local-test
HAMILTONIAN_VERSION=mf-428-5-live bun run start`; listener
`127.0.0.1:4400` принадлежал каноническому checkout. Во время финального
оформления evidence contour и Chrome processes не перезапускались и не
закрывались.

`@meta/chrome` health точно различил два уже открытых процесса:

* default Chrome process `56964` без remote debugging, profile
  `06cb9ee3-433d-4ca1-9c9f-56def51a0328`, logical Worker
  `14fdce37-ce46-44cb-8697-cbcee2c7f810`, execution
  `2b7ba09a-7a30-411c-8a09-4c4bad3bdc62`;
* отдельный Chrome-CDP process `60105` с user data dir
  `Google/Chrome-CDP`, profile `b04b5959-28a2-4ac0-ba5c-6bdba29e0091`,
  logical Worker `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, execution
  `2e1b06ee-3ae2-46ce-bc5c-71279a3c3cbb`.

Authenticated host lifecycle status одновременно показал обе profile/Worker
пары, для обеих `workerCodeVersion = 1.0.0` и точный Chrome owner. Exact CDP
target `448CD67C94E66FD8B02019099F80F6E6` имел profile
`b04b5959-28a2-4ac0-ba5c-6bdba29e0091`, Worker
`45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, готовую scene и
`hamiltonianLifecyclePending = 0`. Canvas получен через разрешённый
`@meta/chrome` CDP REST surface как `canvas.toDataURL("image/png")`.

При двух Chrome processes `@meta/chrome /windows` не смог выдать exact
tab-addressing default process, а `@meta/window` сообщил отсутствующее
Accessibility permission. По правилу сервиса был один раз вызван permission
surface, открывший System Settings; операция не повторялась. Поэтому отдельный
прямой screenshot default profile является tooling boundary: его exact scope
подтверждён host lifecycle evidence и общей агрегированной сценой. Incognito
для этой проверки не создавался и не закрывался; оба существующих процесса и
профиля были сохранены.

### `mf-428-5-service-worker-headers-cdp.png`

* Источник: exact CDP target `448CD67C94E66FD8B02019099F80F6E6`, WebGPU
  canvas через `toDataURL("image/png")`.
* Ожидание: в каждой из двух Service Worker cards слева находится `Service
  Worker`, справа — своя compact logical identity; строки `Identity` и
  description нет; `Версия кода 1.0.0` остаётся видимой, а card находится
  внутри exact Chrome owner.
* Фактический результат: card Worker `45d8fde1-…4cb4a1` находится внутри Chrome
  `b04b5959-…`, card Worker `14fdce37-…c7f810` — внутри Chrome
  `06cb9ee3-…`; обе совпадают с ожиданием без дублирования identity и с видимой
  SemVer.
* Ограничение: полный кадр также содержит независимый предсуществующий
  host-epoch/node-system declaration defect server RTCPeerConnection. Владелец
  вынес его в `HAMILTONIAN-001.1`; он не относится к MF-428.5 и этим снимком не
  утверждается общая корректность topology всего графа.
* Размер: `3840 × 2176`, `404714` байт.
* SHA-256:
  `91e661fe4316d6d042102234b3a79662687130ab87ed5caf3c8b71c7c476d38b`.
