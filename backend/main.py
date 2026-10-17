"""SportLog 運動紀錄 API — FastAPI + SQLite（登入 / 照片 / 每月報表）"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

DB = "sportlog.db"
UPLOAD_DIR = "uploads"
TZ = timezone(timedelta(hours=8))  # 台灣時間

app = FastAPI(title="SportLog API", version="2.0.0")

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
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    conn = get_conn()
    conn.execute(
        """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_ts INTEGER NOT NULL)"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_ts INTEGER NOT NULL)"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            distance_m REAL NOT NULL,
            duration_s REAL NOT NULL,
            start_ts INTEGER NOT NULL,
            end_ts INTEGER NOT NULL,
            route TEXT,
            note TEXT)"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            created_ts INTEGER NOT NULL)"""
    )
    conn.commit()
    conn.close()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()


def now_ms() -> int:
    return int(datetime.now().timestamp() * 1000)


def auth_dep(authorization: Optional[str] = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登入")
    token = authorization[7:]
    conn = get_conn()
    r = conn.execute("SELECT user_id FROM sessions WHERE token=?", (token,)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=401, detail="登入已過期")
    return r["user_id"]


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


class AuthIn(BaseModel):
    username: str
    password: str


class ActivityIn(BaseModel):
    type: str
    distance_m: float
    duration_s: float
    start_ts: int
    end_ts: int
    route: Optional[List[List[float]]] = None
    note: Optional[str] = None


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ---------- 登入 ----------
@app.post("/api/auth/register", status_code=201)
def register(a: AuthIn) -> dict:
    u = a.username.strip()
    if len(u) < 2 or len(a.password) < 4:
        raise HTTPException(status_code=422, detail="帳號至少2字、密碼至少4字")
    salt = secrets.token_hex(16)
    h = hash_password(a.password, salt)
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, salt, created_ts) VALUES (?,?,?,?)",
            (u, h, salt, now_ms()),
        )
        conn.commit()
        uid = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="帳號已存在")
    finally:
        conn.close()
    token = secrets.token_hex(32)
    conn = get_conn()
    conn.execute("INSERT INTO sessions (token, user_id, created_ts) VALUES (?,?,?)", (token, uid, now_ms()))
    conn.commit()
    conn.close()
    return {"token": token, "username": u}


@app.post("/api/auth/login")
def login(a: AuthIn) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT * FROM users WHERE username=?", (a.username.strip(),)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    if hash_password(a.password, r["salt"]) != r["password_hash"]:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    token = secrets.token_hex(32)
    conn = get_conn()
    conn.execute("INSERT INTO sessions (token, user_id, created_ts) VALUES (?,?,?)", (token, r["id"], now_ms()))
    conn.commit()
    conn.close()
    return {"token": token, "username": r["username"]}


@app.get("/api/auth/me")
def me(user_id: int = Depends(auth_dep)) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    return {"user_id": user_id, "username": r["username"]}


# ---------- 運動紀錄 ----------
@app.post("/api/activities", status_code=201)
def create_activity(a: ActivityIn, user_id: int = Depends(auth_dep)) -> dict:
    if a.type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=422, detail="type must be run/cycle/walk")
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO activities (user_id, type, distance_m, duration_s, start_ts, end_ts, route, note) VALUES (?,?,?,?,?,?,?,?)",
        (user_id, a.type, a.distance_m, a.duration_s, a.start_ts, a.end_ts,
         json.dumps(a.route) if a.route else None, a.note),
    )
    conn.commit()
    aid = cur.lastrowid
    conn.close()
    return {"id": aid}


