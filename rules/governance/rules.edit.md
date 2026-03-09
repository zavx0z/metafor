# Rule Updates

This rule defines when and how to update existing rule files.

## Purpose

Update rules only when the problem is systemic, not when the issue is merely local or accidental.

## When to apply

Apply this rule when:

- a user-visible mistake suggests a rule defect;
- a rule is ambiguous;
- two rules conflict;
- a stable practice has changed;
- a recurring anti-pattern has appeared.

## Requirements

Before updating a rule, check:

1. Was the rule applied in the correct context?
2. Does the rule clearly imply the needed action?
3. Does it have enough boundaries and prohibitions?
4. Does it overlap or conflict with another rule?
5. Is the problem systemic rather than one-off?

Update order:

1. Fix the user task first.
2. Identify the systemic cause.
3. Propose the rule change briefly.
4. Show the exact new fragment if needed.
5. Update the rule so it becomes shorter, sharper, and less ambiguous.
6. Remove duplication created over time.

## Forbidden

Do not:

- patch a rule with extra text without addressing the cause;
- add narrow exceptions instead of strengthening the principle;
- silently rewrite rules after a user-visible failure;
- keep old and new norms side by side;
- expand a rule beyond its responsibility.

## Proposal format

```md
I propose updating `rules/<path>/<file>.md`:

- <change 1>
- <change 2>
```

## Checklist

- [ ] The user task was fixed first
- [ ] The cause is systemic
- [ ] The new wording is clearer or shorter
- [ ] Duplication was removed
- [ ] The rule still has one responsibility
