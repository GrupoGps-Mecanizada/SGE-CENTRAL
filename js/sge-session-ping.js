/**
 * SGE SESSION PING — Mantém sessões ativas no Radar Central
 * 
 * Inclua este script em qualquer sistema satélite do ecossistema SGE.
 * Ele lê os dados de sessão gravados no localStorage pelo sso_login.html
 * e envia pings periódicos (a cada 30s) para manter o status "Online"
 * no Radar de Sessões do Painel Central.
 * 
 * Uso: <script src="https://SEU_DOMINIO/SGE-CENTRAL/js/sge-session-ping.js"></script>
 *       (incluir APÓS o supabase-js CDN)
 */
(function () {
    const SUPABASE_URL = "https://mgcjidryrjqiceielmzp.supabase.co";
    const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";
    const PING_INTERVAL_MS = 30000; // 30 seconds

    let _pingInterval = null;

    function getSessionData() {
        try {
            const sessionId = localStorage.getItem('sge_session_id');
            const userId = localStorage.getItem('sge_session_user_id');
            const token = localStorage.getItem('sge_session_token');
            if (!sessionId || !userId || !token) return null;
            return { sessionId, userId, token };
        } catch (e) {
            return null;
        }
    }

    async function pingSession() {
        const data = getSessionData();
        if (!data) return;

        try {
            const client = window.supabase.createClient(SUPABASE_URL, ANON_KEY, {
                db: { schema: 'gps_compartilhado' },
                global: {
                    headers: { 'Authorization': `Bearer ${data.token}` }
                }
            });

            const { error } = await client
                .from('sge_central_sessoes')
                .update({ ultimo_ping_em: new Date().toISOString() })
                .eq('id', data.sessionId)
                .eq('usuario_id', data.userId);

            if (error) {
                console.warn('[SGE Ping] Erro no ping:', error.message);
            }
        } catch (err) {
            console.warn('[SGE Ping] Falha:', err.message);
        }
    }

    function start() {
        if (_pingInterval) return;
        const data = getSessionData();
        if (!data) {
            console.log('[SGE Ping] Nenhuma sessão SGE encontrada no localStorage.');
            return;
        }

        console.log(`[SGE Ping] Iniciando ping a cada ${PING_INTERVAL_MS / 1000}s para sessão ${data.sessionId}`);
        pingSession(); // First ping immediately
        _pingInterval = setInterval(pingSession, PING_INTERVAL_MS);
    }

    function stop() {
        if (_pingInterval) {
            clearInterval(_pingInterval);
            _pingInterval = null;
        }
    }

    // Auto-start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // Clean up on page unload
    window.addEventListener('beforeunload', stop);

    // Export for manual control
    window.SGE_SESSION_PING = { start, stop, ping: pingSession };
})();
