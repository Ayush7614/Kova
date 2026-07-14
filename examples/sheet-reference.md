---
title: Sheet reference
author: Kova
---

# `!sheet` reference

Every directive, operator and function: the source, then what it renders. Doubles as a manual test — if a slide here looks wrong, something is broken.

---

## Directives

- `!sheet` — marks the table on the next line as computed. Takes `precision=N` (default 2).
- `!let name = expr` — a document-wide constant. A literal, or an expression over earlier constants — never over table data.
- `!` first in a row's first cell — makes it a footer row, where a column name means the whole column. A label that really starts with `!` escapes it as `\!`.

`!include`, `!fmt` and `!code` are reserved and currently error out, so decks written today will not collide with them later.

---

## Arithmetic

```markdown
!let base = 10

!sheet
| what   | result    |
|--------|----------:|
| add    | =base + 5 |
| divide | =base / 4 |
| negate | =-base    |
```

!let base = 10

!sheet
| what   | result    |
|--------|----------:|
| add    | =base + 5 |
| divide | =base / 4 |
| negate | =-base    |

---

## Precedence

```markdown
!sheet
| what        | result          |
|-------------|----------------:|
| power       | =2 ^ 3 ^ 2      |
| plus, times | =base + 2 * 3   |
| parentheses | =(base + 2) * 3 |
```

!sheet
| what        | result          |
|-------------|----------------:|
| power       | =2 ^ 3 ^ 2      |
| plus, times | =base + 2 * 3   |
| parentheses | =(base + 2) * 3 |

---

## Operator notes

`^` is right-associative, so `2 ^ 3 ^ 2` is 512, not 64.

`*` and `/` bind tighter than `+` and `-`, and parentheses override both.

The full set: `+ - * / % ^`, the comparisons, `and` / `or` / `not`, and the ternary `cond ? a : b`.

---

## Comparisons and logic

```markdown
!sheet precision=0
| what    | result                  |
|---------|------------------------:|
| ternary | =base > 5 ? 1 : 0       |
| if()    | =if(base == 10, 100, 0) |
```

!sheet precision=0
| what    | result                  |
|---------|------------------------:|
| ternary | =base > 5 ? 1 : 0       |
| if()    | =if(base == 10, 100, 0) |

---

## Scalar functions

```markdown
!sheet
| call   | result               |
|--------|---------------------:|
| round  | =round(3.14159, 2)   |
| abs    | =abs(-7.5)           |
| concat | =concat("a", "-", 1) |
```

!sheet
| call   | result               |
|--------|---------------------:|
| round  | =round(3.14159, 2)   |
| abs    | =abs(-7.5)           |
| concat | =concat("a", "-", 1) |

---

## Aggregate functions

```markdown
!sheet
| student | score       |
|---------|------------:|
| Ada     |          91 |
| Linus   |          64 |
| Grace   |          88 |
| !sum    | =sum(score) |
```

!sheet
| student | score       |
|---------|------------:|
| Ada     |          91 |
| Linus   |          64 |
| Grace   |          88 |
| !sum    | =sum(score) |

---

## About aggregates

`sum`, `avg`, `min`, `max`, `count` and `median`. Each takes one whole column, so they only work in a footer row.

A footer row is never part of a column — `sum(score)` cannot eat its own total. Empty cells are skipped. A non-empty cell that is not a number is an error, not a silent skip: a wrong total is worse than a visible failure.

---

## Precision

```markdown
!sheet precision=6
| item | unit | share     |
|------|-----:|----------:|
| a    |    3 | =unit / 7 |
```

!sheet precision=6
| item | unit | share     |
|------|-----:|----------:|
| a    |    3 | =unit / 7 |

Per table. Whole numbers render without a decimal point.

---

## Errors, part 1

```markdown
!sheet
| case             | result         |
|------------------|----------------|
| unknown column   | =nope * 2      |
| unknown function | =frobnicate(1) |
| divide by zero   | =1 / 0         |
```

!sheet
| case             | result         |
|------------------|----------------|
| unknown column   | =nope * 2      |
| unknown function | =frobnicate(1) |
| divide by zero   | =1 / 0         |

---

## Errors, part 2

```markdown
!sheet
| case          | value | result      |
|---------------|------:|-------------|
| wrong arity   |     1 | =round(1)   |
| syntax error  |     1 | =1 +        |
| aggregate     |     1 | =sum(value) |
```

!sheet
| case          | value | result      |
|---------------|------:|-------------|
| wrong arity   |     1 | =round(1)   |
| syntax error  |     1 | =1 +        |
| aggregate     |     1 | =sum(value) |

---

## About errors

Errors are per cell. A bad formula never takes the slide down with it, and the rest of the table still computes.

The last one above is the vector/scalar rule: an aggregate needs a whole column, and a data row only has scalars.

---

## Not a sheet

```markdown
| key       | literal value |
|-----------|---------------|
| formula?  | =qty * unit   |
| computed? | no            |
```

| key       | literal value |
|-----------|---------------|
| formula?  | =qty * unit   |
| computed? | no            |

No `!sheet` line, so the table is inert — Kova never touches it, even when a cell starts with `=`.

Inside a sheet, escape a cell that really starts with `=` as `\=`, and a row label that really starts with `!` as `\!` — otherwise the row is read as a footer.