/**
 * CENTRAL SGE — API Layer (Supabase Gateway)
 * Grupo GPS · Data Access · Schema: gps_compartilhado
 * 
 * Table structures:
 *   sge_central_usuario_setores:  usuario_id + setor_id (composite PK, NO id column)
 *   sge_central_usuario_sistema_acesso: id, usuario_id, sistema_id, perfil_id, concedido_por, concedido_em, is_active
 */
let supabaseClient = null;
let _authClient = null;

function initSupabase(projectUrl, serviceRoleKey) {
    try {
        supabaseClient = supabase.createClient(projectUrl, serviceRoleKey, {
            auth: { persistSession: false },
            db: { schema: 'gps_compartilhado' }
        });
        return true;
    } catch (error) {
        console.error("Erro ao inicializar Supabase:", error);
        return false;
    }
}

async function loginWithEmailPassword(projectUrl, anonKey, email, password) {
    try {
        if (!_authClient) {
            _authClient = supabase.createClient(projectUrl, anonKey, {
                auth: { persistSession: true, storageKey: 'sge_central_admin' }
            });
        }
        const { data, error } = await _authClient.auth.signInWithPassword({ email, password });
        if (error) return { data: null, error };

        // Inicializa client principal com JWT do usuário logado (sem persistir — sessão gerenciada pelo _authClient)
        supabaseClient = supabase.createClient(projectUrl, anonKey, {
            auth: { persistSession: false },
            db: { schema: 'gps_compartilhado' }
        });
        await supabaseClient.auth.setSession(data.session);
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err };
    }
}

async function restoreSession(projectUrl, anonKey) {
    try {
        _authClient = supabase.createClient(projectUrl, anonKey, {
            auth: { persistSession: true, storageKey: 'sge_central_admin' }
        });
        const { data: { session } } = await _authClient.auth.getSession();
        if (!session) return null;

        supabaseClient = supabase.createClient(projectUrl, anonKey, {
            auth: { persistSession: false },
            db: { schema: 'gps_compartilhado' }
        });
        await supabaseClient.auth.setSession(session);
        return session.user.id;
    } catch {
        return null;
    }
}

async function logoutAuth() {
    try {
        if (_authClient) await _authClient.auth.signOut();
    } catch {}
    _authClient = null;
    supabaseClient = null;
}

function db() {
    if (!supabaseClient) throw new Error("Supabase não inicializado.");
    return supabaseClient;
}

// ==================== LEITURA ====================

async function fetchActiveSessions() {
    const { data, error } = await db()
        .from('sge_central_sessoes')
        .select(`
            id, ultimo_ping_em, ip_address, sistema_id, usuario_id, user_agent,
            usuarios:sge_central_usuarios!sge_central_sessoes_usuario_id_fkey(nome, email),
            sistemas:sge_central_sistemas!sge_central_sessoes_sistema_id_fkey(nome)
        `)
        .eq('is_revoked', false)
        .gt('expira_em', new Date().toISOString())
        .order('ultimo_ping_em', { ascending: false });

    if (error) throw error;

    const now = new Date();
    return (data || []).map(session => {
        const lastPing = new Date(session.ultimo_ping_em);
        const diffMins = (now - lastPing) / 60000;
        let status = 'offline';
        if (diffMins <= 5) status = 'online';
        else if (diffMins <= 30) status = 'away';
        return { ...session, status };
    });
}

