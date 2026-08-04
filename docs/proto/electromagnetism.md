# Electromagnetism

`electromagnetism.md` разворачивает силовое чтение `Electromagnetism`.
Общие различения силы, `Boson`, подтипа канала и `Impulse` заданы в [корневом Force](../FORCE.md).

## Сила и канал

`Electromagnetism` отвечает за наблюдаемое распространение и перенос `State`.
`Photon` является подтипом `Boson` и каналом `Electromagnetism`.
Он переносит не значение поля вообще, а состояние в его явной, сигнальной и распространяемой форме.

Именно поэтому `Photon` относится к межкомпонентной связи, доставке состояния и проявляемому сигналу.

## Чтение по доменам

### Dark

- declaration states, transitions и conditions как часть WIMP source;
- передача declaration через Inflaton;
- отсутствие runtime Photon emission или наблюдения.

### Boundary

- canonical state graph и current state imprint;
- испускание только адресованных state/structure consequences после commit;
- отсутствие runtime Photon routing или direct consumer reads.

### Matrix

- вычисление перехода State;
- `photon/replace` для State без Process;
- `photon/test` для State с Process;
- публикация Photon через единый Force transport.

### Energy

- приём только `photon/test` как сигнала process-bound state;
- отсутствие реакции на обычный `photon/replace`.

### Bulk

- приём отдельных наблюдаемых state/runtime particles;
- `photon/test` проявляет Process-bound State так же, как `photon/replace`
  проявляет State без Process; различие операций не скрывает новое состояние;
- хранение собственной state-проекции и parent-child индексов;
- проявление state без исполнения transition logic;
- визуальная связь активных частей системы.

## Силовые различия

- `Electromagnetism` не является общим каналом всех сил.
- `Photon` переносит `State`, но не подменяет изменение значений обычных `Field` через `Gluon`.
- `Photon` не является каналом изменения полей topology; это делает `Higgs boson`.
- `Photon` не подменяет переходную логику `Weak`.
- `Impulse` может сопровождать перенос состояния, но остаётся содержимым изменения, а не самим каналом.
