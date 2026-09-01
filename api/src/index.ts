// api/src/index.ts
import express from "express";
import { z } from "zod";
import { pool, withTransaction } from "./db.js";
import { asyncRoute, errorHandler, HttpError, ExtractorError } from "./errors.js";


const app = express();
app.use(express.json({ limit: "1mb" }));

const IdParam = z.object({ id: z.string().uuid() });
const CreateDocument = z.object({
  source_text: z.string().min(1).max(100_000),
});

const CreateCorrection = z.object({
  corrected_value: z.string().min(1).max(10_000),
});


const ExtractorResponse = z.object({
  prompt_version: z.string(),
  model: z.string(),
  fields: z.array(
    z.object({
      field_name: z.string(),
      value: z.string().nullable(),
      confidence: z.number(),
    })
  ),
});

const extractorUrl = process.env.EXTRACTOR_URL;
if (!extractorUrl) throw new Error("EXTRACTOR_URL is not set");

async function callExtractor(text: string) {
  let res;
  try {
    res = await fetch(`${extractorUrl}/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new ExtractorError("extractor unreachable or timed out", { cause: err });
  }

  if (!res.ok) {
    throw new ExtractorError(`extractor returned ${res.status}`);
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw new ExtractorError("extractor returned non-JSON body", { cause: err });
  }

  const parsed = ExtractorResponse.safeParse(body);
  if (!parsed.success) {
    throw new ExtractorError("extractor returned unexpected shape", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

app.get("/health", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query("select count(*)::int as documents from documents");
  res.json({ ok: true, ...rows[0] });
}));

app.post("/documents", asyncRoute(async (req, res) => {
  const body = CreateDocument.parse(req.body);
  const { rows } = await pool.query(
    "insert into documents (source_text) values ($1) returning id, created_at",
    [body.source_text]
  );
  res.status(201).json(rows[0]);
}));

app.get("/documents/:id", asyncRoute(async (req, res) => {
  const { id } = IdParam.parse(req.params);

  const doc = await pool.query(
    "select id, source_text, created_at from documents where id = $1",
    [id]
  );
  if (doc.rowCount === 0) throw new HttpError(404, "document not found");

  const runs = await pool.query(
    `select id, prompt_version, model, status, created_at
     from extraction_runs where document_id = $1 order by created_at desc`,
    [id]
  );
  const runIds = runs.rows.map((r) => r.id);

  const fields = runIds.length
    ? await pool.query(
        `select f.id, f.run_id, f.field_name, f.value, f.confidence,
                c.corrected_value, c.created_at
         from extracted_fields f
         left join (
           select distinct on (extracted_field_id)
                  extracted_field_id, corrected_value, created_at
           from field_corrections
           order by extracted_field_id, created_at desc
         ) c on c.extracted_field_id = f.id
         where f.run_id = any($1::uuid[])`,
        [runIds]
      )
    : { rows: [] };

  res.json({
    ...doc.rows[0],
    runs: runs.rows.map((run) => ({
      ...run,
      fields: fields.rows
        .filter((f) => f.run_id === run.id)
        .map((f) => ({
          ...f,
          current_value: f.corrected_value ?? f.value,
          corrected: f.corrected_value !== null,
        })),
    })),
  });
}));
app.post("/documents/:id/extractions", asyncRoute(async (req, res) => {
  const { id } = IdParam.parse(req.params);

  const doc = await pool.query(
    "select source_text from documents where id = $1",
    [id]
  );
  if (doc.rowCount === 0) throw new HttpError(404, "document not found");

  await pool.query(
    `update extraction_runs
     set status = 'failed'
     where status = 'pending'
       and created_at < now() - interval '5 minutes'`
  );
  
  const run = await pool.query(
    `insert into extraction_runs (document_id, prompt_version, model, status)
     values ($1, 'unknown', 'unknown', 'pending')
     returning id`,
    [id]
  );
  const runId = run.rows[0].id;

  let result;
  try {
    result = await callExtractor(doc.rows[0].source_text);
  } catch (err) {
    if (err instanceof ExtractorError) {
      console.error("extraction failed", { runId, cause: err });
      await pool.query(
        "update extraction_runs set status = 'failed' where id = $1",
        [runId]
      );
      throw new HttpError(502, "extraction failed");
    }
    throw err;
  }

  await withTransaction(async (client) => {
    await client.query(
      `update extraction_runs
       set prompt_version = $2, model = $3, status = 'succeeded'
       where id = $1`,
      [runId, result.prompt_version, result.model]
    );
    for (const f of result.fields) {
      await client.query(
        `insert into extracted_fields (run_id, field_name, value, confidence)
         values ($1, $2, $3, $4)`,
        [runId, f.field_name, f.value, f.confidence]
      );
    }
  });

  res.status(201).json({ run_id: runId, status: "succeeded" });
}));
app.patch("/extracted-fields/:id", asyncRoute(async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const body = CreateCorrection.parse(req.body);

  const field = await pool.query(
    `select id, run_id, field_name, value, confidence
     from extracted_fields where id = $1`,
    [id]
  );
  if (field.rowCount === 0) throw new HttpError(404, "extracted field not found");

  const correction = await pool.query(
    `insert into field_corrections (extracted_field_id, corrected_value)
     values ($1, $2)
     returning corrected_value, created_at`,
    [id, body.corrected_value]
  );

  res.json({
    ...field.rows[0],
    corrected_value: correction.rows[0].corrected_value,
    created_at: correction.rows[0].created_at,
    current_value: correction.rows[0].corrected_value,
    corrected: true,
  });
}));

app.use(errorHandler);


app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`api listening on ${port}`));