// =========================================================
// FUNÇÃO SERVERLESS — envia e-mail via Gmail SMTP direto
// =========================================================
// Roda na Vercel (de graça), não no navegador do usuário — é
// por isso que consegue usar a senha de app do Gmail com
// segurança (ela fica guardada nas variáveis de ambiente da
// Vercel, nunca é exposta no código do site). O navegador só
// manda os dados do alerta pra cá; quem realmente conecta no
// Gmail e manda o e-mail é essa função, exatamente como o
// smtplib fazia na versão em Python.

const nodemailer = require("nodemailer");

module.exports = async (req, res) => {

  // Libera o site (rodando em outro endereço) a chamar essa
  // função — sem isso, o navegador bloqueia a chamada por
  // segurança (CORS).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ sucesso: false, erro: "Método não permitido." });
    return;
  }

  const { nivel, motivo, data, hora, link_formulario, foto } = req.body || {};

  if (!nivel || !motivo || !data || !hora) {
    res.status(400).json({ sucesso: false, erro: "Faltam dados obrigatórios do alerta." });
    return;
  }

  // As credenciais nunca ficam no código — só nas variáveis de
  // ambiente configuradas no painel da Vercel (Settings →
  // Environment Variables). Veja o README para o passo a passo.
  const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE;
  const EMAIL_SENHA_APP = process.env.EMAIL_SENHA_APP;
  const EMAIL_DESTINATARIO = process.env.EMAIL_DESTINATARIO || EMAIL_REMETENTE;

  if (!EMAIL_REMETENTE || !EMAIL_SENHA_APP) {
    console.error("EMAIL_REMETENTE ou EMAIL_SENHA_APP não configurados nas variáveis de ambiente.");
    res.status(500).json({
      sucesso: false,
      erro: "Servidor de e-mail não configurado (faltam variáveis de ambiente).",
    });
    return;
  }

  const secaoFoto = foto
    ? `<p style="margin:0 0 20px 0;">
         <img src="${foto}" alt="Foto do momento do alerta"
              style="max-width:100%; border-radius:6px; border:1px solid #1c2f57; display:block;">
       </p>`
    : "";

  const secaoFormulario = link_formulario
    ? `<p style="color:#E0F7FA; margin:0 0 14px 0; font-size:15px;">
         <b>📋 Responda ao alerta:</b> conte o que você observou e deixe seu nome registrado.
       </p>
       <p style="margin:0 0 20px 0;">
         <a href="${link_formulario}"
            style="background-color:#00F0FF; color:#0A1128; padding:14px 24px;
                   text-decoration:none; border-radius:6px; font-weight:bold;
                   display:inline-block; font-size:15px;">
           Preencher formulário de resposta
         </a>
       </p>`
    : "";

  // Mesmo visual do template usado antes com o EmailJS — só
  // que montado direto aqui, em JavaScript, em vez de depender
  // de variáveis {{...}} de um serviço externo.
  const htmlEmail = `
    <div style="background-color:#0A1128; padding:32px 16px; font-family: Arial, sans-serif;">
      <div style="max-width:500px; margin:0 auto; background-color:#0D1630; border:1px solid #17264a; border-radius:10px; padding:28px;">

        <p style="color:#00F0FF; font-size:12px; letter-spacing:2px; text-transform:uppercase; margin:0 0 8px 0; font-family: 'Courier New', monospace;">
          Sentinela Urbana IA
        </p>

        <h2 style="color:#FF2A6D; margin:0 0 16px 0; font-size:22px;">
          🚨 Risco ${nivel} detectado
        </h2>

        <p style="color:#E0F7FA; margin:0 0 8px 0; font-size:15px;">
          <b>Motivo:</b> ${motivo}
        </p>
        <p style="color:#E0F7FA; margin:0 0 16px 0; font-size:15px;">
          <b>Data:</b> ${data} &nbsp;&nbsp; <b>Hora:</b> ${hora}
        </p>
        <p style="color:#7f93b8; margin:0 0 24px 0; font-size:14px;">
          Verifique o painel de monitoramento imediatamente.
        </p>

        ${secaoFoto}
        ${secaoFormulario}

        <p style="color:#5a6b8c; font-size:12px; margin:20px 0 0 0; border-top:1px solid #17264a; padding-top:16px;">
          Sua resposta fica registrada automaticamente para a equipe de monitoramento revisar.
        </p>

      </div>
    </div>`;

  try {
    const transportador = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_REMETENTE,
        pass: EMAIL_SENHA_APP,
      },
    });

    await transportador.sendMail({
      from: `"Sentinela Urbana IA" <${EMAIL_REMETENTE}>`,
      to: EMAIL_DESTINATARIO,
      subject: `Alerta ${nivel} - Sentinela Urbana IA`,
      html: htmlEmail,
    });

    res.status(200).json({ sucesso: true });

  } catch (erro) {
    console.error("Erro ao enviar e-mail via Gmail:", erro);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
};
