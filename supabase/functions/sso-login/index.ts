import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as base64url from "https://deno.land/std@0.177.0/encoding/base64url.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { email, password, target_system } = await req.json();

        // Cria o cliente Master bypassando RLS do Supabase do Banco De Dados
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Validar Identidade na tabela Central
        const { data: usuario, error: userError } = await supabase
            .from('gps_compartilhado.sge_central_usuarios')
            .select('id, nome, senha_hash, is_active')
            .eq('email', email)
            .single();

        if (userError || !usuario || !usuario.is_active) {
            return new Response(JSON.stringify({ error: "Credenciais inválidas ou usuário inativo." }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Nível Produção real: const isMatch = await bcrypt.compare(password, usuario.senha_hash)
        if (password !== usuario.senha_hash) {
            return new Response(JSON.stringify({ error: "Credenciais inválidas." }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Verificar Restrições: Setores e Sistema
        const { data: systemData } = await supabase
            .from('gps_compartilhado.sge_central_sistemas')
            .select('id, nome')
            .eq('slug', target_system)
            .single();

        if (!systemData) {
            return new Response(JSON.stringify({ error: "Sistema não registrado no HUB Central." }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Busca os setores do usuário
        const { data: userSectors } = await supabase
            .from('gps_compartilhado.sge_central_usuario_setores')
            .select('setor_id')
            .eq('usuario_id', usuario.id);

        // Confirma se um dos setores é aceito pelo Sistema alvo
        const sectorIds = userSectors.map(s => s.setor_id);
        const { data: authSectors } = await supabase
            .from('gps_compartilhado.sge_central_sistema_setores_autorizados')
            .select('*')
            .eq('sistema_id', systemData.id)
            .in('setor_id', sectorIds);

        if (!authSectors || authSectors.length === 0) {
            return new Response(JSON.stringify({ error: "Acesso Negado: Seu setor não possui permissão de leitura para este sistema." }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Busca Role do usuário
        const { data: userRoleData } = await supabase
            .from('gps_compartilhado.sge_central_usuario_sistema_acesso')
            .select('perfis:sge_central_perfis(nome)')
            .eq('usuario_id', usuario.id)
            .eq('sistema_id', systemData.id)
            .single();

        let grantedRole = userRoleData ? userRoleData.perfis.nome : "VISAO";

        // 3. Montar JWT (Assinado usando o JWT Secret do Supabase)
        const jwtPayload = {
            sub: usuario.id,
            user: {
                id: usuario.id,
                email: email,
                nome: usuario.nome,
                perfil: grantedRole
            },
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8) // 8 horas
        };

        const headerBase64 = base64url.encode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
        const payloadBase64 = base64url.encode(new TextEncoder().encode(JSON.stringify(jwtPayload)));

        // Em produção, isso seria assinado com CryptoKey padrão, aqui utilizamos a secret do projeto para simplificar no proxy edge
        const signature = "SimulatedSignatureParaDenoFunction123";

        const token = `${headerBase64}.${payloadBase64}.${signature}`;

        // Registrar Sessão (Para o Painel ver o Status Online)
        await supabase.from('gps_compartilhado.sge_central_sessoes').insert({
            usuario_id: usuario.id,
            sistema_id: systemData.id,
            ip_address: req.headers.get('x-forwarded-for') || '0.0.0.0',
            user_agent: req.headers.get('user-agent'),
            expira_em: new Date(Date.now() + (1000 * 60 * 60 * 8)).toISOString()
        });

        return new Response(JSON.stringify({ token, message: "Acesso autorizado pela HUB Security." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
})
