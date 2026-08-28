const registerForm = document.getElementById("registerForm");

const message = document.getElementById("message");

const registerButton =
    document.getElementById("registerButton");

const password =
    document.getElementById("password");

const confirmPassword =
    document.getElementById("confirmPassword");

const togglePassword =
    document.getElementById("togglePassword");

const toggleConfirmPassword =
    document.getElementById("toggleConfirmPassword");


// =========================================
// MOSTRAR / ESCONDER SENHA
// =========================================

togglePassword.addEventListener("click", () => {

    if (password.type === "password") {

        password.type = "text";

        togglePassword.textContent = "Ocultar";

    } else {

        password.type = "password";

        togglePassword.textContent = "Mostrar";
    }

});


toggleConfirmPassword.addEventListener("click", () => {

    if (confirmPassword.type === "password") {

        confirmPassword.type = "text";

        toggleConfirmPassword.textContent = "Ocultar";

    } else {

        confirmPassword.type = "password";

        toggleConfirmPassword.textContent = "Mostrar";
    }

});


// =========================================
// REGISTER
// =========================================

registerForm.addEventListener("submit", async (event) => {

    event.preventDefault();


    const name =
        document.getElementById("name").value.trim();

    const email =
        document.getElementById("email").value.trim();

    const passwordValue =
        password.value;

    const confirmPasswordValue =
        confirmPassword.value;


    clearMessage();


    // Nome

    if (name.length < 2) {

        showMessage(
            "Digite um nome válido.",
            "error"
        );

        return;
    }


    // Email

    if (!isValidEmail(email)) {

        showMessage(
            "Digite um e-mail válido.",
            "error"
        );

        return;
    }


    // Senha

    if (passwordValue.length < 6) {

        showMessage(
            "A senha precisa ter pelo menos 6 caracteres.",
            "error"
        );

        return;
    }


    // Confirmar senha

    if (passwordValue !== confirmPasswordValue) {

        showMessage(
            "As senhas não são iguais.",
            "error"
        );

        return;
    }


    // Loading

    registerButton.disabled = true;

    registerButton.classList.add("loading");


    try {

        /*
         * FUTURO:
         *
         * Aqui vamos conectar com:
         *
         * POST /api/register
         *
         * Exemplo:
         *
         * const response = await fetch(
         *     "http://localhost:3000/api/register",
         *     {
         *         method: "POST",
         *         headers: {
         *             "Content-Type": "application/json"
         *         },
         *         body: JSON.stringify({
         *             name,
         *             email,
         *             password: passwordValue
         *         })
         *     }
         * );
         */


        // Temporário para testar a interface

        await new Promise(resolve => {

            setTimeout(resolve, 1000);

        });


        showMessage(
            "Conta criada com sucesso!",
            "success"
        );


        registerForm.reset();


        setTimeout(() => {

            window.location.href = "login.html";

        }, 1200);


    } catch (error) {

        console.error(error);

        showMessage(
            "Ocorreu um erro ao criar sua conta.",
            "error"
        );

    } finally {

        registerButton.disabled = false;

        registerButton.classList.remove("loading");
    }

});


// =========================================
// VALIDAÇÃO DE EMAIL
// =========================================

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

}


// =========================================
// MENSAGEM
// =========================================

function showMessage(text, type) {

    message.textContent = text;

    message.className =
        `message ${type}`;
}


function clearMessage() {

    message.textContent = "";

    message.className = "message";
}