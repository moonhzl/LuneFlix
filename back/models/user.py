import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parent.parent / "database" / "usuarios.sqlite"


def get_connection():
	connection = sqlite3.connect(DATABASE_PATH)
	connection.row_factory = sqlite3.Row
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


def authenticate_user(email, password):
	with get_connection() as connection:
		user = connection.execute(
			"SELECT id, name, email, password_hash, password_salt FROM users WHERE email = ?",
			(email.strip().lower(),),
		).fetchone()

	if user is None:
		return None

	_, password_hash = _hash_password(password, bytes.fromhex(user["password_salt"]))
	if not secrets.compare_digest(password_hash, user["password_hash"]):
		return None

	return {"id": user["id"], "name": user["name"], "email": user["email"]}
