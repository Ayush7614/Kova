---
title: Computed tables
author: Kova
---

# Computed tables

Derived numbers — totals, VAT, percentages — usually get computed in a spreadsheet and pasted in as dead values. Change an input and the deck rots.

Annotate a table with `!sheet` and Kova computes it. The source keeps formulas, never cached values.

---

## A bill of materials

```markdown
!let vat = 0.255

!sheet
| item   | qty | unit  | total                   |
|--------|----:|------:|------------------------:|
| motor  |   2 | 12.50 | =qty * unit             |
| ESC    |   2 |  8.00 | =qty * unit             |
| !Total |     |       | =sum(total) * (1 + vat) |
```

!let vat = 0.255

!sheet
| item   | qty | unit  | total                   |
|--------|----:|------:|------------------------:|
| motor  |   2 | 12.50 | =qty * unit             |
| ESC    |   2 |  8.00 | =qty * unit             |
| !Total |     |       | =sum(total) * (1 + vat) |

---

## What just happened

- `!let vat = 0.255` — a document constant. Declare it anywhere; every slide sees it.
- `!sheet` — sits directly above the table. A table without it is left alone, even if a cell starts with `=`.
- `=qty * unit` — a **row** formula. A bare column name means *this row's* value.
- `| !Total |` — a leading `!` makes a **footer row**. The `!` is stripped when rendered.
- `=sum(total)` — a **footer** formula. There a column name means the whole column, and footer rows are never counted in it.

Column names come from the header: lowercased, punctuation dropped, spaces to underscores. `Unit (€)` becomes `unit`.

---

## Chaining columns

```markdown
!sheet
| role   | days | rate | fee          |
|--------|-----:|-----:|-------------:|
| design |    4 |  620 | =days * rate |
| build  |   12 |  680 | =days * rate |
| !Total |      |      | =sum(fee)    |
```

!sheet
| role   | days | rate | fee          |
|--------|-----:|-----:|-------------:|
| design |    4 |  620 | =days * rate |
| build  |   12 |  680 | =days * rate |
| !Total |      |      | =sum(fee)    |

---

## When a formula is wrong

```markdown
!sheet
| item  | qty | unit  | total        |
|-------|----:|------:|-------------:|
| motor |   2 | 12.50 | =qty * unit  |
| ESC   |   2 |  8.00 | =qty * untis |
```

!sheet
| item  | qty | unit  | total        |
|-------|----:|------:|-------------:|
| motor |   2 | 12.50 | =qty * unit  |
| ESC   |   2 |  8.00 | =qty * untis |

---

## Errors stay put

The bad cell shows its error, the rest of the table computes, and the slide renders. Kova re-parses on every keystroke, so a half-typed formula must never blank a slide.

That error text is also what lands in a PPTX or PDF export. A broken deck should look broken, not quietly ship a wrong number.

---

## Degrades gracefully

Open this file in any Markdown viewer that has never heard of Kova and you still get a valid table — with `=qty * unit` in the derived cells instead of numbers, and a stray `!` in front of the footer labels.

Legible, honest, and diffable. That is the whole point.