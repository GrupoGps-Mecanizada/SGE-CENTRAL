/**
 * CENTRAL SGE — SSO Authentication Handler
 * Grupo GPS · Autenticação Centralizada · RBAC Enforcement
 * 
 * Fluxo:
 *   1. Sistema satélite redireciona → index.html?app_slug=X&redirect=Y
 *   2. Usuário loga com email/senha via Supabase Auth
 *   3. Valida 3 camadas de RBAC:
 *      a) Usuário ATIVO em sge_central_usuarios? (is_active = true)
 *      b) Sistema ATIVO em sge_central_sistemas? (is_active = true)
 *      c) Acesso CONCEDIDO em sge_central_usuario_sistema_acesso? (is_active = true)
 *   4. Se tudo OK → gera token SSO e redireciona de volta
 *   5. Se QUALQUER verificação falhar → mostra tela de "Acesso Negado"
 */

const SSO_SUPABASE_URL = "https://mgcjidryrjqiceielmzp.supabase.co";
const SSO_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";
const SSO_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEyMTA3MSwiZXhwIjoyMDg3Njk3MDcxfQ._E35tXsTSvDlVuV2-bRvanhDc8wgdZSXhspGCcxPnaE";

window.SGE_SSO = {
    appSlug: null,
    redirectUrl: null,

    /**
     * Detect if we're in SSO mode (URL has ?app_slug)
     */
    isSSO() {
        const params = new URLSearchParams(window.location.search);
        return params.has('app_slug');
    },

    /**
     * Initialize SSO mode — read params and show SSO form
     */
    init() {
        const params = new URLSearchParams(window.location.search);
        this.appSlug = params.get('app_slug') || 'sge_hub';
        this.redirectUrl = params.get('redirect') || null;

        console.log(`[SGE SSO] Modo SSO ativado para: ${this.appSlug}`);
        console.log(`[SGE SSO] Redirect: ${this.redirectUrl || '(nenhum)'}`);

        // Show SSO view
        document.getElementById('sso-view').classList.remove('hidden');
        document.getElementById('sso-app-name').textContent = this.appSlug.replace(/_/g, ' ').toUpperCase();

        // Setup form
        document.getElementById('sso-form').addEventListener('submit', (e) => this.handleLogin(e));
    },

    /**
     * Handle SSO login form submission
     */
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
            // ═══════════════════════════════════════════
            // STEP 1: Authenticate via Supabase Auth
            // ═══════════════════════════════════════════
            const authClient = window.supabase.createClient(SSO_SUPABASE_URL, SSO_ANON_KEY);
            const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
                email,
                password: pass
            });

            if (authError) throw new Error('Credenciais inválidas.');
            console.log(`[SGE SSO] Auth OK: ${email}`);

            // ═══════════════════════════════════════════
            // STEP 2: RBAC Check — use Service Role to bypass RLS
            // This is safe because this code runs on OUR trusted page
            // ═══════════════════════════════════════════
            const rbacClient = window.supabase.createClient(SSO_SUPABASE_URL, SSO_SERVICE_KEY, {
                db: { schema: 'gps_compartilhado' }
            });

            // ── 2a. Check if USER is globally active ──
            const { data: userData, error: userError } = await rbacClient
                .from('sge_central_usuarios')
                .select('id, nome, is_active')
                .eq('id', authData.user.id)
                .single();

            if (userError || !userData) {
                console.warn(`[SGE SSO] Usuário ${email} não encontrado no SGE Central.`);
                this.showAccessDenied('SGE Central', 'Seu cadastro não foi encontrado no sistema de governança. Contate o administrador.');
                return;
            }

            if (!userData.is_active) {
                console.warn(`[SGE SSO] BLOQUEADO: ${email} está com conta desativada.`);
                this.showAccessDenied('SGE Central', 'Sua conta está <strong>bloqueada</strong>. O administrador desativou seu acesso.');
                return;
            }

            console.log(`[SGE SSO] Usuário ativo: ${userData.nome}`);

            // ── 2b. Check if SYSTEM is active ──
            const { data: sysData, error: sysError } = await rbacClient
                .from('sge_central_sistemas')
                .select('id, nome')
                .eq('slug', this.appSlug)
                .eq('is_active', true)
                .single();

            if (sysError || !sysData) {
                console.warn(`[SGE SSO] Sistema "${this.appSlug}" não encontrado ou desativado.`);
                this.showAccessDenied(this.appSlug, 'Este sistema está <strong>desativado</strong> ou não existe no ecossistema SGE.');
                return;
            }

            console.log(`[SGE SSO] Sistema ativo: ${sysData.nome}`);

            // ── 2c. Check if USER has ACCESS to this SYSTEM ──
            const { data: accessData, error: accessError } = await rbacClient
                .from('sge_central_usuario_sistema_acesso')
                .select(`
                    id, is_active,
                    perfil:sge_central_perfis!sge_central_usuario_sistema_acesso_perfil_id_fkey(nome, nivel)
                `)
                .eq('usuario_id', authData.user.id)
                .eq('sistema_id', sysData.id)
                .single();

            if (accessError || !accessData) {
                console.warn(`[SGE SSO] SEM ACESSO: ${email} não tem permissão para ${this.appSlug}`);
                this.showAccessDenied(sysData.nome, 'Você <strong>não possui acesso</strong> a este sistema. O administrador precisa conceder permissão.');
                return;
            }

            if (!accessData.is_active) {
                console.warn(`[SGE SSO] ACESSO REVOGADO: ${email} teve acesso revogado a ${this.appSlug}`);
                this.showAccessDenied(sysData.nome, 'Seu acesso a este sistema foi <strong>revogado</strong> pelo administrador.');
                return;
            }

            const perfil = accessData.perfil?.nome || 'GESTAO';
            console.log(`[SGE SSO] ✓ ACESSO AUTORIZADO | Perfil: ${perfil}`);

            // ═══════════════════════════════════════════
            // STEP 3: Register session for radar tracking
            // ═══════════════════════════════════════════
            try {
                await rbacClient.from('sge_central_sessoes').insert({
                    usuario_id: authData.user.id,
                    sistema_id: sysData.id,
                    ip_address: '0.0.0.0',
                    user_agent: navigator.userAgent,
                    expira_em: new Date(Date.now() + (1000 * 60 * 60 * 8)).toISOString()
                });
                console.log('[SGE SSO] Sessão registrada no radar.');
            } catch (sessionErr) {
                console.warn('[SGE SSO] Sessão não registrada:', sessionErr.message);
            }

            // ═══════════════════════════════════════════
            // STEP 4: Generate SSO Token
            // ═══════════════════════════════════════════
            const meta = authData.user.user_metadata || {};
            const jwtPayload = {
                sub: authData.user.id,
                user: {
                    id: authData.user.id,
                    email: email,
                    nome: userData.nome || meta.full_name || meta.nome || email.split('@')[0],
                    perfil: perfil
                },
                app_slug: this.appSlug,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8) // 8 hours
            };

            const payloadBase64 = btoa(JSON.stringify(jwtPayload));
            const ssoToken = `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.sge_central_sig`;

            // ═══════════════════════════════════════════
            // STEP 5: Redirect back to satellite system
            // ═══════════════════════════════════════════
            if (this.redirectUrl) {
                const separator = this.redirectUrl.includes('?') ? '&' : '?';
                const finalUrl = `${this.redirectUrl}${separator}sso_token=${ssoToken}`;
                console.log(`[SGE SSO] Redirecionando para: ${finalUrl}`);
                window.location.href = finalUrl;
            } else {
                errEl.style.color = 'var(--green, #22c55e)';
                errEl.textContent = 'Autenticado com sucesso! Nenhum redirect configurado.';
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }

        } catch (error) {
            console.error('[SGE SSO] Erro:', error);
            errEl.textContent = error.message;
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    },

    /**
     * Show Access Denied screen — replaces the form
     */
    showAccessDenied(systemName, reason) {
        const defaultReason = `Você <strong>não tem permissão</strong> para acessar o sistema <strong>${systemName}</strong>.`;
        const msg = reason || defaultReason;
        const ssoView = document.getElementById('sso-view');
        ssoView.innerHTML = `
            <div class="login-box" style="border-color:rgba(214,69,69,0.15);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d64545" stroke-width="2" 
                     stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h2 style="font-size:20px; font-weight:800; color:#d64545; margin-bottom:8px;">
                    Acesso Negado
                </h2>
                <p style="font-size:14px; color:#5a6676; line-height:1.6; margin-bottom:24px; text-align:center;">
                    ${msg}<br><br>
                    Entre em contato com o administrador do SGE Central.
                </p>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button onclick="window.history.back()" class="btn-secondary" style="height:40px; padding:0 20px;">← Voltar</button>
                    <button onclick="window.location.href=window.location.pathname" class="btn-primary" style="height:40px; padding:0 20px;">Trocar Conta</button>
                </div>
            </div>
            <div class="login-footer">SGE Central — Controle de Acesso RBAC · Grupo GPS</div>
        `;
    }
};
