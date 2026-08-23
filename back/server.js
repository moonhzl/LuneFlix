require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = process.env.TMDB_API_URL;
const API_TOKEN = process.env.TMDB_API_TOKEN;

// Servir os arquivos do frontend
app.use(express.static(__dirname));

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
    console.log(`PiresFlix rodando em http://localhost:${PORT}`);
});