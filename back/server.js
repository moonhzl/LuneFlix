require("dotenv").config({
    path: require("path").join(__dirname, ".env")
});

const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const catalogService = require("./services/catalogService");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = process.env.TMDB_API_URL;
const API_TOKEN = process.env.TMDB_API_TOKEN;

const projectRoot = path.join(__dirname, "..");
const authController = path.join(__dirname, "controllers", "authController.py");
const adminController = path.join(__dirname, "controllers", "adminController.py");
const adminSessions = new Map();

app.use(express.json());

// Servir todo o projeto (index.html, front/, etc.)
app.use(express.static(projectRoot));

function readCookies(request) {
    return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map(cookie => {
        const [key, ...value] = cookie.trim().split("=");
        return [key, decodeURIComponent(value.join("="))];
    }));
}

function runAuthController(payload, res) {
    const controller = spawn("python", [authController]);
    let stdout = "";
    let stderr = "";

    controller.stdout.on("data", chunk => { stdout += chunk; });
    controller.stderr.on("data", chunk => { stderr += chunk; });
    controller.on("error", error => {
        console.error("Erro na autenticação:", error);
        res.status(500).json({ erro: "Python não está disponível para a autenticação." });
    });
    controller.on("close", code => {
        if (code !== 0) {
            console.error("Controlador Python falhou:", stderr);
            return res.status(500).json({ erro: "Não foi possível processar a autenticação." });
        }

        try {
            const result = JSON.parse(stdout);
            return res.status(result.ok ? 200 : 401).json(result);
        } catch (parseError) {
            console.error("Resposta inválida do controlador Python:", parseError);
            return res.status(500).json({ erro: "Resposta inválida da autenticação." });
        }
    });
    controller.stdin.end(JSON.stringify(payload));
}

function runAdminController(payload, res) {
    const controller = spawn("python", [adminController]);
    let stdout = "";
    let stderr = "";
    controller.stdout.on("data", chunk => { stdout += chunk; });
    controller.stderr.on("data", chunk => { stderr += chunk; });
    controller.on("error", () => res.status(500).json({ error: "Python não está disponível." }));
    controller.on("close", code => {
        if (code !== 0) {
            console.error("Controlador administrativo falhou:", stderr);
            return res.status(500).json({ error: "Não foi possível processar a operação administrativa." });
        }
        try {
            const result = JSON.parse(stdout);
            return res.status(result.ok === false ? 400 : 200).json(result);
        } catch {
            return res.status(500).json({ error: "Resposta inválida do controlador administrativo." });
        }
    });
    controller.stdin.end(JSON.stringify(payload));
}

function requireAdmin(request, response, next) {
    const token = readCookies(request).luneflix_admin;
    const session = token && adminSessions.get(token);
    if (!session || session.expiresAt < Date.now() || !["admin", "manager"].includes(session.admin.role)) {
        return response.status(401).json({ error: "Autenticação administrativa necessária." });
    }
    request.admin = session.admin;
    next();
}

app.get("/admin", (req, res) => res.sendFile(path.join(projectRoot, "front", "pages", "admin.html")));

