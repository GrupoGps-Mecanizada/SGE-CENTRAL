/**
 * CENTRAL SGE — SSO Authentication Handler v4
 * Grupo GPS · Autenticação Centralizada · RBAC Enforcement
 * 
 * Usa fetch() direto na REST API do Supabase com header Accept-Profile
 * para acessar o schema gps_compartilhado sem depender do Supabase JS client.
 */

const SSO_SUPABASE_URL = "https://mgcjidryrjqiceielmzp.supabase.co";
const SSO_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";

// Direct REST API helper — queries public schema views
async function ssoQuery(table, params) {
    const url = new URL(`${SSO_SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString(), {
        headers: {
            'apikey': SSO_ANON_KEY,
            'Authorization': `Bearer ${SSO_ANON_KEY}`,
            'Accept': 'application/vnd.pgrst.object+json'
        }
    });

    if (!resp.ok) {
        const text = await resp.text();
        console.warn(`[SGE SSO] Query ${table} failed (${resp.status}):`, text);
        return { data: null, error: { status: resp.status, message: text } };
    }

    const data = await resp.json();
    return { data, error: null };
}

// Same but returns array
async function ssoQueryMany(table, params) {
    const url = new URL(`${SSO_SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString(), {
        headers: {
            'apikey': SSO_ANON_KEY,
            'Authorization': `Bearer ${SSO_ANON_KEY}`,
            'Accept': 'application/json',
            'Accept-Profile': 'gps_compartilhado'
        }
    });

    if (!resp.ok) return { data: [], error: { status: resp.status } };
    const data = await resp.json();
    return { data, error: null };
}

window.SGE_SSO = {
    appSlug: null,
    redirectUrl: null,

    isSSO() {
        return new URLSearchParams(window.location.search).has('app_slug');
    },

    init() {
        const params = new URLSearchParams(window.location.search);
        this.appSlug = params.get('app_slug') || 'sge_hub';
        this.redirectUrl = params.get('redirect') || null;

        console.log(`[SGE SSO v4] Modo SSO para: ${this.appSlug}`);
        console.log(`[SGE SSO v4] Redirect: ${this.redirectUrl || '(nenhum)'}`);

        document.getElementById('sso-view').classList.remove('hidden');
        document.getElementById('sso-app-name').textContent = this.appSlug.replace(/_/g, ' ').toUpperCase();
        document.getElementById('sso-form').addEventListener('submit', (e) => this.handleLogin(e));
    },

    async handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('sso-btn-submit');
        const errEl = document.getElementById('sso-error');
        btn.disabled = true;
        btn.textContent = 'Autenticando...';
        errEl.textContent = '';

        const email = document.getElementById('sso-email').value.trim();
        const pass = document.getElementById('sso-password').value.trim();

        try {
            // ═══ STEP 1: Authenticate via Supabase Auth ═══
            const authClient = window.supabase.createClient(SSO_SUPABASE_URL, SSO_ANON_KEY);
            const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password: pass });
            if (authError) throw new Error('Credenciais inválidas.');
            console.log(`[SGE SSO v4] Auth OK: ${email} (${authData.user.id})`);

            // ═══ STEP 2: RBAC via direct REST API (Accept-Profile: gps_compartilhado) ═══

            // 2a. Is USER globally active? (uses public view)
            const { data: userData, error: userErr } = await ssoQuery('v_sso_usuarios', {
                'select': 'id,nome,is_active',
                'id': `eq.${authData.user.id}`
            });

            console.log('[SGE SSO v4] User check:', { userData, userErr });

            if (userErr || !userData) {
                this.showAccessDenied('SGE Central', 'Seu cadastro não foi encontrado no sistema de governança.');
                return;
            }
            if (!userData.is_active) {
                this.showAccessDenied('SGE Central', 'Sua conta está <strong>bloqueada</strong>.');
                return;
            }
            console.log(`[SGE SSO v4] ✓ Usuário ativo: ${userData.nome}`);

            // 2b. Is SYSTEM active? (uses public view)
            const { data: sysData, error: sysErr } = await ssoQuery('v_sso_sistemas', {
                'select': 'id,nome',
                'slug': `eq.${this.appSlug}`,
                'is_active': 'eq.true'
            });

            if (sysErr || !sysData) {
                this.showAccessDenied(this.appSlug, 'Este sistema está <strong>desativado</strong> ou não existe.');
                return;
            }
            console.log(`[SGE SSO v4] ✓ Sistema ativo: ${sysData.nome}`);

            // 2c. Does USER have ACCESS? (uses v_sso_acesso view with perfil pre-joined)
            const { data: accessData, error: accessErr } = await ssoQuery('v_sso_acesso', {
                'select': 'id,is_active,perfil_nome',
                'usuario_id': `eq.${authData.user.id}`,
                'sistema_id': `eq.${sysData.id}`
            });

            if (accessErr || !accessData) {
                this.showAccessDenied(sysData.nome, 'Você <strong>não possui acesso</strong> a este sistema.');
                return;
            }
            if (!accessData.is_active) {
                this.showAccessDenied(sysData.nome, 'Seu acesso foi <strong>revogado</strong>.');
                return;
            }

            const perfil = accessData.perfil_nome || 'GESTAO';
            console.log(`[SGE SSO v4] ✓ AUTORIZADO | Perfil: ${perfil}`);

            // ═══ STEP 3: Generate SSO Token ═══
            const jwtPayload = {
                sub: authData.user.id,
                user: {
                    id: authData.user.id,
                    email: email,
                    nome: userData.nome || email.split('@')[0],
                    perfil: perfil
                },
                app_slug: this.appSlug,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8)
            };

            const payloadBase64 = btoa(JSON.stringify(jwtPayload));
            const ssoToken = `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.sge_central_sig`;

            // ═══ STEP 4: Redirect back ═══
            if (this.redirectUrl) {
                const separator = this.redirectUrl.includes('?') ? '&' : '?';
                window.location.href = `${this.redirectUrl}${separator}sso_token=${ssoToken}`;
            } else {
                errEl.style.color = 'var(--green, #22c55e)';
                errEl.textContent = 'Autenticado! Nenhum redirect configurado.';
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }

        } catch (error) {
            console.error('[SGE SSO v4] Erro:', error);
            errEl.textContent = error.message;
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    },

    showAccessDenied(systemName, reason) {
        const ssoView = document.getElementById('sso-view');
        ssoView.innerHTML = `
            <div class="login-box" style="border-color:rgba(214,69,69,0.15);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d64545" stroke-width="2" 
                     stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h2 style="font-size:20px; font-weight:800; color:#d64545; margin-bottom:8px;">Acesso Negado</h2>
                <p style="font-size:14px; color:#5a6676; line-height:1.6; margin-bottom:24px; text-align:center;">
                    ${reason}<br><br>Contate o administrador do SGE Central.
                </p>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button onclick="window.history.back()" class="btn-secondary" style="height:40px; padding:0 20px;">← Voltar</button>
                    <button onclick="window.location.href=window.location.pathname" class="btn-primary" style="height:40px; padding:0 20px;">Trocar Conta</button>
                </div>
            </div>
            <div class="login-footer">SGE Central — RBAC v4 · Grupo GPS</div>
        `;
    }
};
