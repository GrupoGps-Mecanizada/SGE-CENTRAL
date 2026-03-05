/**
 * CENTRAL SGE — App Controller
 * Grupo GPS · Governança Master · CRUD + Radar + RBAC
 */
const SUPABASE_PROJECT_URL = "https://mgcjidryrjqiceielmzp.supabase.co";

// Caches for dropdowns
let _allSystems = [];
let _allProfiles = [];
let _allSectors = [];

document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const dashView = document.getElementById('dashboard-view');

    // ========== LOGIN ==========
    document.getElementById('btn-login').addEventListener('click', async () => {
        const key = document.getElementById('login-key').value.trim();
        if (!key) return;
        const errEl = document.getElementById('login-error');
        errEl.textContent = '';

        const ok = window.SGE_API.initSupabase(SUPABASE_PROJECT_URL, key);
        if (ok) {
            try {
                await window.SGE_API.fetchAllSectors();
                loginView.style.display = 'none';
                dashView.classList.remove('hidden');
                loadAllData();
            } catch (err) {
                errEl.textContent = 'Chave inválida ou sem permissão.';
                console.error(err);
            }
        }
    });

    document.getElementById('login-key').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-login').click();
    });

    // ========== LOGOUT ==========
    const doLogout = () => {
        window.SGE_API.initSupabase('', '');
        document.getElementById('login-key').value = '';
        dashView.classList.add('hidden');
        loginView.style.display = 'flex';
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

    // Panel navigation
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
    // Update nav active state
    document.querySelectorAll('.nav-menu-item[data-panel]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-menu-item[data-panel="${panelId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Show target panel, hide others
    document.querySelectorAll('#main > .panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const target = document.getElementById(`panel-${panelId}`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
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
    // Cache reference data
    [_allSystems, _allProfiles, _allSectors] = await Promise.all([
        window.SGE_API.fetchAllSystems(),
        window.SGE_API.fetchAllProfiles(),
        window.SGE_API.fetchAllSectors()
    ]);

    await Promise.all([loadSessions(), loadUsers(), loadSectors(), loadSystems(), loadAuditLogs()]);
}

// ---------- SESSÕES ----------
async function loadSessions() {
    try {
        const sessions = await window.SGE_API.fetchActiveSessions();
        const tbody = document.getElementById('table-sessions');
        tbody.innerHTML = '';

        if (!sessions.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhuma sessão ativa no momento</td></tr>';
        }

        let online = 0, away = 0, offline = 0;
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
        users.forEach(u => {
            const statusBadge = u.is_active
                ? '<span class="status-badge active">Ativo</span>'
                : '<span class="status-badge blocked">Bloqueado</span>';
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.innerHTML = `
                <td><strong>${u.nome}</strong></td>
                <td>${u.email}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-primary btn-sm" data-action="config" data-uid="${u.id}">⚙ Configurar</button>
                    <button class="btn-secondary btn-sm" data-action="toggle" data-uid="${u.id}" data-active="${u.is_active}">${u.is_active ? 'Bloquear' : 'Ativar'}</button>
                </td>
            `;
            // Config button opens RBAC drawer
            tr.querySelector('[data-action="config"]').addEventListener('click', (e) => {
                e.stopPropagation();
                openUserDrawer(u);
            });
            // Toggle button
            tr.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleUserStatus(u.id, u.is_active);
            });
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
                <td><a href="${i.url_origem}" target="_blank" style="font-size:12px; color:var(--accent);">${i.url_origem ? '↗ Acessar' : '—'}</a></td>
                <td><button class="btn-secondary btn-sm" onclick="toggleSystemStatus('${i.id}', ${i.is_active})">${i.is_active ? 'Desativar' : 'Ativar'}</button></td>
            `;
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
            const detalhesStr = l.detalhes ? (typeof l.detalhes === 'object' ? JSON.stringify(l.detalhes) : l.detalhes) : '—';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${new Date(l.realizado_em).toLocaleString('pt-BR')}</small></td>
                <td>${l.admin?.nome || l.admin_id || '—'}</td>
                <td><code>${l.acao}</code></td>
                <td style="color:var(--text-3);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${detalhesStr}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Audit:', e); }
}

// ========================================================================
// RBAC USER DRAWER — Configuração Inteligente de Permissões
// ========================================================================

async function openUserDrawer(user) {
    // Load user's permissions and sectors
    const [userAccess, userSectors] = await Promise.all([
        window.SGE_API.fetchUserAccess(user.id),
        window.SGE_API.fetchUserSectors(user.id)
    ]);

    const container = document.getElementById('user-drawer-container');
    const statusBadge = user.is_active
        ? '<span class="status-badge active" style="margin-left:8px">Ativo</span>'
        : '<span class="status-badge blocked" style="margin-left:8px">Bloqueado</span>';

    // Build access list
    const accessHtml = userAccess.length
        ? userAccess.map(a => `
            <div class="access-row" data-access-id="${a.id}">
                <div>
                    <div class="system-name">${a.sistema?.nome || '?'}</div>
                    <div class="system-slug">${a.sistema?.slug || ''}</div>
                </div>
                <select class="profile-select" data-access-id="${a.id}">
                    ${_allProfiles.map(p => `<option value="${p.id}" ${p.id === a.perfil_id ? 'selected' : ''}>${p.nome} (${p.nivel})</option>`).join('')}
                </select>
                <button class="btn-revoke" data-access-id="${a.id}">✕</button>
            </div>
        `).join('')
        : '<div style="color:var(--text-3); font-size:13px; padding:12px 0;">Nenhum acesso configurado</div>';

    // Build sector tags
    const sectorTagsHtml = userSectors.map(us => `
        <span class="sector-tag">
            ${us.setor?.sigla || '?'} — ${us.setor?.nome || ''}
            <button class="remove-sector" data-link-id="${us.id}" title="Remover setor">×</button>
        </span>
    `).join('') || '<span style="color:var(--text-3); font-size:13px;">Nenhum setor atribuído</span>';

    // Systems not yet granted
    const grantedSystemIds = userAccess.map(a => a.sistema_id);
    const availableSystems = _allSystems.filter(s => !grantedSystemIds.includes(s.id) && s.is_active);

    // Sectors not yet assigned
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
                    <!-- SETORES -->
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
                        </div>
                        ` : ''}
                    </div>

                    <!-- ACESSOS A SISTEMAS -->
                    <div class="user-drawer-section">
                        <h4>Acesso aos Sistemas · Nível RBAC</h4>
                        <div id="user-access-list">${accessHtml}</div>
                        ${availableSystems.length ? `
                        <div class="grant-row">
                            <select id="grant-system-select">
                                <option value="">+ Conceder acesso...</option>
                                ${availableSystems.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
                            </select>
                            <select id="grant-profile-select">
                                ${_allProfiles.map(p => `<option value="${p.id}">${p.nome} (${p.nivel})</option>`).join('')}
                            </select>
                            <button class="btn-primary btn-sm" id="btn-grant-access">Conceder</button>
                        </div>
                        ` : '<div style="color:var(--green); font-size:12px; margin-top:10px; font-weight:600;">✓ Acesso a todos os sistemas configurado</div>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    // ---- Event Listeners ----

    // Close drawer
    document.getElementById('close-user-drawer').addEventListener('click', closeUserDrawer);
    document.getElementById('user-drawer-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'user-drawer-overlay') closeUserDrawer();
    });

    // Change profile level
    container.querySelectorAll('.profile-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const accessId = e.target.dataset.accessId;
            try {
                await window.SGE_API.updateAccessProfile(accessId, e.target.value);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    });

    // Revoke access
    container.querySelectorAll('.btn-revoke').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Revogar acesso a este sistema?')) return;
            try {
                await window.SGE_API.revokeSystemAccess(btn.dataset.accessId);
                openUserDrawer(user); // Refresh
            } catch (err) { alert('Erro: ' + err.message); }
        });
    });

    // Remove sector
    container.querySelectorAll('.remove-sector').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remover este setor do usuário?')) return;
            try {
                await window.SGE_API.removeUserSector(btn.dataset.linkId);
                openUserDrawer(user);
            } catch (err) { alert('Erro: ' + err.message); }
        });
    });

    // Grant new access
    const grantBtn = document.getElementById('btn-grant-access');
    if (grantBtn) {
        grantBtn.addEventListener('click', async () => {
            const sistemaId = document.getElementById('grant-system-select').value;
            const perfilId = document.getElementById('grant-profile-select').value;
            if (!sistemaId) return alert('Selecione um sistema.');
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
            if (!setorId) return alert('Selecione um setor.');
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

window.toggleSystemStatus = async function (id, currentActive) {
    const action = currentActive ? 'DESATIVAR' : 'ATIVAR';
    if (!confirm(`Deseja ${action} este sistema?`)) return;
    try {
        await window.SGE_API.updateSystem(id, { is_active: !currentActive });
        _allSystems = await window.SGE_API.fetchAllSystems();
        loadSystems();
    } catch (e) { alert('Erro: ' + e.message); }
};

// ========== MODAIS DE CRIAÇÃO ==========
function showModalNewUser() {
    showModal('Novo Usuário', 'Cadastre um novo operador no ecossistema.', `
        <form id="form-new-user">
            <div class="input-group"><label>Nome Completo</label><input id="mu-nome" required placeholder="Ex: João Silva"></div>
            <div class="input-group"><label>E-mail</label><input id="mu-email" type="email" required placeholder="joao@gps.com.br"></div>
            <div class="input-group"><label>Senha Inicial</label><input id="mu-senha" required placeholder="Senha temporária"></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Criar Usuário</button>
            </div>
        </form>
    `);
    document.getElementById('form-new-user').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await window.SGE_API.createUser({
                nome: document.getElementById('mu-nome').value,
                email: document.getElementById('mu-email').value,
                senha_hash: document.getElementById('mu-senha').value,
                is_active: true
            });
            closeModal();
            loadUsers();
        } catch (err) { alert('Erro: ' + err.message); }
    });
}

