require("dotenv").config({
    path: require("path").join(__dirname, ".env")
});

const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

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
app.get("/api/admin/logs", (req, res) => runAdminController({ action: "logs" }, res));
app.get("/api/admin/modules", (req, res) => runAdminController({ action: "modules" }, res));
app.patch("/api/admin/modules/:key", (req, res) => runAdminController({ action: "toggle_module", key: req.params.key, admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.get("/api/admin/settings", (req, res) => runAdminController({ action: "settings" }, res));
app.put("/api/admin/settings", (req, res) => runAdminController({ action: "update_settings", settings: req.body, admin_id: req.admin.id, ip: req.ip }, res));
app.get("/api/admin/payments", (req, res) => runAdminController({ action: "payments" }, res));
app.get("/api/admin/movies", (req, res) => runAdminController({ action: "movies" }, res));
app.post("/api/admin/movies", (req, res) => runAdminController({ action: "create_movie", admin_id: req.admin.id, ip: req.ip, ...req.body }, res));
app.get("/api/admin/coupons", (req, res) => runAdminController({ action: "coupons" }, res));
app.post("/api/admin/coupons", (req, res) => runAdminController({ action: "create_coupon", admin_id: req.admin.id, ip: req.ip, ...req.body }, res));

app.post("/api/register", (req, res) => runAuthController({ action: "register", ...req.body }, res));
app.post("/api/login", (req, res) => runAuthController({ action: "login", ...req.body }, res));

// Função para consultar a API do TMDB
async function tmdbFetch(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`TMDB retornou HTTP ${response.status}`);
    }

    return await response.json();
}

// Filmes populares
app.get("/api/filmes", async (req, res) => {
    try {
        const dados = await tmdbFetch(
            "/movie/popular?language=pt-BR&page=1"
        );

        res.json(dados);
    } catch (erro) {
        console.error("Erro ao buscar filmes:", erro);

        res.status(500).json({
            erro: "Não foi possível carregar os filmes."
        });
    }
});

// Séries populares
app.get("/api/series", async (req, res) => {
    try {
        const dados = await tmdbFetch(
            "/tv/popular?language=pt-BR&page=1"
        );

        res.json(dados);
    } catch (erro) {
        console.error("Erro ao buscar séries:", erro);

        res.status(500).json({
            erro: "Não foi possível carregar as séries."
        });
    }
});

// Pesquisa
app.get("/api/pesquisa", async (req, res) => {
    try {
        const query = req.query.query;

        if (!query) {
            return res.status(400).json({
                erro: "Informe uma pesquisa."
            });
        }

        const dados = await tmdbFetch(
            `/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&page=1&include_adult=false`
        );

        res.json(dados);
    } catch (erro) {
        console.error("Erro na pesquisa:", erro);

        res.status(500).json({
            erro: "Não foi possível realizar a pesquisa."
        });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`LUNEFLIX rodando em http://localhost:${PORT}`);
});