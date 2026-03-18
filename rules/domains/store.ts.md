## Назначение

Store — это канонический объект состояния домена.

Store нужен только для одного:
быть единственным source of truth своего уровня.

Store не является:

- фабрикой
- классом
- движком
- orchestrator-модулем
- местом для бизнес-логики
- местом для side effects

## Кто имеет право мутировать store

Оркестратор пакета `{package}.ts` любого доменного пакета `{package}`. При передаче в функцию оркестратора первым аргументом.

## Именование переменной

- стор называется по имени домена с постфиксом мутации `$` - `export const {domain}$ = {}`

## Именование типа

- тип store явно указывает домен и пакет - `{Domain}{Package}Store`.

## Методы API

Store может содержать методы для мутации и чтения собственного состояния.

Эти методы являются:

- инкапсулированными мутаторами (`setX`, `deleteX`)
- инкапсулированными читателями (`getX`)

Эти методы не являются:

- бизнес-логикой
- side effects (за исключением мутации собственного состояния)
- оркестрацией внешних модулей

### Не создавай псевдо-методы над коллекциями

Если поле store уже является `Map`, `Set` или другой стандартной коллекцией,
не создавай методы, которые просто переименовывают её встроенный API без добавления смысла.

То есть такие методы создавать не нужно:

- `getX(id)`, если внутри только `return this.x.get(id)`
- `deleteX(id)`, если внутри только `this.x.delete(id)`
- `addX(id)`, если внутри только `this.x.add(id)`
- `setX(id, value)`, если внутри только `this.x.set(id, value)` и больше ничего

В таком случае оркестратор должен работать с коллекцией напрямую:

```typescript
store$.particles.set(id, particle)
store$.parent.set(id, parentId)
store$.roots.add(id)
store$.meta.set(id, src)
```

Метод в store оправдан только если он добавляет доменную семантику или инвариант:

- делает `structuredClone`
- синхронно обновляет несколько структур store
- скрывает внутренний формат ключа
- задаёт осмысленную доменную операцию, а не alias стандартного `Map`/`Set`

### Плохо

```typescript
getParticle(id: string) {
  return this.particles.get(id)
}

deleteParticle(id: string) {
  this.particles.delete(id)
}

addRoot(id: string) {
  this.roots.add(id)
}
```

### Хорошо

```typescript
graph$.particles.set(id, particle)
graph$.parent.set(id, parentId)
graph$.roots.add(id)
```

### Пример

```typescript
export const store$: DomenStore = {
  meta: new Map(),

  setMeta(address: string, meta: MetaAST) {
    const next = structuredClone(meta)
    this.meta.set(address, next)
    return next
  },
}
```
