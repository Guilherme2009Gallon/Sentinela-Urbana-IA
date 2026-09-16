// =========================================================
// SENTINELA URBANA IA — VERSÃO WEB
// =========================================================
// Roda inteiramente no navegador: câmera via getUserMedia,
// detecção via TensorFlow.js (modelo COCO-SSD), sem precisar
// instalar nada nem depender de Python/OpenCV.


// =========================================================
// ESTADO GLOBAL
// =========================================================

const estado = {
  modelo: null,
  streamAtivo: false,

  areaManual: null,       // {x1,y1,x2,y2} em % do vídeo, ou null = padrão
  arrastandoArea: false,
  areaTempInicio: null,
  areaTempFim: null,

  objetosRastreados: {},  // id -> {nome, centro, inicio}
  pessoasRastreadasArea: {}, // id -> {centro, dentroBruto, desde}
  bboxAlertaAtual: null, // [x, y, largura, altura] do que está causando o risco agora
  ultimoNivelAutomatico: null,
  ultimoMotivoAlerta: "Evento registrado manualmente",
  riscoAtual: "Baixo",

  alertasHoje: 0,
  historico: [],

  emailProntoParaEnviar: false,
  modoEmailAtivo: true, // true = tenta enviar e-mail; false = só o link no histórico
};


// =========================================================
// ELEMENTOS DOM
// =========================================================

const video = document.getElementById("video");
const canvas = document.getElementById("canvas-overlay");
const ctx = canvas.getContext("2d");
const palcoCamera = document.getElementById("palco-camera");
const mensagemCamera = document.getElementById("mensagem-camera");

const statusCamera = document.getElementById("status-camera");
const relogioEl = document.getElementById("relogio");
const caixaAlerta = document.getElementById("caixa-alerta");
const statPessoas = document.getElementById("stat-pessoas");
const statAlertas = document.getElementById("stat-alertas");
const statRisco = document.getElementById("stat-risco");
const listaHistorico = document.getElementById("lista-historico");
const marcadorAlertaMapa = document.getElementById("marcador-alerta");

const btnPermitirCamera = document.getElementById("btn-permitir-camera");
const btnRedefinirArea = document.getElementById("btn-redefinir-area");
const btnAdicionarEvento = document.getElementById("btn-adicionar-evento");
const btnFinalizar = document.getElementById("btn-finalizar");
const btnModoEnvio = document.getElementById("btn-modo-envio");
const interruptorValor = document.getElementById("interruptor-valor");


// =========================================================
// AVISO: PÁGINA ABERTA DIRETO DO ARQUIVO (file://)
// =========================================================
// Se a página foi aberta com duplo clique em vez de servida
// por "python -m http.server", os links do e-mail (e possivelmente
// a câmera, em alguns navegadores) não funcionam direito. Só
// avisa no console (F12) — não mostra nada na tela, pra não
// atrapalhar a apresentação.

if (window.location.protocol === "file:") {
  console.warn(
    "ATENÇÃO: esta página foi aberta direto do arquivo (file://). " +
    "Rode 'python -m http.server 8000' na pasta do projeto e acesse " +
    "http://localhost:8000 pelo navegador — veja o README.md."
  );
}


// =========================================================
// RELÓGIO
// =========================================================

