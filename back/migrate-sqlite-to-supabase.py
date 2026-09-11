import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "database" / "usuarios.sqlite"
TABLES = [
    "users", "payments", "movies", "coupons", "modules", "settings",
    "admin_logs", "catalog_movies", "catalog_series", "system_logs",
    "security_logs", "password_reset_tokens",
]
JSON_COLUMNS = {"catalog_movies": {"genres"}, "catalog_series": {"genres", "seasons"}}


def request_rows(base_url, api_key, table, rows):
    if not rows:
        print(f"{table}: 0 registros")
        return
    payload = []
    for row in rows:
        item = dict(row)
        for column in JSON_COLUMNS.get(table, set()):
            try:
                item[column] = json.loads(item[column] or "[]")
            except (TypeError, json.JSONDecodeError):
                item[column] = []
        if table == "movies":
            item["featured"] = bool(item.get("featured"))
        if table == "password_reset_tokens":
            item["used"] = bool(item.get("used"))
        payload.append(item)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/rest/v1/{table}",
        data=body,
        method="POST",
        headers={
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(f"HTTP {response.status}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{table}: HTTP {error.code}: {detail}") from error
    print(f"{table}: {len(rows)} registros enviados")


def main():
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not api_key:
        raise SystemExit("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes da migração.")
    if not DATABASE_PATH.exists():
        raise SystemExit(f"Banco não encontrado: {DATABASE_PATH}")

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        for table in TABLES:
            rows = connection.execute(f'SELECT * FROM "{table}"').fetchall()
            request_rows(base_url, api_key, table, rows)
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f"Falha na migração: {error}", file=sys.stderr)
        sys.exit(1)
