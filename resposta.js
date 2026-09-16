// =========================================================
// PÁGINA DE RESPOSTA AO ALERTA
// =========================================================
// Envia a resposta (nome + opção marcada) para a mesma
// planilha do Google Forms configurada em config.js — mas com
// a nossa própria aparência em vez do formulário genérico do
// Google.

const resumoAlerta = document.getElementById("resumo-alerta");
const formResposta = document.getElementById("form-resposta");
const mensagemFinal = document.getElementById("mensagem-final");
const btnEnviar = document.getElementById("btn-enviar");


// =========================================================
// "PING" AO CLICAR NO BOTÃO
// =========================================================

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
// LER OS DADOS DO ALERTA A PARTIR DA URL
// =========================================================

const parametros = new URLSearchParams(window.location.search);

let alerta = { nivel: "—", motivo: "—", data: "—", hora: "—" };

const dadosBrutos = parametros.get("dados");

if (dadosBrutos) {
  try {
    alerta = JSON.parse(dadosBrutos);
  } catch (erro) {
    console.error("Erro ao ler os dados do alerta na URL:", erro);
  }
} else {
  console.warn(
    "Nenhum parâmetro 'dados' encontrado na URL — abrindo sem detalhes do alerta."
  );
}

resumoAlerta.innerHTML =
  `Risco: ${alerta.nivel}<br>` +
  `Motivo: ${alerta.motivo}<br>` +
  `Quando: ${alerta.data} ${alerta.hora}`;

const classeNivel =
  alerta.nivel === "Alto" ? "nivel-alto" :
  alerta.nivel === "Médio" ? "nivel-medio" :
  "nivel-baixo";

resumoAlerta.classList.add(classeNivel);


// =========================================================
// ANALISAR O LINK PRÉ-PREENCHIDO DO GOOGLE FORMS
// =========================================================
// A partir da URL "pré-preenchida" salva em config.js,
// descobre automaticamente o ID do formulário e qual
// "entry.NNNNN" corresponde a cada campo (nome, resposta,
// detalhes), usando os textos-marcador que preenchemos nela.

function analisarUrlFormulario(urlPreenchida) {
  try {
    const url = new URL(urlPreenchida);
    const match = url.pathname.match(/\/forms\/d\/e\/([^/]+)\//);
    const idFormulario = match ? match[1] : null;

    const campos = {};

    url.searchParams.forEach((valor, chave) => {
      if (!chave.startsWith("entry.")) return;

      if (valor === "NOME_AQUI") {
        campos.nome = chave;
      } else if (valor === "MOTIVO_DATA_HORA_AQUI") {
        campos.detalhes = chave;
      } else {
        campos.resposta = chave;
      }
    });

    return { idFormulario, campos };

  } catch (erro) {
    console.error("Erro ao analisar o link do Google Forms:", erro);
    return { idFormulario: null, campos: {} };
  }
}


// =========================================================
// ENVIAR RESPOSTA PARA O GOOGLE FORMS
// =========================================================

async function enviarParaGoogleForms(nome, resposta, detalhes) {
  const { idFormulario, campos } = analisarUrlFormulario(
    CONFIG.GOOGLE_FORM_URL_TEMPLATE
  );

  // DIAGNÓSTICO — mostra exatamente o que foi identificado a
  // partir do GOOGLE_FORM_URL_TEMPLATE, para conferir se os
  // campos foram reconhecidos certinho.
  console.log("ID do formulário identificado:", idFormulario);
  console.log("Campos identificados:", campos);

  if (!idFormulario || !campos.nome || !campos.resposta || !campos.detalhes) {
    console.error(
      "GOOGLE_FORM_URL_TEMPLATE não está configurado corretamente no config.js."
    );
    return false;
  }

  const dados = new FormData();
  dados.append(campos.nome, nome);
  dados.append(campos.resposta, resposta);
  dados.append(campos.detalhes, detalhes);

  const endpoint = `https://docs.google.com/forms/d/e/${idFormulario}/formResponse`;

  console.log("Enviando para:", endpoint);
  console.log("Nome:", nome, "| Resposta:", resposta, "| Detalhes:", detalhes);

  try {
    // "no-cors": o Google não deixa a gente LER a resposta,
    // mas o envio em si funciona normalmente — é o jeito
    // padrão de mandar dados pro Google Forms de fora dele.
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      credentials: "include",
      body: dados,
    });
    return true;

  } catch (erro) {
    console.error("Erro ao enviar resposta para o Google Forms:", erro);
    return false;
  }
}


// =========================================================
// ENVIO DO FORMULÁRIO
// =========================================================

formResposta.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const nome = document.getElementById("campo-nome").value.trim();
  const respostaSelecionada = formResposta.querySelector(
    'input[name="resposta"]:checked'
  );

  if (!nome || !respostaSelecionada) return;

  btnEnviar.disabled = true;
  btnEnviar.textContent = "Enviando...";

  const detalhes = `${alerta.motivo} - ${alerta.data} ${alerta.hora} (Risco ${alerta.nivel})`;

  const sucesso = await enviarParaGoogleForms(
    nome,
    respostaSelecionada.value,
    detalhes
  );

  if (sucesso) {
    formResposta.classList.add("escondido");
    mensagemFinal.classList.add("visivel");
  } else {
    btnEnviar.disabled = false;
    btnEnviar.textContent = "Enviar resposta";
    alert(
      "Não foi possível enviar a resposta. Veja o console (F12) para detalhes, ou confira se o GOOGLE_FORM_URL_TEMPLATE está certo no config.js."
    );
  }
});