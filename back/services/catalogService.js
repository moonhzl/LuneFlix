const path = require("path");
const { spawn } = require("child_process");

const controller = path.join(__dirname, "..", "controllers", "catalogController.py");
const API_URL = process.env.TMDB_API_URL || "https://api.themoviedb.org/3";
const API_TOKEN = process.env.TMDB_API_TOKEN;
const VIDEO_PROVIDER = process.env.VIDEO_PROVIDER || "embedmovies";
const pythonCommand = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const externalRequests = new Map();
const rateWindow = new Map();

function runCatalog(payload) {
    return new Promise((resolve, reject) => {
        const process = spawn(pythonCommand, [controller]);
        let stdout = "";
        let stderr = "";
        process.stdout.on("data", chunk => { stdout += chunk; });
        process.stderr.on("data", chunk => { stderr += chunk; });
        process.on("error", reject);
        process.on("close", code => {
            try {
                const result = JSON.parse(stdout);
                if (code !== 0 || !result.ok) return reject(new Error(result.error || stderr || "Operação de catálogo recusada."));
                if (!result.ok) return reject(new Error(result.error || "Operação de catálogo recusada."));
                resolve(result);
            } catch (error) {
                if (code !== 0) return reject(new Error(stderr || "Controlador de catálogo indisponível."));
                reject(new Error(`Resposta inválida do catálogo: ${error.message}`));
            }
        });
        process.stdin.end(JSON.stringify(payload));
    });
}

function playerUrl(item, season, episode) {
    if (VIDEO_PROVIDER === "legacy") return item.video_url || null;
    if (item.type === "movie" && /^tt\d+$/.test(item.imdb_id || "")) return `https://myembed.biz/filme/${item.imdb_id}`;
    if (item.type === "series" && /^\d+$/.test(String(item.tmdb_id || ""))) {
        const suffix = season && episode ? `/${Number(season)}/${Number(episode)}` : "";
        return `https://myembed.biz/serie/${item.tmdb_id}${suffix}`;
    }
    return null;
}

function publicItem(item) {
    return {
        ...item,
        poster_path: item.poster ? item.poster.replace("https://image.tmdb.org/t/p/w500", "") : null,
        backdrop_path: item.backdrop ? item.backdrop.replace("https://image.tmdb.org/t/p/original", "") : null,
        name: item.type === "series" ? item.title : undefined,
        media_type: item.type === "series" ? "tv" : "movie",
        release_date: item.release_date,
        first_air_date: item.first_air_date,
        vote_average: item.rating,
        player_url: playerUrl(item)
    };
}

function normalizeExternal(item, details) {
    const type = item.media_type === "tv" || item.type === "series" ? "series" : "movie";
    const source = details || item;
    const externalIds = source.external_ids || {};
    return {
        id: type === "movie" ? externalIds.imdb_id || source.imdb_id || item.imdb_id || `tmdb_${item.id}` : `tmdb_${item.id}`,
        type,
        title: source.title || source.name || item.title || item.name || "Sem título",
        original_title: source.original_title || source.original_name || item.original_title || item.original_name,
        imdb_id: externalIds.imdb_id || source.imdb_id || item.imdb_id || null,
        tmdb_id: Number(item.id || source.id),
        rating: Number(source.vote_average || item.vote_average || 0),
        overview: source.overview || item.overview || "",
        poster: source.poster_path ? `https://image.tmdb.org/t/p/w500${source.poster_path}` : null,
        backdrop: source.backdrop_path ? `https://image.tmdb.org/t/p/original${source.backdrop_path}` : null,
        release_date: source.release_date || item.release_date || null,
        first_air_date: source.first_air_date || item.first_air_date || null,
        genres: (source.genres || []).map(genre => typeof genre === "string" ? genre : genre.name),
        runtime: source.runtime || null,
        seasons: source.seasons || []
    };
}

