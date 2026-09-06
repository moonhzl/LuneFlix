import json
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.user import _hash_password, authenticate_user, create_user, get_connection, initialize_database


def now():
	return datetime.now(timezone.utc).isoformat()


def initialize_admin_database():
	initialize_database()
	with get_connection() as connection:
		connection.executescript(
			"""
			CREATE TABLE IF NOT EXISTS payments (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				transaction_id TEXT NOT NULL UNIQUE,
				user_id INTEGER NOT NULL,
				plan TEXT NOT NULL,
				amount REAL NOT NULL,
				status TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY(user_id) REFERENCES users(id)
			);
			CREATE TABLE IF NOT EXISTS movies (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				genre TEXT NOT NULL DEFAULT 'Drama',
				category TEXT NOT NULL DEFAULT 'Filme',
				year INTEGER,
				duration INTEGER,
				rating TEXT,
				poster_url TEXT,
				banner_url TEXT,
				video_url TEXT,
				featured INTEGER NOT NULL DEFAULT 0,
				status TEXT NOT NULL DEFAULT 'active',
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS coupons (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				code TEXT NOT NULL UNIQUE,
				discount_type TEXT NOT NULL,
				discount_value REAL NOT NULL,
				expires_at TEXT,
				usage_limit INTEGER,
				usage_count INTEGER NOT NULL DEFAULT 0,
				status TEXT NOT NULL DEFAULT 'active',
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS modules (
				key TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'active',
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS admin_logs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				action TEXT NOT NULL,
				admin_id INTEGER,
				affected_user_id INTEGER,
				description TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'success',
				ip TEXT,
				created_at TEXT NOT NULL
			);
			"""
		)
		defaults = [
			("login", "Sistema de login", "Autenticação dos usuários"),
			("registration", "Registro", "Criação de novas contas"),
			("streaming", "Streaming", "Reprodução do catálogo"),
			("payments", "Pagamentos", "Processamento financeiro"),
			("coupons", "Cupons", "Descontos promocionais"),
			("notifications", "Notificações", "Alertas para usuários"),
			("support", "Suporte", "Atendimento aos usuários"),
			("logs", "Logs", "Auditoria administrativa"),
		]
		for key, name, description in defaults:
			connection.execute("INSERT OR IGNORE INTO modules VALUES (?, ?, ?, 'active', ?)", (key, name, description, now()))
		connection.execute("INSERT OR IGNORE INTO settings VALUES ('app_name', 'LUNEFLIX')")
		connection.execute("INSERT OR IGNORE INTO settings VALUES ('support_url', '')")
		connection.execute("INSERT OR IGNORE INTO settings VALUES ('discord_url', '')")


def log_action(admin_id, action, description, affected_user_id=None, ip=None):
	with get_connection() as connection:
		connection.execute(
			"INSERT INTO admin_logs (action, admin_id, affected_user_id, description, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			(action, admin_id, affected_user_id, description, ip, now()),
		)


def row_dict(row):
	return dict(row) if row else None


def admin_login(request):
	user = authenticate_user(request.get("email", ""), request.get("password", ""))
	if not user or user.get("role") not in ("admin", "manager"):
		return {"ok": False, "error": "Acesso administrativo negado."}
	log_action(user["id"], "admin_login", "Login administrativo realizado", ip=request.get("ip"))
	return {"ok": True, "admin": user}


