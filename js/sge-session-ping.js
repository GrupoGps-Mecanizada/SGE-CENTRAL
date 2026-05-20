/**
 * SGE SESSION PRESENCE v2 — Radar de Presença + Verificação de Acesso
 *
 * Inclua este script em qualquer sistema satélite do ecossistema SGE.
 *
 * Funcionalidades:
 *  - Entra no canal Realtime ao abrir → aparece como "Online" no Radar
 *  - Detecta inatividade → muda para "Ausente" automaticamente
 *  - Sai do canal ao fechar a aba → desaparece do Radar imediatamente
 *  - Verifica a cada 5 minutos: acesso ativo + sistema não em manutenção
 *  - Se acesso revogado ou manutenção iniciada → exibe overlay + encerra sessão
 *
 * Uso: <script src="https://SEU_DOMINIO/SGE-CENTRAL/js/sge-session-ping.js"></script>
 *      (incluir APÓS o supabase-js CDN)
 */
(function () {
    const SUPABASE_URL = "https://mgcjidryrjqiceielmzp.supabase.co";
    const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";
    const CHANNEL_NAME = "sge-radar";
    const AWAY_TIMEOUT = 30000;      // 30s sem atividade → ausente
    const VERIFY_INTERVAL = 300000;  // 5 min → re-verifica acesso

    let _supabase = null;
    let _channel = null;
    let _awayTimer = null;
    let _verifyTimer = null;
    let _currentStatus = 'online';
    let _payload = null;

    // ── Lê dados da sessão gravados pelo SSO ──────────────────
    function getSessionData() {
        try {
            const userId = localStorage.getItem('sge_session_user_id');
            const userName = localStorage.getItem('sge_session_user_name') || 'Usuário SGE';
            const userEmail = localStorage.getItem('sge_session_user_email') || '';
            const appSlug = localStorage.getItem('sge_session_app_slug') || window.SGE_APP_SLUG || 'desconhecido';
            const appName = localStorage.getItem('sge_session_app_name') || window.SGE_APP_NAME || appSlug;
            const sessionId = localStorage.getItem('sge_session_id') || crypto.randomUUID();

            if (!userId) return null;

            return { userId, userName, userEmail, appSlug, appName, sessionId };
        } catch (e) {
            return null;
        }
    }

    // ── Força logout: limpa sessão e exibe overlay bloqueante ─
    function forceLogout(title, message, icon) {
        // Para timers e canal
        if (_awayTimer) clearTimeout(_awayTimer);
        if (_verifyTimer) clearInterval(_verifyTimer);
        if (_channel) {
            try { _channel.untrack(); _supabase.removeChannel(_channel); } catch (_) {}
        }

        // Limpa dados de sessão
        ['sge_session_id', 'sge_session_user_id', 'sge_session_token',
         'sge_session_user_name', 'sge_session_user_email',
         'sge_session_app_slug', 'sge_session_app_name'].forEach(k => {
            try { localStorage.removeItem(k); } catch (_) {}
        });

        // Remove overlay anterior se existir
        const prev = document.getElementById('sge-logout-overlay');
        if (prev) prev.remove();

        const iconHtml = icon === 'wrench'
            ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" style="margin-bottom:16px"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`
            : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d64545" stroke-width="1.5" style="margin-bottom:16px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

        const accentColor = icon === 'wrench' ? '#f59e0b' : '#d64545';

        const overlay = document.createElement('div');
        overlay.id = 'sge-logout-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,0.92);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(4px);';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:40px 48px;max-width:440px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.5);">
                ${iconHtml}
                <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:${accentColor};">${title}</h2>
                <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.65;">${message}</p>
                <button onclick="window.location.reload()" style="padding:11px 28px;background:${accentColor};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Recarregar página</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    // ── Verificação periódica de acesso e manutenção ─────────
    async function verifyAccess() {
        const data = getSessionData();
        if (!data || data.appSlug === 'sge_hub') return;

        const headers = {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Accept': 'application/json'
        };

        try {
            // 1. Usuário ainda está ativo?
            const userResp = await fetch(
                `${SUPABASE_URL}/rest/v1/v_sso_usuarios?id=eq.${data.userId}&select=is_active`,
                { headers }
            );
            if (userResp.ok) {
                const users = await userResp.json();
                if (users.length === 0 || !users[0].is_active) {
                    forceLogout('Conta Bloqueada', 'Sua conta foi bloqueada pelo administrador.<br>Entre em contato com o suporte do SGE Central.', 'shield');
                    return;
                }
            }

            // 2. Sistema entrou em manutenção?
            const maintResp = await fetch(
                `${SUPABASE_URL}/rest/v1/v_sso_manutencao?sistema_slug=eq.${data.appSlug}&select=ativo,mensagem`,
                { headers }
            );
            if (maintResp.ok) {
                const maint = await maintResp.json();
                if (maint.length > 0 && maint[0].ativo) {
                    const msg = maint[0].mensagem || 'O sistema entrou em manutenção. Tente novamente em breve.';
                    forceLogout('Sistema em Manutenção', msg, 'wrench');
                    return;
                }
            }

            // 3. Usuário ainda tem acesso ao sistema?
            const sysResp = await fetch(
                `${SUPABASE_URL}/rest/v1/v_sso_sistemas?slug=eq.${data.appSlug}&select=id,is_active`,
                { headers }
            );
            if (sysResp.ok) {
                const systems = await sysResp.json();
                if (systems.length === 0 || !systems[0].is_active) {
                    forceLogout('Sistema Desativado', 'Este sistema foi desativado pelo administrador.', 'shield');
                    return;
                }
                const sysId = systems[0].id;

                const accResp = await fetch(
                    `${SUPABASE_URL}/rest/v1/v_sso_acesso?usuario_id=eq.${data.userId}&sistema_id=eq.${sysId}&select=is_active`,
                    { headers }
                );
                if (accResp.ok) {
                    const access = await accResp.json();
                    if (access.length === 0 || !access[0].is_active) {
                        forceLogout('Acesso Revogado', 'Seu acesso a este sistema foi revogado pelo administrador.<br>Entre em contato com o SGE Central para solicitar acesso.', 'shield');
                        return;
                    }
                }
            }

            console.log('[SGE Presence] ✓ Verificação de acesso OK');
        } catch (e) {
            // Erro de rede — não expulsa, apenas loga
            console.warn('[SGE Presence] Verificação de acesso falhou (rede):', e.message);
        }
    }

    // ── Configura e entra no canal de presença ───────────────
    function buildPayload(data, status) {
        return {
            session_id: data.sessionId,
            user_id: data.userId,
            user_name: data.userName,
            user_email: data.userEmail,
            app_slug: data.appSlug,
            app_name: data.appName,
            status: status,
            tab_id: sessionStorage.getItem('sge_tab_id') || (() => {
                const id = crypto.randomUUID().slice(0, 8);
                sessionStorage.setItem('sge_tab_id', id);
                return id;
            })(),
            url: window.location.pathname,
            entrou_em: new Date().toISOString(),
        };
    }

    async function trackStatus(status) {
        if (!_channel || !_payload) return;
        if (_currentStatus === status) return;
        _currentStatus = status;
        _payload.status = status;
        await _channel.track(_payload);
    }

    // ── Lógica de inatividade (ausente) ─────────────────────
    function resetAwayTimer() {
        if (_awayTimer) clearTimeout(_awayTimer);
        if (_currentStatus !== 'online') trackStatus('online');
        _awayTimer = setTimeout(() => trackStatus('away'), AWAY_TIMEOUT);
    }

    function bindActivityListeners() {
        const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        events.forEach(ev => document.addEventListener(ev, resetAwayTimer, { passive: true }));

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                trackStatus('away');
            } else {
                resetAwayTimer();
            }
        });
    }

    // ── Início ───────────────────────────────────────────────
    let _retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 3000;

    async function start() {
        const data = getSessionData();
        if (!data) {
            if (_retryCount < MAX_RETRIES) {
                _retryCount++;
                console.log(`[SGE Presence] Sessão não encontrada — retry ${_retryCount}/${MAX_RETRIES} em ${RETRY_DELAY / 1000}s...`);
                setTimeout(start, RETRY_DELAY);
            } else {
                console.log('[SGE Presence] Nenhuma sessão SGE encontrada no localStorage após retries.');
            }
            return;
        }

        _supabase = window.supabase.createClient(SUPABASE_URL, ANON_KEY, {
            realtime: { params: { eventsPerSecond: 5 } }
        });

        _payload = buildPayload(data, 'online');

        _channel = _supabase.channel(CHANNEL_NAME, {
            config: { presence: { key: data.sessionId } }
        });

        await _channel.subscribe(async (channelStatus) => {
            if (channelStatus === 'SUBSCRIBED') {
                await _channel.track(_payload);
                console.log(`[SGE Presence] ✓ Entrou no radar como ${data.appName} (${data.userName})`);
                bindActivityListeners();
                resetAwayTimer();

                // Verificação imediata + periódica de acesso
                await verifyAccess();
                _verifyTimer = setInterval(verifyAccess, VERIFY_INTERVAL);
            }
        });
    }

    // ── Saída limpa ao fechar a aba ──────────────────────────
    async function stop() {
        if (_awayTimer) clearTimeout(_awayTimer);
        if (_verifyTimer) clearInterval(_verifyTimer);
        if (_channel) {
            await _channel.untrack();
            _supabase.removeChannel(_channel);
        }
    }

    // Auto-start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.addEventListener('beforeunload', stop);

    window.SGE_SESSION_PING = {
        start,
        stop,
        setStatus: (s) => trackStatus(s),
        getPayload: () => _payload,
        verifyNow: () => verifyAccess(),
    };
})();
