/* =========================
   CONFIGURAÇÃO
   Usa o backend local como proxy para o TMDB
========================= */

const API_URL = "/api";


/* =========================
   ELEMENTOS
========================= */

const filmesContainer =
    document.getElementById("filmesContainer");

const seriesContainer =
    document.getElementById("seriesContainer");

const pesquisaContainer =
    document.getElementById("pesquisaContainer");

const pesquisa =
    document.getElementById("pesquisa");

const resultadosPesquisa =
    document.getElementById("resultadosPesquisa");

const tituloPesquisa =
    document.getElementById("tituloPesquisa");

const tituloFilmes =
    document.getElementById("tituloFilmes");

const tituloSeries =
    document.getElementById("tituloSeries");

const playerContainer =
    document.getElementById("playerContainer");

const player =
    document.getElementById("player");

const fecharPlayer =
    document.getElementById("fecharPlayer");


/* =========================
   VARIÁVEIS
========================= */

let filmes = [];

let series = [];

let timerPesquisa;


/* =========================
   BUSCAR FILMES POPULARES
========================= */

async function buscarFilmes() {

    try {

        const resposta = await fetch(
            `${API_URL}/filmes`
        );


        if (!resposta.ok) {
            throw new Error(
                `Erro HTTP: ${resposta.status}`
            );
        }


        const dados =
            await resposta.json();


        filmes =
            dados.results || [];


        mostrarFilmes(
            filmes,
            filmesContainer
        );


    } catch (erro) {

        console.error(
            "Erro ao buscar filmes:",
            erro
        );


        filmesContainer.innerHTML = `
            <div class="loading">
                Erro ao carregar os filmes.
                <br><br>
                Verifique se o servidor está rodando (npm start).
            </div>
        `;

    }

}


/* =========================
   BUSCAR SÉRIES POPULARES
========================= */

async function buscarSeries() {

    try {

        const resposta = await fetch(
            `${API_URL}/series`
        );


        if (!resposta.ok) {
            throw new Error(
                `Erro HTTP: ${resposta.status}`
            );
        }


        const dados =
            await resposta.json();


        series =
            dados.results || [];


        mostrarSeries(series);


    } catch (erro) {

        console.error(
            "Erro ao buscar séries:",
            erro
        );


        seriesContainer.innerHTML = `
            <div class="loading">
                Erro ao carregar as séries.
            </div>
        `;

    }

}


/* =========================
   MOSTRAR FILMES
========================= */

function mostrarFilmes(
    lista,
    container
) {

    container.innerHTML = "";


    if (!lista || lista.length === 0) {

        container.innerHTML = `
            <div class="loading">
                Nenhum filme encontrado.
            </div>
        `;

        return;
    }


    lista.forEach(filme => {

        const card =
            criarCard(
                filme,
                "movie"
            );


        container.appendChild(card);

    });

}


/* =========================
   MOSTRAR SÉRIES
========================= */

function mostrarSeries(lista) {

    seriesContainer.innerHTML = "";


    if (!lista || lista.length === 0) {

        seriesContainer.innerHTML = `
            <div class="loading">
                Nenhuma série encontrada.
            </div>
        `;

        return;
    }


    lista.forEach(serie => {

        const card =
            criarCard(
                serie,
                "tv"
            );


        seriesContainer.appendChild(card);

    });

}


/* =========================
   CRIAR CARD
========================= */

function criarCard(
    item,
    tipo
) {

    const card =
        document.createElement("div");


    card.className =
        "filme";


    /* =========================
       IMAGEM
    ========================= */

    let poster;


    if (item.poster_path) {

        poster =
            `https://image.tmdb.org/t/p/w500${item.poster_path}`;

    } else {

        poster =
            "https://via.placeholder.com/500x750/111111/ffffff?text=Sem+Poster";

    }


    /* =========================
       NOME
    ========================= */

    const nome =
        tipo === "movie"
            ? item.title
            : item.name;


    /* =========================
       DATA
    ========================= */

    const data =
        tipo === "movie"
            ? item.release_date
            : item.first_air_date;


    const ano =
        data
            ? data.substring(0, 4)
            : "----";


    /* =========================
       NOTA
    ========================= */

    const nota =
        typeof item.vote_average === "number"
            ? item.vote_average.toFixed(1)
            : "N/A";


    /* =========================
       TIPO
    ========================= */

    const tipoTexto =
        tipo === "movie"
            ? "Filme"
            : "Série";


    /* =========================
       HTML DO CARD
    ========================= */

    card.innerHTML = `

        <img
            class="poster"
            src="${poster}"
            alt="${nome || "Sem título"}"
            loading="lazy"
            onerror="this.src='https://via.placeholder.com/500x750/111111/ffffff?text=Sem+Poster'"
        >

        <div class="info">

            <div class="nome-filme">
                ${nome || "Sem título"}
            </div>

            <div class="detalhes">

                <span>
                    ${ano}
                </span>

                <span class="tipo">
                    ${tipoTexto}
                </span>

                <span class="nota">
                    ⭐ ${nota}
                </span>

            </div>

        </div>

    `;


    /* =========================
       CLIQUE
    ========================= */

    card.addEventListener(
        "click",
        () => abrirFilme(item)
    );


    return card;

}


