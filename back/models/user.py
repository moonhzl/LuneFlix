import hashlib
import secrets
import sqlite3
import hashlib
from datetime import datetime, timezone
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parent.parent / "database" / "usuarios.sqlite"


def get_connection():
	connection = sqlite3.connect(DATABASE_PATH, timeout=10)
	connection.row_factory = sqlite3.Row
	connection.execute("PRAGMA busy_timeout = 10000")
	return connection


def initialize_database():
	with get_connection() as connection:
		connection.execute(
			"""
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE COLLATE NOCASE,
				password_hash TEXT NOT NULL,
				password_salt TEXT NOT NULL,
				created_at TEXT NOT NULL
			)
			"""
		)
		connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'") if "role" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'") if "status" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN last_login TEXT") if "last_login" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN last_ip TEXT") if "last_ip" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'") if "plan" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN avatar TEXT") if "avatar" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'inactive'") if "subscription_status" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN subscription_expires_at TEXT") if "subscription_expires_at" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN provider_customer_id TEXT") if "provider_customer_id" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("ALTER TABLE users ADD COLUMN provider_subscription_id TEXT") if "provider_subscription_id" not in [row[1] for row in connection.execute("PRAGMA table_info(users)")] else None
		connection.execute("UPDATE users SET role = 'admin' WHERE lower(name) = 'admin'")
		connection.execute("CREATE TABLE IF NOT EXISTS security_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, user_id INTEGER, timestamp TEXT NOT NULL, ip TEXT, details TEXT NOT NULL)")
		connection.execute("CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id))")


def _hash_password(password, salt=None):
	salt = salt or secrets.token_bytes(16)
	password_hash = hashlib.pbkdf2_hmac(
		"sha256", password.encode("utf-8"), salt, 120000
	)
	return salt.hex(), password_hash.hex()


def create_user(name, email, password):
	salt, password_hash = _hash_password(password)
	try:
		with get_connection() as connection:
			cursor = connection.execute(
				"""
				INSERT INTO users
					(name, email, password_hash, password_salt, created_at)
				VALUES (?, ?, ?, ?, ?)
				""",
				(
					name.strip(),
					email.strip().lower(),
					password_hash,
					salt,
					datetime.now(timezone.utc).isoformat(),
				),
			)
			return {"id": cursor.lastrowid, "name": name.strip(), "email": email.strip().lower()}
	except sqlite3.IntegrityError:
		raise ValueError("Este e-mail já está cadastrado.")


def authenticate_user(email, password, ip=None):
	initialize_database()
	with get_connection() as connection:
		user = connection.execute(
			"SELECT id, name, email, password_hash, password_salt, role, status, plan, last_ip FROM users WHERE email = ?",
			(email.strip().lower(),),
		).fetchone()

	if user is None:
		return None

	_, password_hash = _hash_password(password, bytes.fromhex(user["password_salt"]))
	if not secrets.compare_digest(password_hash, user["password_hash"]):
		return None

	if user["status"] != "active":
		return None

	with get_connection() as connection:
		if ip and user["last_ip"] and user["last_ip"] != ip:
			connection.execute("INSERT INTO security_logs (type, user_id, timestamp, ip, details) VALUES (?, ?, ?, ?, ?)", ("LOGIN_DIFFERENT_IP", user["id"], datetime.now(timezone.utc).isoformat(), ip, "Novo IP detectado durante login"))
		connection.execute(
			"UPDATE users SET last_login = ?, last_ip = ? WHERE id = ?",
			(datetime.now(timezone.utc).isoformat(), ip, user["id"]),
		)

	return {
		"id": user["id"],
		"name": user["name"],
		"email": user["email"],
		"role": user["role"],
		"status": user["status"],
		"plan": user["plan"],
	}


def get_user(user_id):
	with get_connection() as connection:
		user = connection.execute("SELECT id, name, email, role, status, plan, avatar, subscription_status, subscription_expires_at FROM users WHERE id = ?", (user_id,)).fetchone()
	return dict(user) if user else None


def update_profile(user_id, name, avatar):
	name = str(name or "").strip()
	avatar = str(avatar or "").strip() or None
	if len(name) < 2 or len(name) > 80:
		raise ValueError("O nome precisa ter entre 2 e 80 caracteres.")
	with get_connection() as connection:
		cursor = connection.execute("UPDATE users SET name = ?, avatar = ? WHERE id = ?", (name, avatar, user_id))
	if cursor.rowcount == 0:
		raise ValueError("Usuário não encontrado.")
	return get_user(user_id)


def create_password_reset(email):
	with get_connection() as connection:
		user = connection.execute("SELECT id FROM users WHERE email = ?", (str(email or "").strip().lower(),)).fetchone()
	if not user:
		return None
	token = secrets.token_urlsafe(32)
	expires = datetime.now(timezone.utc).timestamp() + 30 * 60
	expires_at = datetime.fromtimestamp(expires, timezone.utc).isoformat()
	with get_connection() as connection:
		connection.execute("DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at < ?", (user["id"], datetime.now(timezone.utc).isoformat()))
		connection.execute("INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES (?, ?, ?)", (hashlib.sha256(token.encode()).hexdigest(), user["id"], expires_at))
	return token


def reset_password(token, password):
	if len(str(password or "")) < 6:
		raise ValueError("A senha precisa ter pelo menos 6 caracteres.")
	token_hash = hashlib.sha256(str(token or "").encode()).hexdigest()
	with get_connection() as connection:
		row = connection.execute("SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ?", (token_hash, datetime.now(timezone.utc).isoformat())).fetchone()
		if not row:
			raise ValueError("Token inválido ou expirado.")
		salt, password_hash = _hash_password(password)
		connection.execute("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", (password_hash, salt, row["user_id"]))
		connection.execute("UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?", (token_hash,))
