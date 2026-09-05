require("dotenv").config({
    path: require("path").join(__dirname, ".env")
});

const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = process.env.TMDB_API_URL;
const API_TOKEN = process.env.TMDB_API_TOKEN;

const projectRoot = path.join(__dirname, "..");
const authController = path.join(__dirname, "controllers", "authController.py");

app.use(express.json());

// Servir todo o projeto (index.html, front/, etc.)
app.use(express.static(projectRoot));

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