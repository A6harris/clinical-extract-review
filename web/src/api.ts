// web/src/api.ts
// Every call the browser makes to the Express API. Nothing else fetches.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type Field = {
  id: string;
  run_id: string;
  field_name: string;
  value: string | null;
  confidence: number | null;
  corrected_value: string | null;
  created_at: string | null;
  current_value: string | null;
  corrected: boolean;
};

export type Run = {
  id: string;
  prompt_version: string;
  model: string;
  status: "pending" | "succeeded" | "failed";
  created_at: string;
  fields: Field[];
};

export type ClinicalDocument = {
  id: string;
  source_text: string;
  created_at: string;
  runs: Run[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only send content-type when there is a body. Sending it on a GET
  // would make the request non-simple and cost an extra preflight.
  const headers = init?.body
    ? { "content-type": "application/json" }
    : undefined;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    let message = `request failed with ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body. Keep the status-based message.
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export function createDocument(source_text: string) {
  return request<{ id: string; created_at: string }>("/documents", {
    method: "POST",
    body: JSON.stringify({ source_text }),
  });
}

export function runExtraction(documentId: string) {
  return request<{ run_id: string; status: string }>(
    `/documents/${documentId}/extractions`,
    { method: "POST" }
  );
}

export function getDocument(documentId: string) {
  return request<ClinicalDocument>(`/documents/${documentId}`);
}

export function correctField(fieldId: string, corrected_value: string) {
  return request<Field>(`/extracted-fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify({ corrected_value }),
  });
}
