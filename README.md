# Clinical Extract Review

Paste a clinical discharge note, extract five structured fields with an LLM,
review them in a table, and correct any that are wrong. Corrections are stored
as new rows rather than overwriting the model's output, so every correction
produces a labeled (predicted, actual) pair.

Four moving parts: a React review screen, a Node/Express API, a Python
extraction service, and Postgres.

## Architecture

```
  Browser
  Vite dev server on :5173  (runs on the host, not in Docker)
      |
      |  POST  /documents
      |  POST  /documents/:id/extractions
      |  GET   /documents/:id
      |  PATCH /extracted-fields/:id
      v
  +------------------------------+
  |  api                         |   container, :3000
  |  Node + Express + TypeScript |
  +------------------------------+
      |                        |
      |  SQL (pg pool)         |  POST /extract
      v                        v
  +-----------------+   +------------------------------+
  |  db             |   |  extractor                   |   container, :8000
  |  Postgres 16    |   |  Python + FastAPI + Pydantic |
  |  volume: pgdata |   +------------------------------+
  +-----------------+                  |
                                       |  HTTPS
                                       v
                              Anthropic Messages API
                              (claude-haiku-4-5)
```

The three containers are wired by docker compose and reach each other by
service name over the compose network. The browser is outside that network and
talks only to the API, over the published port on localhost.

### Request path for one extraction

1. The browser POSTs the note text to `/documents`. The API inserts a row and
   returns an id.
2. The browser POSTs to `/documents/:id/extractions`. The API marks any stale
   `pending` runs as failed, inserts a new `pending` run, and commits it.
3. The API POSTs the note text to `http://extractor:8000/extract` with a 20
   second abort timeout.
4. The extractor calls the Anthropic API with a Pydantic output schema and
   returns five named fields with confidences.
5. The API validates that response with Zod, then in one transaction marks the
   run `succeeded` and inserts the five fields.
6. The browser GETs `/documents/:id` and renders the table.

Correcting a field is a `PATCH` that inserts into `field_corrections` and
triggers a refetch of step 6.

## Data model

- `documents` — the pasted source text.
- `extraction_runs` — one row per attempt, with `prompt_version`, `model`, and
  a `status` of `pending`, `succeeded`, or `failed`.
- `extracted_fields` — one row per field per run, with the model's value and
  confidence. Never updated after insert.
- `field_corrections` — append-only. One row per human correction, joined back
  with `DISTINCT ON` to find the latest.

## Running it

Requires Docker Desktop, Node 20.19+ on the host, and an Anthropic API key.

Create a `.env` in the repo root:

```
ANTHROPIC_API_KEY=sk-ant-...
EXTRACTOR_MODEL=claude-haiku-4-5
```

`EXTRACTOR_MODEL=stub` runs a regex extractor instead and needs no key.

Start the backend:

```
docker compose up -d
```

Start the frontend, in a second terminal:

```
cd web
npm install
npm run dev
```

Open http://localhost:5173.

## Decisions and tradeoffs

**Corrections are appended, never applied in place.** A reviewer fixing a field
is the only source of ground truth this system has, and the signal is the pair:
the model said `null`, the truth was `Type 2 diabetes mellitus`. Overwriting the
row keeps the truth and destroys the pair. A table of correct diagnoses measures
nothing; a table of (predicted, actual) is an eval set that grows every day the
product is used. The cost is that reading a field's current value is a
`DISTINCT ON` subquery rather than a column read, and that cost grows with
correction volume.

**Extraction is a separate service, not a function call.** It is Python because
that is where the model SDKs and the data tooling live, and it scales and fails
independently of the API. Collapsing it into Express would remove a network hop,
a container, and a whole class of failure. It would also mean a slow model call
occupies an API process, and that the extraction logic can no longer be
deployed, timed out, or replaced on its own. The cost of keeping it split is
real: two languages, two dependency sets, and a wire format that two schemas
have to agree on.

**The run row is written and committed before the model is called.** If the
extractor times out or the container dies mid-request, there is a `pending` row
in the database saying an attempt happened. Writing the row after a successful
response would be simpler and would leave a failure completely invisible. The
cost is that `pending` means two things you cannot tell apart from the row
alone, running now or abandoned, so a sweep marks rows older than five minutes
as failed. Time is the only signal that separates them; anything keyed on row
position races with a request that is still legitimately running.

