# Rule Design

This rule defines how to create new rule files.

## Purpose

A rule captures a stable decision that:

- is reused across tasks;
- reduces repeated mistakes;
- is not tied to a specific agent or local workflow.

A rule should describe a principle, its trigger, its required behavior, and its boundaries.

## When to apply

Apply this rule when creating a new file under `rules/`.

## Requirements

Create a new rule only if all are true:

- the topic is not already covered;
- the rule will be reused;
- the rule has one clear responsibility;
- the rule can be named precisely.

Each rule must be:

- **universal** where possible;
- **focused** on one responsibility;
- **actionable** and unambiguous;
- **compact**;
- **consistent** with neighboring rules.

A rule should answer:

- when to read it;
- what to do;
- what not to do;
- how to verify the result.

## Forbidden

Do not:

- create a new rule for a one-off case;
- mix unrelated topics in one file;
- encode shell commands, editor rituals, or local workflows as rules;
- duplicate content already covered elsewhere;
- tie a universal rule to a specific agent brand.

## Recommended structure

Use only the sections you need:

1. Purpose
2. When to apply
3. Requirements
4. Forbidden
5. Examples
6. Checklist
7. Links

## Examples

Good rule names:

- `markdown.md`
- `tsdoc.md`
- `packages.md`

Weak rule names:

- `misc.md`
- `stuff.md`
- `new-rule-v2.md`

## Checklist

- [ ] The rule has one responsibility
- [ ] It covers a reusable pattern
- [ ] It does not duplicate an existing rule
- [ ] It explains triggers, requirements, and boundaries
- [ ] It is as short as possible without losing clarity