function atualizarRelogio() {
  const agora = new Date();
  relogioEl.textContent = agora.toLocaleTimeString("pt-BR");
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();


// =========================================================
// RADAR: pisca os pontos quando a varredura passa por eles
// =========================================================
// Calcula o ângulo de cada ponto em relação ao centro do
// radar, e compara com o ângulo atual da varredura (que gira
// a cada 4s, em sincronia com a animação CSS "girar"). Quando
// os dois ângulos ficam próximos, o ponto pisca — como um
// radar de verdade.

function iniciarRadarInterativo() {
  const CENTRO_RADAR = { x: 150, y: 110 };
  const DURACAO_VOLTA_MS = 4000; // precisa bater com o CSS (girar 4s)
  const TOLERANCIA_GRAUS = 8;

  const pontos = document.querySelectorAll(".radar-ponto");

  if (pontos.length === 0) return;

  // Calcula o ângulo de cada ponto uma única vez (0° = topo,
  // aumentando no sentido horário — mesma referência da
  // animação de rotação CSS).
  const dadosPontos = Array.from(pontos).map((ponto) => {
    const cx = parseFloat(ponto.getAttribute("cx"));
    const cy = parseFloat(ponto.getAttribute("cy"));
    const dx = cx - CENTRO_RADAR.x;
    const dy = cy - CENTRO_RADAR.y;

    let angulo = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angulo < 0) angulo += 360;

    return { elemento: ponto, angulo };
  });

  const inicio = performance.now();

  function loop(agora) {
    const decorrido = (agora - inicio) % DURACAO_VOLTA_MS;
    const anguloVarredura = (decorrido / DURACAO_VOLTA_MS) * 360;

    dadosPontos.forEach(({ elemento, angulo }) => {
      const diferenca = Math.abs(
        ((anguloVarredura - angulo + 540) % 360) - 180
      );

      const passandoAgora = diferenca < TOLERANCIA_GRAUS;

      elemento.classList.toggle("radar-ponto-piscando", passandoAgora);
    });

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

iniciarRadarInterativo();


// =========================================================
// "PING" AO CLICAR NOS BOTÕES
// =========================================================
// Cria um pequeno círculo que expande a partir do ponto exato
// onde o usuário clicou, como um "ping" de radar detectando o
// clique. Não usa nada se o sistema tiver "movimento reduzido"
// ativado.

function ativarPingBotoes() {
  const prefereReduzido = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefereReduzido) return;

  document.querySelectorAll(".botao").forEach((botao) => {
    botao.addEventListener("click", (evento) => {
      const retangulo = botao.getBoundingClientRect();

      const ping = document.createElement("span");
      ping.className = "botao-ping";
      ping.style.left = `${evento.clientX - retangulo.left}px`;
      ping.style.top = `${evento.clientY - retangulo.top}px`;

      botao.appendChild(ping);

      ping.addEventListener("animationend", () => ping.remove());
    });
  });
}

ativarPingBotoes();


// =========================================================
// SOM DE ALERTA (Web Audio API — sem precisar de arquivo)
// =========================================================

let alertaSonoroAtivo = false;

function tocarBip() {
  try {
    const contexto = new (window.AudioContext || window.webkitAudioContext)();
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();

    osc.type = "square";
    osc.frequency.value = 880;
    ganho.gain.value = 0.15;

    osc.connect(ganho);
    ganho.connect(contexto.destination);

    osc.start();
    osc.stop(contexto.currentTime + 0.25);
  } catch (erro) {
    console.warn("Não foi possível tocar o som de alerta:", erro);
  }
}


// =========================================================
// INICIAR CÂMERA
// =========================================================

btnPermitirCamera.addEventListener("click", iniciarCamera);

async function iniciarCamera() {
  btnPermitirCamera.disabled = true;
  btnPermitirCamera.textContent = "Abrindo câmera...";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false,
    });

    video.srcObject = stream;
    estado.streamAtivo = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ajustarTamanhoVideo();
    window.addEventListener("resize", ajustarTamanhoVideo);

    mensagemCamera.classList.add("escondida");
    btnPermitirCamera.textContent = "Câmera Ativa";
    btnRedefinirArea.disabled = false;

    definirStatus("online", "🟢 ONLINE");

    if (!estado.modelo) {
      definirStatus("atencao", "🟡 CARREGANDO IA...");
      estado.modelo = await cocoSsd.load();
    }

    definirStatus("online", "🟢 ONLINE");

    configurarSelecaoArea();
    loopDeteccao();

  } catch (erro) {
    console.error("Erro ao acessar a câmera:", erro);
    btnPermitirCamera.disabled = false;
    btnPermitirCamera.textContent = "Ativar Câmera";

    mensagemCamera.querySelector("p").textContent =
      "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
  }
}

function definirStatus(tipo, texto) {
  statusCamera.className = "pilula pilula-" + tipo;
  statusCamera.innerHTML = '<span class="ponto"></span>' + texto;
}


// =========================================================
// AJUSTAR TAMANHO DO VÍDEO/CANVAS
// =========================================================
// <canvas> não entende "object-fit", então calculamos na mão
// o tamanho e a posição que mostram a cena INTEIRA dentro do
// painel, sem cortar nada (tipo "letterbox") — e aplicamos o
// mesmo cálculo no vídeo e no canvas, pra ficarem sempre
// alinhados um com o outro.

function ajustarTamanhoVideo() {
  if (!video.videoWidth || !video.videoHeight) return;

  const containerLargura = palcoCamera.clientWidth;
  const containerAltura = palcoCamera.clientHeight;

  if (containerLargura === 0 || containerAltura === 0) return;

  const razaoVideo = video.videoWidth / video.videoHeight;
  const razaoContainer = containerLargura / containerAltura;

  let largura, altura;

  if (razaoContainer > razaoVideo) {
    // Painel mais largo que o vídeo: a altura manda
    altura = containerAltura;
    largura = altura * razaoVideo;
  } else {
    // Painel mais estreito/alto que o vídeo: a largura manda
    largura = containerLargura;
    altura = largura / razaoVideo;
  }

  const esquerda = (containerLargura - largura) / 2;
  const topo = (containerAltura - altura) / 2;

  [video, canvas].forEach((elemento) => {
    elemento.style.width = `${largura}px`;
    elemento.style.height = `${altura}px`;
    elemento.style.left = `${esquerda}px`;
    elemento.style.top = `${topo}px`;
  });
}


// =========================================================
// ÁREA RESTRITA CONFIGURÁVEL (clicar e arrastar)
// =========================================================

function converterCliqueParaCoordenadas(evento) {
  const retangulo = canvas.getBoundingClientRect();
  const escalaX = canvas.width / retangulo.width;
  const escalaY = canvas.height / retangulo.height;

  const x = (evento.clientX - retangulo.left) * escalaX;
  const y = (evento.clientY - retangulo.top) * escalaY;

  return {
    x: Math.max(0, Math.min(x, canvas.width)),
    y: Math.max(0, Math.min(y, canvas.height)),
  };
}

