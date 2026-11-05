-- 001_init: schema from docs/architecture/proposal.md (Week 6), section 2.
-- Deliberate differences from the proposal are listed in docs/decisions.md.

CREATE TABLE app_user (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE book (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES app_user(id),
  title              text NOT NULL CHECK (length(btrim(title)) > 0),
  source_lang        text NOT NULL DEFAULT 'ar' CHECK (source_lang = 'ar'),
  target_lang        text NOT NULL DEFAULT 'en' CHECK (target_lang = 'en'),
  source_file_key    text NOT NULL,
  source_file_type   text NOT NULL CHECK (source_file_type IN ('docx', 'pdf', 'txt')),
  page_count         integer CHECK (page_count > 0),
  pipeline_status    text NOT NULL DEFAULT 'uploaded'
                     CHECK (pipeline_status IN ('uploaded', 'translating', 'ready', 'failed')),
  translation_engine text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paragraph (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id            uuid NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  position           integer NOT NULL CHECK (position > 0),
  source_ar          text NOT NULL,
  machine_en         text,
  translation_status text NOT NULL DEFAULT 'pending'
                     CHECK (translation_status IN ('pending', 'translated', 'failed')),
  translation_error  text,
  accepted_edit_id   uuid, -- FK added below (circular reference); null in the MVP
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, position),
  -- a translated paragraph always has machine text
  CHECK (translation_status <> 'translated' OR machine_en IS NOT NULL)
);

CREATE TABLE book_assignment (
  book_id      uuid NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app_user(id),
  role         text NOT NULL CHECK (role IN ('reviewer')),
  completed_at timestamptz,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, user_id, role)
);
CREATE INDEX book_assignment_user_idx ON book_assignment (user_id);

CREATE TABLE paragraph_edit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paragraph_id uuid NOT NULL REFERENCES paragraph(id) ON DELETE CASCADE,
  reviewer_id  uuid NOT NULL REFERENCES app_user(id),
  text_en      text NOT NULL,
  is_done      boolean NOT NULL DEFAULT false,
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paragraph_id, reviewer_id)
);

ALTER TABLE paragraph
  ADD CONSTRAINT paragraph_accepted_edit_fk
  FOREIGN KEY (accepted_edit_id) REFERENCES paragraph_edit(id) ON DELETE SET NULL;
