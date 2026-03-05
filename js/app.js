/**
 * CENTRAL SGE — App Controller
 * Grupo GPS · Governança Master · CRUD + Radar + RBAC
 */
const SUPABASE_PROJECT_URL = "https://mgcjidryrjqiceielmzp.supabase.co";

let _allSystems = [];
let _allProfiles = [];
let _allSectors = [];

document.addEventListener('DOMContentLoaded', () => {
    // ========== DUAL-MODE DETECTION ==========
    // If URL has ?app_slug → SSO mode (satellite system authentication)
    // Otherwise → Admin Panel mode (Service Role Key governance)
    if (window.SGE_SSO && window.SGE_SSO.isSSO()) {
        window.SGE_SSO.init();
        return; // SSO handles everything — stop here
    }

    // ========== ADMIN PANEL MODE ==========
    const adminLoginView = document.getElementById('admin-login-view');
    const dashView = document.getElementById('dashboard-view');
    adminLoginView.classList.remove('hidden');

    // ========== LOGIN ==========
    const doLogin = async () => {
        const key = document.getElementById('login-key').value.trim();
        if (!key) return;
        const errEl = document.getElementById('login-error');
        errEl.textContent = '';

        const ok = window.SGE_API.initSupabase(SUPABASE_PROJECT_URL, key);
        if (!ok) {
            errEl.textContent = 'Erro ao inicializar conexão.';
            return;
        }

        try {
            // Test key validity
            await window.SGE_API.fetchAllSectors();
            adminLoginView.classList.add('hidden');
            dashView.classList.remove('hidden');
            loadAllData();
        } catch (err) {
            errEl.textContent = 'Chave inválida ou sem permissão.';
            console.error('Login error:', err);
        }
    };

    document.getElementById('btn-login').addEventListener('click', doLogin);
    document.getElementById('login-key').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // ========== LOGOUT ==========
    const doLogout = () => {
        window.SGE_API.initSupabase('', '');
        document.getElementById('login-key').value = '';
        dashView.classList.add('hidden');
        adminLoginView.classList.remove('hidden');
        closeNav();
    };
    document.getElementById('btn-logout').addEventListener('click', doLogout);
    document.getElementById('nav-logout-btn').addEventListener('click', doLogout);

    // ========== NAVIGATION DRAWER ==========
    const navOverlay = document.getElementById('nav-menu-overlay');

    document.getElementById('nav-menu-btn').addEventListener('click', () => {
        navOverlay.classList.remove('hidden');
    });

    navOverlay.addEventListener('click', (e) => {
        if (e.target === navOverlay) closeNav();
    });

    document.querySelectorAll('.nav-menu-item[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchPanel(btn.dataset.panel);
            closeNav();
        });
    });

    // ========== ACTION BUTTONS ==========
    document.getElementById('btn-create-user').addEventListener('click', showModalNewUser);
    document.getElementById('btn-create-sector').addEventListener('click', showModalNewSector);
    document.getElementById('btn-create-system').addEventListener('click', showModalNewSystem);
});

function closeNav() {
    document.getElementById('nav-menu-overlay').classList.add('hidden');
}

function switchPanel(panelId) {
    document.querySelectorAll('.nav-menu-item[data-panel]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-menu-item[data-panel="${panelId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('#main > .panel').forEach(p => {
        p.classList.remove('active');
    });
    const target = document.getElementById(`panel-${panelId}`);
    if (target) {
        target.classList.add('active');
    }
}

// ========== HELPERS ==========
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

// ========== DATA LOADERS ==========
async function loadAllData() {
    try {
        [_allSystems, _allProfiles, _allSectors] = await Promise.all([
            window.SGE_API.fetchAllSystems(),
            window.SGE_API.fetchAllProfiles(),
            window.SGE_API.fetchAllSectors()
        ]);
    } catch (e) {
        console.error('Error loading reference data:', e);
    }

    // Load each independently — one failure shouldn't block others
    loadSessions();
    loadUsers();
    loadSectors();
    loadSystems();
    loadAuditLogs();
}