function configurarSelecaoArea() {
  canvas.addEventListener("mousedown", (evento) => {
    const ponto = converterCliqueParaCoordenadas(evento);
    estado.arrastandoArea = true;
    estado.areaTempInicio = ponto;
    estado.areaTempFim = ponto;
  });

  canvas.addEventListener("mousemove", (evento) => {
    if (!estado.arrastandoArea) return;
    estado.areaTempFim = converterCliqueParaCoordenadas(evento);
  });

  window.addEventListener("mouseup", (evento) => {
    if (!estado.arrastandoArea) return;
    estado.arrastandoArea = false;

    const inicio = estado.areaTempInicio;
    const fim = converterCliqueParaCoordenadas(evento);

    const x1 = Math.min(inicio.x, fim.x);
    const x2 = Math.max(inicio.x, fim.x);
    const y1 = Math.min(inicio.y, fim.y);
    const y2 = Math.max(inicio.y, fim.y);

    estado.areaTempInicio = null;
    estado.areaTempFim = null;

    // Ignora arrastes muito pequenos (clique acidental)
    if ((x2 - x1) < 20 || (y2 - y1) < 20) return;

    estado.areaManual = { x1, y1, x2, y2 };
  });
}

btnRedefinirArea.addEventListener("click", () => {
  estado.areaManual = null;
});

function obterAreaRestrita() {
  if (estado.areaManual) return estado.areaManual;

  // Padrão: metade direita da tela
  return {
    x1: canvas.width * 0.5,
    y1: 0,
    x2: canvas.width,
    y2: canvas.height,
  };
}


// =========================================================
// LOOP DE DETECÇÃO
// =========================================================

let contadorErrosSeguidos = 0;

// Diagnóstico: mostra no console quantas detecções por
// segundo o computador está realmente conseguindo fazer.
let contadorFrames = 0;
let ultimoLogFps = performance.now();

// Diagnóstico: throttle do log de detecções brutas (ver
// processarDeteccoes), pra não inundar o console.
let ultimoLogDeteccoes = 0;

async function loopDeteccao() {
  if (!estado.streamAtivo) return;

  // Só tenta detectar se o vídeo realmente tiver um frame
  // pronto (evita erros do TensorFlow.js tentando ler um
  // vídeo pausado/ainda carregando).
  const videoPronto =
    video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;

  if (!videoPronto) {
    setTimeout(loopDeteccao, CONFIG.INTERVALO_DETECCAO_MS);
    return;
  }

  try {
    const deteccoes = await estado.modelo.detect(video);
    processarDeteccoes(deteccoes);
    contadorErrosSeguidos = 0;

    contadorFrames += 1;
    const agora = performance.now();
    if (agora - ultimoLogFps >= 2000) {
      const fps = (contadorFrames / ((agora - ultimoLogFps) / 1000)).toFixed(1);
      console.log(`Detecção rodando a ${fps} frames/segundo.`);
      contadorFrames = 0;
      ultimoLogFps = agora;
    }

  } catch (erro) {
    contadorErrosSeguidos += 1;
    console.error("Erro ao processar frame:", erro);

    // Se errar muitas vezes seguidas, avisa na tela em vez de
    // deixar o problema escondido só no console (F12).
    if (contadorErrosSeguidos >= 5) {
      caixaAlerta.className = "caixa-alerta alerta-alto";
      caixaAlerta.textContent =
        `ERRO NA DETECÇÃO!\n${erro.message || erro}\n\nVeja o console (F12) para detalhes.`;
    }
  }

  setTimeout(loopDeteccao, CONFIG.INTERVALO_DETECCAO_MS);
}


// =========================================================
// PROCESSAR DETECÇÕES (equivalente ao _processar_frame_interno)
// =========================================================

