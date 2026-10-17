"""Strava OAuth and idempotent GPX uploads. Credentials never leave the server."""
from contextlib import contextmanager
import hashlib
import json
import math
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from xml.etree.ElementTree import Element, SubElement, tostring

import httpx
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException
from fastapi.responses import RedirectResponse

API = "https://www.strava.com/api/v3"
FRONTEND = "https://sportlog-frontend.onrender.com/"
CALLBACK = "https://sportlog-backend.onrender.com/api/strava/callback"


def cipher():
    return Fernet(os.environ["STRAVA_TOKEN_KEY"].encode())


def configured():
    try:
        cipher()
        return bool(os.getenv("STRAVA_CLIENT_ID") and os.getenv("STRAVA_CLIENT_SECRET"))
    except (KeyError, ValueError):
        return False


def remote(method, url, **kwargs):
    try:
        response = httpx.request(method, url, timeout=25, **kwargs)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        message = {401: "Strava 授權失效，請重新連接", 403: "Strava 權限不足，請重新連接", 429: "Strava 流量限制，請稍後重試"}.get(e.response.status_code, "Strava 暫時無法處理，請稍後重試")
        raise ValueError(message) from None
    except (httpx.HTTPError, ValueError):
        raise ValueError("Strava 連線未完成，請稍後重試") from None


def gpx(samples):
    if len(samples) < 2:
        raise ValueError("此紀錄缺少帶時間的 GPS 路線，無法上傳；請用新版記錄一次運動")
    root = Element("gpx", version="1.1", creator="SportLog", xmlns="http://www.topografix.com/GPX/1/1")
    track = SubElement(root, "trk")
    segment = None
    last_segment = None
    last_time = 0
    for p in samples:
        lat, lng, ts = p["lat"], p["lng"], p["ts"]
        if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180 and ts > last_time):
            raise ValueError("GPS 路線或時間有誤，無法上傳")
        if segment is None or last_segment != p.get("segment", 0):
            segment = SubElement(track, "trkseg")
            last_segment = p.get("segment", 0)
        point = SubElement(segment, "trkpt", lat=str(lat), lon=str(lng))
        SubElement(point, "time").text = datetime.fromtimestamp(ts / 1000, timezone.utc).isoformat().replace("+00:00", "Z")
        last_time = ts
    return tostring(root, encoding="utf-8", xml_declaration=True)


