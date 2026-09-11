import json
import sys
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from models.supabase_client import delete, insert, select, upsert


def now(): return datetime.now(timezone.utc).isoformat()

def table_for(content_type):
	if content_type == "movie": return "catalog_movies"
	if content_type == "series": return "catalog_series"
	raise ValueError("Tipo de conteúdo inválido.")

def initialize_catalog(): return None

def decode(row, content_type):
	item = dict(row); item["type"] = content_type
	for key in ("genres", "seasons"):
		if isinstance(item.get(key), str): item[key] = json.loads(item[key] or "[]")
	return item

def normalize_search_text(value):
	text = unicodedata.normalize("NFKD", str(value or ""))
	return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()

def list_items(content_type=None):
	if content_type:
		try:
			return [decode(row, content_type) for row in select(table_for(content_type), order="updated_at.desc")]
		except Exception:
			return []
	return list_items("movie") + list_items("series")

def search_score(query, item):
	query = normalize_search_text(query)
	title = normalize_search_text(item.get("title") or "")
	original = normalize_search_text(item.get("original_title") or "")
	base = max(SequenceMatcher(None, query, title).ratio(), SequenceMatcher(None, query, original).ratio())
	if not query:
		return 0.0
	if title == query or original == query:
		return 1.0 + base
	if title.startswith(query) or original.startswith(query):
		return 0.85 + base
	if query in title or query in original:
		return 0.7 + base
	query_tokens = [token for token in query.split() if token]
	if query_tokens:
		matches = sum(1 for token in query_tokens if token in title or token in original)
		return (matches / max(len(query_tokens), 1)) * 0.5 + base
	return base

def local_search(query):
	query = normalize_search_text(query)
	if not query: return []
	items = list_items()
	return [item for item in sorted(items, key=lambda item: search_score(query, item), reverse=True) if search_score(query, item) >= .18][:20]

def upsert_item(item):
	content_type = "movie" if item.get("type") == "movie" else "series"
	key = "imdb_id" if content_type == "movie" else "tmdb_id"
	if not item.get(key): raise ValueError("O conteúdo não possui o ID obrigatório.")
	payload = dict(item); payload.pop("type", None); payload["updated_at"] = now(); payload.setdefault("created_at", now())
	payload["id"] = str(payload.get("id") or f"{key}_{payload[key]}")
	payload["genres"] = payload.get("genres", [])
	if content_type == "series": payload["seasons"] = payload.get("seasons", [])
	return decode(upsert(table_for(content_type), payload), content_type)

def log_event(event_type, details, user_id=None, ip=None):
	try:
		insert("system_logs", {"id": f"log_{int(datetime.now().timestamp() * 1000000)}", "type": event_type, "user_id": user_id, "timestamp": now(), "ip": ip, "details": details})
	except Exception:
		pass

def dispatch(request):
	action = request.get("action")
	if action == "search": return {"ok": True, "data": local_search(request.get("query", ""))}
	if action == "list": return {"ok": True, "data": list_items(request.get("type"))}
	if action == "upsert": return {"ok": True, "data": upsert_item(request["item"])}
	if action == "delete": return {"ok": True, "deleted": delete(table_for(request["type"]), {"id": f"eq.{request['id']}"}) is not None}
	if action == "log": log_event(request["type"], request.get("details", ""), request.get("user_id"), request.get("ip")); return {"ok": True}
	if action == "logs": return {"ok": True, "data": select("system_logs", order="timestamp.desc", limit=200)}
	return {"ok": False, "error": "Operação de catálogo inválida."}

if __name__ == "__main__":
	try: print(json.dumps(dispatch(json.loads(sys.stdin.read())), ensure_ascii=False))
	except (KeyError, ValueError, TypeError) as error:
		print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False)); sys.exit(1)
