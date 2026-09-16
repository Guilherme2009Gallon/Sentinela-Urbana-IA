# Sentinela Urbana IA — Versão Web

Versão do projeto que roda **inteiramente no navegador**: câmera, detecção
de pessoas/objetos, área restrita, aglomeração, alertas e histórico. Não
precisa instalar Python, OpenCV, nem nada — só um navegador (Chrome, Edge
ou Firefox) e internet (pra carregar as bibliotecas de IA na primeira vez).

## Como rodar

**Não abra o `index.html` clicando duas vezes nele.** Alguns navegadores
bloqueiam o acesso à câmera quando o site é aberto direto do arquivo
(`file://`). O jeito confiável é servir os arquivos por um servidor local
simples — e o Python (que já vem instalado no PC da escola) já tem um
embutido, sem precisar instalar nada extra:

1. Abra um terminal na pasta onde estão esses arquivos
   (`index.html`, `style.css`, `app.js`, `config.js`)
2. Rode:
   ```
   python -m http.server 8000
   ```
3. Abra o navegador em: **http://localhost:8000**
4. Clique em "Ativar Câmera" e permita o acesso quando o navegador pedir

Pronto — a partir daqui funciona exatamente como a versão desktop:
clique e arraste sobre o vídeo pra desenhar a área restrita, os alertas
aparecem automaticamente, e o histórico vai sendo preenchido.

## Configurar o envio de e-mail (opcional)

Assim como a versão Python usava uma senha de app do Gmail direto, essa
versão web usa uma pequena **função serverless gratuita** (hospedada na
Vercel) que faz a mesma coisa — conecta direto no Gmail via SMTP — porque
páginas web sozinhas não conseguem fazer esse tipo de conexão por
segurança do navegador. A vantagem sobre serviços como o EmailJS é não
ter um limite baixo de e-mails por mês.

### 1. Pegue (ou confirme) a senha de app do Gmail

Se você já tinha uma senha de app configurada na versão Python
(`EMAIL_SENHA_APP`), pode reaproveitar a mesma. Se não tiver mais:

1. Acesse **myaccount.google.com/apppasswords** (logado na conta que vai
   enviar os e-mails)
2. Crie uma nova senha de app (nome sugerido: "Sentinela Urbana IA")
3. Copie a senha de 16 caracteres gerada (sem espaços)

### 2. Publique a função na Vercel

1. Crie uma conta grátis em **[vercel.com](https://vercel.com)** — pode
   entrar direto com sua conta do GitHub
2. Clique em **"Add New" → "Project"**
3. Escolha o repositório desse projeto (o que você já subiu no GitHub)
4. Não precisa mudar nenhuma configuração — clica em **"Deploy"**
5. Espere terminar (leva menos de um minuto)

### 3. Configure as variáveis de ambiente

1. Na página do projeto na Vercel, vai em **Settings → Environment
   Variables**
2. Adiciona essas três (uma de cada vez, clicando em "Add" para cada):

   | Nome | Valor |
   |---|---|
   | `EMAIL_REMETENTE` | seu e-mail do Gmail (ex: `sentinelaurbanaa1@gmail.com`) |
   | `EMAIL_SENHA_APP` | a senha de app de 16 caracteres do passo 1 |
   | `EMAIL_DESTINATARIO` | e-mail que vai receber os alertas (pode ser o mesmo do remetente) |

3. Depois de adicionar as três, vai na aba **"Deployments"**, clica nos
   três pontinhos do último deploy → **"Redeploy"** (as variáveis novas só
   valem a partir do próximo deploy)

### 4. Pegue a URL da função e configure no site

1. Ainda na Vercel, copia a URL do seu projeto (aparece no topo, algo tipo
   `https://sentinela-urbana-ia.vercel.app`)
2. Abre o `config.js` e preenche:
   ```js
   SERVIDOR_EMAIL_URL: "https://sentinela-urbana-ia.vercel.app/api/enviar-email",
   ```
   (repara no `/api/enviar-email` no final — é o caminho da função)

Se deixar `SERVIDOR_EMAIL_URL` em branco, o programa funciona
normalmente — só não envia e-mail de verdade (fica registrado no console
do navegador, F12, pra você ver que teria sido enviado).

## O que foi ajustado em relação à versão Python

- **Detecção de objetos/pessoas**: usa o modelo **COCO-SSD** (via
  TensorFlow.js) em vez do YOLO. Reconhece as mesmas classes que já
  usávamos: pessoa, mochila, bolsa, mala, garrafa.
- **Banco de dados**: o histórico fica na memória do navegador durante a
  sessão (não precisa de SQLite). Se quiser que ele sobreviva a um
  recarregamento de página, é só pedir que eu adicione salvamento via
  `localStorage`.
- **Som de alerta**: gerado direto pelo navegador (Web Audio API), sem
  precisar de arquivo de áudio.
- **Câmera**: pede permissão pelo próprio navegador — não depende de
  DirectShow, OpenCV nem nenhuma configuração de driver do Windows.

## Ajustando os limiares de detecção

Abra o `config.js` — lá estão os mesmos parâmetros que existiam no
`dashboard.py` (tempo do objeto suspeito, distância de supervisão,
distância de aglomeração, etc.), com comentários explicando cada um.
