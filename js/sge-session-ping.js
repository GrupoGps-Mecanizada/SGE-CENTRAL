/**
 * SGE SESSION PRESENCE — Radar de Presença em Tempo Real
 *
 * Inclua este script em qualquer sistema satélite do ecossistema SGE.
 * Usa Supabase Realtime Presence Channel (igual ao Excel/Google Docs):
 *  - Entra no canal ao abrir → aparece como "Online" no Radar imediatamente
 *  - Detecta inatividade → muda para "Ausente" automaticamente
 *  - Sai do canal ao fechar a aba → desaparece do Radar imediatamente
 *
 * NÃO faz mais polling de banco — é WebSocket puro.
 *
 * Uso: <script src="https://SEU_DOMINIO/SGE-CENTRAL/js/sge-session-ping.js"></script>
 *      (incluir APÓS o supabase-js CDN)
 */
(function () {
    const SUPABASE_URL = "https://mgcjidryrjqiceielmzp.supabase.co";
    const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";
    const CHANNEL_NAME = "sge-radar";
    const AWAY_TIMEOUT = 30000; // 30s sem atividade → ausente

    let _supabase = null;
    let _channel = null;
    let _awayTimer = null;
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

        // Aba em segundo plano → ausente imediatamente
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
    const RETRY_DELAY = 3000; // 3s entre tentativas

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

        // Cria client dedicado para o canal de presença (anon key)
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
            }
        });
    }

    // ── Saída limpa ao fechar a aba ──────────────────────────
    async function stop() {
        if (_awayTimer) clearTimeout(_awayTimer);
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

    // Supabase Presence remove automaticamente ao fechar,
    // mas chamamos untrack() para garantir dado limpo.
    window.addEventListener('beforeunload', stop);

    // API pública (uso manual/debug)
    window.SGE_SESSION_PING = {
        start,
        stop,
        setStatus: (s) => trackStatus(s),
        getPayload: () => _payload,
    };
})();
