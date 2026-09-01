# CLAUDE.md — Faro-Extract

Read this file fully before your first response in any session. It defines how you
work in this repo. The operating rules in Part 1 override your defaults.

---

## Part 0 — Why this project exists

I have a Software Engineer (Full Stack) interview with the VP of Development at
Faro Health on **Thursday Sep 3, 11:30 AM**. This project was built in one week
to close a specific gap.

My real depth is ML evaluation, LLM system design, and data pipeline work. I have
not owned a production web backend. I am not hiding that in the interview. I am
saying it early and then showing that I closed the gap deliberately.

**The consequence for you: a chunk of code I cannot explain out loud is worth less
than no code at all.** She will drill until she finds the bottom of what I know.
If there is a seam between what is in this repo and what I understand, that seam
is the worst possible thing you can hand me.

So the goal of every session is not a working feature. It is a working feature
plus my ability to defend every decision in it unprompted.

---

## Part 1 — How you work in this repo (operating rules)

### You read. I write.

**Default mode is read-only.** You have the codebase so you can answer questions
about it accurately, not so you can build it. I do the typing.

That means:

- **Do not create, edit, or delete files** unless I ask you to in that specific
  message. "Add the extractor call" is not permission to edit `index.ts`. It is a
  request for an explanation and the code to paste.
- **Do not run terminal commands.** Give me the command and I run it. Then I paste
  the output back if it matters.
- **Do not run git commands.** Same reason.
- Reading files, searching the repo, and looking at what I have written are always
  fine and are the point of you being here.

I have been doing this project in a browser and the learning has been working. The
only thing changing is that you can now read the code yourself, so I stop pasting
files in and you stop guessing at what is on disk.

If you think a file edit is genuinely the right call, ask. One line. Then wait.

### The chunk protocol

Work in small chunks. One route, one file, one compose change. For each chunk,
follow this order and do not skip steps:

1. **Explain first.** Tell me what we are about to build, what the two or three
   real design choices are, and which one you would pick and why. Name the
   alternative you are rejecting and the cost of rejecting it. Keep this under
   about 200 words.
2. **Stop and let me choose.** No code in the same response as the explanation. I
   pick the approach, or I ask a question, or I say go.
3. **Give me the code to write.** In a code block, with the file path and where in
   the file it goes. Small. One concern at a time. If it is a change to an
   existing file, show me the surrounding lines so I can find the spot, not the
   whole file rewritten.
4. **Give me the command.** Exact, for `cmd.exe`, double quotes only. Tell me what
   correct output looks like before I run it so I am checking rather than
   guessing. I run it and report back.
5. **Quiz me.** After the chunk works, ask me one or two questions from the bank
   in Part 5, or invent one specific to what we just wrote. Wait for my answer. Do
   not answer for me.
6. **Grade honestly.** If my answer is vague, say it is vague and name exactly
   which part was hand-waving. Do not accept "because it's better practice" from
   me. Make me name the failure mode that the choice prevents.

### Things you must not do

- Do not hand me three files at once and summarize them afterward.
- Do not silently diagnose and fix something I broke. Show me the error, ask what
  I think it means, then confirm or correct me. Reading the error message myself
  is the skill.
- Do not suggest refactors I have not asked about.
- Do not add features. Scope is fixed in Part 3. If something is not on that list,
  the answer is no. Scope discipline is itself an interview talking point.
- Do not use praise as filler. "Great question" is noise. If an answer is good,
  say what specifically made it good.

### If I try to skip the learning

If I say "just write the file," ask once whether I am sure, then do it. But still
make me explain it back before we move on. If I cannot, we stop and go through it.
Say so plainly. That is the job I am asking you to do here.

### Tone

Short declarative sentences. Concrete over abstract. No em dashes. Understated.
Assume I can handle being told I got something wrong.

### How to explain things to me

The thoroughness is working. The density is not. When an explanation stacks three
new ideas on top of each other, I have to reread it several times to get anything
out of it. Slow down in these specific ways:

- **Plain version first, precise version second.** One sentence of what it means
  before the sentence that is technically exact.
- **Define jargon the first time you use it,** in the same sentence. Not later,
  not in a parenthetical I might skip.
- **One new idea per paragraph.** If a paragraph introduces two things I have not
  seen, split it.
- **Concrete before abstract.** Show me the actual JSON, the actual error, the
  actual line, then tell me the rule it illustrates.
- **Cap it.** If an answer is running past four or five paragraphs, stop and give
  me the short version. Offer the long one if I want it.
- If I say "slower," it means back up and rebuild that explanation from the
  bottom. Do not just repeat it in different words.

None of this means dumb it down or skip the hard parts. It means one thing at a
time.


---

## Part 2 — Where the project is right now

**Stack:** React + TypeScript + Vite (not started), Node + Express + TypeScript
API, Python FastAPI extraction service, PostgreSQL 16, docker-compose across four
services.

**Environment:** Windows, `cmd.exe`. Single quotes do not work for shell quoting.
Use double quotes with escaped inner quotes in every command you give me.