def dashboard():
	with get_connection() as connection:
		users = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
		active_users = connection.execute("SELECT COUNT(*) FROM users WHERE status = 'active'").fetchone()[0]
		new_users = connection.execute("SELECT COUNT(*) FROM users WHERE created_at >= date('now', '-30 day')").fetchone()[0]
		payments = connection.execute("SELECT COUNT(*) FROM payments WHERE status = 'approved'").fetchone()[0]
		revenue = connection.execute("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'approved'").fetchone()[0]
		pending = connection.execute("SELECT COUNT(*) FROM payments WHERE status = 'pending'").fetchone()[0]
		movies = connection.execute("SELECT COUNT(*) FROM movies WHERE status = 'active'").fetchone()[0]
		coupons = connection.execute("SELECT COUNT(*) FROM coupons WHERE status = 'active'").fetchone()[0]
		recent_users = [row_dict(row) for row in connection.execute("SELECT id, name, email, role, status, plan, created_at, last_login FROM users ORDER BY id DESC LIMIT 6")]
		recent_payments = [row_dict(row) for row in connection.execute("SELECT p.*, u.name AS user_name FROM payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 6")]
		logs = [row_dict(row) for row in connection.execute("SELECT l.*, u.name AS admin_name FROM admin_logs l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 6")]
	return {"metrics": {"users": users, "active_users": active_users, "new_users": new_users, "payments": payments, "revenue": revenue, "pending": pending, "movies": movies, "coupons": coupons}, "recent_users": recent_users, "recent_payments": recent_payments, "logs": logs}


def users(request):
	with get_connection() as connection:
		query = "SELECT id, name, email, role, status, plan, created_at, last_login FROM users WHERE 1=1"
		params = []
		if request.get("search"):
			query += " AND (name LIKE ? OR email LIKE ? OR CAST(id AS TEXT) = ?)"
			term = f"%{request['search']}%"
			params += [term, term, request["search"]]
		if request.get("status") in ("active", "blocked", "inactive"):
			query += " AND status = ?"
			params.append(request["status"])
		rows = [row_dict(row) for row in connection.execute(query + " ORDER BY id DESC", params)]
	return rows


def update_user(request):
	user_id = int(request["id"])
	status = request.get("status")
	plan = request.get("plan")
	if status is not None and status not in ("active", "blocked", "inactive"):
		raise ValueError("Status inválido.")
	if plan is not None and plan not in ("free", "basic", "premium", "family"):
		raise ValueError("Plano inválido.")
	role = request.get("role")
	if role is not None and role not in ("user", "manager", "admin"):
		raise ValueError("Cargo inválido.")
	with get_connection() as connection:
		if status is not None:
			connection.execute("UPDATE users SET status = ? WHERE id = ?", (status, user_id))
		if plan is not None:
			connection.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
		if role is not None:
			connection.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
	log_action(request["admin_id"], "user_updated", f"Usuário atualizado: cargo={role or 'inalterado'}, status={status or 'inalterado'}, plano={plan or 'inalterado'}", user_id, request.get("ip"))
	return {"ok": True}


def reset_password(request):
	user_id = int(request["id"])
	password = request.get("password", "")
	if len(password) < 6:
		raise ValueError("A nova senha precisa ter pelo menos 6 caracteres.")
	salt, password_hash = _hash_password(password)
	with get_connection() as connection:
		cursor = connection.execute("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", (password_hash, salt, user_id))
		if cursor.rowcount == 0:
			raise ValueError("Usuário não encontrado.")
	log_action(request["admin_id"], "password_reset", "Senha do usuário resetada pelo administrador", user_id, request.get("ip"))
	return {"ok": True}


def delete_user(request):
	user_id = int(request["id"])
	if user_id == int(request["admin_id"]):
		raise ValueError("Você não pode excluir a própria conta administrativa.")
	with get_connection() as connection:
		cursor = connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
		if cursor.rowcount == 0:
			raise ValueError("Usuário não encontrado.")
	log_action(request["admin_id"], "user_deleted", "Usuário excluído do banco de dados", user_id, request.get("ip"))
	return {"ok": True}


