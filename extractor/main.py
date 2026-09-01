# extractor/main.py
import os
import re
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

PROMPT_VERSION = "v1"
MODEL = os.getenv("EXTRACTOR_MODEL", "stub")

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


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "prompt_version": PROMPT_VERSION}


@app.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest) -> ExtractResponse:
    return ExtractResponse(
        prompt_version=PROMPT_VERSION,
        model=MODEL,
        fields=stub_extract(req.text),
    )