import sqlite3, json, os, secrets
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return secrets.token_hex(12)


@contextmanager
def db():
    path = Path(os.environ.get("VCU_DATA", "data")) / "workshop.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(path, timeout=30)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, room TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL)"
    )
    c.execute("CREATE INDEX IF NOT EXISTS room_kind ON records(room,kind)")
    c.execute("BEGIN IMMEDIATE")
    try:
        yield c
        c.commit()
    except:
        c.rollback()
        raise
    finally:
        c.close()


def rows(c, room, kind):
    return [
        json.loads(x[0])
        for x in c.execute(
            "SELECT body FROM records WHERE room=? AND kind=? ORDER BY rowid",
            (room, kind),
        )
    ]


def get(c, id, kind=None):
    r = c.execute("SELECT kind,body FROM records WHERE id=?", (id,)).fetchone()
    return json.loads(r[1]) if r and (kind is None or r[0] == kind) else None


def put(c, room, kind, data):
    data = {"id": uid(), "created_at": now(), **data}
    c.execute(
        "INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        (data["id"], room, kind, json.dumps(data, ensure_ascii=False)),
    )
    return data


def audit(c, room, actor, action, before, after, reason=""):
    put(
        c,
        room,
        "audit",
        dict(actor=actor, action=action, before=before, after=after, reason=reason),
    )
