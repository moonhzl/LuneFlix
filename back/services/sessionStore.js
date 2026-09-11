const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const memorySessions = new Map();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) : null;

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function createSession(user) {
    const token = createToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL).toISOString();
    if (supabase) {
        const { error } = await supabase.from("sessions").insert({ token_hash: tokenHash, user_id: user.id, user_data: user, expires_at: expiresAt });
        if (error) throw new Error(`Não foi possível salvar a sessão no Supabase: ${error.message}`);
    } else {
        memorySessions.set(tokenHash, { user, expiresAt });
    }
    return { token, expiresAt };
}

async function getSession(token) {
    if (!token) return null;
    const tokenHash = hashToken(token);
    if (supabase) {
        const { data, error } = await supabase.from("sessions").select("user_data, expires_at").eq("token_hash", tokenHash).maybeSingle();
        if (error) throw new Error(`Não foi possível consultar a sessão no Supabase: ${error.message}`);
        if (!data || new Date(data.expires_at).getTime() <= Date.now()) {
            await deleteSession(token);
            return null;
        }
        return { user: data.user_data, expiresAt: new Date(data.expires_at).getTime() };
    }
    const session = memorySessions.get(tokenHash);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
        memorySessions.delete(tokenHash);
        return null;
    }
    return session;
}

async function deleteSession(token) {
    if (!token) return;
    const tokenHash = hashToken(token);
    if (supabase) {
        const { error } = await supabase.from("sessions").delete().eq("token_hash", tokenHash);
        if (error) throw new Error(`Não foi possível remover a sessão do Supabase: ${error.message}`);
    } else {
        memorySessions.delete(tokenHash);
    }
}

function isPersistent() {
    return Boolean(supabase);
}

module.exports = { SESSION_TTL, createSession, getSession, deleteSession, isPersistent };
