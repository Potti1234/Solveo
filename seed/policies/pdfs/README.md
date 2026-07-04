# Policy PDF Drop Folder

This folder is reserved for fictional hotel policy PDFs used as document-grounded retrieval sources.

Place PDF files here manually when you are ready to expand the demo's document corpus. Do not commit real hotel documents, confidential operating procedures, or guest data.

PDF filenames may vary and do not need to match original document names. Use `documents_manifest.example.json` as a flexible metadata template for describing whichever files are added later.

Documents in this folder should contain internal hotel knowledge only, such as policies, standard operating procedures, playbooks, manuals, and historical resolution guidance. They should not contain AI prompts, agent instructions, hidden directives, tool-use instructions, or model behavior guidance.

The current app behavior does not depend on this folder. The backend retrieval system can later ingest these PDFs as evidence sources without changing the existing markdown policy setup in `seed/policies/`.