class StravaSync:
    def __init__(self, app, conn, auth):
        @contextmanager
        def connection():
            db = conn()
            try:
                with db:
                    yield db
            finally:
                db.close()
        self.conn = connection
        self.lock = threading.RLock()

        @app.get("/api/strava/status")
        def status(uid: int = Depends(auth)):
            with self.conn() as db:
                row = db.execute("SELECT athlete_id FROM strava_connections WHERE user_id=?", (uid,)).fetchone()
            return {"configured": configured(), "connected": bool(row), "athlete_id": row[0] if row else None}

        @app.post("/api/strava/connect")
        def connect(uid: int = Depends(auth)):
            if not configured():
                raise HTTPException(503, "Strava 尚未完成網站設定")
            state = secrets.token_urlsafe(32)
            with self.conn() as db:
                db.execute("DELETE FROM strava_states WHERE expires_at<? OR user_id=?", (time.time(), uid))
                db.execute("INSERT INTO strava_states VALUES (?,?,?)", (hashlib.sha256(state.encode()).hexdigest(), uid, time.time() + 600))
            return {"url": "https://www.strava.com/oauth/authorize?" + urlencode({"client_id": os.environ["STRAVA_CLIENT_ID"], "redirect_uri": os.getenv("STRAVA_REDIRECT_URI", CALLBACK), "response_type": "code", "approval_prompt": "force", "scope": "activity:write", "state": state})}

        @app.get("/api/strava/callback")
        def callback(state: str = "", code: str = "", scope: str = "", error: str = ""):
            digest = hashlib.sha256(state.encode()).hexdigest()
            with self.conn() as db:
                row = db.execute("DELETE FROM strava_states WHERE state=? AND expires_at>? RETURNING user_id", (digest, time.time())).fetchone()
            result = "failed"
            if row and code and not error and configured():
                try:
                    token = self.exchange(grant_type="authorization_code", code=code)
                    # Newer Strava responses include authoritative accepted scopes.
                    granted = token.get("scope", scope).replace(",", " ").split()
                    if "activity:write" not in granted:
                        raise ValueError("missing scope")
                    self.store_token(row[0], token, token["athlete"]["id"])
                    result = "connected"
                except (ValueError, KeyError):
                    pass
            return RedirectResponse(FRONTEND + "?strava=" + result, status_code=303)

        @app.delete("/api/strava/connection")
        def disconnect(uid: int = Depends(auth)):
            # Remove local credentials and pending consent; user can also revoke in Strava settings.
            with self.lock, self.conn() as db:
                db.execute("DELETE FROM strava_connections WHERE user_id=?", (uid,))
                db.execute("DELETE FROM strava_states WHERE user_id=?", (uid,))
            return {"disconnected": True}

        @app.get("/api/activities/{aid}/strava")
        def sync_status(aid: int, uid: int = Depends(auth)):
            self.owned(aid, uid)
            return self.result(aid)

        @app.post("/api/activities/{aid}/strava")
        def sync(aid: int, uid: int = Depends(auth)):
            self.owned(aid, uid)
            if not configured():
                raise HTTPException(503, "Strava 尚未完成網站設定")
            self.auto_sync(aid, uid, manual=True)
            return self.result(aid)

    def init_tables(self):
        with self.conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS strava_connections(user_id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL, tokens TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS strava_states(state TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS strava_uploads(activity_id INTEGER PRIMARY KEY, status TEXT NOT NULL, upload_id TEXT, strava_id TEXT, error TEXT);
            """)

    def owned(self, aid, uid):
        with self.conn() as db:
            row = db.execute("SELECT * FROM activities WHERE id=? AND user_id=?", (aid, uid)).fetchone()
        if not row:
            raise HTTPException(404, "找不到運動紀錄")
        return row

    def exchange(self, **data):
        return remote("POST", "https://www.strava.com/oauth/token", data={"client_id": os.environ["STRAVA_CLIENT_ID"], "client_secret": os.environ["STRAVA_CLIENT_SECRET"], **data})

    def store_token(self, uid, token, athlete):
        encrypted = cipher().encrypt(json.dumps({k: token[k] for k in ("access_token", "refresh_token", "expires_at")}).encode()).decode()
        with self.conn() as db:
            db.execute("INSERT OR REPLACE INTO strava_connections VALUES (?,?,?)", (uid, athlete, encrypted))

    def access(self, uid):
        with self.conn() as db:
            row = db.execute("SELECT * FROM strava_connections WHERE user_id=?", (uid,)).fetchone()
        if not row:
            raise ValueError("請先連接 Strava")
        token = json.loads(cipher().decrypt(row["tokens"].encode()))
        if token["expires_at"] < time.time() + 60:
            token = self.exchange(grant_type="refresh_token", refresh_token=token["refresh_token"])
            self.store_token(uid, token, row["athlete_id"])
        return token["access_token"]

    def result(self, aid):
        with self.conn() as db:
            row = db.execute("SELECT status,strava_id,error FROM strava_uploads WHERE activity_id=?", (aid,)).fetchone()
        return dict(row) if row else {"status": "not_synced", "strava_id": None, "error": None}

    def auto_sync(self, aid, uid, manual=False):
        if not configured():
            return
        # Serialise refresh-token rotation and uploads in this single-worker service.
        with self.lock:
            with self.conn() as db:
                connected = db.execute("SELECT 1 FROM strava_connections WHERE user_id=?", (uid,)).fetchone()
                previous = db.execute("SELECT * FROM strava_uploads WHERE activity_id=?", (aid,)).fetchone()
            if not connected:
                if manual:
                    raise HTTPException(409, "請先連接 Strava")
                return
            if previous and previous["status"] == "synced":
                return
            upload_id = previous["upload_id"] if previous else None
            try:
                activity = self.owned(aid, uid)
                headers = {"Authorization": "Bearer " + self.access(uid)}
                if not upload_id:
                    data = gpx(json.loads(activity["route_samples"] or "[]"))
                    payload = remote("POST", API + "/uploads", headers=headers, data={"data_type": "gpx", "external_id": f"sportlog-{uid}-{aid}", "name": "SportLog " + {"run": "跑步", "cycle": "騎車", "walk": "走路"}[activity["type"]], "sport_type": {"run": "Run", "cycle": "Ride", "walk": "Walk"}[activity["type"]]}, files={"file": (f"sportlog-{uid}-{aid}.gpx", data, "application/gpx+xml")})
                    upload_id = str(payload["id"])
                    with self.conn() as db:
                        db.execute("INSERT OR REPLACE INTO strava_uploads VALUES (?,?,?,?,?)", (aid, "processing", upload_id, None, None))
                else:
                    payload = remote("GET", API + "/uploads/" + upload_id, headers=headers)
                activity_id = payload.get("activity_id")
                # Duplicate GPX uploads return the original activity reference.
                import re
                duplicate = re.search(r"duplicate of activity (\d+)", payload.get("error") or "")
                if duplicate:
                    activity_id = duplicate[1]
                if payload.get("error") and not activity_id:
                    raise ValueError("Strava 無法處理這份路線，請確認 GPS 紀錄")
                with self.conn() as db:
                    db.execute("INSERT OR REPLACE INTO strava_uploads VALUES (?,?,?,?,?)", (aid, "synced" if activity_id else "processing", upload_id, str(activity_id) if activity_id else None, None))
            except Exception as e:
                # Never expose provider payloads, tokens or traceback to the client.
                message = str(e) if isinstance(e, ValueError) else "同步未完成，請稍後重試或重新連接 Strava"
                with self.conn() as db:
                    db.execute("INSERT OR REPLACE INTO strava_uploads VALUES (?,?,?,?,?)", (aid, "failed", upload_id, None, message))
