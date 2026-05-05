import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function calcularTurno(dataFiltro: string, turma: string): string {
  // 1. Cria a data alvo com segurança de Fuso Horário
  const dataAlvo = new Date(`${dataFiltro}T12:00:00Z`);

  // ==========================================
  // LÓGICA DO TURNO ADMINISTRATIVO (ADM)
  // ==========================================
  if (turma === 'ADM') {
    const diaSemana = dataAlvo.getUTCDay(); // 0 = Domingo, 1 = Segunda ... 6 = Sábado
    
    if (diaSemana === 0 || diaSemana === 6) {
      return "F"; // Folga no fim de semana
    } else {
      return "ADM"; // Retorna 'ADM'
    }
  }

  // ==========================================
  // LÓGICA DO TURNO ININTERRUPTO (A, B, C, D)
  // ==========================================
  const ciclo = ["07", "07", "19", "19", "F", "F", "F", "F"];
  const offsets: Record<string, number> = { 'A': 0, 'B': 4, 'C': 2, 'D': 6 };
  
  // Trava de segurança caso o sistema envie uma turma que não existe
  if (!offsets.hasOwnProperty(turma)) {
    return "Turma inválida";
  }

  // Data base fixada: 2026-03-11 ao meio-dia (UTC)
  const dataBase = new Date("2026-03-11T12:00:00Z");
  
  const diffTempo = dataAlvo.getTime() - dataBase.getTime();
  const diffDias = Math.floor(diffTempo / (1000 * 3600 * 24));

  // A fórmula matemática pura para o loop contínuo
  const index = ((diffDias + offsets[turma]) % 8 + 8) % 8;
  
  return ciclo[index];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { dataFiltro, turma } = await req.json();

    if (!dataFiltro || !turma) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros dataFiltro e turma são obrigatórios.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const turno = calcularTurno(dataFiltro, turma);

    return new Response(
      JSON.stringify({
        dataFiltro,
        turma,
        turno
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno do servidor' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
