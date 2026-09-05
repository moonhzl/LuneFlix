# LUNEFLIX

Seu cinema. Sua Noite.

## Visualizar o banco SQLite

O arquivo `back/database/usuarios.sqlite` e um banco SQLite binario. Nao abra esse arquivo como texto no VS Code, pois o editor exibira o schema misturado com dados internos do banco.

Para visualizar as tabelas, instale uma extensao de SQLite no VS Code, como **SQLite Viewer**, e abra `back/database/usuarios.sqlite` usando a opcao **Open Database** da extensao. A tabela de usuarios se chama `users`.

O banco tambem pode ser consultado pelo terminal:

```powershell
python -c "import sqlite3; db=sqlite3.connect('back/database/usuarios.sqlite'); print(db.execute('SELECT id, name, email, created_at FROM users').fetchall()); db.close()"
```