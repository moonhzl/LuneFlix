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