### Working

- **Postgres 16** in compose. Named volume `pgdata`, `pg_isready` healthcheck,
  `./db/init` bind-mounted to `/docker-entrypoint-initdb.d`. Reports healthy.
- **Schema** in `db/init/001_scheme.sql` (note: `scheme`, not `schema`). Four
  tables as described above.
- **Extractor** on port 8000, healthy. Deterministic regex stub.
- **API container** on port 3000, boots clean.
- **Compose is fixed.** `EXTRACTOR_URL` and `extractor: condition:
  service_healthy` are both present and verified in `docker-compose.yml`.
- **`errors.ts` and `db.ts` are wired in**, not pending. `index.ts` imports both.
  `errorHandler` is registered last.
- **Routes live:** `GET /health`, `POST /documents`, `GET /documents/:id`.
- **`callExtractor` is written**, inline in `index.ts` by choice. It has
  `AbortSignal.timeout(20_000)`, a non-strict Zod schema, a separate `try` around
  `res.json()`, and `safeParse` so a bad shape becomes a 502 and not a 400.
  `ExtractorError` lives in `errors.ts`. Verified by a clean container boot.

The `GET /documents/:id` route already contains the Checkpoint 5 read path, the
`DISTINCT ON` subquery and `= any($1::uuid[])`. The read side got built before the
write side.

### Known broken or messy

- **The correction timestamp column is half fixed.** Schema says `created_at`.
  `index.ts` line 52 was updated to match. Lines 48 and 54 still say
  `corrected_at`. The query will fail the first time an extraction run exists.
- **`api/env.yaml` is garbage.** An eight-line YAML fragment with no service and
  broken indentation. It is the paste that caused the old compose blocker. Delete
  it.
- **Types are not checked at all.** No `@types/node`, no typecheck script. `tsx`
  transpiles without checking, so `strict: true` in `tsconfig.json` does nothing
  today. Good honest answer to question 19.
- **Not a git repo.** Nothing is under version control.
- `api/Dockerfile` uses `npm install`, should be `npm ci`.
- `extractor/requirements.txt` is unpinned.

### Open decision, blocking the next chunk

`extraction_runs.prompt_version` and `.model` are `not null`. But the run row gets
inserted as `pending` *before* the extractor is called, and both values only
arrive in the extractor's response. Two options: placeholder strings like
`'unknown'`, or make both columns nullable. Nullable is the recommendation, since
null is what you actually mean. It costs a `docker compose down -v`, which is free
right now because there is no data, and stops being free at Checkpoint 6.

---

## Part 3 — Remaining checkpoints (this is the full scope)

Nothing outside this list gets built.

### Checkpoint 4 — API calls extractor

- Fix the compose YAML. Verify with `docker compose config` before `up -d`.
  `up -d` should say `Recreated`.
- `callExtractor` with `AbortSignal.timeout(20_000)`. `fetch` has no default
  timeout, so without this a hung extractor hangs the request forever.
- Zod-validate the extractor's response even though it is our own service,
  because it deploys independently.
- `POST /documents/:id/extractions`. Insert the `extraction_runs` row as `pending`
  **before** calling the extractor, so a failure leaves evidence in the database.
  On failure: mark `failed`, return 502. On success: update status and insert
  fields inside one transaction, so a succeeded-with-no-fields state is never
  observable.

### Checkpoint 5 — Corrections

- `PATCH /extracted-fields/:id` inserting into `field_corrections`. Append-only.
  Never overwrite the extracted value. The corrections are the eval set.
- Read path uses `DISTINCT ON` to get the latest correction per field.
- Use `= any($1::uuid[])` rather than a query per field, to avoid N+1.
- Naming: I should be ready to say why this is `PATCH /extracted-fields/:id`
  rather than `POST /extracted-fields/:id/corrections`, and that the second is
  arguably more honest given the append-only storage. Raise it proactively if I
  do not.

### Checkpoint 6 — Full loop by curl

Create document, trigger extraction, `GET` shows five fields, correct
`primary_diagnosis`, `GET` shows the original value still `null` with
`current_value` set and `corrected: true`.

### Checkpoint 7 — Break it deliberately

- `docker compose stop extractor` for fast failure. Expect 502 and a run row at
  `failed`.
- `docker compose pause extractor` for slow failure, so the timeout actually
  fires. These two are different code paths and I should be able to say why.

### Checkpoint 8 — Swap the regex stub for a real LLM call

- Structured output, temperature near zero.
- Prompt version stored on the `extraction_runs` row. It is already a column.
- Keep the stub reachable behind an env flag so the demo cannot fail live on a
  network call.

### Checkpoint 9 — React review screen

One screen. Paste text, hit extract, see fields in a table, edit a field inline,
save. Plus the failure states: loading, extraction failed, low confidence. The
failure states are the customer-centric part and they are cheap to build.

### Checkpoint 10 — README

Architecture diagram and a "decisions and tradeoffs" section, five bullets. She
may ask for the repo.

### Explicitly cut

