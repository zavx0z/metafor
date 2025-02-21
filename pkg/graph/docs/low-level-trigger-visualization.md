# Отображение триггеров на низком уровне

В `@quantum/graph` триггеры могут быть визуализированы на низком уровне, что позволяет пользователям видеть подробное
отображение всех элементов и их состояний, включая внутренние процессы и данные.

> 💡 Подробнее о концепции триггеров можно прочитать
> в [документации по триггерам](../../machine/docs/concepts/triggers.md)

## Структура визуализации

### Корневые настройки раскладки

```
root
└── layoutOptions
    ├── algorithm: layered
    ├── elk.direction: RIGHT
    ├── elk.layered.spacing.edgeEdgeBetweenLayers: 40
    ├── elk.layered.spacing.edgeNodeBetweenLayers: 15
    ├── elk.spacing.edgeEdge: 15
    ├── elk.spacing.edgeNode: 40
    └── hierarchyHandling: INCLUDE_CHILDREN
```

### Иерархическая структура состояний

```
atom: ${machine}
├── state: `${machine} ${state}`
│   │
│   ├── context: `${machine} ${state} context`
│   │   ├── parameter
│   │   │   └── socket `${machine} ${fromState} ${toState} ${parameter} context input`
│   │   │   └── socket `${machine} ${fromState} ${toState} ${parameter} trigger output`
│   │   ├── parameter
│   │   │   └── socket `${machine} ${fromState} ${toState} ${parameter} context input`
│   │   │   └── socket `${machine} ${fromState} ${toState} ${parameter} trigger output`
│   │   └── layoutOptions
│   │       └── portConstraints: FIXED_POS
│   │
│   ├── trigger: `${machine} ${state} ${parameter} trigger`
│   │   ├── ports
│   │   │   └── `${machine} ${state} ${parameter} input`
│   │   │   │    └── layoutOptions port.side: WEST
│   │   │   └── `${machine} ${state} ${parameter} output`
│   │   │        └── layoutOptions port.side: EAST
│   │   └── layoutOptions
│   │       ├── portConstraints: FIXED_SIDE
│   │       ├── portAlignment.east: JUSTIFIED
│   │       └── portAlignment.west: JUSTIFIED
│   │
│   └── trigger: `${machine} ${state} ${parameter} trigger`
│       ├── parameter
│       │   └── socket `${machine} ${fromState} ${toState} ${parameter} context input`
│       │   └── socket `${machine} ${fromState} ${toState} ${parameter} trigger output`
│       └── layoutOptions
│           ├── portConstraints: FIXED_SIDE
│           ├── portAlignment.east: JUSTIFIED
│           └── portAlignment.west: JUSTIFIED
│ 
├── state: `${machine} ${state}`
.   └── layoutOptions
.       └── portConstraints: FIXED_POS
```

### Поток данных

```
[Context Output Ports состояния A] -> [Trigger West Ports состояния B] -> 
[Trigger Processing] -> [Trigger East Ports] -> 
[Context Input Port (общий для нескольких триггеров)]
```

## Особенности реализации

Триггеры визуализируются как специальные узлы внутри состояния, которые:

- Принимают данные через west ports от выходных портов параметров контекста других состояний
- Обрабатывают условия
- Передают результаты через east ports в общий входной порт параметра контекста своего состояния

Несколько триггеров могут быть подключены к одному параметру контекста, что позволяет:

- Комбинировать различные условия для одного параметра
- Реализовывать сложную логику обработки через несколько триггеров
- Визуально отслеживать все источники изменения параметра

