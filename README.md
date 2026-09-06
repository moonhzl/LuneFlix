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

## Catálogo e EmbedMovies

O catálogo novo fica nas tabelas SQLite `catalog_movies` e `catalog_series`, separado da tabela `users`. A busca consulta primeiro esse catálogo; somente quando não há resultado ela consulta o TMDB, salva os metadados e retorna o resultado com `player_url`.

Copie `back/.env.example` para `back/.env` e preencha `TMDB_API_TOKEN`. Use `VIDEO_PROVIDER=embedmovies` para `https://myembed.biz`; `VIDEO_PROVIDER=legacy` mantém o comportamento legado quando houver `video_url`.

Execute `node back/migrate-catalog.js` para migrar registros legados que já tenham um IMDb ID na URL. O script pode ser executado novamente sem duplicar registros.

O painel em `/admin`, na seção **Filmes**, permite buscar um IMDb ID, revisar a prévia, confirmar o cadastro e remover itens. Os eventos administrativos e `LOGIN_DIFFERENT_IP` ficam em **Logs**; IPs não são enviados ao frontend comum.

Antes da migração foi criado o backup local `backups/2026-09-06_193345`. Para restaurar, pare o servidor e copie os arquivos dessa pasta de volta, preservando o `.env` local conforme necessário.