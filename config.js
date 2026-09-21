// =========================================================
// CONFIGURAÇÃO — Sentinela Urbana IA (versão Web)
// =========================================================

const CONFIG = {

  // =======================================================
  // E-MAIL (opcional)
  // =======================================================
  // Agora manda e-mail através da NOSSA própria função
  // serverless (rodando de graça na Vercel), que conecta direto
  // no Gmail via SMTP — sem o limite baixo de serviços como o
  // EmailJS. Veja o README.md para o passo a passo de configurar
  // (é preciso colocar a senha de app do Gmail nas variáveis de
  // ambiente da Vercel, NUNCA aqui neste arquivo).
  //
  // Cole aqui a URL da sua função depois de publicar na Vercel,
  // algo tipo:
  // "https://seu-projeto.vercel.app/api/enviar-email"
  //
  // Se deixar em branco, o sistema simplesmente não tenta
  // enviar e-mail — o resto do programa funciona normalmente.
  SERVIDOR_EMAIL_URL: "",

  // Link "pré-preenchido" do Google Forms (veja o README.md
  // para saber como gerar o seu). Precisa conter exatamente o
  // texto MOTIVO_DATA_HORA_AQUI em algum lugar da URL — o
  // sistema troca esse trecho pelos detalhes reais do alerta
  // antes de colocar o link no e-mail.
  GOOGLE_FORM_URL_TEMPLATE: "https://docs.google.com/forms/d/e/1FAIpQLSco9duD78OMy21RHxtlf6iStK4_67twQfQxR5q3N_V50ETD7w/viewform?usp=pp_url&entry.1352706861=NOME_AQUI&entry.1202899410=Risco+confirmado&entry.925892778=MOTIVO_DATA_HORA_AQUI",

  // =======================================================
  // DETECÇÃO
  // =======================================================

  // Confiança mínima (0 a 1) para considerar uma detecção válida
  CONFIANCA_MINIMA: 0.45, // meio-termo mais sensível (antes 0.55)

  // Confiança mínima ESPECÍFICA para algumas classes, que
  // sobrescreve o CONFIANCA_MINIMA geral acima. Útil pra
  // classes que o modelo reconhece com menos certeza por
  // padrão — como "bottle", que foi treinado majoritariamente
  // com garrafas de formato convencional (gargalo estreito), e
  // fica com confiança mais baixa e instável diante de
  // térmicas, frascos, latas e formatos incomuns.
  CONFIANCA_MINIMA_POR_CLASSE: {
    bottle: 0.25,
  },

  // Classes do COCO-SSD tratadas como "objeto suspeito"
  CLASSES_OBJETOS_SUSPEITOS: ["backpack", "handbag", "suitcase", "bottle"],

  // Segundos parado + sem supervisão para o objeto virar alerta
  TEMPO_OBJETO_SUSPEITO: 3, // reage mais rápido pra demonstrar (antes 4)

  // Distância (em % da largura do vídeo) para considerar que é
  // "o mesmo objeto" ou "a mesma pessoa" de um frame pro outro
  DISTANCIA_MAX_RASTREIO: 0.08,

  // Tempo mínimo (ms) que uma pessoa precisa estar CONTINUAMENTE
  // dentro (ou fora) da área restrita antes do sistema confiar
  // nessa detecção. Evita que um erro de detecção de um único
  // frame dispare (ou cancele) um alerta — a pessoa precisa
  // aparecer consistentemente por esse tempo, não só piscar
  // uma vez.
  TEMPO_CONFIRMACAO_AREA_MS: 200, // confirma um pouco mais rápido (antes 300)

  // Por quanto tempo (ms) um objeto/pessoa que sumiu do
  // reconhecimento continua "vivo" no rastreamento, esperando
  // reaparecer, antes de ser esquecido de vez. Evita que um
  // tremor de detecção (a caixa balançar um pouco e ficar fora
  // do alcance de "é o mesmo objeto") reinicie o cronômetro do
  // zero — sem isso, quanto mais rápido a detecção roda, maior
  // a chance de um tremor cortar a contagem antes da hora.
  TOLERANCIA_SUMICO_MS: 500,

  // Distância (em % da largura do vídeo) até uma pessoa para
  // considerar que ela está "supervisionando" um objeto
  DISTANCIA_SUPERVISAO: 0.15,

  // Duas pessoas são "próximas" se a distância entre elas for
  // menor que este fator vezes a altura média delas. Ex: 1.5
  // significa "mais perto que 1,5 vez a altura de uma pessoa".
  // Aumentar deixa a detecção de aglomeração mais SENSÍVEL
  // (agrupa gente mais distante); diminuir deixa mais RÍGIDA
  // (só agrupa quem está bem colado). Como usa a altura das
  // pessoas como régua, funciona igual perto ou longe da câmera.
  FATOR_DISTANCIA_AGLOMERACAO: 1.8, // agrupa gente um pouco mais distante (antes 1.5)

  // Quantidade mínima de pessoas próximas para virar alerta
  MINIMO_PESSOAS_AGLOMERACAO: 3,

  // Pausa mínima ENTRE UMA DETECÇÃO E A PRÓXIMA (ms) — não é
  // "detecta a cada X ms", é "espera terminar uma detecção, e
  // só então espera mais X ms antes de começar a próxima". Um
  // valor pequeno deixa a velocidade real ser limitada pela
  // capacidade do seu computador (que tende a ser bem mais
  // rápida que 200ms numa máquina razoável), em vez de uma
  // espera artificial. Só existe pra não travar o navegador em
  // computadores muito fracos — não precisa aumentar isso pra
  // deixar mais fluido, geralmente é o contrário.
  INTERVALO_DETECCAO_MS: 10,
};