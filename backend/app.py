import os, secrets, hashlib, hmac, json, io, asyncio
from contextlib import suppress
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Response
from fastapi.staticfiles import StaticFiles
from .db import db, rows, get, put, uid, now
from . import model

@asynccontextmanager
async def lifespan(app):
    # Model loading is deferred until a facilitator requests archive analysis.
    with db() as c:
        for room, body in c.execute("SELECT room,body FROM records WHERE kind='archive_run'").fetchall():
            run=json.loads(body)
            if run['status']=='running':
                run.update(status='failed',error='Server restarted. Start a new analysis.',finished_at=now())
                put(c,room,'archive_run',run)
        for room,body in c.execute("SELECT room,body FROM records WHERE kind='duo_chat'").fetchall():
            run=json.loads(body)
            if run['status']=='running':
                run.update(status='failed',finished_at=now())
                for answer in run['answers'].values():
                    if answer['status']!='complete':answer.update(status='failed',error='Server restarted; submit a new comparison.')
                put(c,room,'duo_chat',run)
    from .duo import clock_loop
    timer=asyncio.create_task(clock_loop())
    try: yield
    finally:
        timer.cancel()
        with suppress(asyncio.CancelledError):await timer

app=FastAPI(title='VCU Card Jam', lifespan=lifespan)

@app.middleware('http')
async def canonical_room_code(request, call_next):
    path=request.scope['path']
    for prefix in ['/api/workshops/','/api/rooms/','/api/archive/rooms/']:
        if path.startswith(prefix):
            tail=path[len(prefix):];code=tail.split('/')[0]
            with db() as c:
                alias=get(c,'alias-'+code.upper(),'room_alias')
                canonical=alias['target'] if alias else code.lower() if get(c,code.lower(),'room') else code
            if canonical!=code:
                request.scope['path']=prefix+canonical+tail[len(code):]
                request.scope['raw_path']=request.scope['path'].encode()
            break
    return await call_next(request)


def check(ok, msg="Forbidden", status=403):
    if not ok:
        raise HTTPException(status, msg)

def digest(t):
    return hashlib.sha256(t.encode()).hexdigest()

def auth(c, authorization, room=None, roles=None):
    token = (authorization or "").removeprefix("Bearer ")
    a = get(c, digest(token), "identity")
    check(
        a and (not room or a["role"] == "admin" or a["room"] == room),
        "Authentication required",
        401,
    )
    check(not roles or a["role"] in roles)
    if a["role"] == "admin":
        check(
            a.get("credential_version")
            == digest(os.environ.get("VCU_ADMIN_PASSWORD", "")),
            "Facilitator credential changed; sign in again",
            401,
        )
    return a

def roomget(c, code):
    r = get(c, code, "room")
    check(r, "Room not found", 404)
    return r

def identity(c, room, role, **fields):
    token = secrets.token_urlsafe(32)
    a = put(
        c, room, "identity", {"id": digest(token), "room": room, "role": role, **fields}
    )
    return token, a

@app.post("/api/login")
def login(body: dict):
    password = os.environ.get("VCU_ADMIN_PASSWORD", "")
    check(len(password) >= 4, "Set VCU_ADMIN_PASSWORD (4+ characters) on server", 503)
    check(
        hmac.compare_digest(str(body.get("password", "")), password),
        "Invalid password",
        401,
    )
    with db() as c:
        token, _ = identity(c, "*", "admin", credential_version=digest(password))
        return {"token": token, "role": "admin"}

