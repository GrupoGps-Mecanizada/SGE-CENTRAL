/**
 * SGE TICKET WIDGET v1.0
 * Widget flutuante embeddable para sistemas satelites.
 * Permite que usuarios enviem chamados (duvidas, bugs, sugestoes)
 * diretamente para o SGE Central.
 *
 * USO: Adicionar no HTML do sistema satelite:
 *   <script src="https://grupogps-mecanizada.github.io/SGE-CENTRAL/js/sge-ticket-widget.js"></script>
 *
 * Pre-requisito: sge_session_* no localStorage (definido pelo sso_login.html ou sge-session-ping.js)
 */
(function () {
    'use strict';

    const SGE_TICKET_API = 'https://mgcjidryrjqiceielmzp.supabase.co';
    const SGE_TICKET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA';

    const WIDGET_ID = 'sge-ticket-widget';
    const TYPES = [
        { value: 'question',        label: 'Duvida',     icon: '?' },
        { value: 'bug_report',      label: 'Bug',        icon: '!' },
        { value: 'feature_request', label: 'Sugestao',   icon: '+' },
        { value: 'other',           label: 'Outro',      icon: '...' }
    ];

    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function getSessionData() {
        try {
            return {
                userId:    localStorage.getItem('sge_session_user_id') || null,
                userName:  localStorage.getItem('sge_session_user_name') || null,
                userEmail: localStorage.getItem('sge_session_user_email') || null,
                appSlug:   localStorage.getItem('sge_session_app_slug') || null,
                appName:   localStorage.getItem('sge_session_app_name') || null,
                token:     localStorage.getItem('sge_session_token') || null
            };
        } catch (e) { return {}; }
    }

    async function submitTicket(tipo, assunto, mensagem) {
        const session = getSessionData();
        const headers = {
            'apikey': SGE_TICKET_KEY,
            'Content-Type': 'application/json',
            'Content-Profile': 'gps_compartilhado',
            'Prefer': 'return=minimal'
        };

        // Use authenticated token if available, otherwise anon
        if (session.token) {
            headers['Authorization'] = `Bearer ${session.token}`;
        } else {
            headers['Authorization'] = `Bearer ${SGE_TICKET_KEY}`;
        }

        const body = {
            tipo,
            assunto,
            mensagem,
            sistema_slug: session.appSlug || null,
            usuario_id: session.userId || null,
            usuario_nome: session.userName || null,
            usuario_email: session.userEmail || 'anonimo@sistema',
            prioridade: tipo === 'bug_report' ? 'alta' : 'normal'
        };

        const resp = await fetch(`${SGE_TICKET_API}/rest/v1/sge_central_tickets`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        return resp.ok;
    }

    function injectStyles() {
        if (document.getElementById('sge-tw-styles')) return;
        const style = document.createElement('style');
        style.id = 'sge-tw-styles';
        style.textContent = `
            #${WIDGET_ID}-fab {
                position: fixed; bottom: 24px; right: 24px; z-index: 99990;
                width: 48px; height: 48px; border-radius: 50%; border: none;
                background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
                color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 16px rgba(29,78,216,0.35); transition: transform 0.2s, box-shadow 0.2s;
                font-family: 'Inter', sans-serif;
            }
            #${WIDGET_ID}-fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(29,78,216,0.45); }
            #${WIDGET_ID}-fab svg { width: 22px; height: 22px; }

            #${WIDGET_ID}-panel {
                position: fixed; bottom: 84px; right: 24px; z-index: 99991;
                width: 340px; max-height: 480px; background: #fff;
                border-radius: 14px; border: 1px solid rgba(10,47,168,0.12);
                box-shadow: 0 8px 32px rgba(0,0,0,0.12); overflow: hidden;
                display: none; flex-direction: column; font-family: 'Inter', sans-serif;
                animation: sge-tw-in 0.25s ease;
            }
            #${WIDGET_ID}-panel.open { display: flex; }
            @keyframes sge-tw-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            .sge-tw-header {
                padding: 16px 18px; background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
                color: #fff; display: flex; align-items: center; justify-content: space-between;
            }
            .sge-tw-header h4 { font-size: 14px; font-weight: 700; margin: 0; }
            .sge-tw-close { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 18px; padding: 0; line-height: 1; }
            .sge-tw-close:hover { color: #fff; }

            .sge-tw-body { padding: 16px 18px; overflow-y: auto; flex: 1; }

            .sge-tw-types { display: flex; gap: 6px; margin-bottom: 14px; }
            .sge-tw-type {
                flex: 1; padding: 8px 4px; border: 1.5px solid #e2e8f0; border-radius: 8px;
                background: #f8fafc; cursor: pointer; text-align: center; font-size: 11px;
                font-weight: 600; color: #64748b; transition: all 0.15s;
            }
            .sge-tw-type:hover { border-color: #93c5fd; background: #eff6ff; }
            .sge-tw-type.active { border-color: #1d4ed8; background: #eff6ff; color: #1d4ed8; }
            .sge-tw-type-icon { font-size: 16px; font-weight: 800; display: block; margin-bottom: 2px; }

            .sge-tw-field { margin-bottom: 12px; }
            .sge-tw-field label { display: block; font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
            .sge-tw-field input, .sge-tw-field textarea {
                width: 100%; padding: 10px 12px; border: 1px solid #d1d9e6; border-radius: 8px;
                font-size: 13px; font-family: 'Inter', sans-serif; color: #1e293b; background: #f7f9fc;
                transition: border-color 0.15s, box-shadow 0.15s;
            }
            .sge-tw-field input:focus, .sge-tw-field textarea:focus { outline: none; border-color: #1d4ed8; box-shadow: 0 0 0 3px rgba(29,78,216,0.08); background: #fff; }
            .sge-tw-field textarea { resize: vertical; min-height: 70px; }

            .sge-tw-submit {
                width: 100%; height: 40px; background: #1d4ed8; color: #fff; border: none;
                border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
                transition: background 0.15s; font-family: 'Inter', sans-serif;
            }
            .sge-tw-submit:hover { background: #1e40af; }
            .sge-tw-submit:disabled { opacity: 0.6; cursor: not-allowed; }

            .sge-tw-success {
                display: none; padding: 20px; text-align: center; color: #059669;
                font-size: 13px; font-weight: 600; line-height: 1.6;
            }
            .sge-tw-success.show { display: block; }
            .sge-tw-success svg { margin-bottom: 8px; }

            @media (max-width: 420px) {
                #${WIDGET_ID}-panel { right: 8px; left: 8px; width: auto; bottom: 80px; }
            }
        `;
        document.head.appendChild(style);
    }

    function createWidget() {
        if (document.getElementById(WIDGET_ID + '-fab')) return;
        injectStyles();

        const session = getSessionData();

        // FAB button
        const fab = document.createElement('button');
        fab.id = WIDGET_ID + '-fab';
        fab.title = 'Suporte SGE';
        fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
        document.body.appendChild(fab);

        // Panel
        const panel = document.createElement('div');
        panel.id = WIDGET_ID + '-panel';
        panel.innerHTML = `
            <div class="sge-tw-header">
                <h4>Suporte SGE</h4>
                <button class="sge-tw-close" id="sge-tw-close">&times;</button>
            </div>
            <div class="sge-tw-body">
                <div class="sge-tw-types" id="sge-tw-types">
                    ${TYPES.map((t, i) => `
                        <div class="sge-tw-type ${i === 0 ? 'active' : ''}" data-type="${t.value}">
                            <span class="sge-tw-type-icon">${esc(t.icon)}</span>
                            ${esc(t.label)}
                        </div>
                    `).join('')}
                </div>
                <div class="sge-tw-field">
                    <label>Assunto</label>
                    <input type="text" id="sge-tw-subject" placeholder="Descreva brevemente...">
                </div>
                <div class="sge-tw-field">
                    <label>Mensagem</label>
                    <textarea id="sge-tw-message" placeholder="Detalhe seu chamado..."></textarea>
                </div>
                <button class="sge-tw-submit" id="sge-tw-submit">Enviar Chamado</button>
                <div class="sge-tw-success" id="sge-tw-success">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <div>Chamado enviado com sucesso!<br>O administrador sera notificado.</div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // Events
        let selectedType = TYPES[0].value;

        fab.addEventListener('click', () => {
            panel.classList.toggle('open');
        });

        document.getElementById('sge-tw-close').addEventListener('click', () => {
            panel.classList.remove('open');
        });

        document.querySelectorAll('.sge-tw-type').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('.sge-tw-type').forEach(t => t.classList.remove('active'));
                el.classList.add('active');
                selectedType = el.dataset.type;
            });
        });

        document.getElementById('sge-tw-submit').addEventListener('click', async () => {
            const subject = document.getElementById('sge-tw-subject').value.trim();
            const message = document.getElementById('sge-tw-message').value.trim();

            if (!subject) { document.getElementById('sge-tw-subject').focus(); return; }
            if (!message) { document.getElementById('sge-tw-message').focus(); return; }

            const btn = document.getElementById('sge-tw-submit');
            btn.disabled = true;
            btn.textContent = 'Enviando...';

            const ok = await submitTicket(selectedType, subject, message);

            if (ok) {
                document.getElementById('sge-tw-success').classList.add('show');
                document.getElementById('sge-tw-subject').value = '';
                document.getElementById('sge-tw-message').value = '';
                setTimeout(() => {
                    document.getElementById('sge-tw-success').classList.remove('show');
                    panel.classList.remove('open');
                }, 3000);
            }

            btn.disabled = false;
            btn.textContent = 'Enviar Chamado';
        });
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createWidget);
    } else {
        createWidget();
    }

    // Export
    window.SGE_TICKET = { submit: submitTicket };
})();