**The API validates the extractor's response with Zod, even though both
services are mine.** Pydantic proves the extractor agrees with itself. Zod
proves the extractor still agrees with the API. Two schemas, two owners, one
wire. If someone renames `field_name` to `name` in `main.py` and redeploys only
the extractor, Pydantic accepts it and the API inserts `undefined`, hitting a
not-null violation in Postgres and sending you to debug the wrong container.
Zod does not prevent that failure. It moves it to the boundary where the cause
is obvious. The cost is a schema maintained in two languages.

**A client-side timeout is the only real protection at request time.**
`depends_on: condition: service_healthy` is a startup gate. It guarantees the
extractor was healthy when the API booted and says nothing about whether it is
healthy now. `fetch` has no default timeout, so without
`AbortSignal.timeout(20_000)` a hung extractor hangs the request forever and it
never becomes an error at all. Verified: stopping the extractor fails in 2.8
seconds at DNS resolution, pausing it fails at 20.45 seconds on the timeout.
The 20 seconds is a number chosen to sit well above a normal model call, not a
number the network provides.

## Frontend runs outside Docker

Vite runs on the host rather than in a fourth container. Windows filesystem
events do not cross a bind mount into a Linux container, so a containerized
watcher never sees an edit. The same problem already affects `tsx watch` and
`uvicorn --reload` in this project, which is why both services are restarted
rather than reloaded after a source change. In production there is no Vite dev
server at all: `vite build` emits static files served from the same origin as
the API, which is also why the CORS middleware exists only for development.




## Known limitations

These are known and deliberate, not undiscovered. Each one is a thing I would
fix before this ran for real.

**The API is not typechecked.** `tsconfig.json` sets `strict: true`, but `tsx`
transpiles without checking and there is no typecheck script, so that setting
does nothing today. `@types/node` is not even installed. The frontend does
typecheck, via `tsc -b` in its build. The fix is a `typecheck` script and a CI
step, not a code change.

**Corrections record no author.** `field_corrections` stores the new value and a
timestamp, and nothing about who made the change. There is no auth in this
project, which is a deliberate scope cut, but the consequence is specific: the
correction pairs are usable as evaluation data and not usable as an audit trail.
In a clinical setting that distinction matters.

**Field display order is duplicated.** `FIELD_NAMES` in `extractor/main.py` and
`FIELD_ORDER` in `api/src/index.ts` are the same list maintained in two places.
The API orders rows with `array_position`, which returns null for a name absent
from the list, and nulls sort last. So a newly added sixth field appears at the
bottom of the table with no error, and two new fields tie and come back in
arbitrary order. A `display_order` column would fix it at the cost of a
migration and a wider extractor contract.

**One error message is wrong.** If the API itself is unreachable, `fetch`
rejects and the screen says `Extraction failed: Failed to fetch`. Extraction did
not fail. Nothing was reached. The client's error copy assumes the only thing
that can break is downstream of a working API.

**The stale-run sweep is a full table scan.** Every extraction runs an `update`
over `extraction_runs` filtered on `status` and `created_at`, and there is no
index on that pair. Fine at hundreds of rows, wrong at millions. It also runs on
the write path rather than as a background job, which is the right call at this
volume and the wrong one at scale.

**Two log paths hide the field you actually need.** `console.error` in the API
defaults to two levels of object depth, and the wrapped extractor error nests
three deep, so the innermost `errno` and `code` print as `[cause]: [Error]`. In
the extractor, `except anthropic.APIError` logs `type(err).__name__` and
discards the message, which makes a 404 from the Messages API ambiguous: a
misspelled model id and a model the key is not entitled to look identical in the
logs.

**No graceful shutdown.** Nothing handles SIGTERM. Docker sends it on stop,
waits ten seconds, then sends SIGKILL, so a deploy drops in-flight requests. The
`pending` run rows those requests leave behind are exactly what the sweeper
exists for, but the request itself is simply lost.

**There is no way back to a previous document.** Every extraction creates a new
document, and the screen holds one document at a time in memory. Reload the page
and the previous one is unreachable from the UI, though it is still in the
database. A list view was cut for scope.

**Image builds are not reproducible.** `api/Dockerfile` uses `npm install`
rather than `npm ci`, so it can resolve different versions than the lockfile
pins. `extractor/requirements.txt` lists bare package names with no versions at
all, so a rebuild next month may not produce the extractor described here.

