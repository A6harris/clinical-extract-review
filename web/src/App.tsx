// web/src/App.tsx
import { useState } from "react";
import { createDocument, runExtraction, getDocument } from "./api";
import type { ClinicalDocument } from "./api";
import FieldTable from "./FieldTable";


// The data lives inside the status, not beside it. `doc` exists only on
// the "ready" branch, so nothing can read it in any other state.
type State =
  | { status: "idle" }
  | { status: "extracting" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: ClinicalDocument };

export default function App() {
  const [sourceText, setSourceText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleExtract() {
    setState({ status: "extracting" });

    try {
      // Three calls, in order. If the second fails the document still
      // exists on the server. We show that as a failure rather than
      // pretending nothing happened.
      const created = await createDocument(sourceText);
      await runExtraction(created.id);
      const doc = await getDocument(created.id);

      setState({ status: "ready", doc });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "something went wrong",
      });
    }
  }

  return (
    <main>
      <h1>Clinical Extract Review</h1>

      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Paste a discharge note"
        rows={8}
      />

      <p>
        <button
          onClick={handleExtract}
          disabled={state.status === "extracting" || sourceText.trim() === ""}
        >
          {state.status === "extracting" ? "Extracting..." : "Extract"}
        </button>
      </p>

      {state.status === "error" && (
        <p role="alert">Extraction failed: {state.message}</p>
      )}
      {state.status === "ready" && (
        <>
          <p>
            Run {state.doc.runs[0]?.status} using {state.doc.runs[0]?.model} (
            {state.doc.runs[0]?.prompt_version})
          </p>
          <FieldTable fields={state.doc.runs[0]?.fields ?? []} />
        </>
      )}

    
    </main>
  );
}
