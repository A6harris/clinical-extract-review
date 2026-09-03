// web/src/FieldTable.tsx
// Pure presentation. Receives fields, owns no state, fetches nothing.
import type { Field } from "./api";

const LOW_CONFIDENCE = 0.8;

export default function FieldTable({ fields }: { fields: Field[] }) {
  if (fields.length === 0) {
    return <p>No fields on this run.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Model Value</th>
          <th>Confidence</th>
          <th>Corrected Value</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const low = f.confidence !== null && f.confidence < LOW_CONFIDENCE;

          return (
            <tr key={f.id} className={low ? "low-confidence" : undefined}>
              <td>{f.field_name}</td>
              <td>{f.value ?? <em>not found</em>}</td>
              <td>
                {f.confidence === null ? "\u2014" : f.confidence.toFixed(2)}
                {low && " low"}
              </td>
              <td>{f.corrected_value ?? ""}</td>
            </tr>

          );
        })}
      </tbody>
    </table>
  );
}
