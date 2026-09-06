const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const togglePassword = document.getElementById("togglePassword");

const loginButton = document.getElementById("loginButton");
const githubPagesDemo = window.location.hostname.endsWith(".github.io");
const demoEmail = "demo@luneflix.test";
const demoPassword = "LuneflixDemo2026!";


// ============================
// MOSTRAR / OCULTAR SENHA
// ============================

togglePassword.addEventListener("click", () => {

    const isPassword =
        passwordInput.type === "password";

    passwordInput.type =
        isPassword ? "text" : "password";

    togglePassword.textContent =
        isPassword ? "Ocultar" : "Mostrar";
});


// ============================
// LOGIN
// ============================

loginForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        return;
    }

    // Ativa animação
    loginButton.classList.add("loading");
    loginButton.disabled = true;

    try {
        if (githubPagesDemo) {
            if (email !== demoEmail || password !== demoPassword) {
                throw new Error("Use as credenciais de demonstração do GitHub Pages.");
            }

            if (document.getElementById("remember").checked) {
                localStorage.setItem("luneflixUser", JSON.stringify({
                    name: "Demonstração",
                    email: demoEmail,
                    role: "user",
                    demo: true
                }));
            }
            window.location.href = "home.html";
            return;
        }

        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "E-mail ou senha inválidos.");
        }

        if (document.getElementById("remember").checked) {
            localStorage.setItem("luneflixUser", JSON.stringify(data.user));
        }
        window.location.href = "home.html";
    } catch (error) {
        alert(error.message);
        loginButton.classList.remove("loading");
        loginButton.disabled = false;
    }
});


// ============================
// ESQUECI MINHA SENHA
// ============================

document
    .getElementById("forgotPassword")
    .addEventListener("click", (event) => {

        event.preventDefault();

        alert(
            "Sistema de recuperação de senha."
        );
    });


// ============================
// GOOGLE
// ============================

document
    .querySelector(".social-login")
    .addEventListener("click", () => {

        console.log(
            "Iniciar autenticação com Google"
        );

    });