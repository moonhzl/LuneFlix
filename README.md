# LUNEFLIX

Seu cinema. Sua Noite.

## Painel administrativo

Com o servidor em execução, acesse `http://localhost:3000/admin`. O login usa a autenticação real do backend; somente usuários com `role = 'admin'` conseguem criar sessão administrativa. A conta existente com nome `admin` recebe esse papel automaticamente na migração do banco.

O painel possui dashboard, usuários, pagamentos, filmes, cupons, módulos, configurações e logs. As operações administrativas são persistidas no SQLite e registradas em `admin_logs`. Pagamentos dependem da integração do provedor para começar a aparecer.

## Visualizar o banco SQLite

O arquivo `back/database/usuarios.sqlite` e um banco SQLite binario. Nao abra esse arquivo como texto no VS Code, pois o editor exibira o schema misturado com dados internos do banco.

Para visualizar as tabelas, instale uma extensao de SQLite no VS Code, como **SQLite Viewer**, e abra `back/database/usuarios.sqlite` usando a opcao **Open Database** da extensao. A tabela de usuarios se chama `users`.

O banco tambem pode ser consultado pelo terminal:

```powershell
python -c "import sqlite3; db=sqlite3.connect('back/database/usuarios.sqlite'); print(db.execute('SELECT id, name, email, created_at FROM users').fetchall()); db.close()"
```