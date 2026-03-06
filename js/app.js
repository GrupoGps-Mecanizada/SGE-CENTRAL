/**
 * CENTRAL SGE — App Controller v6.0
 * Grupo GPS · Governança Master · CRUD + Radar + RBAC
 * 
 * MELHORIAS v6:
 *  - Breadcrumb dinâmico no topbar
 *  - Coloração de ping por severidade temporal
 *  - Filtro de busca em sessões e usuários
 *  - KPI counter animado
 *  - Indicador "última atualização" no radar
 *  - Empty states visuais com SVG
 */
const SUPABASE_PROJECT_URL = "https://mgcjidryrjqiceielmzp.supabase.co";

let _allSystems = [];
let _allProfiles = [];
let _allSectors = [];
let _serviceKey = '';
let _radarChannel = null;   // Supabase Presence Channel
let _radarSupabase = null;  // client separado com anon key
let _pingInterval = null;   // Admin session keepalive interval

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA";
const RADAR_CHANNEL = "sge-radar";

// ──────────────────────────────────────────────────────────
// PANEL METADATA — títulos e subtítulos para o breadcrumb
// ──────────────────────────────────────────────────────────
const PANEL_META = {
    sessions: { label: 'Radar de Sessões', sub: 'Monitoramento em tempo real' },
    users: { label: 'Gestão de Identidade', sub: 'Usuários e permissões' },
    'user-config': { label: 'Configuração de Usuário', sub: 'Acessos e permissões' },
    sectors: { label: 'Setores / CRs', sub: 'Centros de resultado' },
    systems: { label: 'Ecossistema SGE', sub: 'Sistemas registrados' },
    audit: { label: 'Log de Auditoria', sub: 'Histórico de ações' },
};

// ──────────────────────────────────────────────────────────
// BOOT
// ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (window.SGE_SSO && window.SGE_SSO.isSSO()) {
        window.SGE_SSO.init();
        return;
    }

    // Admin panel mode
    document.getElementById('admin-login-view').classList.remove('hidden');

    const doLogin = async () => {
        const key = document.getElementById('login-key').value.trim();
        if (!key) return;
        _serviceKey = key;
        const errEl = document.getElementById('login-error');
        errEl.textContent = '';

        const ok = window.SGE_API.initSupabase(SUPABASE_PROJECT_URL, key);
        if (!ok) { errEl.textContent = 'Erro ao inicializar conexão.'; return; }

        try {
            await window.SGE_API.fetchAllSectors();
            await window.SGE_API.createAdminSession();
            document.getElementById('admin-login-view').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
            document.getElementById('btn-refresh-sessions').style.removeProperty('display');
            // Keep admin session alive with periodic pings
            _pingInterval = setInterval(window.SGE_API.pingAdminSession, 60000);
            loadAllData();
        } catch (err) {
            errEl.textContent = 'Chave inválida ou sem permissão.';
        }
    };

    document.getElementById('btn-login').addEventListener('click', doLogin);
    document.getElementById('login-key').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // Logout
    const doLogout = async () => {
        if (_pingInterval) { clearInterval(_pingInterval); _pingInterval = null; }
        await window.SGE_API.endAdminSession();
        window.SGE_API.initSupabase('', '');
        document.getElementById('login-key').value = '';
        document.getElementById('btn-refresh-sessions').style.display = 'none';
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('admin-login-view').classList.remove('hidden');
        // Desconecta do canal de presença
        if (_radarChannel && _radarSupabase) {
            _radarSupabase.removeChannel(_radarChannel);
            _radarChannel = null;
        }
        closeNav();
    };
    document.getElementById('btn-logout').addEventListener('click', doLogout);
    document.getElementById('nav-logout-btn').addEventListener('click', doLogout);

    // Nav drawer
    const navOverlay = document.getElementById('nav-menu-overlay');
    document.getElementById('nav-menu-btn').addEventListener('click', () => navOverlay.classList.remove('hidden'));
    navOverlay.addEventListener('click', e => { if (e.target === navOverlay) closeNav(); });

    document.querySelectorAll('.nav-menu-item[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchPanel(btn.dataset.panel);
            closeNav();
        });
    });

    // CRUD buttons
    document.getElementById('btn-create-user').addEventListener('click', showModalNewUser);
    document.getElementById('btn-create-sector').addEventListener('click', showModalNewSector);
    document.getElementById('btn-create-system').addEventListener('click', showModalNewSystem);
});

// ──────────────────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────────────────
function closeNav() {
    document.getElementById('nav-menu-overlay').classList.add('hidden');
}

