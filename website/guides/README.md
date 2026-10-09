# Feature guides: public how-to pages on sportnnote.in

There is one Markdown file per guide in this folder (not this README). `scripts/build-website.mjs` turns each file into `https://sportnnote.in/guides/<slug>/`, and the index of all of them into `/guides/`.

## File format

The file name is the URL slug: lowercase-with-dashes.md, e.g. `scoring-lock.md` → `/guides/scoring-lock/`.

```markdown
---
title: Only one phone scores at a time
description: One or two sentences, max ~160 characters. Used for the search snippet, the card on /guides/ and social previews.
category: Live scoring
audience: Scorers
sports: all
order: 30
updated: 2026-10-09
---

Intro paragraph: the problem in the reader's words, and what this feature does about it (2–4 sentences).

## Before you start
- Who can do this (role) and what you need first.

## Step by step
1. Open the match → **Scoring** tab.
2. Tap **Take over**. …

> **Tip:** Short, useful advice.

## Common questions
### What happens if my phone dies?
Answer.
```

### Front-matter fields (all required)

| Field | Meaning |
|---|---|
| `title` | Task-shaped, plain words, ≤ 60 characters. |
| `description` | ≤ 160 characters. |
| `category` | Exactly one of: `Getting started`, `Live scoring`, `Cricket scoring`, `Tournaments`, `Teams & players`, `Following & alerts`, `Streaming & sharing`. |
| `audience` | Comma list from `Organisers`, `Scorers`, `Captains`, `Players`, `Parents & fans`. |
| `sports` | `all`, or a comma list of sport names (e.g. `cricket`). |
| `order` | Integer used for sorting within the category; lower comes first. |
| `updated` | `YYYY-MM-DD`. |

## Markdown the renderer supports

Use nothing else:

- `##` and `###` headings. The first `##` sections appear in the article's "On this page" list.
- Paragraphs.
- `-` bullets and `1.` numbered steps; **no nested lists** (an indented line joins the item above). A numbered list under a heading containing "step" (any case, even "Next steps") renders as big step cards.
- Front matter is single-line `key: value`; category and audience must match the lists above exactly or the build fails.
- Not supported: `#` headings, tables, italics, raw HTML.
- `**bold**` for exact button and tab names, as they appear in the app (e.g. **Take over**, **⚙ Manage**).
- `` `code` `` for things you type (e.g. a join code).
- `[text](url)`: links to other guides use `/guides/<slug>/`; links to the app use `https://app.sportnnote.in`.
- Callouts, each a single blockquote line starting with one of:
  - `> **Tip:**`
  - `> **Note:**`
  - `> **Important:**`
- `![alt text](/guides/img/<file>.png)` for screenshots. Optional, for later.

## Writing rules

- Write for a school PE teacher, a parent, or a college student scorer in India. Use plain English and short sentences, and say "you".
- Every step must match the shipped app exactly: button labels, tab names, where things are. Check `src/` and the spec in `docs/cricheroes-parity/specs/`, and PROGRESS.md for what was actually built (it records choices that differ from the spec). Don't invent features, and don't describe anything that isn't built.
- Explain the rule behind the feature where it helps. For example: a cricket correction never changes earlier balls; the "once only" Player of the Match change.
- No marketing fluff, no competitor names, no emojis in headings.
- Mention the platform where it differs. On iPhone, web alerts need the app added to the Home Screen first; the contacts picker is Android-only, etc.
- Length: 300–900 words.