function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function scoreSearchRelevance(query, item) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return 0;
    const title = normalizeSearchText(item.title || item.name || "");
    const originalTitle = normalizeSearchText(item.original_title || item.original_name || "");
    const haystacks = [title, originalTitle];
    let score = 0;

    if (haystacks.some(value => value === normalizedQuery)) score += 100;
    if (haystacks.some(value => value.startsWith(normalizedQuery))) score += 30;
    if (haystacks.some(value => value.includes(normalizedQuery))) score += 20;

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (queryTokens.length) {
        const matchingTokens = queryTokens.filter(token => haystacks.some(value => value.includes(token))).length;
        score += (matchingTokens / queryTokens.length) * 25;
    }

    const similarity = Math.max(
        ...haystacks.map(value => value ? (1 - levenshteinDistance(normalizedQuery, value) / Math.max(normalizedQuery.length, value.length, 1)) : 0)
    );
    score += similarity * 15;
    score += Number(item.rating || item.vote_average || 0) * 0.3;
    return score;
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[b.length][a.length];
}

async function externalFetch(endpoint) {
    if (!API_TOKEN) throw new Error("TMDB_API_TOKEN não configurado.");
    const response = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`TMDB retornou HTTP ${response.status}`);
    return response.json();
}

async function withRateLimit(key, operation) {
    const now = Date.now();
    const recent = (rateWindow.get(key) || []).filter(timestamp => now - timestamp < 60000);
    if (recent.length >= 20) throw new Error("Limite temporário de pesquisas externas atingido.");
    recent.push(now);
    rateWindow.set(key, recent);
    return operation();
}

async function search(query, clientKey = "anonymous") {
    const local = await module.exports.runCatalog({ action: "search", query });
    const cacheKey = query.trim().toLowerCase();
    const request = externalRequests.get(cacheKey) || withRateLimit(clientKey, async () => {
        const pages = await Promise.all([1, 2].map(page => module.exports.externalFetch(`/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&page=${page}&include_adult=false`)));
        const candidates = pages.flatMap(result => result.results || [])
            .filter(item => item.media_type === "movie" || item.media_type === "tv")
            .filter((item, index, items) => items.findIndex(candidate => `${candidate.media_type}:${candidate.id}` === `${item.media_type}:${item.id}`) === index)
            .slice(0, 40);
        const normalized = [];
        for (const item of candidates) {
            const endpoint = item.media_type === "movie" ? `/movie/${item.id}?language=pt-BR&append_to_response=external_ids` : `/tv/${item.id}?language=pt-BR&append_to_response=external_ids`;
            const details = await module.exports.externalFetch(endpoint);
            const normalizedItem = normalizeExternal(item, details);
            if ((normalizedItem.type === "movie" && normalizedItem.imdb_id) || normalizedItem.type === "series") {
                normalized.push(await module.exports.runCatalog({ action: "upsert", item: normalizedItem }).then(response => response.data));
            }
        }
        return normalized;
    });
    if (!externalRequests.has(cacheKey)) externalRequests.set(cacheKey, request);
    try {
        const external = (await request).map(publicItem);
        const combined = [...external, ...local.data.map(publicItem)];
        const unique = new Map();
        combined.forEach(item => {
            const key = item.imdb_id || `${item.media_type}:${item.tmdb_id}`;
            if (!unique.has(key)) unique.set(key, item);
        });
        return [...unique.values()].sort((a, b) => scoreSearchRelevance(query, b) - scoreSearchRelevance(query, a));
    } catch (error) {
        if (local.data.length) return local.data.map(publicItem);
        throw error;
    } finally {
        if (externalRequests.get(cacheKey) === request) externalRequests.delete(cacheKey);
    }
}

async function list(type) {
    const result = await runCatalog({ action: "list", type });
    return result.data.map(publicItem);
}

async function getSeason(tmdbId, season) {
    if (!/^\d+$/.test(String(tmdbId)) || !/^\d+$/.test(String(season))) throw new Error("Temporada inválida.");
    const data = await externalFetch(`/tv/${tmdbId}/season/${Number(season)}?language=pt-BR`);
    return { season_number: data.season_number, episodes: (data.episodes || []).map(episode => ({ episode_number: episode.episode_number, name: episode.name, overview: episode.overview, still_path: episode.still_path, air_date: episode.air_date })) };
}

async function save(item) {
    const result = await runCatalog({ action: "upsert", item });
    return publicItem(result.data);
}

module.exports = { list, playerUrl, runCatalog, save, search, normalizeExternal, externalFetch, getSeason };