function switchPanel(panelId) {
    // Update nav active state
    document.querySelectorAll('.nav-menu-item[data-panel]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-menu-item[data-panel="${panelId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update panel visibility
    document.querySelectorAll('#main > .panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`panel-${panelId}`);
    if (target) target.classList.add('active');

    // Update topbar breadcrumb
    updateBreadcrumb(panelId);
}

/**
 * Atualiza o breadcrumb dinâmico no centro do topbar
 */
function updateBreadcrumb(panelId) {
    const meta = PANEL_META[panelId] || {};
    const logoEl = document.querySelector('.topbar-logo');
    if (!logoEl) return;

    // Animate out → in (transition must be set BEFORE changing values)
    logoEl.style.transition = 'opacity .15s ease, transform .15s ease';
    logoEl.style.opacity = '0';
    logoEl.style.transform = 'translateX(-50%) translateY(4px)';
    setTimeout(() => {
        logoEl.querySelector('.logo-gps').textContent = 'GRUPO GPS';
        logoEl.querySelector('.logo-system').textContent = meta.label || 'CENTRAL SGE';
        logoEl.style.opacity = '1';
        logoEl.style.transform = 'translateX(-50%) translateY(0)';
    }, 160);
}

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────
function closeModal() {
    document.getElementById('modal-container').innerHTML = '';
}

function showModal(title, subtitle, formHtml) {
    document.getElementById('modal-container').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
            <div class="modal">
                <h3>${title}</h3>
                <p class="modal-sub">${subtitle}</p>
                <div class="modal-body">${formHtml}</div>
            </div>
        </div>
    `;
}

/**
 * Classifica o tempo do último ping em categorias visuais
 */
function pingClass(diffMins) {
    if (diffMins <= 5) return 'ping-fresh';
    if (diffMins <= 30) return 'ping-warning';
    return 'ping-stale';
}

/**
 * Formata tempo relativo (ex: "há 2 min", "há 1 h")
 */
function relativeTime(date) {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'agora mesmo';
    if (diffMins < 60) return `há ${diffMins} min`;
    const hrs = Math.floor(diffMins / 60);
    return hrs === 1 ? 'há 1 h' : `há ${hrs} h`;
}

/**
 * Anima um número contando de 0 até o valor final
 */
function animateCounter(el, target, duration = 600) {
    const start = Date.now();
    const initial = parseInt(el.textContent, 10) || 0;
    const step = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(initial + (target - initial) * ease);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/**
 * SVG para empty states
 */
function emptyStateSVG() {
    return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18M9 21V9"/>
    </svg>`;
}

// ──────────────────────────────────────────────────────────
// TOAST — Sistema de notificações profissional
// ──────────────────────────────────────────────────────────
function sgeToast(type, msg, duration = 3800) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const cfg = {
        success: { bg: 'var(--green-glow-md)',   border: 'rgba(5,150,105,0.25)',  color: 'var(--green)',   icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' },
        error:   { bg: 'var(--red-glow-md)',      border: 'rgba(220,38,38,0.25)',  color: 'var(--red)',     icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' },
        warning: { bg: 'var(--orange-glow)',      border: 'rgba(217,119,6,0.25)', color: 'var(--orange)',  icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
        info:    { bg: 'var(--accent-glow-md)',   border: 'rgba(29,78,216,0.25)', color: 'var(--accent)',  icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>' },
    };
    const c = cfg[type] || cfg.info;

    const toast = document.createElement('div');
    toast.className = 'sge-toast';
    toast.innerHTML = `
        <span class="sge-toast-icon" style="color:${c.color}; background:${c.bg}; border-color:${c.border};">${c.icon}</span>
        <span class="sge-toast-msg">${msg}</span>
        <button class="sge-toast-close" onclick="this.closest('.sge-toast').remove()">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;
    container.appendChild(toast);

    // Auto-remove
    const timer = setTimeout(() => {
        toast.classList.add('sge-toast-out');
        setTimeout(() => toast.remove(), 250);
    }, duration);

    toast.querySelector('.sge-toast-close').addEventListener('click', () => clearTimeout(timer));
}

// ──────────────────────────────────────────────────────────
// CONFIRM — Dialog de confirmação profissional
// ──────────────────────────────────────────────────────────
function sgeConfirm(msg, dangerLabel = 'Confirmar') {
    return new Promise(resolve => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="modal-overlay" style="z-index:9600;">
                <div class="modal" style="max-width:360px;">
                    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--red-glow); border:1.5px solid var(--red-glow-md);
                                    display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--red)" stroke-width="2.2" stroke-linecap="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                        <div>
                            <h3 style="margin-bottom:6px;">Confirmar Ação</h3>
                            <p class="modal-sub" style="margin-bottom:0; line-height:1.5;">${msg}</p>
                        </div>
                    </div>
                    <div class="modal-actions" style="padding-top:14px;">
                        <button class="btn-secondary" id="_sge-cancel">Cancelar</button>
                        <button class="btn-danger btn-primary" id="_sge-ok" style="background:var(--red);">${dangerLabel}</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-container').appendChild(wrapper);

        wrapper.querySelector('#_sge-cancel').addEventListener('click', () => { wrapper.remove(); resolve(false); });
        wrapper.querySelector('#_sge-ok').addEventListener('click', () => { wrapper.remove(); resolve(true); });
        wrapper.querySelector('.modal-overlay').addEventListener('click', e => {
            if (e.target === wrapper.querySelector('.modal-overlay')) { wrapper.remove(); resolve(false); }
        });
    });
}

// ──────────────────────────────────────────────────────────
// DATA LOADERS
// ──────────────────────────────────────────────────────────
async function loadAllData() {
    try {
        [_allSystems, _allProfiles, _allSectors] = await Promise.all([
            window.SGE_API.fetchAllSystems(),
            window.SGE_API.fetchAllProfiles(),
            window.SGE_API.fetchAllSectors()
        ]);
    } catch (e) { console.error('Reference data:', e); }

    updateBreadcrumb('sessions');
    initRadarPresence();

    loadUsers();
    loadSectors();
    loadSystems();
    loadAuditLogs();
}

// ──────────────────────────────────────────────────────────
// RADAR — Presence Channel (tempo real, estilo Excel)
// ──────────────────────────────────────────────────────────
function initRadarPresence() {
    if (_radarChannel) return;

    // Utiliza o cliente existente para evitar o aviso "Multiple GoTrueClient instances"
    _radarSupabase = window.SGE_API.db();

    _radarChannel = _radarSupabase.channel(RADAR_CHANNEL);

    _radarChannel
        .on('presence', { event: 'sync' }, () => {
            const state = _radarChannel.presenceState();
            renderRadar(state);
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
            console.log('[Radar] Entrou:', newPresences[0]?.user_name);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            console.log('[Radar] Saiu:', leftPresences[0]?.user_name);
        })
        .subscribe();
}

// ──────────────────────────────────────────────────────────
// SESSÕES — Radar renderizado via Presence Channel
// ──────────────────────────────────────────────────────────
function renderRadar(presenceState) {
    const tbody = document.getElementById('table-sessions');
    if (!tbody) return;
    tbody.innerHTML = '';

    // presenceState é { key: [payload, ...], ... }
    // Cada chave é um session_id; pega a última presença de cada uma
    const presences = Object.values(presenceState).flatMap(arr => arr);

    let online = 0, away = 0;

    if (!presences.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty">
                    <div class="table-empty-inner">
                        ${emptyStateSVG()}
                        <span>Nenhuma sessão ativa no momento</span>
                    </div>
                </td>
            </tr>`;
    } else {
        // Ordena: online primeiro, depois ausente, por app_name
        presences.sort((a, b) => {
            if (a.status === b.status) return (a.app_name || '').localeCompare(b.app_name || '');
            return a.status === 'online' ? -1 : 1;
        });

        presences.forEach(p => {
            const status = p.status || 'online';
            if (status === 'online') online++;
            else away++;

            const statusLabel = status === 'online' ? 'Online' : 'Ausente';
            const entrou = p.entrou_em ? relativeTime(p.entrou_em) : '—';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="status-badge ${status}">
                        <span class="status-dot ${status}"></span>
                        ${statusLabel}
                    </span>
                </td>
                <td>
                    <strong>${p.user_name || 'Usuário SGE'}</strong><br>
                    <small style="color:var(--text-3); font-size:11px;">${p.user_email || ''}</small>
                </td>
                <td>
                    <span style="font-weight:500; color:var(--text-2);">${p.app_name || p.app_slug || '—'}</span>
                </td>
                <td><code style="font-size:11px;">${p.url || '—'}</code></td>
                <td>
                    <span class="ping-fresh" title="Sessão iniciada: ${p.entrou_em || ''}">
                        ${entrou}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // KPIs — offline sempre 0 pois quem saiu some do canal
    animateCounter(document.getElementById('kpi-online'), online);
    animateCounter(document.getElementById('kpi-away'), away);
    animateCounter(document.getElementById('kpi-offline'), 0);

    const lastUpdEl = document.getElementById('sessions-last-updated');
    if (lastUpdEl) lastUpdEl.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
}

// ──────────────────────────────────────────────────────────
// USUÁRIOS
// ──────────────────────────────────────────────────────────
async function loadUsers() {
    try {
        const users = await window.SGE_API.fetchAllUsers();
        renderUsersTable(users);
    } catch (e) { console.error('Users:', e); }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('table-users');
    tbody.innerHTML = '';

    if (!users.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="table-empty">
                    <div class="table-empty-inner">
                        ${emptyStateSVG()}
                        <span>Nenhum usuário cadastrado</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    users.forEach(u => {
        const statusBadge = u.is_active
            ? '<span class="status-badge active">Ativo</span>'
            : '<span class="status-badge blocked">Bloqueado</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <!-- Avatar initials -->
                    <div style="
                        width:30px; height:30px; border-radius:50%; background:var(--accent-glow-md);
                        border:1.5px solid rgba(29,78,216,0.2); display:flex; align-items:center;
                        justify-content:center; font-size:11px; font-weight:700; color:var(--accent);
                        flex-shrink:0; letter-spacing:0.05em;">
                        ${(u.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <strong style="font-size:13px;">${u.nome}</strong>
                </div>
            </td>
            <td style="color:var(--text-2); font-size:12px;">${u.email}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="btn-primary btn-sm btn-config-user">
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="8" cy="8" r="3"/>
                            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/>
                        </svg>
                        Configurar
                    </button>
                    <button class="btn-secondary btn-sm btn-toggle-user">
                        ${u.is_active ? 'Bloquear' : 'Ativar'}
                    </button>
                </div>
            </td>
        `;
        tr.querySelector('.btn-config-user').addEventListener('click', () => openUserConfig(u));
        tr.querySelector('.btn-toggle-user').addEventListener('click', () => toggleUserStatus(u.id, u.is_active));
        tbody.appendChild(tr);
    });
}

// ──────────────────────────────────────────────────────────
// SETORES
// ──────────────────────────────────────────────────────────
async function loadSectors() {
    try {
        const items = _allSectors.length ? _allSectors : await window.SGE_API.fetchAllSectors();
        const tbody = document.getElementById('table-sectors');
        tbody.innerHTML = '';

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="table-empty"><div class="table-empty-inner">${emptyStateSVG()}<span>Nenhum setor cadastrado</span></div></td></tr>`;
            return;
        }

        items.forEach(i => {
            const statusBadge = i.is_active
                ? '<span class="status-badge active">Ativo</span>'
                : '<span class="status-badge offline">Inativo</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code style="font-weight:700; font-size:12px;">${i.sigla}</code></td>
                <td><strong>${i.nome}</strong></td>
                <td>${statusBadge}</td>
                <td style="color:var(--text-3); font-size:12px;">${i.descricao || '—'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Setores:', e); }
}

// ──────────────────────────────────────────────────────────
// SISTEMAS
// ──────────────────────────────────────────────────────────
async function loadSystems() {
    try {
        const items = _allSystems.length ? _allSystems : await window.SGE_API.fetchAllSystems();
        const tbody = document.getElementById('table-systems');
        tbody.innerHTML = '';

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty"><div class="table-empty-inner">${emptyStateSVG()}<span>Nenhum sistema registrado</span></div></td></tr>`;
            return;
        }

        items.forEach(i => {
            const statusBadge = i.is_active
                ? '<span class="status-badge active"><span class="status-dot online" style="animation:none"></span> Online</span>'
                : '<span class="status-badge offline"><span class="status-dot offline"></span> Offline</span>';

            const DEV_KEY = `sge_dev_bypass_${i.slug}`;
            const devActive = localStorage.getItem(DEV_KEY) === '1';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${i.nome}</strong></td>
                <td><code>${i.slug}</code></td>
                <td>${statusBadge}</td>
                <td>
                    ${i.url_origem
                    ? `<a href="${i.url_origem}" target="_blank"
                            style="font-size:12px; color:var(--accent); font-weight:500;
                                   text-decoration:none; display:inline-flex; align-items:center; gap:3px;">
                            ↗ Acessar
                           </a>`
                    : '<span style="color:var(--text-3)">—</span>'}
                </td>
                <td>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                        <button class="btn-secondary btn-sm btn-edit-sys" title="Editar sistema">
                            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H2v-3L11.5 2.5z"/>
                            </svg>
                            Editar
                        </button>
                        <button class="btn-secondary btn-sm btn-toggle-sys">
                            ${i.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button class="btn-sm btn-dev-sys" title="Bypass SSO para desenvolvimento local"
                            style="display:inline-flex; align-items:center; gap:5px; padding:4px 9px;
                                   border-radius:20px; font-size:10px; font-weight:700; letter-spacing:0.05em;
                                   cursor:pointer; border:1.5px solid; transition:background .15s, color .15s;
                                   background:${devActive ? '#0f3868' : 'transparent'};
                                   color:${devActive ? '#60a5fa' : 'var(--text-3)'};
                                   border-color:${devActive ? '#1d4ed8' : 'var(--border)'};">
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                            </svg>
                            ${devActive ? 'DEV ON' : 'DEV OFF'}
                        </button>
                    </div>
                </td>
            `;
            tr.querySelector('.btn-toggle-sys').addEventListener('click', () => toggleSystemStatus(i.id, i.is_active));
            tr.querySelector('.btn-edit-sys').addEventListener('click', () => showModalEditSystem(i));
            tr.querySelector('.btn-dev-sys').addEventListener('click', function () {
                const isOn = localStorage.getItem(DEV_KEY) === '1';
                if (isOn) {
                    localStorage.removeItem(DEV_KEY);
                    // Limpa tokens SSO deste sistema
                    localStorage.removeItem(`sge_token_${i.slug}`);
                    localStorage.removeItem(`sge_ver_${i.slug}`);
                    this.textContent = '';
                    this.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> DEV OFF`;
                    this.style.background = 'transparent';
                    this.style.color = 'var(--text-3)';
                    this.style.borderColor = 'var(--border)';
                    sgeToast('info', `Dev Mode desativado para ${i.nome}`);
                } else {
                    localStorage.setItem(DEV_KEY, '1');
                    this.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> DEV ON`;
                    this.style.background = '#0f3868';
                    this.style.color = '#60a5fa';
                    this.style.borderColor = '#1d4ed8';
                    sgeToast('success', `Dev Mode ativado para ${i.nome} — SSO bypass habilitado`);
                }
            });
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Sistemas:', e); }
}

// ──────────────────────────────────────────────────────────
// AUDITORIA
// ──────────────────────────────────────────────────────────
async function loadAuditLogs() {
    try {
        const logs = await window.SGE_API.fetchAuditLogs();
        const tbody = document.getElementById('table-auditoria');
        tbody.innerHTML = '';

        if (!logs.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="table-empty">
                        <div class="table-empty-inner">
                            ${emptyStateSVG()}
                            <span>Nenhum registro de auditoria</span>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        logs.forEach(l => {
            const detalhes = l.detalhes
                ? (typeof l.detalhes === 'object' ? JSON.stringify(l.detalhes) : l.detalhes)
                : '—';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <small style="font-size:12px; color:var(--text-2);">
                        ${new Date(l.realizado_em).toLocaleString('pt-BR')}
                    </small>
                </td>
                <td style="font-weight:500;">${l.admin?.nome || l.admin_id || '—'}</td>
                <td><code style="color:var(--accent);">${l.acao}</code></td>
                <td style="color:var(--text-3); max-width:260px; overflow:hidden;
                           text-overflow:ellipsis; white-space:nowrap; font-size:12px;">
                    ${detalhes}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Audit:', e); }
}

// ──────────────────────────────────────────────────────────
// RBAC USER CONFIG
// ──────────────────────────────────────────────────────────
async function openUserConfig(user) {
    let userAccess = [];
    let userSectors = [];

    try {
        [userAccess, userSectors] = await Promise.all([
            window.SGE_API.fetchUserAccess(user.id),
            window.SGE_API.fetchUserSectors(user.id)
        ]);
    } catch (e) { console.error('User config data:', e); }

    const container = document.getElementById('user-config-body');
    const statusBadge = user.is_active
        ? '<span class="status-badge active" style="margin-left:6px; font-size:11px;">Ativo</span>'
        : '<span class="status-badge blocked" style="margin-left:6px; font-size:11px;">Bloqueado</span>';

    // Access list HTML
    const accessHtml = userAccess.length
        ? userAccess.map(a => {
            const isActive = a.is_active !== false;
            return `
                <div class="access-row">
                    <div style="flex:1; min-width:0;">
                        <div class="system-name">${a.sistema?.nome || '?'}</div>
                        <div class="system-slug">${a.sistema?.slug || ''}</div>
                    </div>
                    <select class="profile-select" data-access-id="${a.id}" title="Perfil de acesso">
                        ${_allProfiles.map(p => `<option value="${p.id}" ${p.id === a.perfil_id ? 'selected' : ''}>${p.nome} · nv.${p.nivel}</option>`).join('')}
                    </select>
                    <button class="btn-sm ${isActive ? 'btn-danger' : 'btn-primary'}"
                        data-toggle-access-id="${a.id}" data-current-active="${isActive}"
                        title="${isActive ? 'Desativar acesso' : 'Ativar acesso'}">
                        ${isActive ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn-revoke" data-revoke-access-id="${a.id}" title="Revogar permanentemente">✕</button>
                </div>
            `;
        }).join('')
        : `<div style="color:var(--text-3); font-size:12px; padding:10px 0; text-align:center;">
               Nenhum acesso configurado
           </div>`;

    // Sector tags HTML
    const sectorTagsHtml = userSectors.length
        ? userSectors.map(us => `
            <span class="sector-tag">
                <strong>${us.setor?.sigla || '?'}</strong>&nbsp;${us.setor?.nome || ''}
                <button class="remove-sector" data-setor-id="${us.setor_id}" title="Remover">×</button>
            </span>
        `).join('')
        : `<span style="color:var(--text-3); font-size:12px;">Nenhum setor atribuído</span>`;

    const grantedSystemIds = userAccess.map(a => a.sistema_id);
    const availableSystems = _allSystems.filter(s => !grantedSystemIds.includes(s.id));
    const assignedSectorIds = userSectors.map(us => us.setor_id);
    const availableSectors = _allSectors.filter(s => !assignedSectorIds.includes(s.id));

    // Avatar initials
    const initials = (user.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('');

    container.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
            <!-- Avatar -->
            <div style="
                width:48px; height:48px; border-radius:50%; background:var(--accent-glow-md);
                border:2px solid rgba(29,78,216,0.25); display:flex; align-items:center;
                justify-content:center; font-size:16px; font-weight:800; color:var(--accent);
                flex-shrink:0; letter-spacing:0.05em;">
                ${initials}
            </div>
            <div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <h3 style="font-size: 18px; margin: 0;">${user.nome}</h3>
                    ${statusBadge}
                </div>
                <div style="font-size:13px; color:var(--text-3); margin-top:4px; font-family:'SF Mono',monospace;">${user.email}</div>
            </div>
        </div>

        <div class="user-drawer-body" style="padding: 0; display: grid; gap: 24px; grid-template-columns: 1fr 1fr;">
            <!-- SETORES -->
            <div class="user-drawer-section" style="background: var(--bg-2); padding: 16px; border-radius: var(--radius); border: 1px solid var(--border);">
                <h4>Setores Atribuídos</h4>
                <div id="user-sectors-tags" style="padding: 2px 0 12px;">${sectorTagsHtml}</div>
                ${availableSectors.length ? `
                <div class="grant-row">
                    <select id="add-sector-select">
                        <option value="">Selecionar setor...</option>
                        ${availableSectors.map(s => `<option value="${s.id}">${s.sigla} — ${s.nome}</option>`).join('')}
                    </select>
                    <button class="btn-primary btn-sm" id="btn-add-sector">Adicionar</button>
                </div>` : `
                <div style="color:var(--green); font-size:12px; margin-top:8px; font-weight:600;">
                    ✓ Todos os setores atribuídos
                </div>`}
            </div>

            <!-- ACESSOS RBAC -->
            <div class="user-drawer-section" style="background: var(--bg-2); padding: 16px; border-radius: var(--radius); border: 1px solid var(--border);">
                <h4>Acesso aos Sistemas · RBAC</h4>
                <div id="user-access-list" style="margin-bottom: 12px;">${accessHtml}</div>
                ${availableSystems.length ? `
                <div class="grant-row" style="flex-wrap:wrap;">
                    <select id="grant-system-select" style="flex:1; min-width:120px;">
                        <option value="">Selecionar sistema...</option>
                        ${availableSystems.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
                    </select>
                    <select id="grant-profile-select" style="flex:1; min-width:120px;">
                        ${_allProfiles.map(p => `<option value="${p.id}">${p.nome} · nv.${p.nivel}</option>`).join('')}
                    </select>
                    <button class="btn-primary btn-sm" id="btn-grant-access">Conceder</button>
                </div>` : `
                <div style="color:var(--green); font-size:12px; margin-top:10px; font-weight:600;">
                    ✓ Acesso a todos os sistemas configurado
                </div>`}
            </div>
        </div>
    `;

    // ── Event Listeners ──
    container.querySelectorAll('.profile-select').forEach(select => {
        select.addEventListener('change', async () => {
            try {
                await window.SGE_API.updateAccessProfile(select.dataset.accessId, select.value);
                await window.SGE_API.insertAuditLog('ALTERAR_PERFIL_ACESSO', {
                    usuario_id: user.id,
                    access_id: select.dataset.accessId,
                    novo_perfil_id: select.value
                });
                sgeToast('success', 'Perfil de acesso atualizado.');
                loadAuditLogs();
            }
            catch (err) { sgeToast('error', 'Erro ao alterar perfil: ' + err.message); }
        });
    });

    container.querySelectorAll('[data-toggle-access-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const isActive = btn.dataset.currentActive === 'true';
            try {
                await window.SGE_API.toggleAccessActive(btn.dataset.toggleAccessId, !isActive);
                await window.SGE_API.insertAuditLog(!isActive ? 'ATIVAR_ACESSO' : 'DESATIVAR_ACESSO', {
                    usuario_id: user.id,
                    access_id: btn.dataset.toggleAccessId
                });
                sgeToast('success', isActive ? 'Acesso desativado.' : 'Acesso ativado.');
                loadAuditLogs();
                openUserConfig(user);
            } catch (err) { sgeToast('error', err.message); }
        });
    });

    container.querySelectorAll('[data-revoke-access-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!await sgeConfirm('Revogar permanentemente o acesso a este sistema?', 'Revogar')) return;
            try {
                await window.SGE_API.revokeSystemAccess(btn.dataset.revokeAccessId);
                await window.SGE_API.insertAuditLog('REVOGAR_ACESSO', {
                    usuario_id: user.id,
                    access_id: btn.dataset.revokeAccessId
                });
                sgeToast('success', 'Acesso revogado com sucesso.');
                loadAuditLogs();
                openUserConfig(user);
            } catch (err) { sgeToast('error', err.message); }
        });
    });

    container.querySelectorAll('.remove-sector').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!await sgeConfirm('Remover este setor do usuário?', 'Remover')) return;
            try {
                await window.SGE_API.removeUserSector(user.id, btn.dataset.setorId);
                await window.SGE_API.insertAuditLog('REMOVER_SETOR_USUARIO', {
                    usuario_id: user.id,
                    setor_id: btn.dataset.setorId
                });
                sgeToast('success', 'Setor removido.');
                loadAuditLogs();
                openUserConfig(user);
            } catch (err) { sgeToast('error', err.message); }
        });
    });

    const grantBtn = document.getElementById('btn-grant-access');
    if (grantBtn) {
        grantBtn.addEventListener('click', async () => {
            const sistemaId = document.getElementById('grant-system-select').value;
            const perfilId = document.getElementById('grant-profile-select').value;
            if (!sistemaId) { sgeToast('warning', 'Selecione um sistema.'); return; }
            try {
                await window.SGE_API.grantSystemAccess(user.id, sistemaId, perfilId);
                await window.SGE_API.insertAuditLog('CONCEDER_ACESSO_SISTEMA', {
                    usuario_id: user.id,
                    sistema_id: sistemaId,
                    perfil_id: perfilId
                });
                sgeToast('success', 'Acesso concedido com sucesso.');
                loadAuditLogs();
                openUserConfig(user);
            } catch (err) { sgeToast('error', err.message); }
        });
    }

    const addSectorBtn = document.getElementById('btn-add-sector');
    if (addSectorBtn) {
        addSectorBtn.addEventListener('click', async () => {
            const setorId = document.getElementById('add-sector-select').value;
            if (!setorId) { sgeToast('warning', 'Selecione um setor.'); return; }
            try {
                await window.SGE_API.addUserSector(user.id, setorId);
                await window.SGE_API.insertAuditLog('ADICIONAR_SETOR_USUARIO', {
                    usuario_id: user.id,
                    setor_id: setorId
                });
                sgeToast('success', 'Setor adicionado.');
                loadAuditLogs();
                openUserConfig(user);
            } catch (err) { sgeToast('error', err.message); }
        });
    }

    switchPanel('user-config');
}


// ──────────────────────────────────────────────────────────
// CRUD ACTIONS
// ──────────────────────────────────────────────────────────
async function toggleUserStatus(id, currentActive) {
    const action = currentActive ? 'BLOQUEAR' : 'ATIVAR';
    const msg = currentActive
        ? 'Bloquear este usuário? Isso irá impedir o acesso a <strong>todos os sistemas</strong> do ecossistema SGE.'
        : 'Ativar este usuário? O acesso voltará conforme suas permissões RBAC configuradas.';
    if (!await sgeConfirm(msg, currentActive ? 'Bloquear' : 'Ativar')) return;

    try {
        await window.SGE_API.updateUser(id, { is_active: !currentActive });
        await window.SGE_API.insertAuditLog(action, { usuario_id: id });
        sgeToast('success', currentActive ? 'Usuário bloqueado.' : 'Usuário ativado.');
        loadAuditLogs();

        // Attempt to sync Supabase Auth ban
        try {
            const resp = await fetch(`${SUPABASE_PROJECT_URL}/auth/v1/admin/users/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${_serviceKey}`,
                    'apikey': _serviceKey
                },
                body: JSON.stringify({
                    ban_duration: currentActive ? '876000h' : 'none'
                })
            });
            if (!resp.ok) console.warn(`[SGE] Auth ban sync failed (${resp.status}) — RBAC still enforced`);
        } catch (banErr) {
            console.warn('[SGE] Auth ban request failed:', banErr.message);
        }

        loadUsers();
    } catch (e) { sgeToast('error', e.message); }
}

async function toggleSystemStatus(id, currentActive) {
    const msg = currentActive
        ? 'Desativar este sistema? Todos os usuários serão <strong>bloqueados</strong> de acessá-lo.'
        : 'Ativar este sistema? Os usuários com acesso configurado voltarão a conseguir entrar.';
    if (!await sgeConfirm(msg, currentActive ? 'Desativar' : 'Ativar')) return;
    try {
        await window.SGE_API.updateSystem(id, { is_active: !currentActive });
        await window.SGE_API.insertAuditLog(currentActive ? 'DESATIVAR_SISTEMA' : 'ATIVAR_SISTEMA', { sistema_id: id });
        sgeToast('success', currentActive ? 'Sistema desativado.' : 'Sistema ativado.');
        loadAuditLogs();
        _allSystems = await window.SGE_API.fetchAllSystems();
        loadSystems();
    } catch (e) { sgeToast('error', e.message); }
}

// ──────────────────────────────────────────────────────────
// MODAIS DE CRIAÇÃO
// ──────────────────────────────────────────────────────────
function showModalNewUser() {
    showModal('Novo Usuário', 'Cadastre um novo operador no ecossistema SGE.', `
        <form id="form-new-user" onsubmit="return false;">
            <div class="input-group">
                <label>Nome Completo</label>
                <input id="mu-nome" required placeholder="Ex: João Silva" autocomplete="off">
            </div>
            <div class="input-group">
                <label>E-mail Corporativo</label>
                <input id="mu-email" type="email" required placeholder="joao@gps.com.br" autocomplete="off">
            </div>
            <div class="input-group">
                <label>Senha Inicial</label>
                <input id="mu-senha" type="password" required placeholder="Senha temporária" autocomplete="new-password">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-user">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M8 2v12M2 8h12"/>
                    </svg>
                    Criar Usuário
                </button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-user').addEventListener('click', async () => {
        const nome = document.getElementById('mu-nome').value.trim();
        const email = document.getElementById('mu-email').value.trim();
        const senha = document.getElementById('mu-senha').value.trim();
        if (!nome || !email || !senha) { sgeToast('warning', 'Preencha todos os campos.'); return; }
        try {
            await window.SGE_API.createUser({ nome, email, senha_hash: senha, is_active: true });
            await window.SGE_API.insertAuditLog('CRIAR_USUARIO', { email, nome });
            sgeToast('success', `Usuário <strong>${nome}</strong> criado com sucesso.`);
            loadAuditLogs();
            closeModal();
            loadUsers();
        } catch (err) { sgeToast('error', err.message); }
    });
}

function showModalNewSector() {
    showModal('Novo Setor', 'Crie uma unidade organizacional para segregação de acesso.', `
        <form id="form-new-sector" onsubmit="return false;">
            <div class="input-group">
                <label>Sigla</label>
                <input id="ms-sigla" required placeholder="Ex: MEC" style="text-transform:uppercase;">
            </div>
            <div class="input-group">
                <label>Nome do Setor</label>
                <input id="ms-nome" required placeholder="Ex: GPS Mecanizada">
            </div>
            <div class="input-group">
                <label>Descrição <span style="color:var(--text-3); font-weight:400;">(opcional)</span></label>
                <input id="ms-desc" placeholder="Breve descrição...">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-sector">Criar Setor</button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-sector').addEventListener('click', async () => {
        const sigla = document.getElementById('ms-sigla').value.trim().toUpperCase();
        const nome = document.getElementById('ms-nome').value.trim();
        if (!sigla || !nome) { sgeToast('warning', 'Preencha sigla e nome.'); return; }
        try {
            await window.SGE_API.createSector({
                sigla, nome,
                descricao: document.getElementById('ms-desc').value.trim(),
                is_active: true
            });
            await window.SGE_API.insertAuditLog('CRIAR_SETOR', { sigla, nome });
            sgeToast('success', `Setor <strong>${sigla}</strong> criado com sucesso.`);
            loadAuditLogs();
            closeModal();
            _allSectors = await window.SGE_API.fetchAllSectors();
            loadSectors();
        } catch (err) { sgeToast('error', err.message); }
    });
}

function showModalNewSystem() {
    showModal('Novo Sistema', 'Registre um sistema satélite no Ecossistema SGE.', `
        <form id="form-new-system" onsubmit="return false;">
            <div class="input-group">
                <label>Nome do Sistema</label>
                <input id="msys-nome" required placeholder="Ex: Gestão de Efetivo">
            </div>
            <div class="input-group">
                <label>Slug <span style="color:var(--text-3); font-weight:400;">(identificador único)</span></label>
                <input id="msys-slug" required placeholder="Ex: gestao_efetivo_mec">
            </div>
            <div class="input-group">
                <label>URL de Origem <span style="color:var(--text-3); font-weight:400;">(opcional)</span></label>
                <input id="msys-url" placeholder="https://...">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-system">Registrar Sistema</button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-system').addEventListener('click', async () => {
        const nome = document.getElementById('msys-nome').value.trim();
        const slug = document.getElementById('msys-slug').value.trim().toLowerCase().replace(/\s+/g, '_');
        if (!nome || !slug) { sgeToast('warning', 'Preencha nome e slug.'); return; }
        try {
            await window.SGE_API.createSystem({
                nome, slug,
                url_origem: document.getElementById('msys-url').value.trim(),
                is_active: true
            });
            await window.SGE_API.insertAuditLog('CRIAR_SISTEMA', { slug, nome });
            sgeToast('success', `Sistema <strong>${nome}</strong> registrado com sucesso.`);
            loadAuditLogs();
            closeModal();
            _allSystems = await window.SGE_API.fetchAllSystems();
            loadSystems();
        } catch (err) { sgeToast('error', err.message); }
    });
}

function showModalEditSystem(system) {
    showModal('Editar Sistema', `Atualize as informações do sistema <strong>${system.nome}</strong>.`, `
        <form id="form-edit-system" onsubmit="return false;">
            <div class="input-group">
                <label>Nome do Sistema</label>
                <input id="esys-nome" required value="${system.nome}" placeholder="Ex: Gestão de Efetivo">
            </div>
            <div class="input-group">
                <label>Slug <span style="color:var(--text-3); font-weight:400;">(identificador único)</span></label>
                <input id="esys-slug" required value="${system.slug}" placeholder="Ex: gestao_efetivo_mec">
            </div>
            <div class="input-group">
                <label>URL de Origem <span style="color:var(--text-3); font-weight:400;">(opcional)</span></label>
                <input id="esys-url" value="${system.url_origem || ''}" placeholder="https://...">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-edit-system">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2">
                        <polyline points="13 2 6 9 3 6"/>
                    </svg>
                    Salvar Alterações
                </button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-edit-system').addEventListener('click', async () => {
        const nome = document.getElementById('esys-nome').value.trim();
        const slug = document.getElementById('esys-slug').value.trim().toLowerCase().replace(/\s+/g, '_');
        if (!nome || !slug) { sgeToast('warning', 'Preencha nome e slug.'); return; }
        try {
            await window.SGE_API.updateSystem(system.id, {
                nome, slug,
                url_origem: document.getElementById('esys-url').value.trim() || null
            });
            await window.SGE_API.insertAuditLog('EDITAR_SISTEMA', { sistema_id: system.id, nome, slug });
            sgeToast('success', `Sistema <strong>${nome}</strong> atualizado.`);
            loadAuditLogs();
            closeModal();
            _allSystems = await window.SGE_API.fetchAllSystems();
            loadSystems();
        } catch (err) { sgeToast('error', err.message); }
    });
}
