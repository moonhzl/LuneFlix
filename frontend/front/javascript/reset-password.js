const form = document.getElementById("resetForm");
const message = document.getElementById("message");
const token = new URLSearchParams(window.location.search).get("token");

form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (!token) { message.textContent = "Link de recuperação inválido."; return; }
    if (password !== confirmPassword) { message.textContent = "As senhas não são iguais."; return; }
    try {
        const response = await fetch("/api/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível redefinir a senha.");
        message.textContent = "Senha alterada. Você já pode fazer login.";
        form.reset();
    } catch (error) { message.textContent = error.message; }
});