async function fetchAllUsers() {
    const { data, error } = await db()
        .from('sge_central_usuarios')
        .select('*')
        .order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function fetchAllSectors() {
    const { data, error } = await db()
        .from('sge_central_setores')
        .select('*')
        .order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function fetchAllSystems() {
    const { data, error } = await db()
        .from('sge_central_sistemas')
        .select('*')
        .order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function fetchAllProfiles() {
    const { data, error } = await db()
        .from('sge_central_perfis')
        .select('*')
        .order('nivel', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function fetchAuditLogs() {
    const { data, error } = await db()
        .from('sge_central_auditoria')
        .select(`
            id, acao, detalhes, realizado_em, admin_id,
            admin:sge_central_usuarios!sge_central_auditoria_admin_id_fkey(nome)
        `)
        .order('realizado_em', { ascending: false })
        .limit(100);
    if (error) { console.warn('Audit fetch:', error); return []; }
    return data || [];
}

// ==================== RBAC: Permissões de Acesso ====================

// sge_central_usuario_sistema_acesso HAS an id column
async function fetchUserAccess(userId) {
    const { data, error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .select(`
            id, usuario_id, sistema_id, perfil_id, is_active,
            sistema:sge_central_sistemas!sge_central_usuario_sistema_acesso_sistema_id_fkey(id, nome, slug, is_active),
            perfil:sge_central_perfis!sge_central_usuario_sistema_acesso_perfil_id_fkey(id, nome, nivel)
        `)
        .eq('usuario_id', userId);
    if (error) throw error;
    return data || [];
}

// sge_central_usuario_setores has NO id column — composite PK (usuario_id, setor_id)
async function fetchUserSectors(userId) {
    const { data, error } = await db()
        .from('sge_central_usuario_setores')
        .select(`
            usuario_id, setor_id,
            setor:sge_central_setores!sge_central_usuario_setores_setor_id_fkey(id, sigla, nome)
        `)
        .eq('usuario_id', userId);
    if (error) throw error;
    return data || [];
}

async function grantSystemAccess(userId, sistemaId, perfilId) {
    const { data, error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .insert({ usuario_id: userId, sistema_id: sistemaId, perfil_id: perfilId, is_active: true })
        .select();
    if (error) throw error;
    return data;
}

async function revokeSystemAccess(accessId) {
    const { error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .delete()
        .eq('id', accessId);
    if (error) throw error;
}

async function updateAccessProfile(accessId, newPerfilId) {
    const { error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .update({ perfil_id: newPerfilId })
        .eq('id', accessId);
    if (error) throw error;
}

async function toggleAccessActive(accessId, newActiveState) {
    const { error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .update({ is_active: newActiveState })
        .eq('id', accessId);
    if (error) throw error;
}

// Composite PK — delete by both columns
async function addUserSector(userId, setorId) {
    const { data, error } = await db()
        .from('sge_central_usuario_setores')
        .insert({ usuario_id: userId, setor_id: setorId })
        .select();
    if (error) throw error;
    return data;
}

async function removeUserSector(userId, setorId) {
    const { error } = await db()
        .from('sge_central_usuario_setores')
        .delete()
        .eq('usuario_id', userId)
        .eq('setor_id', setorId);
    if (error) throw error;
}

// ==================== ESCRITA ====================

async function createUser(payload) {
    const { data, error } = await db()
        .from('sge_central_usuarios')
        .insert(payload)
        .select();
    if (error) throw error;
    return data;
}

async function updateUser(id, changes) {
    const { error } = await db()
        .from('sge_central_usuarios')
        .update(changes)
        .eq('id', id);
    if (error) throw error;
}

async function createSector(payload) {
    const { data, error } = await db()
        .from('sge_central_setores')
        .insert(payload)
        .select();
    if (error) throw error;
    return data;
}

async function createSystem(payload) {
    const { data, error } = await db()
        .from('sge_central_sistemas')
        .insert(payload)
        .select();
    if (error) throw error;
    return data;
}

async function updateSystem(id, changes) {
    const { error } = await db()
        .from('sge_central_sistemas')
        .update(changes)
        .eq('id', id);
    if (error) throw error;
}

async function revokeSession(id) {
    const { error } = await db()
        .from('sge_central_sessoes')
        .update({ is_revoked: true })
        .eq('id', id);
    if (error) throw error;
}

// ==================== AUDITORIA E SESSÃO ADMIN ====================

async function insertAuditLog(acao, detalhes) {
    const { error } = await db()
        .from('sge_central_auditoria')
        .insert({
            acao,
            detalhes,
            realizado_em: new Date().toISOString()
        });
    if (error) {
        console.warn('Falha persistindo log de auditoria:', error);
    }
}

// Sessão Fake do admin
let _adminSessionId = null;

async function createAdminSession() {
    const { data, error } = await db()
        .from('sge_central_sessoes')
        .insert({
            ip_address: '127.0.0.1 (Admin)',
            user_agent: 'Painel Central SGE',
            expira_em: new Date(Date.now() + (1000 * 60 * 60 * 8)).toISOString()
        })
        .select('id')
        .single();

    if (!error && data) {
        _adminSessionId = data.id;
    }
}

async function pingAdminSession() {
    if (!_adminSessionId) return;
    await db()
        .from('sge_central_sessoes')
        .update({ ultimo_ping_em: new Date().toISOString() })
        .eq('id', _adminSessionId);
}

async function endAdminSession() {
    if (!_adminSessionId) return;
    await db()
        .from('sge_central_sessoes')
        .update({ is_revoked: true })
        .eq('id', _adminSessionId);
    _adminSessionId = null;
}

// ==================== MANUTENÇÃO ====================

async function fetchMaintenanceAll() {
    const { data, error } = await db()
        .from('sge_central_manutencao')
        .select('*');
    if (error) { console.warn('Maintenance fetch:', error); return []; }
    return data || [];
}

async function upsertMaintenance(sistemaId, ativo, mensagem, previsaoFim, adminId) {
    // Tenta atualizar primeiro
    const { data: existing } = await db()
        .from('sge_central_manutencao')
        .select('id')
        .eq('sistema_id', sistemaId)
        .maybeSingle();

    if (existing) {
        const updates = {
            ativo,
            mensagem: mensagem || 'Sistema em manutenção. Tente novamente em breve.',
            previsao_fim: previsaoFim || null,
            ativado_por: adminId || null
        };
        if (ativo) {
            updates.ativado_em = new Date().toISOString();
            updates.desativado_em = null;
        } else {
            updates.desativado_em = new Date().toISOString();
        }
        const { error } = await db()
            .from('sge_central_manutencao')
            .update(updates)
            .eq('id', existing.id);
        if (error) throw error;
    } else {
        const { error } = await db()
            .from('sge_central_manutencao')
            .insert({
                sistema_id: sistemaId,
                ativo,
                mensagem: mensagem || 'Sistema em manutenção. Tente novamente em breve.',
                previsao_fim: previsaoFim || null,
                ativado_por: adminId || null,
                ativado_em: new Date().toISOString()
            });
        if (error) throw error;
    }
}

// ==================== TICKETS / CHAMADOS ====================

async function fetchTickets(filters = {}) {
    let query = db()
        .from('sge_central_tickets')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(200);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.tipo) query = query.eq('tipo', filters.tipo);

    const { data, error } = await query;
    if (error) { console.warn('Tickets fetch:', error); return []; }
    return data || [];
}

async function updateTicket(id, changes) {
    changes.atualizado_em = new Date().toISOString();
    const { error } = await db()
        .from('sge_central_tickets')
        .update(changes)
        .eq('id', id);
    if (error) throw error;
}

async function respondToTicket(id, resposta, adminId) {
    const { error } = await db()
        .from('sge_central_tickets')
        .update({
            resposta_admin: resposta,
            respondido_por: adminId || null,
            respondido_em: new Date().toISOString(),
            status: 'resolvido',
            atualizado_em: new Date().toISOString()
        })
        .eq('id', id);
    if (error) throw error;
}

// ==================== NOTIFICAÇÕES ====================

async function fetchNotifications(limit = 20) {
    const { data, error } = await db()
        .from('sge_central_notificacoes')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(limit);
    if (error) { console.warn('Notif fetch:', error); return []; }
    return data || [];
}

async function fetchUnreadNotifCount() {
    const { count, error } = await db()
        .from('sge_central_notificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('lida', false);
    if (error) return 0;
    return count || 0;
}

async function markNotificationRead(id) {
    const { error } = await db()
        .from('sge_central_notificacoes')
        .update({ lida: true })
        .eq('id', id);
    if (error) throw error;
}

async function markAllNotificationsRead() {
    const { error } = await db()
        .from('sge_central_notificacoes')
        .update({ lida: true })
        .eq('lida', false);
    if (error) throw error;
}

// ==================== ADMIN CHECK ====================

async function checkAdminAccess(userId, projectUrl, anonKey) {
    const headers = {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Accept': 'application/json'
    };

    const sysUrl = new URL(`${projectUrl}/rest/v1/v_sso_sistemas`);
    sysUrl.searchParams.set('select', 'id');
    sysUrl.searchParams.set('slug', 'eq.sge_hub');
    sysUrl.searchParams.set('is_active', 'eq.true');

    const sysResp = await fetch(sysUrl.toString(), { headers });
    if (!sysResp.ok) throw new Error('Sem permissão de administrador.');
    const sysArr = await sysResp.json();
    const sysData = Array.isArray(sysArr) ? sysArr[0] : sysArr;
    if (!sysData?.id) throw new Error('Sem permissão de administrador.');

    const accUrl = new URL(`${projectUrl}/rest/v1/v_sso_acesso`);
    accUrl.searchParams.set('select', 'is_active,perfil_nome');
    accUrl.searchParams.set('usuario_id', `eq.${userId}`);
    accUrl.searchParams.set('sistema_id', `eq.${sysData.id}`);

    const accResp = await fetch(accUrl.toString(), { headers });
    if (!accResp.ok) throw new Error('Sem permissão de administrador.');
    const accArr = await accResp.json();
    const accData = Array.isArray(accArr) ? accArr[0] : accArr;

    if (!accData?.is_active) throw new Error('Sem permissão de administrador.');
    return accData;
}

// ==================== EXPORT ====================
window.SGE_API = {
    initSupabase,
    loginWithEmailPassword,
    restoreSession,
    logoutAuth,
    db,
    fetchActiveSessions,
    fetchAllUsers,
    fetchAllSectors,
    fetchAllSystems,
    fetchAllProfiles,
    fetchAuditLogs,
    fetchUserAccess,
    fetchUserSectors,
    grantSystemAccess,
    revokeSystemAccess,
    updateAccessProfile,
    toggleAccessActive,
    addUserSector,
    removeUserSector,
    createUser,
    updateUser,
    createSector,
    createSystem,
    updateSystem,
    revokeSession,
    checkAdminAccess,
    insertAuditLog,
    createAdminSession,
    pingAdminSession,
    endAdminSession,
    // Manutenção
    fetchMaintenanceAll,
    upsertMaintenance,
    // Tickets
    fetchTickets,
    updateTicket,
    respondToTicket,
    // Notificações
    fetchNotifications,
    fetchUnreadNotifCount,
    markNotificationRead,
    markAllNotificationsRead
};
