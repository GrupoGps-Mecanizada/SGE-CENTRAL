/**
 * CENTRAL SGE — App Controller
 * Grupo GPS · Governança Master · CRUD + Radar
 */
const SUPABASE_PROJECT_URL = "https://mgcjidryrjqiceielmzp.supabase.co";

document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const dashView = document.getElementById('dashboard-view');
    const formLogin = document.getElementById('form-login');

    // ========== LOGIN ==========
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('admin-key').value.trim();
        if (!key) return;
        toggleLoading(true);

        const ok = window.SGE_API.initSupabase(SUPABASE_PROJECT_URL, key);
        if (ok) {
            try {
                await window.SGE_API.fetchAllSectors(); // Teste de chave
                loginView.classList.add('hidden');
                dashView.classList.remove('hidden');
                loadAllData();
            } catch (err) {
                alert("Chave inválida ou sem permissão.");
                console.error(err);
            }
        }
        toggleLoading(false);
    });

    // ========== LOGOUT ==========
    document.getElementById('btn-logout').addEventListener('click', () => {
        window.SGE_API.initSupabase('', '');
        document.getElementById('admin-key').value = '';
        dashView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });

    // ========== NAVIGATION ==========
    document.querySelectorAll('.menu button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.menu button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        });
    });

    // ========== ACTION BUTTONS ==========
    document.getElementById('btn-refresh-sessions').addEventListener('click', loadSessions);
    document.getElementById('btn-new-user').addEventListener('click', showModalNewUser);
    document.getElementById('btn-new-sector').addEventListener('click', showModalNewSector);
    document.getElementById('btn-new-system').addEventListener('click', showModalNewSystem);
    const logBtn = document.getElementById('btn-refresh-logs');
    if (logBtn) logBtn.addEventListener('click', loadAuditLogs);
});

// ========== HELPERS ==========
function toggleLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

function closeModal() {
    document.getElementById('modal-container').innerHTML = '';
}

function showModal(title, subtitle, formHtml) {
    document.getElementById('modal-container').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
            <div class="modal">
                <h3>${title}</h3>
                <p class="modal-sub">${subtitle}</p>
                ${formHtml}
            </div>
        </div>
    `;
}

// ========== DATA LOADERS ==========
async function loadAllData() {
    toggleLoading(true);
    await Promise.all([loadSessions(), loadUsers(), loadSectors(), loadSystems(), loadAuditLogs()]);
    toggleLoading(false);
}

// ---------- SESSÕES ----------
async function loadSessions() {
    try {
        const sessions = await window.SGE_API.fetchActiveSessions();
        const tbody = document.querySelector('#table-sessoes tbody');
        const empty = document.getElementById('empty-sessoes');
        tbody.innerHTML = '';

        if (!sessions.length) { empty.classList.remove('hidden'); }
        else { empty.classList.add('hidden'); }

        let online = 0, away = 0;
        sessions.forEach(s => {
            if (s.status === 'online') online++;
            else if (s.status === 'away') away++;

            const statusClass = s.status;
            const statusLabel = s.status === 'online' ? 'Online' : s.status === 'away' ? 'Ausente' : 'Offline';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${s.usuarios?.nome || 'N/A'}</strong><br><small style="color:var(--text-3)">${s.usuarios?.email || ''}</small></td>
                <td>${s.sistemas?.nome || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}"><span class="status-dot ${statusClass}"></span>${statusLabel}</span><br><small style="color:var(--text-3)">${new Date(s.ultimo_ping_em).toLocaleTimeString('pt-BR')}</small></td>
                <td><code>${s.ip_address || '—'}</code></td>
                <td><button class="btn-danger btn-sm" onclick="revokeSession('${s.id}')">Derrubar</button></td>
            `;
            tbody.appendChild(tr);
        });
        document.getElementById('stat-online').textContent = online;
        document.getElementById('stat-ausente').textContent = away;
        document.getElementById('stat-total').textContent = sessions.length;
    } catch (e) { console.error('Sessões:', e); }
}