function processarDeteccoes(deteccoes) {

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pega o limiar certo pra cada classe — usa o específico da
  // classe se existir em CONFIANCA_MINIMA_POR_CLASSE, senão
  // cai no geral (CONFIANCA_MINIMA).
  function limiarDaClasse(nomeClasse) {
    return CONFIG.CONFIANCA_MINIMA_POR_CLASSE?.[nomeClasse] ?? CONFIG.CONFIANCA_MINIMA;
  }

  const pessoas = deteccoes.filter(
    (d) => d.class === "person" && d.score >= limiarDaClasse(d.class)
  );

  const objetos = deteccoes.filter(
    (d) =>
      CONFIG.CLASSES_OBJETOS_SUSPEITOS.includes(d.class) &&
      d.score >= limiarDaClasse(d.class)
  );

  // DIAGNÓSTICO TEMPORÁRIO — mostra as detecções que o modelo
  // fez, mesmo as que não passaram no limiar de confiança.
  // Ajuda a entender o que a IA está "vendo" quando um objeto
  // não é reconhecido — por exemplo, se ele está sendo
  // classificado como outra coisa (não "bottle"), ou se a
  // confiança está sempre bem baixa. Limitado a 1x por segundo
  // pra não inundar o console, já que a detecção roda muito
  // rápido agora.
  const agoraDiagnostico = performance.now();
  if (deteccoes.length > 0 && agoraDiagnostico - ultimoLogDeteccoes >= 1000) {
    console.log(
      "Detecções deste frame:",
      deteccoes.map((d) => `${d.class} (${(d.score * 100).toFixed(0)}%)`).join(", ")
    );
    ultimoLogDeteccoes = agoraDiagnostico;
  }

  statPessoas.textContent = pessoas.length;

  const area = obterAreaRestrita();

  // ===== PESSOA NA ÁREA RESTRITA (com suavização temporal) =====
  // Cada pessoa é rastreada entre frames (por proximidade). Só
  // consideramos ela "confirmada" dentro da área depois que
  // essa condição persistir por TEMPO_CONFIRMACAO_AREA_MS —
  // isso filtra erros de detecção de um único frame (que
  // causavam falso positivo/negativo picado).
  let pessoaNaArea = false;
  let bboxPessoaNaArea = null;
  const agoraMs = Date.now();
  const novoRastreioArea = {};
  const idsUsadosArea = new Set();
  const limiarRastreioPessoa = CONFIG.DISTANCIA_MAX_RASTREIO * canvas.width;

  pessoas.forEach((p, indice) => {
    const [px, py, plargura, paltura] = p.bbox;
    const pesX = px + plargura / 2;
    const pesY = py + paltura;

    // "Dentro" agora significa que a CAIXA da pessoa (a área
    // que ela ocupa na tela) toca a área restrita — não precisa
    // esperar os pés cruzarem totalmente pra dentro. É uma
    // checagem de sobreposição entre dois retângulos: só não
    // sobrepõem se um estiver totalmente à esquerda, direita,
    // acima ou abaixo do outro.
    const dentroBruto =
      px < area.x2 && (px + plargura) > area.x1 &&
      py < area.y2 && (py + paltura) > area.y1;

    // Tenta encontrar essa mesma pessoa no frame anterior
    let idEncontrado = null;
    let menorDistancia = Infinity;

    Object.entries(estado.pessoasRastreadasArea).forEach(([id, dados]) => {
      if (idsUsadosArea.has(id)) return;
      const d = Math.hypot(dados.centro.x - pesX, dados.centro.y - pesY);
      if (d <= limiarRastreioPessoa && d < menorDistancia) {
        menorDistancia = d;
        idEncontrado = id;
      }
    });

    let desde;

    if (idEncontrado && estado.pessoasRastreadasArea[idEncontrado].dentroBruto === dentroBruto) {
      // Mesmo estado (dentro ou fora) que no frame anterior:
      // mantém o cronômetro rodando.
      desde = estado.pessoasRastreadasArea[idEncontrado].desde;
    } else {
      // Pessoa nova, ou mudou de dentro<->fora: reinicia o
      // cronômetro de confirmação.
      desde = agoraMs;
    }

    const confirmado = dentroBruto && (agoraMs - desde) >= CONFIG.TEMPO_CONFIRMACAO_AREA_MS;

    const idUsado = idEncontrado || `pessoa_${indice}_${agoraMs}`;
    idsUsadosArea.add(idUsado);
    novoRastreioArea[idUsado] = {
      centro: { x: pesX, y: pesY },
      dentroBruto,
      desde,
      ultimaVez: agoraMs,
    };

    if (confirmado) {
      pessoaNaArea = true;
      bboxPessoaNaArea = p.bbox;
    }

    desenharCaixa(p.bbox, confirmado ? "#FF2A6D" : "#00F0FF", confirmado ? "PESSOA (ÁREA RESTRITA)" : "pessoa");
    desenharPontoPes(pesX, pesY, confirmado ? "#FF2A6D" : "#00F0FF");
  });

  // Período de tolerância: se a pessoa sumir do reconhecimento
  // por um instante bem curto, mantém o cronômetro de onde
  // estava em vez de resetar — evita que um tremor de detecção
  // atrapalhe a confirmação.
  const toleranciaSumicoAreaMs = CONFIG.TOLERANCIA_SUMICO_MS;
  Object.entries(estado.pessoasRastreadasArea).forEach(([id, dados]) => {
    if (novoRastreioArea[id]) return;
    if (agoraMs - dados.ultimaVez < toleranciaSumicoAreaMs) {
      novoRastreioArea[id] = dados;
    }
  });

  estado.pessoasRastreadasArea = novoRastreioArea;

  // ===== AGLOMERAÇÃO =====
  const centros = pessoas.map((p) => ({
    x: p.bbox[0] + p.bbox[2] / 2,
    y: p.bbox[1] + p.bbox[3] / 2,
  }));

  const { aglomeracaoDetectada, tamanhoGrupo, centroGrupo, raioGrupo } =
    detectarAglomeracao(centros);

  if (aglomeracaoDetectada) {
    desenharCirculo(centroGrupo, raioGrupo, "#FF2A6D");
    desenharTexto(
      { x: centroGrupo.x - raioGrupo, y: centroGrupo.y - raioGrupo - 10 },
      `AGLOMERAÇÃO (${tamanhoGrupo} pessoas)`,
      "#FF2A6D"
    );
  }

  // ===== OBJETO SUSPEITO =====
  const { objetoSuspeitoDetectado, motivoObjeto, bboxObjetoSuspeito } =
    rastrearObjetosSuspeitos(objetos, centros);

  // ===== ÁREA RESTRITA (desenho) =====
  desenharRetangulo(area, "#FF2A6D", "ÁREA RESTRITA");

  if (estado.arrastandoArea && estado.areaTempInicio && estado.areaTempFim) {
    const x1 = Math.min(estado.areaTempInicio.x, estado.areaTempFim.x);
    const x2 = Math.max(estado.areaTempInicio.x, estado.areaTempFim.x);
    const y1 = Math.min(estado.areaTempInicio.y, estado.areaTempFim.y);
    const y2 = Math.max(estado.areaTempInicio.y, estado.areaTempFim.y);
    desenharRetangulo({ x1, y1, x2, y2 }, "#00F0FF", null);
  }

  // ===== DECISÃO DE RISCO =====
  if (pessoaNaArea || aglomeracaoDetectada) {

    const motivo = pessoaNaArea
      ? "Pessoa em área restrita"
      : `Aglomeração detectada (${tamanhoGrupo} pessoas)`;

    definirRisco("Alto", motivo);

    // Guarda a caixa exata que causou o risco, pra poder tirar
    // uma foto recortada só dela (não o quadro inteiro). Pessoa
    // na área: a caixa dela mesma. Aglomeração: uma caixa que
    // envolve o grupo inteiro (a partir do círculo já calculado).
    estado.bboxAlertaAtual = pessoaNaArea
      ? bboxPessoaNaArea
      : [centroGrupo.x - raioGrupo, centroGrupo.y - raioGrupo, raioGrupo * 2, raioGrupo * 2];

    if (!alertaSonoroAtivo) {
      tocarBip();
      alertaSonoroAtivo = true;
    }

    // Pessoa em área restrita: só registra/envia e-mail no
    // clique manual de "Adicionar Evento" (igual à versão
    // Python). Aglomeração: registra automaticamente.
    if (!pessoaNaArea) {
      registrarEventoAutomatico("Alto", motivo);
    }

  } else if (objetoSuspeitoDetectado) {

    definirRisco("Médio", motivoObjeto);
    estado.bboxAlertaAtual = bboxObjetoSuspeito;
    alertaSonoroAtivo = false;
    registrarEventoAutomatico("Médio", motivoObjeto);

  } else {

    definirRisco("Baixo", null);
    estado.bboxAlertaAtual = null;
    alertaSonoroAtivo = false;
    estado.ultimoNivelAutomatico = null;
  }
}


