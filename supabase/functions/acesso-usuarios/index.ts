// Edge Function acesso-usuarios (Central de Acesso, Fase 2). Modelo: sst-usuarios do SST.
// Operações do Auth que exigem a chave secreta. Tudo é feito pelo ADMIN da Central, exceto "senha_trocada".
//   { acao: "criar", nome, email, setor_id? } → { id, senha }   senha provisória, aparece uma vez só
//   { acao: "redefinir_senha", id }            → { senha }
//   { acao: "bloquear", id, bloquear: bool }   → { ok }         bloqueia no Auth e na Central
//   { acao: "senha_trocada" }                  → { ok }         o próprio usuário, depois de criar a senha dele
// A senha nunca é gravada em tabela. O domínio do e-mail é conferido pelo gancho hook_sge_emails_permitidos.
// verify_jwt=false de propósito: o pré-voo do navegador (OPTIONS) não leva token; a função valida o login ela mesma.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.1";

const ORIGENS = new Set([
  "https://grupogps-mecanizada.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function cors(req: Request): Record<string, string> {
  const origem = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.has(origem) ? origem : "https://grupogps-mecanizada.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function resposta(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const chave = (variavel: string) => {
  const bruto = Deno.env.get(variavel);
  if (!bruto) throw new Error(`${variavel} ausente`);
  const obj = JSON.parse(bruto) as Record<string, string>;
  return obj["default"] ?? Object.values(obj)[0];
};

let admin: SupabaseClient | null = null;
/** Cliente com chave secreta: só para as operações do Auth que o usuário não pode fazer sozinho. */
function clienteAdmin(): SupabaseClient {
  admin ??= createClient(URL_SUPABASE, chave("SUPABASE_SECRET_KEYS"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

interface Usuario {
  id: string;
  adminCentral: boolean;
  /** Cliente com o login do usuário: o RLS vale e o histórico registra quem fez. */
  db: SupabaseClient<any, "gps_compartilhado">;
}

async function autenticar(req: Request): Promise<Usuario> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ErroHttp(401, "Não autenticado");
  const db = createClient(URL_SUPABASE, chave("SUPABASE_PUBLISHABLE_KEYS"), {
    db: { schema: "gps_compartilhado" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ErroHttp(401, "Sessão inválida ou expirada");
  const { data: perm } = await db.schema("public").rpc("sge_minhas_permissoes", { p_slug: "sge_hub" });
  return { id: data.user.id, adminCentral: perm?.admin_central === true, db };
}

function exigirAdmin(u: Usuario) {
  if (!u.adminCentral) throw new ErroHttp(403, "Só o administrador da Central pode fazer isso");
}

// Senha provisória fácil de ditar: Palavra-Palavra-1234 (~ 34 bits; vale só até o primeiro acesso).
const PALAVRAS = [
  "Laranja", "Trator", "Janela", "Martelo", "Cadeira", "Montanha", "Caneta", "Garrafa", "Floresta", "Tijolo",
  "Bicicleta", "Lanterna", "Escada", "Telhado", "Parafuso", "Caminhao", "Girassol", "Pipoca", "Relogio", "Baleia",
  "Coruja", "Abacaxi", "Foguete", "Panela", "Vassoura", "Cachoeira", "Guitarra", "Tartaruga", "Morango", "Planeta",
];
function senhaProvisoria(): string {
  const n = crypto.getRandomValues(new Uint32Array(3));
  const p1 = PALAVRAS[n[0] % PALAVRAS.length];
  let p2 = PALAVRAS[n[1] % PALAVRAS.length];
  if (p2 === p1) p2 = PALAVRAS[(n[1] + 1) % PALAVRAS.length];
  return `${p1}-${p2}-${String(n[2] % 10000).padStart(4, "0")}`;
}

const emailValido = (e: unknown): e is string => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const idValido = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, { erro: "Use POST" }, 405);
  try {
    const u = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));

    switch (corpo.acao) {
      case "criar": {
        exigirAdmin(u);
        const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
        if (nome.length < 2) throw new ErroHttp(400, "Informe o nome");
        if (!emailValido(corpo.email)) throw new ErroHttp(400, "E-mail inválido");
        const email = corpo.email.trim().toLowerCase();
        const senha = senhaProvisoria();
        const { data, error } = await clienteAdmin().auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true, // não depende do e-mail da empresa; quem garante é o cadastro do admin
          app_metadata: { trocar_senha: true },
          user_metadata: { nome },
        });
        if (error) {
          // O gancho de domínio devolve a mensagem dele; e-mail repetido também cai aqui.
          throw new ErroHttp(400, /already|registered|exists/i.test(error.message)
            ? "Já existe um login com esse e-mail" : error.message);
        }
        const id = data.user.id;
        const { error: e1 } = await u.db.from("sge_central_usuarios").insert({ id, nome, email, is_active: true });
        if (e1) {
          await clienteAdmin().auth.admin.deleteUser(id); // não deixa login sem cadastro na Central
          throw new ErroHttp(400, "Não foi possível cadastrar na Central: " + e1.message);
        }
        if (idValido(corpo.setor_id)) {
          await u.db.from("sge_central_usuario_setores").insert({ usuario_id: id, setor_id: corpo.setor_id });
        }
        return resposta(req, { id, senha });
      }

      case "redefinir_senha": {
        exigirAdmin(u);
        if (!idValido(corpo.id)) throw new ErroHttp(400, "Usuário inválido");
        const senha = senhaProvisoria();
        const { error } = await clienteAdmin().auth.admin.updateUserById(corpo.id, {
          password: senha,
          app_metadata: { trocar_senha: true },
        });
        if (error) throw new ErroHttp(400, error.message);
        return resposta(req, { senha });
      }

      case "bloquear": {
        exigirAdmin(u);
        if (!idValido(corpo.id)) throw new ErroHttp(400, "Usuário inválido");
        if (corpo.id === u.id) throw new ErroHttp(400, "Você não pode bloquear o seu próprio login");
        const bloquear = corpo.bloquear === true;
        const { error } = await clienteAdmin().auth.admin.updateUserById(corpo.id, {
          ban_duration: bloquear ? "876000h" : "none", // ~100 anos = bloqueado até desbloquear
        });
        if (error) throw new ErroHttp(400, error.message);
        const { error: e1 } = await u.db.from("sge_central_usuarios").update({ is_active: !bloquear }).eq("id", corpo.id);
        if (e1) throw new ErroHttp(400, e1.message);
        return resposta(req, { ok: true });
      }

      case "senha_trocada": {
        // O próprio usuário avisa que já criou a senha dele: tira a obrigação de troca.
        const { error } = await clienteAdmin().auth.admin.updateUserById(u.id, { app_metadata: { trocar_senha: false } });
        if (error) throw new ErroHttp(400, error.message);
        return resposta(req, { ok: true });
      }

      default:
        throw new ErroHttp(400, "Ação inválida");
    }
  } catch (e) {
    if (e instanceof ErroHttp) return resposta(req, { erro: e.message }, e.status);
    console.error(e instanceof Error ? e.message : e); // sem dados pessoais
    return resposta(req, { erro: "Erro interno" }, 500);
  }
});