app.post("/api/admin/login", (req, res) => {
    const controller = spawn("python", [adminController]);
    let stdout = "";
    let stderr = "";
    controller.stdout.on("data", chunk => { stdout += chunk; });
    controller.stderr.on("data", chunk => { stderr += chunk; });
    controller.on("error", () => res.status(500).json({ error: "Python não está disponível." }));
    controller.on("close", code => {
        if (code !== 0) {
            console.error("Login administrativo falhou:", stderr);
            return res.status(500).json({ error: "Não foi possível autenticar o administrador." });
        }
        try {
            const result = JSON.parse(stdout);
            if (!result.ok) return res.status(401).json(result);
            const token = crypto.randomBytes(32).toString("hex");
            adminSessions.set(token, { admin: result.admin, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
            res.setHeader("Set-Cookie", `luneflix_admin=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax`);
            return res.json(result);
        } catch {
            return res.status(500).json({ error: "Resposta inválida do controlador administrativo." });
        }
    });
    controller.stdin.end(JSON.stringify({ action: "login", ...req.body, ip: req.ip }));
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
    const token = readCookies(req).luneflix_admin;
    adminSessions.delete(token);
    res.setHeader("Set-Cookie", "luneflix_admin=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ ok: true, admin: req.admin }));

app.use("/api/admin", requireAdmin);
app.get("/api/admin/dashboard", (req, res) => runAdminController({ action: "dashboard" }, res));
app.get("/api/admin/users", (req, res) => runAdminController({ action: "users", ...req.query }, res));
app.patch("/api/admin/users/:id", (req, res) => runAdminController({ action: "update_user", id: req.params.id, admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.post("/api/admin/users/:id/reset-password", (req, res) => runAdminController({ action: "reset_password", id: req.params.id, admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.delete("/api/admin/users/:id", (req, res) => runAdminController({ action: "delete_user", id: req.params.id, admin_id: req.admin.id, ip: req.ip }, res));
app.get("/api/admin/logs", (req, res) => runAdminController({ action: "logs", ...req.query }, res));
app.get("/api/admin/modules", (req, res) => runAdminController({ action: "modules" }, res));
app.patch("/api/admin/modules/:key", (req, res) => runAdminController({ action: "toggle_module", key: req.params.key, admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.get("/api/admin/settings", (req, res) => runAdminController({ action: "settings" }, res));
app.put("/api/admin/settings", (req, res) => runAdminController({ action: "update_settings", settings: req.body, admin_id: req.admin.id, ip: req.ip }, res));
app.get("/api/admin/payments", (req, res) => runAdminController({ action: "payments" }, res));
app.get("/api/admin/movies", (req, res) => runAdminController({ action: "movies" }, res));
app.post("/api/admin/movies", (req, res) => runAdminController({ action: "create_movie", admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.get("/api/admin/coupons", (req, res) => runAdminController({ action: "coupons" }, res));
app.post("/api/admin/coupons", (req, res) => runAdminController({ action: "create_coupon", admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.get("/api/admin/catalog", async (req, res) => {
    try { res.json({ ok: true, data: await catalogService.list(req.query.type) }); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});
app.post("/api/admin/catalog", async (req, res) => {
    try {
        let payload = req.body;
        if (payload.imdb_id && !payload.title) {
            if (!/^tt\d+$/.test(payload.imdb_id)) return res.status(400).json({ ok: false, error: "IMDb ID inválido." });
            const details = await catalogService.externalFetch(`/find/${encodeURIComponent(payload.imdb_id)}?external_source=imdb_id&language=pt-BR`);
            const match = (details.movie_results || [])[0];
            if (!match) return res.status(404).json({ ok: false, error: "Filme não encontrado no TMDB." });
            const full = await catalogService.externalFetch(`/movie/${match.id}?language=pt-BR&append_to_response=external_ids`);
            payload = catalogService.normalizeExternal({ ...match, media_type: "movie", imdb_id: payload.imdb_id }, full);
        }
        const item = await catalogService.save(payload);
        await catalogService.runCatalog({ action: "log", type: "FILME_ADICIONADO", details: `Catálogo atualizado: ${item.title}`, user_id: req.admin.id, ip: req.ip });
        res.status(201).json({ ok: true, data: item });
    } catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
app.delete("/api/admin/catalog/:type/:id", async (req, res) => {
    try {
        const result = await catalogService.runCatalog({ action: "delete", type: req.params.type, id: req.params.id });
        await catalogService.runCatalog({ action: "log", type: "FILME_REMOVIDO", details: `Item removido: ${req.params.id}`, user_id: req.admin.id, ip: req.ip });
        res.json(result);
    } catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
app.get("/api/admin/catalog/logs", async (req, res) => {
    try { res.json(await catalogService.runCatalog({ action: "logs" })); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

app.post("/api/register", (req, res) => runAuthController({ action: "register", ...req.body }, res));
app.post("/api/login", (req, res) => runAuthController({ action: "login", ...req.body, ip: req.ip }, res));

async function catalogResponse(type) {
    const local = await catalogService.list(type);
    if (local.length) return { page: 1, results: local, total_results: local.length, total_pages: 1 };
    const endpoint = type === "movie" ? "/movie/popular?language=pt-BR&page=1" : "/tv/popular?language=pt-BR&page=1";
    const response = await catalogService.externalFetch(endpoint);
    const results = [];
    for (const item of (response.results || []).slice(0, 10)) {
        const details = await catalogService.externalFetch(type === "movie" ? `/movie/${item.id}?language=pt-BR&append_to_response=external_ids` : `/tv/${item.id}?language=pt-BR&append_to_response=external_ids`);
        const normalized = catalogService.normalizeExternal({ ...item, media_type: type === "movie" ? "movie" : "tv" }, details);
        if (normalized.type === "series" || normalized.imdb_id) results.push(await catalogService.save(normalized));
    }
    return { page: 1, results, total_results: results.length, total_pages: 1 };
}

app.get("/api/filmes", async (req, res) => {
    try { res.json(await catalogResponse("movie")); }
    catch (error) { await catalogService.runCatalog({ action: "log", type: "API_ERROR", details: error.message }); res.status(503).json({ erro: "Catálogo de filmes temporariamente indisponível." }); }
});
app.get("/api/series", async (req, res) => {
    try { res.json(await catalogResponse("series")); }
    catch (error) { await catalogService.runCatalog({ action: "log", type: "API_ERROR", details: error.message }); res.status(503).json({ erro: "Catálogo de séries temporariamente indisponível." }); }
});
app.get("/api/movies", (req, res) => catalogResponse("movie").then(data => res.json(data)).catch(error => res.status(503).json({ error: error.message })));
app.get("/api/search", async (req, res) => {
    const query = String(req.query.q || req.query.query || "").trim();
    if (!query) return res.status(400).json({ error: "Informe uma pesquisa." });
    try { res.json({ page: 1, results: await catalogService.search(query, req.ip), total_results: 1 }); }
    catch (error) { await catalogService.runCatalog({ action: "log", type: "API_ERROR", details: error.message, ip: req.ip }); res.status(503).json({ error: "A pesquisa externa está temporariamente indisponível." }); }
});
app.get("/api/pesquisa", (req, res) => {
    req.query.q = req.query.query;
    return app._router.handle(req, res, () => {});
});
app.get("/api/player", (req, res) => {
    const type = req.query.type === "series" ? "series" : "movie";
    const item = { type, imdb_id: req.query.imdb_id, tmdb_id: req.query.tmdb_id };
    const url = catalogService.playerUrl(item, req.query.season, req.query.episode);
    if (!url) return res.status(400).json({ error: "IDs de reprodução inválidos." });
    res.json({ url });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`LUNEFLIX rodando em http://localhost:${PORT}`);
});