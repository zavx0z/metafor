# Текущий milestone: рекурсивное top-down manifestation Atom

Этот файл задаёт текущую узкую проверку и не заменяет каноническую концепцию.

## Результат

Bulk получает полный текущий Boundary projection через Monad service-plane,
рождает постоянный Store и проявляет materialized Atom одним рекурсивным
top-down законом:

```text
Boundary Monad
→ полный Boundary projection
→ permanent Bulk Store
→ initial package
→ browser manifestation
→ ordinary realtime Particle
```

Каждый Atom повторяет один локальный закон построения, но не состав. Его реальные
Fields, состояния, топологии и child Atom определяются только materialized
entities и relations Boundary.

## Геометрический закон

- Внешний диаметр базового root Atom приблизительно равен `100 mm`.
- Локальные torus geometry и label metrics одинаковы на каждом уровне.
- Дочерний Atom получает детерминированные локальные position и uniform scale
  внутри фиксированного parent envelope.
- Один унаследованный transform охватывает тор, подпись, Fields, orbital
  manifestation, channels и всё дочернее поддерево.
- Подпись не имеет независимого depth-scale: её локальная типографика
  масштабируется общим transform Atom.
- Число и содержимое потомков не увеличивает внешний torus родителя. Плотный
  состав меняет только внутренний allocation и размеры содержимого.
- Иерархия строится по реальным `parentAtom`/`parentTopology`; отдельной
  декоративной scene hierarchy нет.

Точные коэффициенты sibling packing, распределение объёма между Fields и child
Atom и LOD глубоких уровней остаются параметрами визуального закона, а не
онтологией.

## Неподвижные границы

- Bulk по-прежнему загружает весь Boundary; Viewpoint-выборки нет.
- Физические носители Viewpoint не реализованы и не удалены из Concept.
- Boundary ничего не фильтрует.
- Monad RPC, ForceChannel и realtime Particle protocol не изменены.
- Handoff между initial package и WebSocket сохранён.
- Dark reconnect, WebRTC и отдельная декоративная иерархия не входят в milestone.

## Автоматическое доказательство

```bash
bun test bulk
bun test ./pkg/ui
bun run typecheck
bun run check
```

Тесты обязаны доказывать:

- фиксированный root diameter и одинаковую локальную Atom geometry на глубине;
- рекурсивное уменьшение manifested extent через inherited transform;
- containment поддерева и Fields внутри parent envelope;
- независимость parent torus от child и orbital content;
- детерминированный sibling packing без bottom-up `childWeight/contentWeight`;
- реальную Boundary parent/child topology без декоративных узлов;
- отсутствие пересоздания неизменившегося parent при child patch;
- эквивалентную геометрию initial projection и той же последовательности
  ordinary Particle.

## Живая приёмка

1. Проверить `doctor`: шесть сервисов healthy/ready, Bulk и Matrix initialized,
   Monad RPC ready.
2. Открыть точную вкладку `http://localhost:4004/` через `@meta/macos` REST API.
3. На непустом Boundary подтвердить содержательный cold-start до новой Particle.
4. Выполнить `run inflaton-add`: уникальный свежий Atom должен появиться в уже
   открытом canvas без reload.
5. Выполнить `run meta-read zavx0z/capsule --fixture capsule`: acceptance fixture
   читает корневой Atom по двухсегментному `src`, внутренние Meta-пакеты по
   трёхсегментным `src` и materialize реальное дерево
   `Capsule → Alpha/Beta → Leaf` с собственными Fields каждого Atom. Физически
   `alpha`, `beta` и runtime-дочерний `leaf` лежат соседями в корне fixture.
6. Подтвердить root manifestation, затем приблизить `Alpha` через Viewpoint:
   тот же локальный закон и общая подпись должны стать читаемыми только за счёт
   проекции камеры.
7. Повторно открыть Bulk без новой Particle и подтвердить тот же recursive tree
   в initial package.

Допустимый последующий визуальный долг: billboard родительского Field может
перекрывать часть кадра при глубоком Viewpoint focus. Это LOD/presentation-задача;
она не должна исправляться независимым масштабом подписи или изменением
Viewpoint/Particle contract.
