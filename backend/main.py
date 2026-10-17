"""SportLog 運動紀錄 API — FastAPI + SQLite."""
from __future__ import annotations

import json
import sqlite3
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB = "sportlog.db"

app = FastAPI(title="SportLog API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ACTIVITY_TYPES = {"run", "cycle", "walk"}


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            distance_m REAL NOT NULL,
            duration_s REAL NOT NULL,
            start_ts INTEGER NOT NULL,
            end_ts INTEGER NOT NULL,
            route TEXT,
            note TEXT
        )
        """
    )
    conn.commit()
    conn.close()


class ActivityIn(BaseModel):
    type: str
    distance_m: float
    duration_s: float
    start_ts: int
    end_ts: int
    route: Optional[List[List[float]]] = None
    note: Optional[str] = None


def row_to_activity(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "type": r["type"],
        "distance_m": r["distance_m"],
        "duration_s": r["duration_s"],
        "start_ts": r["start_ts"],
        "end_ts": r["end_ts"],
        "route": json.loads(r["route"]) if r["route"] else None,
        "note": r["note"],
    }


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/activities", status_code=201)
def create_activity(a: ActivityIn) -> dict:
    if a.type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=422, detail="type must be run/cycle/walk")
    if a.distance_m < 0 or a.duration_s < 0:
        raise HTTPException(status_code=422, detail="distance/duration must be >= 0")
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO activities (type, distance_m, duration_s, start_ts, end_ts, route, note) VALUES (?,?,?,?,?,?,?)",
        (
            a.type,
            a.distance_m,
            a.duration_s,
            a.start_ts,
            a.end_ts,
            json.dumps(a.route) if a.route else None,
            a.note,
        ),
    )
    conn.commit()
    aid = cur.lastrowid
    conn.close()
    return {"id": aid}


@app.get("/api/activities")
def list_activities() -> List[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM activities ORDER BY start_ts DESC").fetchall()
    conn.close()
    return [row_to_activity(r) for r in rows]


@app.get("/api/activities/{aid}")
def get_activity(aid: int) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT * FROM activities WHERE id=?", (aid,)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    return row_to_activity(r)


@app.delete("/api/activities/{aid}")
def delete_activity(aid: int) -> dict:
    conn = get_conn()
    cur = conn.execute("DELETE FROM activities WHERE id=?", (aid,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": aid}


@app.get("/api/stats")
def stats() -> dict:
    conn = get_conn()
    rows = conn.execute("SELECT type, COUNT(*) AS n, SUM(distance_m) AS d, SUM(duration_s) AS t FROM activities GROUP BY type").fetchall()
    conn.close()
    by_type = {
        r["type"]: {
            "count": r["n"],
            "distance_m": round(r["d"] or 0, 1),
            "duration_s": round(r["t"] or 0, 1),
        }
        for r in rows
    }
    total = {
        "count": sum(v["count"] for v in by_type.values()),
        "distance_m": round(sum(v["distance_m"] for v in by_type.values()), 1),
        "duration_s": round(sum(v["duration_s"] for v in by_type.values()), 1),
    }
    return {"total": total, "by_type": by_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
