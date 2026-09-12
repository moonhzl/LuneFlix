const path = require("path");
const { spawn } = require("child_process");

const controller = path.join(__dirname, "..", "controllers", "catalogController.py");
const API_URL = (process.env.TMDB_API_URL || "https://api.themoviedb.org/3").replace(/\/+$/, "");
const API_TOKEN = (process.env.TMDB_API_TOKEN || "").trim();
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

const GENERIC_SEARCH_WORDS = new Set(["a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "um", "uma", "the", "of", "and", "in"]);

function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function queryTokens(query) {
    const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
    const meaningful = tokens.filter(token => !GENERIC_SEARCH_WORDS.has(token));
    return meaningful.length ? meaningful : tokens;
}

function tokenSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.startsWith(b) || b.startsWith(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

function fieldScore(tokens, normalizedQuery, field, weight) {
    if (!field) return 0;
    const fieldTokens = field.split(" ").filter(Boolean);
    const exactMatches = tokens.filter(token => fieldTokens.includes(token)).length;
    const containedMatches = tokens.filter(token => field.includes(token)).length;
    const fuzzyMatches = tokens.filter(token => fieldTokens.some(candidate => tokenSimilarity(token, candidate) >= (token.length <= 4 ? 0.8 : 0.72))).length;
    let score = 0;

    if (field === normalizedQuery) score += 100;
    else if (field.startsWith(normalizedQuery)) score += 80;
    else if (field.includes(normalizedQuery)) score += 68;
    if (exactMatches === tokens.length) score += 60;
    else if (containedMatches) score += (containedMatches / tokens.length) * 48;
    if (fuzzyMatches === tokens.length && !exactMatches) score += 35;
    else if (fuzzyMatches) score += (fuzzyMatches / tokens.length) * 20;
    return score * weight;
}

function scoreSearchRelevance(query, item) {
    const normalizedQuery = normalizeSearchText(query);
    const tokens = queryTokens(query);
    if (!normalizedQuery || !tokens.length) return 0;
    const title = normalizeSearchText(item.title || item.name || "");
    const originalTitle = normalizeSearchText(item.original_title || item.original_name || "");
    const keywords = (item.search_keywords || item.keywords || []).map(normalizeSearchText).filter(Boolean).join(" ");
    const titleScore = fieldScore(tokens, normalizedQuery, title, 1);
    const originalScore = fieldScore(tokens, normalizedQuery, originalTitle, 0.82);
    const keywordScore = fieldScore(tokens, normalizedQuery, keywords, 0.35);
    const score = Math.max(titleScore, originalScore, keywordScore);
    return score + Math.min(Number(item.rating || item.vote_average || 0), 10) * 0.1;
}

function hasStrongTokenCoverage(query, item) {
    const tokens = queryTokens(query);
    if (tokens.length < 2) return scoreSearchRelevance(query, item) >= 18;
    const fields = [item.title || item.name, item.original_title || item.original_name, ...(item.search_keywords || item.keywords || [])]
        .map(normalizeSearchText)
        .filter(Boolean);
    return fields.some(field => {
        const fieldTokens = field.split(" ");
        return tokens.every(token => fieldTokens.some(candidate => tokenSimilarity(token, candidate) >= (token.length <= 4 ? 0.8 : 0.72)));
    });
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
    // O TMDB fornece dois formatos válidos: Read Access Token (JWT, enviado
    // como Bearer) e API Key v3. Aceitar ambos evita que uma configuração v3
    // existente faça toda a busca cair silenciosamente no cache local.
    const isReadAccessToken = API_TOKEN.startsWith("eyJ");
    const url = isReadAccessToken
        ? `${API_URL}${endpoint}`
        : `${API_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(API_TOKEN)}`;
    const response = await fetch(url, {
        headers: { ...(isReadAccessToken ? { Authorization: `Bearer ${API_TOKEN}` } : {}), "Content-Type": "application/json" },
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

async function mapWithConcurrency(items, limit, mapper) {
    const results = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await mapper(items[index]);
        }
    }));
    return results;
}

function searchVariants(query) {
    const normalized = normalizeSearchText(query);
    const tokens = queryTokens(query);
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
    // A curta consulta de prefixo só é usada como fallback para erros pequenos como
    // "interstelar"; ela evita transformar cada pesquisa em várias requisições.
    const prefix = longest && longest.length >= 6 ? longest.slice(0, Math.min(5, longest.length - 1)) : null;
    return { normalized, fallback: prefix && prefix !== normalized ? prefix : null };
}

function tmdbDetailsEndpoint(item) {
    const resource = item.media_type === "movie" ? "movie" : "tv";
    return `/${resource}/${item.id}?language=pt-BR&append_to_response=external_ids,keywords`;
}

function externalKeywordNames(details) {
    const values = details?.keywords?.keywords || details?.keywords?.results || [];
    return values.map(keyword => keyword.name).filter(Boolean);
}

function searchEndpoint(type, query, page) {
    return `/search/${type}?query=${encodeURIComponent(query)}&language=pt-BR&page=${page}&include_adult=false`;
}

function typedResults(response, mediaType) {
    return (response.results || []).map(item => ({ ...item, media_type: mediaType }));
}

async function search(query, clientKey = "anonymous") {
    const local = await module.exports.runCatalog({ action: "search", query });
    const { normalized, fallback } = searchVariants(query);
    const cacheKey = normalized;
    const request = externalRequests.get(cacheKey) || withRateLimit(clientKey, async () => {
        let searchResponses;
        if (/^tt\d+$/i.test(query.trim())) {
            const found = await module.exports.externalFetch(`/find/${encodeURIComponent(query.trim())}?external_source=imdb_id&language=pt-BR`);
            searchResponses = [{ results: [...(found.movie_results || []).map(item => ({ ...item, media_type: "movie" })), ...(found.tv_results || []).map(item => ({ ...item, media_type: "tv" }))] }];
        } else {
            // As rotas específicas impedem que resultados de pessoas/coleções do
            // multi-search ocupem a página antes de filmes e séries relevantes.
            const [moviePage, tvPage] = await Promise.all([
                module.exports.externalFetch(searchEndpoint("movie", query, 1)),
                module.exports.externalFetch(searchEndpoint("tv", query, 1))
            ]);
            const firstCandidates = [...typedResults(moviePage, "movie"), ...typedResults(tvPage, "tv")];
            const hasRelevantCandidate = firstCandidates.some(item => hasStrongTokenCoverage(query, item));
            const extraResponses = [];
            if (firstCandidates.length < 8) {
                const [movieNextPage, tvNextPage] = await Promise.all([
                    module.exports.externalFetch(searchEndpoint("movie", query, 2)),
                    module.exports.externalFetch(searchEndpoint("tv", query, 2))
                ]);
                extraResponses.push({ results: typedResults(movieNextPage, "movie") }, { results: typedResults(tvNextPage, "tv") });
            }
            if (!hasRelevantCandidate && fallback) {
                extraResponses.push(await module.exports.externalFetch(`/search/multi?query=${encodeURIComponent(fallback)}&language=pt-BR&page=1&include_adult=false`));
            }
            searchResponses = [{ results: firstCandidates }, ...extraResponses];
        }
        const candidates = searchResponses.flatMap(result => result.results || [])
            .filter(item => item.media_type === "movie" || item.media_type === "tv")
            .filter((item, index, items) => items.findIndex(candidate => `${candidate.media_type}:${candidate.id}` === `${item.media_type}:${item.id}`) === index)
            .sort((a, b) => scoreSearchRelevance(query, b) - scoreSearchRelevance(query, a))
            .slice(0, 12);
        return mapWithConcurrency(candidates, 4, async item => {
            const details = await module.exports.externalFetch(tmdbDetailsEndpoint(item));
            const normalizedItem = normalizeExternal(item, details);
            if (!((normalizedItem.type === "movie" && normalizedItem.imdb_id) || normalizedItem.type === "series")) return null;
            const saved = (await module.exports.runCatalog({ action: "upsert", item: normalizedItem })).data;
            return { ...saved, search_keywords: externalKeywordNames(details) };
        });
    });
    if (!externalRequests.has(cacheKey)) externalRequests.set(cacheKey, request);
    try {
        const external = (await request).filter(Boolean).map(publicItem);
        const combined = [...external, ...local.data.map(publicItem)];
        const unique = new Map();
        combined.forEach(item => {
            const key = item.imdb_id || `${item.media_type}:${item.tmdb_id}`;
            if (!unique.has(key)) unique.set(key, item);
        });
        const isImdbSearch = /^tt\d+$/i.test(query.trim());
        return [...unique.values()]
            .map(item => ({ item, score: scoreSearchRelevance(query, item) }))
            .filter(({ item, score }) => isImdbSearch || (score >= 18 && hasStrongTokenCoverage(query, item)))
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(({ item }) => { delete item.search_keywords; return item; });
    } catch (error) {
        const localResults = local.data
            .map(publicItem)
            .filter(item => hasStrongTokenCoverage(query, item));
        if (localResults.length) return localResults;
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
