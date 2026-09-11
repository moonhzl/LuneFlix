import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.user import get_connection


def now():
	return datetime.now(timezone.utc).isoformat()


def initialize_catalog():
	with get_connection() as connection:
		connection.executescript(
			"""
			CREATE TABLE IF NOT EXISTS catalog_movies (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				original_title TEXT,
				imdb_id TEXT UNIQUE,
				tmdb_id INTEGER UNIQUE,
				rating REAL,
				overview TEXT,
				poster TEXT,
				backdrop TEXT,
				release_date TEXT,
				genres TEXT NOT NULL DEFAULT '[]',
				runtime INTEGER,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS catalog_series (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				original_title TEXT,
				tmdb_id INTEGER UNIQUE,
				imdb_id TEXT UNIQUE,
				rating REAL,
				overview TEXT,
				poster TEXT,
				backdrop TEXT,
				first_air_date TEXT,
				genres TEXT NOT NULL DEFAULT '[]',
				seasons TEXT NOT NULL DEFAULT '[]',
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_catalog_movies_title ON catalog_movies(title);
			CREATE INDEX IF NOT EXISTS idx_catalog_series_title ON catalog_series(title);
			CREATE TABLE IF NOT EXISTS system_logs (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				user_id INTEGER,
				timestamp TEXT NOT NULL,
				ip TEXT,
				details TEXT NOT NULL
			);
			"""
		)


def decode(row, content_type):
	item = dict(row)
	item["type"] = content_type
	for key in ("genres", "seasons"):
		if key in item:
			item[key] = json.loads(item[key] or "[]")
	return item


def table_for(content_type):
	if content_type == "movie":
		return "catalog_movies"
	if content_type == "series":
		return "catalog_series"
	raise ValueError("Tipo de conteúdo inválido.")


def normalize_search_text(value):
	text = unicodedata.normalize("NFKD", str(value or ""))
	text = "".join(character for character in text if not unicodedata.combining(character))
	return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def local_search(query):
	normalized_query = normalize_search_text(query)
	if not normalized_query:
		return []
	query_tokens = normalized_query.split()
	with get_connection() as connection:
		movies = [decode(row, "movie") for row in connection.execute("SELECT * FROM catalog_movies")]
		series = [decode(row, "series") for row in connection.execute("SELECT * FROM catalog_series")]

	def rank(item):
		candidate_titles = [item.get("title"), item.get("original_title")]
		best_score = 0
		for candidate in candidate_titles:
			normalized_title = normalize_search_text(candidate)
			if not normalized_title:
				continue
			title_tokens = normalized_title.split()
			token_score = sum(
				1 for token in query_tokens
				if any(token in title_token or title_token in token for title_token in title_tokens)
			)
			partial_score = SequenceMatcher(None, normalized_query, normalized_title).ratio()
			contains_score = 1 if normalized_query in normalized_title else 0
			best_score = max(best_score, contains_score * 3 + token_score + partial_score)
		return best_score

	results = [(rank(item), item) for item in movies + series]
	return [item for score, item in sorted(results, key=lambda result: result[0], reverse=True) if score >= 1.5][:20]


def list_items(content_type=None):
	with get_connection() as connection:
		if content_type:
			table = table_for(content_type)
			return [decode(row, content_type) for row in connection.execute(f"SELECT * FROM {table} ORDER BY updated_at DESC")]
		return list_items("movie") + list_items("series")


