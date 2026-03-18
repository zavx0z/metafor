---
name: gh-issue
description: Создание GitHub issues через gh CLI. Использовать для добавления задач в репозиторий и проект.
---

# GitHub Issue Creator Skill

Создание GitHub issues через GitHub CLI (`gh`).

## Описание

Этот skill создаёт issues в репозитории `zavx0z/metafor` и опционально добавляет их в GitHub Project.

## Использование

```bash
# Базовое использование
.qwen/skills/gh-issue/gh-issue.sh "Название задачи" "Описание задачи"

# С указанием проекта
.qwen/skills/gh-issue/gh-issue.sh "Название" "Описание" --project 2

# С указанием репозитория
.qwen/skills/gh-issue/gh-issue.sh "Название" "Описание" --repo zavx0z/other-repo
```

## Примеры

```bash
# Создать issue с заголовком
.qwen/skills/gh-issue/gh-issue.sh "Реализовать Wimp частицу"

# Создать issue с описанием
.qwen/skills/gh-issue/gh-issue.sh "Реализовать Wimp частицу" "Необходимо реализовать частицу Wimp для Dark domain"

# Создать и добавить в проект #2
.qwen/skills/gh-issue/gh-issue.sh "Реализовать Wimp" "Описание" --project 2
```

## Требования

- Установленный `gh` CLI
- Авторизация в GitHub (`gh auth login`)

## Проверка

```bash
gh --version
gh auth status
```