// ---------- USUÁRIOS ----------
async function loadUsers() {
    try {
        const users = await window.SGE_API.fetchAllUsers();
        const tbody = document.querySelector('#table-usuarios tbody');
        tbody.innerHTML = '';
        users.forEach(u => {
            const statusBadge = u.is_active
                ? '<span class="status-badge active">Ativo</span>'
                : '<span class="status-badge blocked">Bloqueado</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.email}</td>
                <td><strong>${u.nome}</strong></td>
                <td>${statusBadge}</td>
                <td>${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="toggleUserStatus('${u.id}', ${u.is_active})">${u.is_active ? 'Bloquear' : 'Ativar'}</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Users:', e); }
}

// ---------- SETORES ----------
async function loadSectors() {
    try {
        const items = await window.SGE_API.fetchAllSectors();
        const tbody = document.querySelector('#table-setores tbody');
        tbody.innerHTML = '';
        items.forEach(i => {
            const statusBadge = i.is_active
                ? '<span class="status-badge active">Ativo</span>'
                : '<span class="status-badge blocked">Inativo</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${i.sigla}</code></td>
                <td><strong>${i.nome}</strong></td>
                <td style="color:var(--text-3)">${i.descricao || '—'}</td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Setores:', e); }
}

// ---------- SISTEMAS ----------
async function loadSystems() {
    try {
        const items = await window.SGE_API.fetchAllSystems();
        const tbody = document.querySelector('#table-sistemas tbody');
        tbody.innerHTML = '';
        document.getElementById('stat-systems').textContent = items.filter(i => i.is_active).length;

        items.forEach(i => {
            const statusBadge = i.is_active
                ? '<span class="status-badge active">Online</span>'
                : '<span class="status-badge blocked">Offline</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${i.nome}</strong></td>
                <td><code>${i.slug}</code></td>
                <td><a href="${i.url_origem}" target="_blank">${i.url_origem || '—'}</a></td>
                <td>${statusBadge}</td>
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
        const tbody = document.querySelector('#table-auditoria tbody');
        tbody.innerHTML = '';
        logs.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${new Date(l.criado_em).toLocaleString('pt-BR')}</small></td>
                <td>${l.usuarios?.nome || l.usuario_id || '—'}</td>
                <td><code>${l.acao}</code></td>
                <td style="color:var(--text-3);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.detalhes || '—'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error('Audit:', e); }
}

// ========== CRUD ACTIONS ==========

// Revogar Sessão
window.revokeSession = async function (id) {
    if (!confirm('Deseja derrubar esta sessão?')) return;
    try {
        await window.SGE_API.revokeSession(id);
        loadSessions();
    } catch (e) { alert('Erro: ' + e.message); }
};

// Alternar Status Usuário
window.toggleUserStatus = async function (id, currentActive) {
    const action = currentActive ? 'BLOQUEAR' : 'ATIVAR';
    if (!confirm(`Deseja ${action} este usuário?`)) return;
    try {
        await window.SGE_API.updateUser(id, { is_active: !currentActive });
        loadUsers();
    } catch (e) { alert('Erro: ' + e.message); }
};

// Alternar Status Sistema
window.toggleSystemStatus = async function (id, currentActive) {
    const action = currentActive ? 'DESATIVAR' : 'ATIVAR';
    if (!confirm(`Deseja ${action} este sistema?`)) return;
    try {
        await window.SGE_API.updateSystem(id, { is_active: !currentActive });
        loadSystems();
    } catch (e) { alert('Erro: ' + e.message); }
};

// ========== MODAIS DE CRIAÇÃO ==========
function showModalNewUser() {
    showModal('Novo Usuário', 'Cadastre um novo operador no ecossistema.', `
        <form id="form-new-user">
            <div class="input-group"><label>Nome Completo</label><input id="mu-nome" required placeholder="Ex: João Silva"></div>
            <div class="input-group"><label>E-mail</label><input id="mu-email" type="email" required placeholder="joao@gps.com.br"></div>
            <div class="input-group"><label>Senha Inicial (Hash)</label><input id="mu-senha" required placeholder="Senha temporária"></div>
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
            loadSystems();
        } catch (err) { alert('Erro: ' + err.message); }
    });
}
