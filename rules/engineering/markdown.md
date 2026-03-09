# Markdown Standards

This rule defines the Markdown style expected for project documentation and rules.

## Purpose

Markdown should be easy to read, easy to lint, and easy for agents to generate consistently.

## When to apply

Apply this rule when creating or editing `.md` files.

## Requirements

- Use one H1 heading per file.
- Keep heading levels sequential.
- Keep headings unique within the file.
- Always specify a language for fenced code blocks.
- Leave a blank line between adjacent blocks when readability requires it.
- Use tables only when they improve scanning and comparison.
- Keep lists compact.
- Prefer plain Markdown over inline HTML.
- Use code formatting for paths, identifiers, and commands.

For tables:

- keep columns semantically meaningful;
- avoid multi-line cell hacks;
- move complex explanations below the table when needed.

## Forbidden

Do not:

- use inline HTML for layout;
- create giant tables where a list is clearer;
- omit code fence languages;
- create deeply nested list structures without need;
- stuff unrelated detail into headings.

## Examples

Good code fence:

```typescript
export const answer = 42
```

Bad code fence:

```text
export const answer = 42
```

## Checklist

- [ ] One H1 heading
- [ ] Headings are sequential and unique
- [ ] Code fences have languages
- [ ] Tables are used only when helpful
- [ ] No inline HTML layout hacks