@app.post("/api/rooms")
def create_room(body: dict, authorization: str | None = Header(None)):
    with db() as c:
        auth(c, authorization, roles=["admin"])
        groups = body.get("groups", ["Kart", "VCU", "Other"])
        check(
            isinstance(groups, list)
            and 1 <= len(groups) <= 20
            and all(isinstance(g, str) and 0 < len(g.strip()) <= 60 for g in groups),
            "Provide 1–20 nonempty group names",
            422,
        )
        check(len(set(groups)) == len(groups), "Group names must be unique", 422)
        duration = body.get("duration_minutes", 90)
        check(
            type(duration) is int and 1 <= duration <= 1440,
            "Session duration must be 1–1440 minutes",
            422,
        )
        code = "".join(
            secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6)
        )
        return put(
            c,
            code,
            "room",
            dict(
                id=code,
                name=str(body.get("name", "VCU Workshop"))[:120],
                demo=bool(body.get("demo", False)),
                stage="prepare",
                paused=False,
                show_groups=False,
                tool="jam",
                consent_required=body.get("consent_required", True),
                groups=groups,
                duration_minutes=duration,
            ),
        )

@app.get("/api/rooms/{code}")
def room_info(code: str):
    with db() as c:
        r = roomget(c, code)
        return {
            k: r.get(k)
            for k in [
                "id",
                "name",
                "demo",
                "stage",
                "paused",
                "tool",
                "groups",
                "consent_required",
                "duration_minutes",
            ]
        }

@app.post("/api/rooms/{code}/join")
def join(code: str, body: dict):
    with db() as c:
        r = roomget(c, code)
        check(r.get("tool")!="duo", "Use workshop room entry",409)
        jam=get(c,"jam-"+code,"jam")
        check(not jam or jam["phase"] != "done", "Joining closed", 409)
        check(
            not r["consent_required"] or body.get("classroom") is True,
            "Classroom consent required",
            422,
        )
        check(body.get("group") in r["groups"], "Choose a group", 422)
        pid = f"P{len(rows(c,code,'participant'))+1:02}"
        p = put(
            c,
            code,
            "participant",
            dict(
                id=uid(),
                pid=pid,
                group=body["group"],
                language=body.get("language", "ko"),
                background=str(body.get("background", ""))[:2000],
                consent={
                    "classroom": bool(body.get("classroom")),
                    "quote": bool(body.get("quote")),
                    "external_ai": False,
                    "training": False,
                },
                team=None,
            ),
        )
        token, _ = identity(c, code, "participant", participant=p["id"])
        return {"token": token, "role": "participant", "pid": pid, "room": code}

@app.get("/api/rooms/{code}/me")
def me(code: str, authorization: str | None = Header(None)):
    with db() as c:
        a = auth(c, authorization, code)
        if a["role"] != "participant":
            return {"role": a["role"], "reviewer": a.get("reviewer")}
        p = get(c, a["participant"], "participant")
        return {
            **p,
            "role": "participant",
            "responses": [
                x for x in rows(c, code, "jam_response") if x["participant"] == p["id"]
            ],
            "drafts": [
                x for x in rows(c, code, "jam_draft") if x.get("participant") == p["id"]
            ],
        }

@app.post("/api/rooms/{code}/screen")
def screen_token(code: str, authorization: str | None = Header(None)):
    with db() as c:
        auth(c, authorization, code, ["admin"])
        roomget(c, code)
        token, _ = identity(c, code, "screen")
        return {"token": token}

@app.get("/api/rooms/{code}/qr")
def qr(code: str):
    import qrcode
    from urllib.parse import urlparse

    base = os.environ.get("VCU_PUBLIC_URL", "").rstrip("/")
    check(
        urlparse(base).scheme in ["http", "https"]
        and urlparse(base).hostname not in [None, "localhost", "127.0.0.1", "0.0.0.0"],
        "Set VCU_PUBLIC_URL to LAN IP or HTTPS address",
        409,
    )
    with db() as c:
        roomget(c, code)
    b = io.BytesIO()
    qrcode.make(f"{base}/?room={code}").save(b, format="PNG")
    return Response(b.getvalue(), media_type="image/png")

@app.get("/api/health")
def health():
    return {"ok": True, "model": model.state["status"]}

from .jam import install as install_jam
from .archive import install as install_archive
install_jam(app, auth, check, roomget)
install_archive(app, auth, check)
from .duo import install as install_duo
install_duo(app,auth,check,identity)
if Path('dist').exists():
    app.mount('/', StaticFiles(directory='dist', html=True), name='frontend')