function showModalNewSector() {
    showModal('Novo Setor', 'Crie uma unidade organizacional para segregação de acesso.', `
        <form id="form-new-sector">
            <div class="input-group"><label>Sigla</label><input id="ms-sigla" required placeholder="Ex: MEC"></div>
            <div class="input-group"><label>Nome</label><input id="ms-nome" required placeholder="Ex: GPS Mecanizada"></div>
            <div class="input-group"><label>Descrição</label><input id="ms-desc" placeholder="Opcional"></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Criar Setor</button>
            </div>
        </form>
    `);
    document.getElementById('form-new-sector').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await window.SGE_API.createSector({
                sigla: document.getElementById('ms-sigla').value.toUpperCase(),
                nome: document.getElementById('ms-nome').value,
                descricao: document.getElementById('ms-desc').value,
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
        <form id="form-new-system">
            <div class="input-group"><label>Nome</label><input id="msys-nome" required placeholder="Ex: Gestão de Efetivo"></div>
            <div class="input-group"><label>Slug (identificador)</label><input id="msys-slug" required placeholder="Ex: gestao_efetivo_mec"></div>
            <div class="input-group"><label>URL de Origem</label><input id="msys-url" placeholder="https://..."></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Registrar Sistema</button>
            </div>
        </form>
    `);
    document.getElementById('form-new-system').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await window.SGE_API.createSystem({
                nome: document.getElementById('msys-nome').value,
                slug: document.getElementById('msys-slug').value.toLowerCase(),
                url_origem: document.getElementById('msys-url').value,
                is_active: true
            });
            closeModal();
            _allSystems = await window.SGE_API.fetchAllSystems();
            loadSystems();
        } catch (err) { alert('Erro: ' + err.message); }
    });
}