// =========================================================
// AGLOMERAÇÃO (união de conjuntos / clustering)
// =========================================================

function detectarAglomeracao(centros) {
  const pais = centros.map((_, i) => i);

  function encontrar(i) {
    while (pais[i] !== i) {
      pais[i] = pais[pais[i]];
      i = pais[i];
    }
    return i;
  }

  function unir(a, b) {
    const ra = encontrar(a);
    const rb = encontrar(b);
    if (ra !== rb) pais[rb] = ra;
  }

  const limiar = CONFIG.DISTANCIA_AGLOMERACAO * canvas.width;

  for (let i = 0; i < centros.length; i++) {
    for (let j = i + 1; j < centros.length; j++) {
      const dx = centros[i].x - centros[j].x;
      const dy = centros[i].y - centros[j].y;
      const distancia = Math.sqrt(dx * dx + dy * dy);
      if (distancia <= limiar) unir(i, j);
    }
  }

  const grupos = {};
  centros.forEach((_, i) => {
    const raiz = encontrar(i);
    if (!grupos[raiz]) grupos[raiz] = [];
    grupos[raiz].push(i);
  });

  let maiorGrupo = [];
  Object.values(grupos).forEach((indices) => {
    if (
      indices.length >= CONFIG.MINIMO_PESSOAS_AGLOMERACAO &&
      indices.length > maiorGrupo.length
    ) {
      maiorGrupo = indices;
    }
  });

  if (maiorGrupo.length === 0) {
    return { aglomeracaoDetectada: false };
  }

  const pontos = maiorGrupo.map((i) => centros[i]);
  const centroGrupo = {
    x: pontos.reduce((s, p) => s + p.x, 0) / pontos.length,
    y: pontos.reduce((s, p) => s + p.y, 0) / pontos.length,
  };
  const raioGrupo = Math.max(
    80,
    Math.max(
      ...pontos.map((p) =>
        Math.hypot(p.x - centroGrupo.x, p.y - centroGrupo.y)
      )
    ) + 40
  );

  return {
    aglomeracaoDetectada: true,
    tamanhoGrupo: maiorGrupo.length,
    centroGrupo,
    raioGrupo,
  };
}


// =========================================================
// OBJETO SUSPEITO (rastreio entre frames + temporizador)
// =========================================================

