# extractor/main.py
import os
import re
from typing import List, Optional, Tuple

import anthropic
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI()

MODEL = os.getenv("EXTRACTOR_MODEL", "stub")
USE_STUB = MODEL == "stub"

STUB_PROMPT_VERSION = "v1"
LLM_PROMPT_VERSION = "llm-v1"
PROMPT_VERSION = STUB_PROMPT_VERSION if USE_STUB else LLM_PROMPT_VERSION

client = None if USE_STUB else anthropic.Anthropic()


FIELD_NAMES = [
    "patient_age",
    "primary_diagnosis",
    "admission_date",
    "discharge_date",
    "disposition",
]


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1)


class ExtractedField(BaseModel):
    field_name: str
    value: Optional[str] = None
    confidence: float


class ExtractResponse(BaseModel):
    prompt_version: str
    model: str
    fields: List[ExtractedField]


def stub_extract(text: str) -> List[ExtractedField]:
    dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
    age = re.search(r"(\d{1,3})\s*(?:year|yo|y/o)", text, re.I)
    found = {
        "patient_age": age.group(1) if age else None,
        "admission_date": dates[0] if len(dates) > 0 else None,
        "discharge_date": dates[1] if len(dates) > 1 else None,
    }

    return [
        ExtractedField(
            field_name=name,
            value=found.get(name),
            confidence=0.9 if found.get(name) else 0.2,
        )
        for name in FIELD_NAMES
    ]



class FieldGuess(BaseModel):
    value: Optional[str]
    confidence: float


class ExtractionResult(BaseModel):
    patient_age: FieldGuess
    primary_diagnosis: FieldGuess
    admission_date: FieldGuess
    discharge_date: FieldGuess
    disposition: FieldGuess


SYSTEM_PROMPT = (
    "You extract structured fields from a clinical discharge note.\n"
    "If the note does not state a field, set value to null and confidence to 0.\n"
    "Do not guess and do not infer. Dates must be YYYY-MM-DD.\n"
    "confidence is your probability from 0 to 1 that the value is exactly correct."
)


def llm_extract(text: str) -> Tuple[List[ExtractedField], str]:
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text}],
            output_format=ExtractionResult,
        )
    except anthropic.APIError as err:
        raise HTTPException(502, f"model call failed: {type(err).__name__}") from err

    result = response.parsed_output
    if result is None:
        raise HTTPException(
            502, f"model returned no parsed output (stop_reason={response.stop_reason})"
        )

    fields = [
        ExtractedField(
            field_name=name,
            value=getattr(result, name).value,
            confidence=getattr(result, name).confidence,
        )
        for name in FIELD_NAMES
    ]
    return fields, response.model



@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "prompt_version": PROMPT_VERSION}


@app.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest) -> ExtractResponse:
    if USE_STUB:
        return ExtractResponse(
            prompt_version=STUB_PROMPT_VERSION,
            model=MODEL,
            fields=stub_extract(req.text),
        )

    fields, served_model = llm_extract(req.text)
    return ExtractResponse(
        prompt_version=LLM_PROMPT_VERSION,
        model=served_model,
        fields=fields,
    )