/* =========================
   PESQUISA
========================= */

pesquisa.addEventListener(
    "input",
    pesquisar
);


function pesquisar() {

    clearTimeout(
        timerPesquisa
    );


    const texto =
        pesquisa.value
            .trim();


    /* =========================
       PESQUISA VAZIA
    ========================= */

    if (!texto) {

        resultadosPesquisa.classList.remove(
            "ativo"
        );


        document.getElementById(
            "filmes"
        ).style.display = "block";


        document.getElementById(
            "series"
        ).style.display = "block";


        tituloFilmes.textContent =
            "Filmes populares";


        tituloSeries.textContent =
            "Séries populares";


        mostrarFilmes(
            filmes,
            filmesContainer
        );


        mostrarSeries(
            series
        );


        return;

    }


    /* =========================
       ATRASO DA PESQUISA
    ========================= */

    timerPesquisa =
        setTimeout(
            () => pesquisarTMDB(texto),
            500
        );

}


/* =========================
   PESQUISAR NO TMDB
========================= */

async function pesquisarTMDB(texto) {
    try {
        document.getElementById("filmes").style.display = "none";
        document.getElementById("series").style.display = "none";
        resultadosPesquisa.classList.add("ativo");
        tituloPesquisa.textContent = `Resultados para "${texto}"`;
        pesquisaContainer.innerHTML = '<div class="loading">Pesquisando...</div>';

        const resposta = await fetch(`${API_URL}/search?q=${encodeURIComponent(texto)}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.error || `Erro HTTP: ${resposta.status}`);

        mostrarResultadosPesquisa((dados.results || []).filter(item => item.media_type === "movie" || item.media_type === "tv"));
    } catch (erro) {
        console.error("Erro na pesquisa:", erro);
        pesquisaContainer.innerHTML = `<div class="loading">${erro.message || "Erro ao pesquisar."}<br><br>Verifique se o servidor está rodando (npm start).</div>`;
    }
}


/* =========================
   MOSTRAR RESULTADOS
========================= */

function mostrarResultadosPesquisa(resultados) {
    pesquisaContainer.innerHTML = "";
    if (!resultados || resultados.length === 0) {
        pesquisaContainer.innerHTML = '<div class="loading">Nenhum filme ou série encontrado.</div>';
        return;
    }
    resultados.forEach(item => pesquisaContainer.appendChild(criarCard(item, item.media_type)));
}


/* =========================
   ABRIR FILME OU SÉRIE
========================= */

function abrirFilme(item) {
    const url = item.player_url;


    /* =========================
       SEGURANÇA
    ========================= */

    if (!url) {

        console.error(
            "Tipo de conteúdo inválido."
        );

        return;

    }


    /* =========================
       ABRIR PLAYER
    ========================= */

    player.src =
        url;


    playerContainer.style.display =
        "block";


    document.body.style.overflow =
        "hidden";

}


/* =========================
   FECHAR PLAYER
========================= */

fecharPlayer.addEventListener(
    "click",
    fechar
);


function fechar() {

    player.src =
        "";


    playerContainer.style.display =
        "none";


    document.body.style.overflow =
        "auto";

}


/* =========================
   BOTÃO HERO
========================= */

function irParaCatalogo() {

    document
        .getElementById("filmes")
        .scrollIntoView({
            behavior: "smooth"
        });

}


/* =========================
   INICIALIZAÇÃO
========================= */

buscarFilmes();

buscarSeries();