function rastrearObjetosSuspeitos(objetos, centrosPessoas) {
  const agora = Date.now() / 1000;
  const novosRastreados = {};
  const idsUsadosNesseFrame = new Set();
  let objetoSuspeitoDetectado = false;
  let motivoObjeto = "";
  let bboxObjetoSuspeito = null;

  const limiarRastreio = CONFIG.DISTANCIA_MAX_RASTREIO * canvas.width;
  const limiarSupervisao = CONFIG.DISTANCIA_SUPERVISAO * canvas.width;
  const toleranciaSumicoSeg = CONFIG.TOLERANCIA_SUMICO_MS / 1000;

  objetos.forEach((obj, indice) => {
    const [x, y, largura, altura] = obj.bbox;
    const centro = { x: x + largura / 2, y: y + altura / 2 };

    let idEncontrado = null;
    let menorDistancia = Infinity;

    Object.entries(estado.objetosRastreados).forEach(([id, dados]) => {
      if (dados.nome !== obj.class) return;
      if (idsUsadosNesseFrame.has(id)) return;
      const d = Math.hypot(dados.centro.x - centro.x, dados.centro.y - centro.y);
      if (d <= limiarRastreio && d < menorDistancia) {
        menorDistancia = d;
        idEncontrado = id;
      }
    });

    const inicio = idEncontrado
      ? estado.objetosRastreados[idEncontrado].inicio
      : agora;

    const idUsado = idEncontrado || `${obj.class}_${indice}_${agora}`;
    idsUsadosNesseFrame.add(idUsado);

    const tempoParado = agora - inicio;

    const supervisionado = centrosPessoas.some(
      (p) => Math.hypot(p.x - centro.x, p.y - centro.y) <= limiarSupervisao
    );

    const suspeito =
      tempoParado >= CONFIG.TEMPO_OBJETO_SUSPEITO && !supervisionado;

    if (suspeito) {
      objetoSuspeitoDetectado = true;
      motivoObjeto = "Objeto suspeito sem supervisão";
      bboxObjetoSuspeito = obj.bbox;
    }

    novosRastreados[idUsado] = { nome: obj.class, centro, inicio, ultimaVez: agora };

    const cor = suspeito ? "#FFD60A" : "#FFA500";
    const rotulo = suspeito
      ? `OBJETO SUSPEITO (${Math.floor(tempoParado)}s)`
      : `${obj.class} (${Math.floor(tempoParado)}s)`;

    desenharCaixa(obj.bbox, cor, rotulo);
  });

  // Período de tolerância: um objeto que sumiu do reconhecimento
  // por pouco tempo (tremor de detecção, oclusão rápida) NÃO
  // reinicia o cronômetro — continua "vivo", esperando reaparecer,
  // por até TOLERANCIA_SUMICO_MS. Só é esquecido de vez depois
  // desse prazo.
  Object.entries(estado.objetosRastreados).forEach(([id, dados]) => {
    if (novosRastreados[id]) return;
    const tempoSemVer = agora - dados.ultimaVez;
    if (tempoSemVer < toleranciaSumicoSeg) {
      novosRastreados[id] = dados;
    }
  });

  estado.objetosRastreados = novosRastreados;

  return { objetoSuspeitoDetectado, motivoObjeto, bboxObjetoSuspeito };
}


// =========================================================
// DESENHO NO CANVAS
// =========================================================
// Sem espelhamento: câmera de segurança mostra a cena tal como
// a câmera capta, igual à versão Python original.

function desenharCaixa([x, y, largura, altura], cor, rotulo) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, largura, altura);

  if (rotulo) {
    ctx.font = "600 15px 'IBM Plex Mono', monospace";
    const largTexto = ctx.measureText(rotulo).width;

    ctx.fillStyle = cor;
    ctx.fillRect(x, y - 20, largTexto + 10, 20);
    ctx.fillStyle = "#0A1128";
    ctx.fillText(rotulo, x + 5, y - 5);
  }
}

function desenharRetangulo(area, cor, rotulo) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = 3;
  ctx.strokeRect(area.x1, area.y1, area.x2 - area.x1, area.y2 - area.y1);

  if (rotulo) {
    desenharTexto({ x: area.x1 + 10, y: area.y1 + 22 }, rotulo, cor);
  }
}

function desenharCirculo(centro, raio, cor) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centro.x, centro.y, raio, 0, Math.PI * 2);
  ctx.stroke();
}

function desenharTexto(pos, texto, cor) {
  ctx.font = "700 16px 'IBM Plex Mono', monospace";
  ctx.fillStyle = cor;
  ctx.fillText(texto, pos.x, pos.y);
}

function desenharPontoPes(x, y, cor) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
  ctx.strokeStyle = "#0A1128";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}



// =========================================================
// RISCO / PAINEL
// =========================================================

function definirRisco(nivel, motivo) {
  estado.riscoAtual = nivel;
  if (motivo) estado.ultimoMotivoAlerta = motivo;

  statRisco.textContent = nivel.toUpperCase();
  statRisco.className =
    nivel === "Alto" ? "risco-alto" : nivel === "Médio" ? "risco-medio" : "risco-baixo";

  marcadorAlertaMapa.setAttribute("opacity", nivel === "Alto" ? "1" : "0");

  // Pulso vermelho na moldura da câmera + miras de canto,
  // só enquanto o risco estiver Alto.
  palcoCamera.classList.toggle("alerta-ativo", nivel === "Alto");

  if (nivel === "Alto") {
    caixaAlerta.className = "caixa-alerta alerta-alto";
    caixaAlerta.textContent = `ALERTA!\n${motivo}`;
  } else if (nivel === "Médio") {
    caixaAlerta.className = "caixa-alerta alerta-medio";
    caixaAlerta.textContent = `ATENÇÃO!\n${motivo}`;
  } else {
    caixaAlerta.className = "caixa-alerta";
    caixaAlerta.textContent = "Nenhum alerta.";
  }
}


// =========================================================
// FOTO DO ALERTA
// =========================================================
// Tira uma "foto" juntando o frame atual do vídeo com as
// caixas de detecção desenhadas em cima (o mesmo canvas que
// já mostra na tela) — assim a foto mostra exatamente o que
// o sistema detectou no momento do alerta. Se "bboxRecorte" for
// passado, a foto final é recortada só naquela região (com uma
// margem ao redor pra dar contexto), em vez do quadro inteiro.