@app.get("/api/activities")
def list_activities(user_id: int = Depends(auth_dep)) -> List[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM activities WHERE user_id=? ORDER BY start_ts DESC", (user_id,)).fetchall()
    conn.close()
    return [row_to_activity(r) for r in rows]


@app.get("/api/activities/{aid}")
def get_activity(aid: int, user_id: int = Depends(auth_dep)) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT * FROM activities WHERE id=? AND user_id=?", (aid, user_id)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    return row_to_activity(r)


@app.delete("/api/activities/{aid}")
def delete_activity(aid: int, user_id: int = Depends(auth_dep)) -> dict:
    conn = get_conn()
    cur = conn.execute("DELETE FROM activities WHERE id=? AND user_id=?", (aid, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": aid}


# ---------- 照片 ----------
@app.post("/api/activities/{aid}/photos", status_code=201)
def upload_photo(aid: int, file: UploadFile = File(...), user_id: int = Depends(auth_dep)) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT id FROM activities WHERE id=? AND user_id=?", (aid, user_id)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        ext = ".jpg"
    fname = f"{aid}_{now_ms()}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        f.write(file.file.read())
    conn = get_conn()
    conn.execute("INSERT INTO photos (activity_id, filename, created_ts) VALUES (?,?,?)", (aid, fname, now_ms()))
    conn.commit()
    conn.close()
    return {"id": aid, "photo": f"/api/photos/{fname}"}


@app.get("/api/activities/{aid}/photos")
def list_photos(aid: int, user_id: int = Depends(auth_dep)) -> List[str]:
    conn = get_conn()
    r = conn.execute("SELECT id FROM activities WHERE id=? AND user_id=?", (aid, user_id)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    conn = get_conn()
    rows = conn.execute("SELECT filename FROM photos WHERE activity_id=? ORDER BY id", (aid,)).fetchall()
    conn.close()
    return [f"/api/photos/{x['filename']}" for x in rows]


@app.get("/api/photos/{fname}")
def get_photo(fname: str):
    path = os.path.join(UPLOAD_DIR, fname)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path)


# ---------- 統計 / 報表 ----------
@app.get("/api/stats")
def stats(user_id: int = Depends(auth_dep)) -> dict:
    conn = get_conn()
    rows = conn.execute(
        "SELECT type, COUNT(*) AS n, SUM(distance_m) AS d, SUM(duration_s) AS t FROM activities WHERE user_id=? GROUP BY type",
        (user_id,),
    ).fetchall()
    conn.close()
    by_type = {
        r["type"]: {"count": r["n"], "distance_m": round(r["d"] or 0, 1), "duration_s": round(r["t"] or 0, 1)}
        for r in rows
    }
    total = {
        "count": sum(v["count"] for v in by_type.values()),
        "distance_m": round(sum(v["distance_m"] for v in by_type.values()), 1),
        "duration_s": round(sum(v["duration_s"] for v in by_type.values()), 1),
    }
    return {"total": total, "by_type": by_type}


@app.get("/api/reports/monthly")
def monthly_report(user_id: int = Depends(auth_dep)) -> List[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM activities WHERE user_id=?", (user_id,)).fetchall()
    conn.close()
    months: dict = {}
    for r in rows:
        dt = datetime.fromtimestamp(r["start_ts"] / 1000, tz=TZ)
        key = f"{dt.year:04d}-{dt.month:02d}"
        m = months.setdefault(key, {"count": 0, "distance_m": 0.0, "duration_s": 0.0, "by_type": {}})
        m["count"] += 1
        m["distance_m"] += r["distance_m"]
        m["duration_s"] += r["duration_s"]
        t = m["by_type"].setdefault(r["type"], {"count": 0, "distance_m": 0.0, "duration_s": 0.0})
        t["count"] += 1
        t["distance_m"] += r["distance_m"]
        t["duration_s"] += r["duration_s"]
    result = []
    for k in sorted(months.keys(), reverse=True):
        m = months[k]
        result.append({
            "month": k,
            "count": m["count"],
            "distance_m": round(m["distance_m"], 1),
            "duration_s": round(m["duration_s"], 1),
            "by_type": {t: {kk: (round(vv, 1) if kk != "count" else vv) for kk, vv in v.items()} for t, v in m["by_type"].items()},
        })
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
