// Defina aqui a URL pública do serviço backend no Railway antes do deploy da Vercel.
// Exemplo: "https://luneflix-production.up.railway.app"
window.LUNEFLIX_API_URL = "";

window.luneflixApiUrl = function (path) {
    const baseUrl = window.LUNEFLIX_API_URL || window.location.origin;
    return `${baseUrl.replace(/\/$/, "")}${path}`;
};