function capturarFotoAlerta(bboxRecorte = null) {
  if (!video.videoWidth || !video.videoHeight) return null;

  const canvasFoto = document.createElement("canvas");
  canvasFoto.width = video.videoWidth;
  canvasFoto.height = video.videoHeight;
  const ctxFoto = canvasFoto.getContext("2d");

  // Camada 1: o vídeo puro
  ctxFoto.drawImage(video, 0, 0, canvasFoto.width, canvasFoto.height);

  // Camada 2: as caixas/marcações do canvas de detecção, por cima
  ctxFoto.drawImage(canvas, 0, 0, canvasFoto.width, canvasFoto.height);

  if (!bboxRecorte) {
    return canvasFoto.toDataURL("image/jpeg", 0.85);
  }

  // Recorta só a região que causou o risco, com 25% de margem
  // ao redor pra dar um pouco de contexto (sem margem nenhuma,
  // a foto ficaria colada exatamente na borda da caixa).
  const MARGEM = 0.25;
  const [x, y, largura, altura] = bboxRecorte;
  const margemX = largura * MARGEM;
  const margemY = altura * MARGEM;

  const rx = Math.max(0, x - margemX);
  const ry = Math.max(0, y - margemY);
  const rLargura = Math.min(canvasFoto.width - rx, largura + margemX * 2);
  const rAltura = Math.min(canvasFoto.height - ry, altura + margemY * 2);

  if (rLargura <= 0 || rAltura <= 0) {
    // Região inválida (não deveria acontecer, mas por segurança)
    return canvasFoto.toDataURL("image/jpeg", 0.85);
  }

  const canvasRecorte = document.createElement("canvas");
  canvasRecorte.width = rLargura;
  canvasRecorte.height = rAltura;
  const ctxRecorte = canvasRecorte.getContext("2d");

  ctxRecorte.drawImage(
    canvasFoto,
    rx, ry, rLargura, rAltura,
    0, 0, rLargura, rAltura
  );

  return canvasRecorte.toDataURL("image/jpeg", 0.85);
}


// =========================================================
// REGISTRO AUTOMÁTICO (aglomeração e objeto — sem clicar)
// =========================================================

function registrarEventoAutomatico(nivel, motivo) {
  if (estado.ultimoNivelAutomatico === nivel) return;
  estado.ultimoNivelAutomatico = nivel;

  // Tira a foto sozinho, recortada só na região que causou o
  // risco — sem precisar de clique nenhum no botão.
  const foto = capturarFotoAlerta(estado.bboxAlertaAtual);

  registrarEvento(nivel, motivo, foto);
}


// =========================================================
// HISTÓRICO
// =========================================================

function registrarEvento(nivel, motivo, foto = null) {
  const agora = new Date();

  const evento = {
    data: agora.toLocaleDateString("pt-BR"),
    hora: agora.toLocaleTimeString("pt-BR"),
    motivo,
    nivel,
    foto,
  };

  estado.historico.unshift(evento);
  estado.alertasHoje += 1;
  statAlertas.textContent = estado.alertasHoje;

  renderizarHistorico();

  if ((nivel === "Alto" || nivel === "Médio") && estado.modoEmailAtivo) {
    enviarEmailAlerta(evento);
  }
}

function renderizarHistorico() {
  if (estado.historico.length === 0) {
    listaHistorico.innerHTML = '<p class="historico-vazio">Nenhum evento registrado ainda.</p>';
    return;
  }

  listaHistorico.innerHTML = estado.historico
    .slice(0, 50)
    .map((ev) => {
      const classeRisco =
        ev.nivel === "Alto" ? "risco-item-alto" : ev.nivel === "Médio" ? "risco-item-medio" : "risco-item-baixo";

      const miniatura = ev.foto
        ? `<a href="${ev.foto}" target="_blank" rel="noopener" title="Ver foto em tamanho real">
             <img src="${ev.foto}" class="foto-evento" alt="Foto do momento do alerta">
           </a>`
        : "";

      const botaoResponder =
        ev.nivel === "Alto" || ev.nivel === "Médio"
          ? `<a href="${construirLinkResposta(ev)}" target="_blank" rel="noopener" class="link-responder-historico">
               Responder a este alerta →
             </a>`
          : "";

      return `
        <div class="item-historico ${classeRisco}">
          <div class="linha-texto-historico">
            <span class="hora">${ev.hora}</span>
            <span>${ev.motivo} — ${ev.nivel}</span>
          </div>
          ${miniatura}
          ${botaoResponder}
        </div>`;
    })
    .join("");
}


// =========================================================
// BOTÃO "MODO DE ENVIO" (E-mail ↔ Só link no histórico)
// =========================================================

btnModoEnvio.addEventListener("click", () => {
  estado.modoEmailAtivo = !estado.modoEmailAtivo;

  if (estado.modoEmailAtivo) {
    interruptorValor.textContent = "E-mail";
    interruptorValor.classList.remove("modo-historico");
  } else {
    interruptorValor.textContent = "Só histórico";
    interruptorValor.classList.add("modo-historico");
  }

  console.log(
    estado.modoEmailAtivo
      ? "Modo de envio: e-mail ativado."
      : "Modo de envio: só o link no histórico, e-mail desativado."
  );
});