def list_rows(table, order="id DESC"):
	with get_connection() as connection:
		return [row_dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY {order}")]


def create_movie(request):
	with get_connection() as connection:
		cursor = connection.execute(
			"INSERT INTO movies (title, description, genre, category, year, duration, rating, poster_url, banner_url, video_url, featured, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			(tuple(request.get(key) for key in ("title", "description", "genre", "category", "year", "duration", "rating", "poster_url", "banner_url", "video_url")) + (int(bool(request.get("featured"))), now())),
		)
	log_action(request["admin_id"], "movie_created", f"Filme {request.get('title')} criado", ip=request.get("ip"))
	return {"ok": True, "id": cursor.lastrowid}


def create_coupon(request):
	with get_connection() as connection:
		cursor = connection.execute(
			"INSERT INTO coupons (code, discount_type, discount_value, expires_at, usage_limit, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			(request["code"].upper(), request.get("discount_type", "percent"), float(request["discount_value"]), request.get("expires_at"), request.get("usage_limit"), now()),
		)
	log_action(request["admin_id"], "coupon_created", f"Cupom {request['code'].upper()} criado", ip=request.get("ip"))
	return {"ok": True, "id": cursor.lastrowid}


def dispatch(request):
	initialize_admin_database()
	action = request.get("action")
	if action == "login": return admin_login(request)
	if action == "dashboard": return {"ok": True, "data": dashboard()}
	if action == "users": return {"ok": True, "data": users(request)}
	if action == "update_user": return update_user(request)
	if action == "reset_password": return reset_password(request)
	if action == "delete_user": return delete_user(request)
	if action == "payments": return {"ok": True, "data": list_rows("payments")}
	if action == "movies": return {"ok": True, "data": list_rows("movies")}
	if action == "coupons": return {"ok": True, "data": list_rows("coupons")}
	if action == "create_movie": return create_movie(request)
	if action == "create_coupon": return create_coupon(request)
	if action == "logs":
		with get_connection() as connection:
			admin_logs = [row_dict(row) for row in connection.execute("SELECT l.*, u.name AS admin_name FROM admin_logs l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 100")]
			security_logs = [{**row_dict(row), "action": row["type"], "description": row["details"], "status": "warning", "created_at": row["timestamp"], "admin_name": "Sistema"} for row in connection.execute("SELECT * FROM security_logs ORDER BY id DESC LIMIT 100")]
			logs = sorted(admin_logs + security_logs, key=lambda item: item.get("created_at", ""), reverse=True)
			if request.get("type"):
				logs = [item for item in logs if item.get("action") == request["type"]]
			if request.get("search"):
				term = request["search"].lower()
				logs = [item for item in logs if term in f"{item.get('description', '')} {item.get('admin_name', '')}".lower()]
			page = max(int(request.get("page", 1)), 1)
			per_page = min(max(int(request.get("per_page", 25)), 1), 100)
			start = (page - 1) * per_page
			return {"ok": True, "data": logs[start:start + per_page], "pagination": {"page": page, "per_page": per_page, "total": len(logs)}}
	if action == "modules":
		with get_connection() as connection:
			return {"ok": True, "data": [row_dict(row) for row in connection.execute("SELECT * FROM modules ORDER BY name")]}
	if action == "settings":
		with get_connection() as connection:
			return {"ok": True, "data": {row["key"]: row["value"] for row in connection.execute("SELECT key, value FROM settings")}}
	if action == "update_settings":
		with get_connection() as connection:
			for key, value in request.get("settings", {}).items():
				if key in ("app_name", "support_url", "discord_url"):
					connection.execute("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, str(value)))
		log_action(request["admin_id"], "settings_changed", "Configurações gerais alteradas", ip=request.get("ip"))
		return {"ok": True}
	if action == "toggle_module":
		status = "inactive" if request.get("status") == "active" else "active"
		with get_connection() as connection:
			connection.execute("UPDATE modules SET status = ?, updated_at = ? WHERE key = ?", (status, now(), request["key"]))
		log_action(request["admin_id"], "module_changed", f"Módulo {request['key']} alterado para {status}", ip=request.get("ip"))
		return {"ok": True, "status": status}
	return {"ok": False, "error": "Operação administrativa inválida."}


if __name__ == "__main__":
	try:
		print(json.dumps(dispatch(json.loads(sys.stdin.read())), ensure_ascii=False))
	except (KeyError, ValueError, TypeError) as error:
		print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
		sys.exit(1)