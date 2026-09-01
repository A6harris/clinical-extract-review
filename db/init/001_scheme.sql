create table documents ( 
    id UUID primary key default gen_random_uuid(),
    source_text text not null,
    created_at timestamptz not null default now()
);

create table extraction_runs (
    id UUID primary key default gen_random_uuid(),
    document_id UUID not null references documents(id) on delete cascade,
    prompt_version text not null,
    model text not null,
    status text not null default 'pending'
  check (status in ('pending','succeeded','failed')), 
    created_at timestamptz not null default now()
);

create table extracted_fields (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references extraction_runs(id) on delete cascade,
  field_name text not null,
  value      text,
  confidence numeric(4,3),
  unique (run_id, field_name)
);

create table field_corrections (
    id UUID primary key default gen_random_uuid(),
    extracted_field_id UUID not null references extracted_fields(id) on delete cascade,
    corrected_value text not null,
    created_at timestamptz not null default now()
);