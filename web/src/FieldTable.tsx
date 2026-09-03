// web/src/FieldTable.tsx
import { useState } from "react";
import { correctField } from "./api";
import type { Field } from "./api";

const LOW_CONFIDENCE = 0.8;

// Ephemeral edit state, local to one row. Same shape of union as App:
// the draft only exists in states where a draft makes sense.
type RowState =
  | { status: "viewing" }
  | { status: "editing"; draft: string }
  | { status: "saving"; draft: string }
  | { status: "error"; draft: string; message: string };

function FieldRow({
  field,
  onSaved,
}: {
  field: Field;
  onSaved: () => Promise<void>;
}) {
  const [row, setRow] = useState<RowState>({ status: "viewing" });

  const low = field.confidence !== null && field.confidence < LOW_CONFIDENCE;

  async function save(draft: string) {
    setRow({ status: "saving", draft });
    try {
      // Pessimistic. The row does not show the new value until the
      // server has stored it and we have read it back.
      await correctField(field.id, draft);
      await onSaved();
      setRow({ status: "viewing" });
    } catch (err) {
      setRow({
        status: "error",
        draft,
        message: err instanceof Error ? err.message : "save failed",
      });
    }
  }

  return (
    <tr className={low ? "low-confidence" : undefined}>
      <td>{field.field_name}</td>
      <td>{field.value ?? <em>not found</em>}</td>
      <td>
        {field.confidence === null ? "\u2014" : field.confidence.toFixed(2)}
        {low && " low"}
      </td>
      <td>
        {row.status === "viewing" ? (
          <>
            {field.corrected_value ?? ""}{" "}
            <button
              onClick={() =>
                setRow({
                  status: "editing",
                  draft: field.corrected_value ?? field.value ?? "",
                })
              }
            >
              Edit
            </button>
          </>
        ) : (
          <>
            <input
              value={row.draft}
              disabled={row.status === "saving"}
              onChange={(e) =>
                setRow({ status: "editing", draft: e.target.value })
              }
            />{" "}
            <button
              onClick={() => save(row.draft)}
              disabled={row.status === "saving" || row.draft.trim() === ""}
            >
              {row.status === "saving" ? "Saving..." : "Save"}
            </button>{" "}
            <button
              onClick={() => setRow({ status: "viewing" })}
              disabled={row.status === "saving"}
            >
              Cancel
            </button>
            {row.status === "error" && (
              <span role="alert"> {row.message}</span>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export default function FieldTable({
  fields,
  onSaved,
}: {
  fields: Field[];
  onSaved: () => Promise<void>;
}) {
  if (fields.length === 0) {
    return <p>No fields on this run.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Model value</th>
          <th>Confidence</th>
          <th>Corrected value</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <FieldRow key={f.id} field={f} onSaved={onSaved} />
        ))}
      </tbody>
    </table>
  );
}