// =========================================================
// BOTÃO "ADICIONAR EVENTO"
// =========================================================

btnAdicionarEvento.addEventListener("click", () => {
  const nivel = estado.riscoAtual;

  let motivo;
  if (nivel === "Alto") {
    motivo = estado.ultimoMotivoAlerta;
  } else if (nivel === "Médio") {
    motivo = "Objeto suspeito sem supervisão";
  } else {
    motivo = "Evento registrado manualmente";
  }

  // Só tira foto quando o risco está de fato elevado — é o
  // que causou o alerta que estamos registrando. Recorta só a
  // região relevante, quando conhecida.
  const foto =
    nivel === "Alto" || nivel === "Médio"
      ? capturarFotoAlerta(estado.bboxAlertaAtual)
      : null;

  registrarEvento(nivel, motivo, foto);
});


// =========================================================
// BOTÃO "FINALIZAR"
// =========================================================

btnFinalizar.addEventListener("click", () => {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
  }
  estado.streamAtivo = false;

  definirStatus("offline", "🔴 CÂMERA OFFLINE");
  mensagemCamera.classList.remove("escondida");
  mensagemCamera.querySelector("p").textContent =
    "Sessão finalizada. Atualize a página para começar de novo.";
  btnPermitirCamera.disabled = true;
  btnAdicionarEvento.disabled = true;
});


// =========================================================
// E-MAIL (via nosso próprio servidor — Gmail SMTP direto)
// =========================================================
// Antes usava o EmailJS (limitado a poucos e-mails grátis por
// mês). Agora manda pra uma função serverless nossa (rodando
// de graça na Vercel), que conecta direto no Gmail via SMTP —
// igual a versão em Python fazia — sem o limite baixo de
// serviços como o EmailJS.

if (CONFIG.SERVIDOR_EMAIL_URL) {
  estado.emailProntoParaEnviar = true;
} else {
  console.warn(
    "SERVIDOR_EMAIL_URL não configurado no config.js — o envio de e-mail está desativado."
  );
}

// Reduz a foto para uma versão bem mais leve, só para colocar
// no e-mail — o EmailJS no plano grátis não tem "anexo" de
// verdade, mas dá pra colocar a imagem direto no corpo do
// e-mail (isso não é um anexo formal, é só conteúdo normal),
// desde que o tamanho total fique razoável.
function reduzirFotoParaEmail(fotoDataUrl, larguraMax = 480, qualidade = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, larguraMax / img.width);
      const canvasReduzido = document.createElement("canvas");
      canvasReduzido.width = Math.round(img.width * escala);
      canvasReduzido.height = Math.round(img.height * escala);
      const ctx = canvasReduzido.getContext("2d");
      ctx.drawImage(img, 0, 0, canvasReduzido.width, canvasReduzido.height);
      resolve(canvasReduzido.toDataURL("image/jpeg", qualidade));
    };
    img.onerror = reject;
    img.src = fotoDataUrl;
  });
}

// Monta o link da nossa página de resposta (resposta.html) a
// partir de um evento — usado tanto no e-mail quanto no botão
// de responder direto no histórico da tela. Todos os detalhes
// do alerta vão dentro de UM único parâmetro (em JSON), evitando
// usar "&" no meio da URL.
function construirLinkResposta(evento) {
  const dadosAlerta = encodeURIComponent(
    JSON.stringify({
      nivel: evento.nivel,
      motivo: evento.motivo,
      data: evento.data,
      hora: evento.hora,
    })
  );

  return `${window.location.origin}/resposta.html?dados=${dadosAlerta}`;
}

async function enviarEmailAlerta(evento) {
  if (!estado.emailProntoParaEnviar) {
    console.log(
      "[e-mail não configurado] Alerta que seria enviado:",
      evento
    );
    return;
  }

  const linkFormulario = construirLinkResposta(evento);

  // Reduz a foto pra uma versão mais leve antes de mandar —
  // mantém o payload pequeno (nosso servidor e o próprio Gmail
  // têm limites de tamanho de mensagem, mesmo sendo bem mais
  // generosos que o EmailJS).
  let fotoReduzida = null;

  if (evento.foto) {
    try {
      fotoReduzida = await reduzirFotoParaEmail(evento.foto);
    } catch (erro) {
      console.error("Erro ao preparar a foto para o e-mail:", erro);
    }
  }

  const corpo = {
    nivel: evento.nivel,
    motivo: evento.motivo,
    data: evento.data,
    hora: evento.hora,
    link_formulario: linkFormulario,
    foto: fotoReduzida,
  };

  console.log(
    "Enviando alerta para o servidor de e-mail (sem o texto da foto, "
    + "que costuma ser grande):", { ...corpo, foto: fotoReduzida ? "[tem foto]" : null }
  );

  try {
    const resposta = await fetch(CONFIG.SERVIDOR_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    const resultado = await resposta.json();

    if (!resposta.ok || !resultado.sucesso) {
      throw new Error(resultado.erro || `Erro HTTP ${resposta.status}`);
    }

    console.log(`E-mail de alerta (${evento.nivel}) enviado.`);
  } catch (erro) {
    console.error("Erro ao enviar e-mail:", erro);
  }
}