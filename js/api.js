/**
 * CENTRAL SGE — API Layer (Supabase Gateway)
 * Grupo GPS · Data Access · Schema: gps_compartilhado
 */
let supabaseClient = null;

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

function db() {
    if (!supabaseClient) throw new Error("Supabase não inicializado.");
    return supabaseClient;
}

// ==================== LEITURA ====================

async function fetchActiveSessions() {
    const { data, error } = await db()
        .from('sge_central_sessoes')
        .select(`
            id, ultimo_ping_em, ip_address, sistema_id, usuario_id,
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

async function fetchUserAccess(userId) {
    const { data, error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .select(`
            id, usuario_id, sistema_id, perfil_id,
            sistema:sge_central_sistemas!sge_central_usuario_sistema_acesso_sistema_id_fkey(id, nome, slug, is_active),
            perfil:sge_central_perfis!sge_central_usuario_sistema_acesso_perfil_id_fkey(id, nome, nivel)
        `)
        .eq('usuario_id', userId);
    if (error) throw error;
    return data || [];
}

async function fetchUserSectors(userId) {
    const { data, error } = await db()
        .from('sge_central_usuario_setores')
        .select(`
            id, usuario_id, setor_id,
            setor:sge_central_setores!sge_central_usuario_setores_setor_id_fkey(id, sigla, nome)
        `)
        .eq('usuario_id', userId);
    if (error) throw error;
    return data || [];
}

async function grantSystemAccess(userId, sistemaId, perfilId) {
    const { data, error } = await db()
        .from('sge_central_usuario_sistema_acesso')
        .insert({ usuario_id: userId, sistema_id: sistemaId, perfil_id: perfilId })
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

async function addUserSector(userId, setorId) {
    const { data, error } = await db()
        .from('sge_central_usuario_setores')
        .insert({ usuario_id: userId, setor_id: setorId })
        .select();
    if (error) throw error;
    return data;
}

async function removeUserSector(linkId) {
    const { error } = await db()
        .from('sge_central_usuario_setores')
        .delete()
        .eq('id', linkId);
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

// ==================== EXPORT ====================
window.SGE_API = {
    initSupabase,
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
    addUserSector,
    removeUserSector,
    createUser,
    updateUser,
    createSector,
    createSystem,
    updateSystem,
    revokeSession
};
