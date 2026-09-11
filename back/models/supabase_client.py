import json
import os
import urllib.error
import urllib.parse
import urllib.request


class SupabaseError(RuntimeError):
	pass


BASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
API_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def ensure_configured():
	if not BASE_URL or not API_KEY:
		raise SupabaseError("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados.")


def request(method, table, params=None, data=None, prefer="return=representation"):
	ensure_configured()
	query = urllib.parse.urlencode(params or {}, doseq=True)
	url = f"{BASE_URL}/rest/v1/{table}" + (f"?{query}" if query else "")
	body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
	req = urllib.request.Request(url, data=body, method=method, headers={
		"apikey": API_KEY,
		"Authorization": f"Bearer {API_KEY}",
		"Content-Type": "application/json",
		"Accept": "application/json",
		"Prefer": prefer,
	})
	try:
		with urllib.request.urlopen(req, timeout=30) as response:
			content = response.read().decode("utf-8")
			return json.loads(content) if content else None
	except urllib.error.HTTPError as error:
		detail = error.read().decode("utf-8", errors="replace")
		raise SupabaseError(f"Supabase {table}: HTTP {error.code}: {detail}") from error


def select(table, filters=None, order=None, limit=None):
	params = {"select": "*"}
	params.update(filters or {})
	if order:
		params["order"] = order
	if limit:
		params["limit"] = str(limit)
	return request("GET", table, params=params) or []


def insert(table, rows):
	result = request("POST", table, data=rows)
	return result[0] if isinstance(result, list) and result else result


def upsert(table, rows):
	result = request("POST", table, data=rows, prefer="resolution=merge-duplicates,return=representation")
	return result[0] if isinstance(result, list) and result else result


def update(table, filters, values):
	result = request("PATCH", table, params=filters, data=values)
	return result[0] if isinstance(result, list) and result else result


def delete(table, filters):
	return request("DELETE", table, params=filters, data=None, prefer="return=minimal")


def next_id(table):
	rows = select(table, {"select": "id", "order": "id.desc", "limit": "1"})
	return (int(rows[0]["id"]) + 1) if rows else 1
