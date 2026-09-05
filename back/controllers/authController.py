import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.user import authenticate_user, create_user, initialize_database


def handle_request(request):
	initialize_database()
	action = request.get("action")

	if action == "register":
		user = create_user(request["name"], request["email"], request["password"])
		return {"ok": True, "user": user}

	if action == "login":
		user = authenticate_user(request["email"], request["password"])
		if user is None:
			return {"ok": False, "error": "E-mail ou senha inválidos."}
		return {"ok": True, "user": user}

	return {"ok": False, "error": "Operação inválida."}


if __name__ == "__main__":
	try:
		print(json.dumps(handle_request(json.loads(sys.stdin.read())), ensure_ascii=False))
	except (KeyError, ValueError) as error:
		print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
		sys.exit(1)
