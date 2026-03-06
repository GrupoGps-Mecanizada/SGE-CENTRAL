'use strict';

/**
 * SGE — Dev Mode Toggle (SGE-CENTRAL)
 * Botão flutuante para ativar/desativar bypass SSO em desenvolvimento local.
 * Visível apenas em file:// ou localhost.
 *
 * Modos cobertos:
 *  - SSO View (?app_slug=X): com bypass ON, o sso.js pode retornar dados mock
 *    sem precisar fazer redirect para file://
 *  - Admin Panel (sem params): sem bypass — funciona normalmente com Service Role Key
 */
(function () {
    const isLocal = location.protocol === 'file:'
        || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1';
    if (!isLocal) return;

    const STORAGE_KEY = 'sge_dev_bypass';
    const isActive = localStorage.getItem(STORAGE_KEY) === '1';

    const btn = document.createElement('div');
    btn.id = 'sge-dev-toggle';
    btn.title = isActive
        ? 'Dev Mode ativo — SSO bypass habilitado. Clique para desativar.'
        : 'Dev Mode inativo — clique para habilitar bypass SSO local.';

    btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
        <span>${isActive ? 'DEV ON' : 'DEV OFF'}</span>
    `;

    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '72px',        // acima do possível toast container
        right: '16px',
        zIndex: '99998',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 11px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '700',
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '0.06em',
        cursor: 'pointer',
        border: '1.5px solid',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        transition: 'transform .15s, box-shadow .15s',
        userSelect: 'none',
        background: isActive ? '#0f3868' : '#f1f5f9',
        color: isActive ? '#ffffff' : '#64748b',
        borderColor: isActive ? '#1d4ed8' : '#cbd5e1',
    });

    btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    });

    btn.addEventListener('click', () => {
        if (isActive) {
            localStorage.removeItem(STORAGE_KEY);
            // Limpa tokens SSO de todos os sistemas conhecidos
            ['gestao_efetivo_mec', 'relatorio_turno', 'sge_almoxarifado', 'sge_dashboard', 'sge_hub']
                .forEach(slug => {
                    localStorage.removeItem(`sge_token_${slug}`);
                    localStorage.removeItem(`sge_ver_${slug}`);
                });
            localStorage.removeItem('sge_session_id');
        } else {
            localStorage.setItem(STORAGE_KEY, '1');
        }
        location.reload();
    });

    document.body.appendChild(btn);
})();