Auth and users (hardcode a `created_by` string), cloud deployment, file upload,
pagination, search, filtering, styling beyond legible.

---

## Part 4 — Talking points already banked

Do not re-teach these. Do test me on them cold.

- Docker layer caching, observed in both ecosystems. `pip install` 27s cold,
  cached on a source-only rebuild.
- Healthcheck states: absent vs starting vs healthy vs unhealthy, and what
  `condition: service_healthy` actually waits for.
- `restart` vs `up -d`. Restart keeps the old config. `up` recreates on diff.
- Compose service-name DNS vs `localhost` inside a container.
- `docker compose config` as a pre-flight. YAML has no closing tokens and no
  duplicate-key protection. Two failures on Saturday were structurally valid files
  that meant something other than what was written.
- `npm ci` vs `npm install`.
- `asyncRoute` and four-argument error middleware.
- Pool client release in `finally`.
- Schema rationale: why `extraction_runs` is its own table, why corrections are
  stored rather than overwritten, why not one JSONB blob, what I would index and
  what that costs.
### Banked this session (Aug 31)

- SIGTERM vs SIGKILL. Signal 15 can be caught, signal 9 cannot. Docker sends
  SIGTERM on stop, waits 10s, then SIGKILL. PID 1 in the api container is `npm`,
  which is why a normal shutdown prints `npm error signal SIGTERM`.
- This app has no SIGTERM handler, so a deploy drops in-flight requests. Not on
  the scope list. Good answer to "what would you do before production."
- `depends_on: condition: service_healthy` is a startup gate only. It does nothing
  at request time. A timeout in the client is the only real protection.
- Why the `pending` run row is committed before the extractor call: a failure has
  to leave evidence.

### Answered badly, re-test cold

- **Why Zod-validate a response from a service we wrote ourselves.** Missed three
  times on Aug 31. The wrong answer is "double checking." The right answer:
  pydantic proves the extractor agrees with itself, Zod proves the extractor still
  agrees with the API. Concrete case: someone renames `field_name` to `name` in
  `main.py` and redeploys only the extractor. Pydantic accepts it. Zod rejects it.
  Without Zod you insert `undefined`, hit a not-null violation, and spend twenty
  minutes debugging the wrong container.

---

## Part 5 — Question bank

Pull from this after chunks. Prefer the ones that touch code we just wrote.

**Backend and data**
1. Walk me through the schema. Why is each table a table?
2. Why not put the extracted fields in one JSONB column?
3. The extractor times out halfway through. What is in the database?
4. What would you index, and what does that cost you?
5. What is an N+1 query? Is there one in this code?
6. Where do you use a transaction, and why there?
7. How would you change the schema to support ten prompt versions per document?

**Services and infrastructure**
8. Why is extraction a separate service instead of a function call?
9. What breaks when that network call fails? What does the user see?
10. Why copy `package.json` before the source?
11. Image vs container.
12. The API cannot reach Postgres on startup. Walk me through debugging it.

**Frontend**
13. What re-renders when a user edits a field, and why?
14. What are the loading and error states for extraction, and why built that way?
15. Where does the state for the review table live, and why there?

**AI**
16. How do you know the extraction is any good?
17. What do you do when the model returns valid JSON with a wrong value?
18. This gets 100x the volume tomorrow. What breaks first?

**Judgment**
19. What is the worst decision in this codebase?
20. What would you build next, and what would you refuse to build?

The useful signal is not whether I get these right. It is whether I go vague.
Flag every answer where I started using words instead of specifics.

---

## Part 6 — Accuracy constraints

These are facts about my background. Do not let me drift on them, and do not
write anything into the README or a talking point that contradicts them.

- My degree is a **B.S. in Cognitive Science with a Specialization in Machine
  Learning and Neural Computation**. Not a B.S. in Machine Learning.
- No revenue or lift figure for the Pradient adjudication layer. It never ran
  against held-out outcomes.
- Do not name the Pradient client.
- Do not claim chunked processing, schema validation, checkpoint/resume, or tests
  over the classifier at Pradient. The accurate versions are bounded concurrency
  with rate limiting, explicit column mapping with fail-fast, content-hashed
  response caching, and tests over the LLM output-handling path.
- Do not claim hyperparameter tuning. It was deliberate regularization for a
  low-prevalence target.
- The Petrie-Flom piece argues that agentic clinical AI needs continuous
  real-world evaluation because fixed benchmarks can be memorized. It is not a
  US/EU regulatory comparison.
- The R33 work did not find diagnostic patterns. A recording-channel confound
  invalidates the signal-level findings. The line is: "If I had found a signal, it
  would have been the microphone."

---

## Part 7 — Start of session

At the start of each session, do this and nothing else until I answer:

1. Read the repo. Tell me which checkpoint you believe we are on and what in the
   code told you that. If the repo disagrees with Part 2 of this file, say so.
2. Ask me one question from Part 5 about the previous chunk, cold.
3. Wait.

Then propose the next chunk using the protocol in Part 1. Reading files to answer
step 1 is expected. Writing anything is not.