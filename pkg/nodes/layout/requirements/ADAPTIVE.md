# Adaptive side-selection

Этот документ владеет policy-законами `@nodes/layout/adaptive`. Placement,
routing, containment, hard validation и лексикографический objective остаются
общими и определены в [`COMMON.md`](COMMON.md); режимы итоговой геометрии
определены в [`RIGHT.md`](RIGHT.md) и [`DOWN.md`](DOWN.md).

## Вход и смысл

1. Presentation/measurement adapter передаёт каждому measured port capability
   `in | out | inout` и непустое множество допустимых сторон `WEST | EAST`.
2. Capability и visual side независимы. Edge source/target остаются устойчивыми
   topology roles: source требует `out | inout`, target — `in | inout`, но сами
   роли не выбирают сторону и не означают направление живого сообщения.
3. Одна допустимая сторона является fixed constraint и не входит в search
   dimension. Две стороны дают policy право выбрать одну из них.
4. Один exact port получает одну resolved side сразу для всех своих semantic
   edges. Policy не клонирует socket по числу связей и не создаёт обратный edge
   для движения сообщения в другую сторону.

## Ограниченный выбор

1. Dynamic ports канонизируются по semantic ID. Порядок nodes, ports, edges и
   порядок сторон во входных массивах не влияет на результат.
2. Policy не выполняет полный перебор `2^N`. Один вызов рассматривает не более
   `16` дедуплицированных assignments: устойчивые исходные варианты и
   одиночные изменения лучших уже проверенных кандидатов.
3. Каждый assignment передаётся тому же общему solver. Отдельные placement,
   router, validator или soft objective для adaptive запрещены.
4. Hard-invalid assignment отклоняется. Среди законных результатов выбирается
   лучший по общему routing-first objective, затем по стабильному side key.
5. Повторный вызов и перестановка входных коллекций дают тот же result,
   diagnostics и resolved side каждого port. Случайность, часы, предыдущая
   geometry и скорость машины не являются входом policy.

## Наблюдаемый результат

1. `layoutAdaptive` возвращает обычный `LayoutResult`; resolved side находится
   в geometry каждого port и не записывается обратно в semantic input.
2. `layoutAdaptiveWithDiagnostics` отдельно сообщает hard budget, теоретическое
   число assignments, фактически созданные, проверенные, законные и отклонённые
   candidates и выбранные стороны.
3. Если port не имеет допустимой стороны, capability противоречит topology role
   либо ни один bounded candidate не проходит общий solver, policy возвращает
   `AdaptiveLayoutError` с code `NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT` и
   machine-readable witness. Ошибка не заменяется fixed fallback.
4. `@nodes/layout/adaptive` является отдельным public entrypoint. Он не входит
   в fixed entrypoint, Worker transport, UI, WebGPU или product adapter.
