/**
 * CENTRAL SGE — SSO Authentication Handler
 * Grupo GPS · Autenticação Centralizada
 * 
 * Fluxo:
 *   1. Sistema satélite redireciona → index.html?app_slug=X&redirect=Y
 *   2. Usuário loga com email/senha via Supabase Auth
 *   3. Valida se o usuário tem permissão no sistema solicitado (RBAC)
 *   4. Gera token SSO e redireciona de volta
 * 
 * Se o usuário NÃO tem acesso → mostra tela de "Acesso Negado"
 */

const SSO_SUPABASE_URL = "https://mgcjidryrjqiceielmzp.supabase.co";
const SSO_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";

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
        document.getElementById('sso-view').style.display = 'flex';
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
            // 1. Authenticate with Supabase Auth
            const authClient = window.supabase.createClient(SSO_SUPABASE_URL, SSO_ANON_KEY);
            const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
                email,
                password: pass
            });

            if (authError) throw new Error('Credenciais inválidas.');

            console.log(`[SGE SSO] Login bem-sucedido: ${email}`);

            // 2. Check RBAC permissions — does this user have access to the requested system?
            const rbacClient = window.supabase.createClient(SSO_SUPABASE_URL, SSO_ANON_KEY, {
                db: { schema: 'gps_compartilhado' }
            });

            // Find system by slug
            const { data: sysData } = await rbacClient
                .from('sge_central_sistemas')
                .select('id, nome')
                .eq('slug', this.appSlug)
                .eq('is_active', true)
                .single();

            let perfil = 'GESTAO'; // Default profile

            if (sysData) {
                // Check user access permission
                const { data: accessData } = await rbacClient
                    .from('sge_central_usuario_sistema_acesso')
                    .select(`
                        id, is_active,
                        perfil:sge_central_perfis!sge_central_usuario_sistema_acesso_perfil_id_fkey(nome, nivel)
                    `)
                    .eq('usuario_id', authData.user.id)
                    .eq('sistema_id', sysData.id)
                    .single();

                if (accessData && accessData.is_active !== false) {
                    perfil = accessData.perfil?.nome || 'GESTAO';
                    console.log(`[SGE SSO] Acesso autorizado. Perfil: ${perfil}`);
                } else {
                    // NO ACCESS — show access denied screen
                    console.warn(`[SGE SSO] ACESSO NEGADO para ${email} no sistema ${this.appSlug}`);
                    this.showAccessDenied(sysData.nome || this.appSlug);
                    return;
                }

                // 3. Register session for radar tracking
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
                    console.warn('[SGE SSO] Sessão não registrada (RLS):', sessionErr.message);
                }
            } else {
                console.warn(`[SGE SSO] Sistema "${this.appSlug}" não encontrado no BD. Permitindo com perfil padrão.`);
            }

            // 4. Generate SSO Token (simplified JWT)
            const meta = authData.user.user_metadata || {};
            const jwtPayload = {
                sub: authData.user.id,
                user: {
                    id: authData.user.id,
                    email: email,
                    nome: meta.full_name || meta.nome || email.split('@')[0],
                    perfil: perfil
                },
                app_slug: this.appSlug,
                exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8) // 8 hours
            };

            const payloadBase64 = btoa(JSON.stringify(jwtPayload));
            const ssoToken = `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.sge_central_sig`;

            // 5. Redirect back to satellite system
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
    showAccessDenied(systemName) {
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
                    Você <strong>não tem permissão</strong> para acessar o sistema
                    <strong style="color:#2d3748;">${systemName}</strong>.
                    <br><br>
                    Seu setor ou perfil não está autorizado.<br>
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
