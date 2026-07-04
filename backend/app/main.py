from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.agent.actions import detect_patterns
from app.db import SEED_DIR, init_db
from app.routes import cases, inbox, ops_board, voice


app = FastAPI(title="Concierge Court API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets/images", StaticFiles(directory=SEED_DIR / "images"), name="seed-images")


@app.on_event("startup")
def startup() -> None:
    conn = init_db()
    try:
        detect_patterns(conn)
    finally:
        conn.close()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(inbox.router)
app.include_router(cases.router)
app.include_router(ops_board.router)
app.include_router(voice.router)