[nested](https://rtsys.informatik.uni-kiel.de/elklive/json.html?compressedContent=N4KABGBECWAmkC4oCcD2qAukA04oGMALaAG1mQFMA7RMAbTwlAhbDiUlQFcMAHHnIxYB3OBkJIALJNysIhCtADmhDEgCs62XJIBDAEYUSAZyQM5LYGAwUAHmqjc+A7GAXLVSAIxawo2OJSAAxgAL5CEAC62qyQegCeTgDyvBjQqFTGtMwWUFSosBQAMgZGxgB0vHr4FAC21FgcdAASAPoAwgCiAHIAKp0ASq4Aaq29SQAKrkkAqr0AygCSACKdkYK5ULyoyBjtGcYYyLrQVBhZHABiiwAancutSQOrAxu5kNu7AIIkylT1Z3KFF0h1okAAUjN5r1Ftd7m8LB8dhgSoYTJVqnUGmC6ItuktVusYixQsSIJ9zmYIpZqax2I4vAjcv5AmAABxkuTuFQODm0lgJZKpdKZJBWJG7crGOAUMGdL7QyBhTmsPRo0z0fmsKw2ewcVCM1wsiRgABMpvKQVc3M8YC8FpC4U2UX5pP5OU29M4pqZFmNSD5zrcih5AZVAt0iR4KTSBzFW2RUplcoVvSVbqDarKVKDTGsdgc3pwfjEJvNlutIdt9stYS1YEirvDHtyXtQAGZfXJ-ezw-Iq7y+2BBdHhXGwOKKUnCinFcr61mTDnczqC-rO0bS0hy1bgx4HDXHfXG5sM7kWxY25Iu6we4HnTbBwvI0LY6KJwnJdKZxx5XOz5si4auYK75nqjjXpuARlg6lb7t4Dp1kGJ65ABLAoRAaHatSbY8PwGCGtSPbSJyj4aFo1JAcuFiruBnB4Twhp7qGdq+MRR4WNE1JxC+o5vhcE78pA+SFKiZQYroNQAo0UAtB0PT9EMYCjOMUxgLMCwrGsN6fnsBxHCcZwCZA1x3A8TwvDpEoYD8fzSUCIIyRCUIwnCyxWRSYnolUklYmcOJ4gS2mclhYAUsB7r1m2XgALSEUGd5DmRvbPlGGAxiKGqTom36yr+qbpkOVGarmH66oWBrFj2O5wSxh5Ic6GFyKFTBRbA+qxT6Q6JfWyX3oBvHpWO77ZV+yb5f+RWlEuJWgeV+pdSW0HbrBzHVohTqNU2kVBtFMUbvWPVBn1U1pRl46jRg055VAf5pvOmbTRFpW0RVG5LayNVrQeG3HttmwXnIe2QYdW4pcdA5hqlr6ZfG1nXbO90tRG6rUc6r36pBH0wRW30IbWm2bE1rChU1aGAzA8AcCJsqcjxZ3DQJ4o015FQ+VJ2JNG0XR9IMIxjJM0xzEFRLUqFPHqrQIE0VA5VgjTxaQI+tA+K4kDGrQ5quIT6F0xQsBKBQAnS3I4pwGC+uG3FivGNwyA1MbssxRQjINmrGC6MghvnFLeQxcInYNg955QObHCWxQMWLZAttcPbRu+5AGDOz6buy573uO8J-uB5Ewcy5TFsG5H70x3bDuJ8nFC5+7GcUD7Zh+wHSp58jZtU1AEcxVjZdxxXjdJ8715p0ndcN-QTe5-npuhx3kBd+oNvlwnA8EUPLe1179dZ1Q-vD63nJcYiRCkOQ1BSztzqFxwRzKIbyBZEO1nG-WrWlRA19O8I8Xv+rpa0P1XMSsBwAKHLEEcQ1+LZF0gjDgAB1Tok1X4sAlmUC+79LCywLGCZO39FYayQO2VawD9wq1+hgo+uZkbYQwZ-QewgurII-gQ8Gv9lZQ1oRA86mRoHw1ymCBBiowEkmER-IC6CMEfiTtgm+-to4sKIbjEhPIyEEyYW7ZB1CaS0LDl-A6tCWGAKDMo1QoD1H0xhgcXhU5+HwMQWmUR09jHiLRi9LB9gcE53wf-QhxD2F2nIe-ShQYtFv1-ro+hIMDE+NYaVExMkjFXy4YzaxOVxpQEEQ49RoSUEuNmhg8UctZHCB7govxID8YcSCcInJgNNh0Krj-OJhjHHxLMZwwa3CmYwNsbdAqTiklPQkQU9xTlGneOgrQRRu42mVIaqVYJzpanmIiVXRh0TJkcLYRU2JQDklQLhjY9JkA7qFXMXkk2bjpEeNkRQeRMTplq38fVHWyEanCLqe8VZzt9G-xaeY-xiT6n7MyqksaP4+lII6ZLVxoFrljJ+RM8QUzymkLma8xq7zkGfMRN8igUS-kxKBe8QFrSQVWMOWkiFJz+k5LEUM2FQZCkyKdvipFhAUVKOeYEhZWK3n1lQSYYZ6NRk4OQHfCgD92W0GkFynZPg1H8ucZ0lJYpkHWX2JkAypxx4mVuPcVoQUdKxApLZJQ-wGgOVBBwSE0JYSLHhMI6yZqLWAmEEbJytrXIOvck6lmT0JIc38lzeSvMlIqUFupYWWlRZxM8gG9mfknK4nxDGyA9YtF-02WAAA7DmisAr-GaEtE2HFs8xUSofk0944VhUAxWXPNeeDWn-NoaS85KqDlSKOdSzJZzoVoMZSK+Fnjm1QDKXKtFATFXVM0R8htODYoMONXILNyKtlxPbR0hmXbLqwIyfYldJMyUMvye-ZlNzZZLvudmx5UBuUzt5XO7FC6b5Lt+c0olrSt2-3JTwyl4KbqQD7Y4ulUALnqLzCOt9Xi1YTpmQ+qpT7SrLJ0Y2pdBLP3ZuJYiH9cS-3dL4cckD2ST0wrPVcopV697St8ZOlR6L1GLNPPOtDi7nbVuMa27ZU6cOroI2Cq6vSaVQt-aey5cKqNJ1ii7WjYA72zOnUh3MzHUKsfCehlOR6UHcc3Tsvj4DO2goA0J45pyBnAvE5BqRUm153LkwpxD8yVN8pXK+6j1dtPMK-QC-TJ6d3Ge7VSoD5mwOCpfpImzLLpOIrgw81FDGlPOaVVQ9TcTVkycw0A3TQC8N7KMxSoLgHEb9rE+RiTTLRUwbZXF29CXTGMYoa5omT8IOUei7fJQ99jBMTXRyqQkh6MNdYo+3IqnDMBcK2Wj+FJNWHGODq4ypkDVGqdaa345r7LAmtVAL19rHXqvW3ZS17qdvOTtW5bTwkCjFATZiaSOJuYKT5spAWakNIiyu-G9Ugak0BVTYSdNISn4sLzQW4xRb1AlpY5fepESaBP1rUOmhGn5Y0ZbT5ttfmO2Tf-UV0zvbD0WfeG1yRF6nK7xKQ5+rMkXlMea+jdz2dm4Y+w9+7H27LF473cJvtxPESk5GdBye1Ohu055S559L0meU-WYStnvneP+a54RntQG+dhcF+eqrTcb3rvkzT1RymUvA5fWx6m-tONXxyxDjnYnceq+CwIonmurORfJ2jsdfXOUIflRLk3SyhzjdyQV7nh3kRze1UZMEy3zLPEGF95ELqtuOTBHty7a2k8bddVdU7nqXL7d9eq-1P3E0PZDTzRS-NVJC00oDzPuxWa-fL7JQKaahyZq1wDHXwlFbPN8N77wu4MWsGD957Nkggjg6vpD6HqFqRk20JQixfFAstkgLoEgSgdjQHELUMECRJX6yZPPEgABrcosBoCUHwG+MEAxFgAHFmhZNYMQSVnsiDxGaLoKgsBfhUBKAcB4jtBFAzCrAdDNCLBFDLADA9BvDIzzzFwRYhx0JdxBC9axzxxZyVQjwexbzjx0BfypwHzujlrhzFwxRBA9xYH9wTxFh4FjxZxNokHE7txFxWxBDRy0Erz0EGjWyMEEHME0ZBxtzkGdyUFBClw8E4GdQbzpxCGVwYYtwDJcShBAA)