// ---------- SESSÕES ----------
async function loadSessions() {
    try {
        const sessions = await window.SGE_API.fetchActiveSessions();
        const tbody = document.getElementById('table-sessions');
        tbody.innerHTML = '';

        let online = 0, away = 0, offline = 0;

        if (!sessions.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhuma sessão ativa no momento</td></tr>';
        } else {
            sessions.forEach(s => {
                if (s.status === 'online') online++;
                else if (s.status === 'away') away++;
                else offline++;

                const statusLabel = s.status === 'online' ? 'Online' : s.status === 'away' ? 'Ausente' : 'Offline';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="status-badge ${s.status}"><span class="status-dot ${s.status}"></span>${statusLabel}</span></td>
                    <td><strong>${s.usuarios?.nome || 'N/A'}</strong><br><small style="color:var(--text-3)">${s.usuarios?.email || ''}</small></td>
                    <td>${s.sistemas?.nome || 'N/A'}</td>
                    <td><code>${s.ip_address || '—'}</code></td>
                    <td><small>${new Date(s.ultimo_ping_em).toLocaleString('pt-BR')}</small></td>
                `;
                tbody.appendChild(tr);
            });
        }

        document.getElementById('kpi-online').textContent = online;
        document.getElementById('kpi-away').textContent = away;
        document.getElementById('kpi-offline').textContent = offline;
    } catch (e) { console.error('Sessões:', e); }
}

// ---------- USUÁRIOS ----------
async function loadUsers() {
    try {
        const users = await window.SGE_API.fetchAllUsers();
        const tbody = document.getElementById('table-users');
        tbody.innerHTML = '';

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Nenhum usuário cadastrado</td></tr>';
            return;
        }

        users.forEach(u => {
            const statusBadge = u.is_active
                ? '<span class="status-badge active">Ativo</span>'
                : '<span class="status-badge blocked">Bloqueado</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.nome}</strong></td>
                <td>${u.email}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-primary btn-sm btn-config-user">⚙ Configurar</button>
                    <button class="btn-secondary btn-sm btn-toggle-user">${u.is_active ? 'Bloquear' : 'Ativar'}</button>
                </td>
            `;
            tr.querySelector('.btn-config-user').addEventListener('click', () => openUserDrawer(u));
            tr.querySelector('.btn-toggle-user').addEventListener('click', () => toggleUserStatus(u.id, u.is_active));
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Users:', e); }
}

// ---------- SETORES ----------
async function loadSectors() {
    try {
        const items = _allSectors.length ? _allSectors : await window.SGE_API.fetchAllSectors();
        const tbody = document.getElementById('table-sectors');
        tbody.innerHTML = '';
        items.forEach(i => {
            const statusBadge = i.is_active
                ? '<span class="status-badge active">Ativo</span>'
                : '<span class="status-badge blocked">Inativo</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${i.sigla}</code></td>
                <td><strong>${i.nome}</strong></td>
                <td>${statusBadge}</td>
                <td>—</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Setores:', e); }
}

// ---------- SISTEMAS ----------
async function loadSystems() {
    try {
        const items = _allSystems.length ? _allSystems : await window.SGE_API.fetchAllSystems();
        const tbody = document.getElementById('table-systems');
        tbody.innerHTML = '';
        items.forEach(i => {
            const statusBadge = i.is_active
                ? '<span class="status-badge active">Online</span>'
                : '<span class="status-badge blocked">Offline</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${i.nome}</strong></td>
                <td><code>${i.slug}</code></td>
                <td>${statusBadge}</td>
                <td><a href="${i.url_origem || '#'}" target="_blank" style="font-size:12px; color:var(--accent);">${i.url_origem ? '↗ Acessar' : '—'}</a></td>
                <td><button class="btn-secondary btn-sm btn-toggle-sys">${i.is_active ? 'Desativar' : 'Ativar'}</button></td>
            `;
            tr.querySelector('.btn-toggle-sys').addEventListener('click', () => toggleSystemStatus(i.id, i.is_active));
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Sistemas:', e); }
}

// ---------- AUDITORIA ----------
async function loadAuditLogs() {
    try {
        const logs = await window.SGE_API.fetchAuditLogs();
        const tbody = document.getElementById('table-auditoria');
        tbody.innerHTML = '';

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Nenhum registro de auditoria</td></tr>';
            return;
        }

        logs.forEach(l => {
            const detalhes = l.detalhes ? (typeof l.detalhes === 'object' ? JSON.stringify(l.detalhes) : l.detalhes) : '—';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${new Date(l.realizado_em).toLocaleString('pt-BR')}</small></td>
                <td>${l.admin?.nome || l.admin_id || '—'}</td>
                <td><code>${l.acao}</code></td>
                <td style="color:var(--text-3);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${detalhes}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Audit:', e); }
}

// ========================================================================
// RBAC USER DRAWER — Configuração de Permissões
// ========================================================================
async function openUserDrawer(user) {
    let userAccess = [];
    let userSectors = [];

    try {
        [userAccess, userSectors] = await Promise.all([
            window.SGE_API.fetchUserAccess(user.id),
            window.SGE_API.fetchUserSectors(user.id)
        ]);
    } catch (e) {
        console.error('Error loading user data:', e);
    }

    const container = document.getElementById('user-drawer-container');
    const statusBadge = user.is_active
        ? '<span class="status-badge active" style="margin-left:8px">Ativo</span>'
        : '<span class="status-badge blocked" style="margin-left:8px">Bloqueado</span>';

    // Access list
    const accessHtml = userAccess.length
        ? userAccess.map(a => {
            const isActive = a.is_active !== false;
            return `
                <div class="access-row">
                    <div style="flex:1">
                        <div class="system-name">${a.sistema?.nome || '?'}</div>
                        <div class="system-slug">${a.sistema?.slug || ''}</div>
                    </div>
                    <select class="profile-select" data-access-id="${a.id}">
                        ${_allProfiles.map(p => `<option value="${p.id}" ${p.id === a.perfil_id ? 'selected' : ''}>${p.nome} (nv.${p.nivel})</option>`).join('')}
                    </select>
                    <button class="btn-sm ${isActive ? 'btn-danger' : 'btn-primary'}" data-toggle-access-id="${a.id}" data-current-active="${isActive}">
                        ${isActive ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn-revoke" data-revoke-access-id="${a.id}" title="Revogar permanentemente">✕</button>
                </div>
            `;
        }).join('')
        : '<div style="color:var(--text-3); font-size:13px; padding:12px 0;">Nenhum acesso configurado — adicione abaixo</div>';

    // Sector tags
    const sectorTagsHtml = userSectors.length
        ? userSectors.map(us => `
            <span class="sector-tag">
                ${us.setor?.sigla || '?'} — ${us.setor?.nome || ''}
                <button class="remove-sector" data-setor-id="${us.setor_id}" title="Remover setor">×</button>
            </span>
        `).join('')
        : '<span style="color:var(--text-3); font-size:13px;">Nenhum setor atribuído</span>';

    // Available systems & sectors
    const grantedSystemIds = userAccess.map(a => a.sistema_id);
    const availableSystems = _allSystems.filter(s => !grantedSystemIds.includes(s.id));
    const assignedSectorIds = userSectors.map(us => us.setor_id);
    const availableSectors = _allSectors.filter(s => !assignedSectorIds.includes(s.id));

    container.innerHTML = `
        <div class="user-drawer-overlay" id="user-drawer-overlay">
            <div class="user-drawer" onclick="event.stopPropagation()">
                <div class="user-drawer-header">
                    <div>
                        <h3>${user.nome} ${statusBadge}</h3>
                        <div style="font-size:12px; color:var(--text-3); margin-top:4px;">${user.email}</div>
                    </div>
                    <button class="topbar-icon-btn" id="close-user-drawer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="user-drawer-body">
                    <div class="user-drawer-section">
                        <h4>Setores do Usuário</h4>
                        <div id="user-sectors-tags">${sectorTagsHtml}</div>
                        ${availableSectors.length ? `
                        <div class="grant-row" style="margin-top:8px;">
                            <select id="add-sector-select">
                                <option value="">+ Adicionar setor...</option>
                                ${availableSectors.map(s => `<option value="${s.id}">${s.sigla} — ${s.nome}</option>`).join('')}
                            </select>
                            <button class="btn-primary btn-sm" id="btn-add-sector">Adicionar</button>
                        </div>` : ''}
                    </div>

                    <div class="user-drawer-section">
                        <h4>Acesso aos Sistemas · Nível RBAC</h4>
                        <div id="user-access-list">${accessHtml}</div>
                        ${availableSystems.length ? `
                        <div class="grant-row">
                            <select id="grant-system-select">
                                <option value="">+ Conceder acesso...</option>
                                ${availableSystems.map(s => `<option value="${s.id}">${s.nome} (${s.slug})</option>`).join('')}
                            </select>
                            <select id="grant-profile-select">
                                ${_allProfiles.map(p => `<option value="${p.id}">${p.nome} (nv.${p.nivel})</option>`).join('')}
                            </select>
                            <button class="btn-primary btn-sm" id="btn-grant-access">Conceder</button>
                        </div>` : '<div style="color:var(--green); font-size:12px; margin-top:10px; font-weight:600;">✓ Acesso a todos os sistemas configurado</div>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    // ---- Event Listeners ----
    document.getElementById('close-user-drawer').addEventListener('click', closeUserDrawer);
    document.getElementById('user-drawer-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'user-drawer-overlay') closeUserDrawer();
    });

    // Change profile
    container.querySelectorAll('.profile-select').forEach(select => {
        select.addEventListener('change', async () => {
            try {
                await window.SGE_API.updateAccessProfile(select.dataset.accessId, select.value);
            } catch (err) { alert('Erro ao alterar perfil: ' + err.message); }
        });
    });

    // Toggle access active/inactive
    container.querySelectorAll('[data-toggle-access-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const isActive = btn.dataset.currentActive === 'true';
            try {
                await window.SGE_API.toggleAccessActive(btn.dataset.toggleAccessId, !isActive);
                openUserDrawer(user);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    });

    // Revoke access permanently
    container.querySelectorAll('[data-revoke-access-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Revogar acesso permanentemente a este sistema?')) return;
            try {
                await window.SGE_API.revokeSystemAccess(btn.dataset.revokeAccessId);
                openUserDrawer(user);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    });

    // Remove sector (composite key — pass userId + setorId)
    container.querySelectorAll('.remove-sector').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remover este setor do usuário?')) return;
            try {
                await window.SGE_API.removeUserSector(user.id, btn.dataset.setorId);
                openUserDrawer(user);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    });

    // Grant access
    const grantBtn = document.getElementById('btn-grant-access');
    if (grantBtn) {
        grantBtn.addEventListener('click', async () => {
            const sistemaId = document.getElementById('grant-system-select').value;
            const perfilId = document.getElementById('grant-profile-select').value;
            if (!sistemaId) { alert('Selecione um sistema.'); return; }
            try {
                await window.SGE_API.grantSystemAccess(user.id, sistemaId, perfilId);
                openUserDrawer(user);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    }

    // Add sector
    const addSectorBtn = document.getElementById('btn-add-sector');
    if (addSectorBtn) {
        addSectorBtn.addEventListener('click', async () => {
            const setorId = document.getElementById('add-sector-select').value;
            if (!setorId) { alert('Selecione um setor.'); return; }
            try {
                await window.SGE_API.addUserSector(user.id, setorId);
                openUserDrawer(user);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    }
}

function closeUserDrawer() {
    document.getElementById('user-drawer-container').innerHTML = '';
}

// ========== CRUD ACTIONS ==========
async function toggleUserStatus(id, currentActive) {
    const action = currentActive ? 'BLOQUEAR' : 'ATIVAR';
    if (!confirm(`Deseja ${action} este usuário?`)) return;
    try {
        await window.SGE_API.updateUser(id, { is_active: !currentActive });
        loadUsers();
    } catch (e) { alert('Erro: ' + e.message); }
}

async function toggleSystemStatus(id, currentActive) {
    const action = currentActive ? 'DESATIVAR' : 'ATIVAR';
    if (!confirm(`Deseja ${action} este sistema?`)) return;
    try {
        await window.SGE_API.updateSystem(id, { is_active: !currentActive });
        _allSystems = await window.SGE_API.fetchAllSystems();
        loadSystems();
    } catch (e) { alert('Erro: ' + e.message); }
}

// ========== MODAIS DE CRIAÇÃO ==========
function showModalNewUser() {
    showModal('Novo Usuário', 'Cadastre um novo operador no ecossistema.', `
        <form id="form-new-user" onsubmit="return false;">
            <div class="input-group"><label>Nome Completo</label><input id="mu-nome" required placeholder="Ex: João Silva"></div>
            <div class="input-group"><label>E-mail</label><input id="mu-email" type="email" required placeholder="joao@gps.com.br"></div>
            <div class="input-group"><label>Senha Inicial</label><input id="mu-senha" type="password" required placeholder="Senha temporária"></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-user">Criar Usuário</button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-user').addEventListener('click', async () => {
        const nome = document.getElementById('mu-nome').value.trim();
        const email = document.getElementById('mu-email').value.trim();
        const senha = document.getElementById('mu-senha').value.trim();
        if (!nome || !email || !senha) { alert('Preencha todos os campos.'); return; }
        try {
            await window.SGE_API.createUser({ nome, email, senha_hash: senha, is_active: true });
            closeModal();
            loadUsers();
        } catch (err) { alert('Erro: ' + err.message); }
    });
}

function showModalNewSector() {
    showModal('Novo Setor', 'Crie uma unidade organizacional para segregação de acesso.', `
        <form id="form-new-sector" onsubmit="return false;">
            <div class="input-group"><label>Sigla</label><input id="ms-sigla" required placeholder="Ex: MEC"></div>
            <div class="input-group"><label>Nome</label><input id="ms-nome" required placeholder="Ex: GPS Mecanizada"></div>
            <div class="input-group"><label>Descrição</label><input id="ms-desc" placeholder="Opcional"></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-sector">Criar Setor</button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-sector').addEventListener('click', async () => {
        const sigla = document.getElementById('ms-sigla').value.trim().toUpperCase();
        const nome = document.getElementById('ms-nome').value.trim();
        if (!sigla || !nome) { alert('Preencha sigla e nome.'); return; }
        try {
            await window.SGE_API.createSector({
                sigla, nome,
                descricao: document.getElementById('ms-desc').value.trim(),
                is_active: true
            });
            closeModal();
            _allSectors = await window.SGE_API.fetchAllSectors();
            loadSectors();
        } catch (err) { alert('Erro: ' + err.message); }
    });
}

function showModalNewSystem() {
    showModal('Novo Sistema', 'Registre um sistema satélite no Ecossistema SGE.', `
        <form id="form-new-system" onsubmit="return false;">
            <div class="input-group"><label>Nome</label><input id="msys-nome" required placeholder="Ex: Gestão de Efetivo"></div>
            <div class="input-group"><label>Slug (identificador)</label><input id="msys-slug" required placeholder="Ex: gestao_efetivo_mec"></div>
            <div class="input-group"><label>URL de Origem</label><input id="msys-url" placeholder="https://..."></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary" id="btn-submit-system">Registrar Sistema</button>
            </div>
        </form>
    `);
    document.getElementById('btn-submit-system').addEventListener('click', async () => {
        const nome = document.getElementById('msys-nome').value.trim();
        const slug = document.getElementById('msys-slug').value.trim().toLowerCase();
        if (!nome || !slug) { alert('Preencha nome e slug.'); return; }
        try {
            await window.SGE_API.createSystem({
                nome, slug,
                url_origem: document.getElementById('msys-url').value.trim(),
                is_active: true
            });
            closeModal();
            _allSystems = await window.SGE_API.fetchAllSystems();
            loadSystems();
        } catch (err) { alert('Erro: ' + err.message); }
    });
}