def upsert(item):
	content_type = "movie" if item.get("type") == "movie" else "series"
	table = table_for(content_type)
	key = "imdb_id" if content_type == "movie" else "tmdb_id"
	identifier = item.get(key)
	if not identifier:
		raise ValueError("O conteúdo não possui o ID obrigatório.")
	item_id = str(item.get("id") or f"{key}_{identifier}")
	timestamp = now()
	fields = [key, "id", "title", "original_title", "rating", "overview", "poster", "backdrop", "genres", "created_at", "updated_at"]
	if content_type == "movie":
		fields.insert(8, "release_date")
		fields.insert(9, "runtime")
		values = [identifier, item_id, item.get("title", ""), item.get("original_title"), item.get("rating"), item.get("overview", ""), item.get("poster"), item.get("backdrop"), item.get("release_date"), item.get("runtime"), json.dumps(item.get("genres", []), ensure_ascii=False), timestamp, timestamp]
	else:
		fields.insert(8, "first_air_date")
		fields.insert(9, "seasons")
		values = [identifier, item_id, item.get("title", ""), item.get("original_title"), item.get("rating"), item.get("overview", ""), item.get("poster"), item.get("backdrop"), item.get("first_air_date"), json.dumps(item.get("seasons", []), ensure_ascii=False), json.dumps(item.get("genres", []), ensure_ascii=False), timestamp, timestamp]
	with get_connection() as connection:
		columns = ", ".join(fields)
		placeholders = ", ".join("?" for _ in fields)
		updates = ", ".join(f"{field}=excluded.{field}" for field in fields if field not in ("id", "created_at"))
		connection.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders}) ON CONFLICT({key}) DO UPDATE SET {updates}", values)
		row = connection.execute(f"SELECT * FROM {table} WHERE {key} = ?", (identifier,)).fetchone()
	return decode(row, content_type)


def remove(content_type, item_id):
	table = table_for(content_type)
	with get_connection() as connection:
		cursor = connection.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
	return cursor.rowcount > 0


def log_event(event_type, details, user_id=None, ip=None):
	with get_connection() as connection:
		connection.execute("INSERT INTO system_logs (id, type, user_id, timestamp, ip, details) VALUES (?, ?, ?, ?, ?, ?)", (f"log_{int(datetime.now().timestamp() * 1000000)}", event_type, user_id, now(), ip, details))


def dispatch(request):
	initialize_catalog()
	action = request.get("action")
	if action == "search":
		return {"ok": True, "data": local_search(request.get("query", ""))}
	if action == "list":
		return {"ok": True, "data": list_items(request.get("type"))}
	if action == "upsert":
		return {"ok": True, "data": upsert(request["item"])}
	if action == "delete":
		return {"ok": True, "deleted": remove(request["type"], request["id"])}
	if action == "log":
		log_event(request["type"], request.get("details", ""), request.get("user_id"), request.get("ip"))
		return {"ok": True}
	if action == "logs":
		with get_connection() as connection:
			rows = [dict(row) for row in connection.execute("SELECT id, type, user_id, timestamp, details FROM system_logs ORDER BY timestamp DESC LIMIT 200")]
		return {"ok": True, "data": rows}
	if action == "migrate_legacy":
		migrated = 0
		skipped = 0
		with get_connection() as connection:
			legacy = connection.execute("SELECT title, description, year, rating, poster_url, banner_url, video_url, created_at FROM movies").fetchall()
		for row in legacy:
			match = re.search(r"tt\d+", row["video_url"] or "")
			if not match:
				skipped += 1
				continue
			upsert({"type": "movie", "id": match.group(0), "title": row["title"], "original_title": row["title"], "imdb_id": match.group(0), "rating": float(row["rating"] or 0) if str(row["rating"] or "").replace('.', '', 1).isdigit() else None, "overview": row["description"], "poster": row["poster_url"], "backdrop": row["banner_url"], "release_date": f"{row['year']}-01-01" if row["year"] else None, "genres": []})
			migrated += 1
		return {"ok": True, "migrated": migrated, "skipped": skipped}
	return {"ok": False, "error": "Operação de catálogo inválida."}


if __name__ == "__main__":
	try:
		print(json.dumps(dispatch(json.loads(sys.stdin.read())), ensure_ascii=False))
	except (KeyError, ValueError, TypeError) as error:
		print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
		sys.exit(1)