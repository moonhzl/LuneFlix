const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

let server;
const port = 3217;

function waitForServer() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Servidor não iniciou a tempo.")), 8000);
        server.stdout.on("data", chunk => {
            if (chunk.toString().includes(`localhost:${port}`)) {
                clearTimeout(timeout);
                resolve();
            }
        });
        server.on("error", reject);
    });
}

test.before(async () => {
    server = spawn(process.execPath, ["back/server.js"], { env: { ...process.env, PORT: String(port) } });
    await waitForServer();
});

test.after(() => server.kill());

test("recusa sessão ausente", async () => {
    const response = await fetch(`http://localhost:${port}/api/me`);
    assert.equal(response.status, 401);
});

test("recusa player sem sessão", async () => {
    const response = await fetch(`http://localhost:${port}/api/player?type=movie&imdb_id=tt1234567`);
    assert.equal(response.status, 401);
});

test("recuperação não revela se o e-mail existe", async () => {
    const response = await fetch(`http://localhost:${port}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nao-existe@example.com" })
    });
    const data = await response.json();
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        assert.equal(response.status, 200);
        assert.equal(data.ok, true);
        assert.match(data.message, /Se o e-mail existir/);
    } else {
        assert.equal(response.status, 503);
    }
});

test("a busca prioriza o título mais relevante para a query", async () => {
    const catalogService = require("../back/services/catalogService");
    const originalRunCatalog = catalogService.runCatalog;
    const originalExternalFetch = catalogService.externalFetch;

    catalogService.runCatalog = async payload => {
        if (payload.action === "search") {
            return { ok: true, data: [] };
        }
        if (payload.action === "upsert") {
            return { ok: true, data: { ...payload.item, title: payload.item.title || "Sem título", id: String(payload.item.tmdb_id || payload.item.imdb_id || "local") } };
        }
        throw new Error(`Ação inesperada: ${payload.action}`);
    };

    catalogService.externalFetch = async endpoint => {
        if (endpoint.includes("/search/multi")) {
            return {
                results: [
                    { id: 11, media_type: "movie", title: "Titans: O Ataque", original_title: "Titans: The Attack", vote_average: 6.2, overview: "" },
                    { id: 22, media_type: "movie", title: "Clash of the Titans", original_title: "Clash of the Titans", vote_average: 7.8, overview: "" },
                    { id: 33, media_type: "movie", title: "Titanes da Guerra", original_title: "Titanes da Guerra", vote_average: 5.9, overview: "" }
                ]
            };
        }
        if (endpoint.includes("/movie/11")) {
            return { id: 11, title: "Titans: O Ataque", original_title: "Titans: The Attack", imdb_id: "tt11", vote_average: 6.2, overview: "", poster_path: null, backdrop_path: null, release_date: "2008-01-01", genres: [{ name: "Ação" }] };
        }
        if (endpoint.includes("/movie/22")) {
            return { id: 22, title: "Clash of the Titans", original_title: "Clash of the Titans", imdb_id: "tt22", vote_average: 7.8, overview: "", poster_path: null, backdrop_path: null, release_date: "2010-03-26", genres: [{ name: "Fantasia" }] };
        }
        if (endpoint.includes("/movie/33")) {
            return { id: 33, title: "Titanes da Guerra", original_title: "Titanes da Guerra", imdb_id: "tt33", vote_average: 5.9, overview: "", poster_path: null, backdrop_path: null, release_date: "2014-01-01", genres: [{ name: "Ação" }] };
        }
        return {};
    };

    try {
        const results = await catalogService.search("clash of the titans");
        assert.equal(results[0].title, "Clash of the Titans");
        assert.ok(results[0].rating >= 7);
    } finally {
        catalogService.runCatalog = originalRunCatalog;
        catalogService.externalFetch = originalExternalFetch;
    }
});
