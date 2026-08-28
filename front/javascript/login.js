const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const togglePassword = document.getElementById("togglePassword");

const loginButton = document.getElementById("loginButton");


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

    /*
        Aqui você vai conectar seu backend.

        Exemplo:

        const response = await fetch(
            "http://localhost:3000/api/login",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        const data = await response.json();
    */

    // Demonstração — redireciona para a home após login
    setTimeout(() => {

        loginButton.classList.remove("loading");
        loginButton.disabled = false;

        window.location.href = "home.html";

    }, 1200);
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