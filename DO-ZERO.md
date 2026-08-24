# Do zero ao CI/CD funcionando — guia completo

Este guia assume que você não tem nada instalado ainda: nem Git, nem conta no GitHub configurada,
nem o runner. Siga na ordem. Os comandos marcados **[PC]** rodam na sua máquina (onde você edita
o código); os marcados **[SERVIDOR]** rodam no servidor Argos onde o `docker compose` vai ficar.

---

## Parte 1 — Instalar o Git

### [PC] e [SERVIDOR] — Ubuntu/Debian
```bash
sudo apt update
sudo apt install -y git
git --version
```

### Configurar sua identidade (roda uma vez, em cada máquina que for usar o `git commit`)
```bash
git config --global user.name "Maikel André"
git config --global user.email "seu-email@exemplo.com"
```

---

## Parte 2 — Conferir que o servidor já tem Docker

Como você já roda o Metas & Indicadores lá, provavelmente já tem — só confirme:
```bash
# [SERVIDOR]
docker --version
docker compose version
```
Se algum desses dois comandos não existir, me avisa que eu te passo a instalação do zero
(o processo muda um pouco dependendo se é Ubuntu, Debian puro, etc).

---

## Parte 3 — Criar a conta e o repositório no GitHub

1. Se ainda não tem conta: [github.com/signup](https://github.com/signup)
2. Logado, clique no **+** no canto superior direito → **New repository**
3. Nome: `auditoria-argos` (ou o que preferir)
4. Marque **Private**
5. **NÃO** marque "Add a README" (você já tem o projeto pronto, vamos subir ele)
6. Clique **Create repository**

O GitHub vai te mostrar uma página com comandos — não precisa usar ainda, vamos fazer no
próximo passo com mais controle.

---

## Parte 4 — Autenticar seu PC com o GitHub

Você precisa provar pro GitHub que é você quem está mandando código. O jeito mais simples pra
quem está começando é **HTTPS + token**; o mais "correto" a longo prazo é **chave SSH**. Escolha
um dos dois:

### Opção A — Token (HTTPS, mais simples de começar)

1. No GitHub: clique na sua foto → **Settings** → menu lateral, bem embaixo → **Developer settings**
2. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
3. Dê um nome (ex: `servidor-argos`), defina uma data de expiração (ex: 90 dias — depois renova)
4. Em **Repository access**, escolha **Only select repositories** → selecione `auditoria-argos`
5. Em **Permissions → Repository permissions**, dê `Contents: Read and write`
6. **Generate token** — copie o token na hora, ele não aparece de novo depois

Guarde esse token num lugar seguro (ex: seu gerenciador de senhas). Você vai usar ele como
"senha" quando o Git pedir, na hora do `git push`.

### Opção B — Chave SSH (recomendado se for usar com frequência)

```bash
# [PC]
ssh-keygen -t ed25519 -C "seu-email@exemplo.com"
# aperta Enter em tudo (local padrão, sem senha, ou com senha se preferir)

cat ~/.ssh/id_ed25519.pub
```
Copie a saída inteira (começa com `ssh-ed25519 ...`). No GitHub: **Settings → SSH and GPG keys →
New SSH key** → cole → **Add SSH key**.

---

## Parte 5 — Subir o projeto pro GitHub

Extraia o zip que te mandei e entre na pasta:
```bash
# [PC]
unzip auditoria-interna-projeto.zip
cd project

git init
git add .
git commit -m "Sistema de Auditoria Interna — versão inicial"
git branch -M main
```

Agora conecte com o repositório que você criou — **use uma das duas linhas abaixo**, conforme a
opção que escolheu na Parte 4:

```bash
# Se escolheu Opção A (token/HTTPS):
git remote add origin https://github.com/SEU_USUARIO/auditoria-argos.git

# Se escolheu Opção B (SSH):
git remote add origin git@github.com:SEU_USUARIO/auditoria-argos.git
```

E finalmente:
```bash
git push -u origin main
```
Se escolheu a Opção A, ele vai pedir usuário (seu usuário do GitHub) e senha — cole o **token**
no campo de senha (não a sua senha normal do GitHub).

Se der certo, atualize a página do repositório no navegador — os arquivos devem aparecer lá.

---

## Parte 6 — Instalar o runner self-hosted no servidor

Esse é o processo que faz o GitHub Actions conseguir "falar" com o seu servidor sem você abrir
porta nenhuma — o runner conecta de dentro pra fora.

1. No repositório no GitHub: **Settings → Actions → Runners → New self-hosted runner**
2. Escolha **Linux** e **x64**
3. A página vai te mostrar comandos parecidos com os abaixo (⚠️ **copie os da tela do GitHub**,
   porque a versão e o token mudam — o que está aqui é só o formato):

```bash
# [SERVIDOR]
mkdir -p ~/actions-runner && cd ~/actions-runner

curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.XXX.X/actions-runner-linux-x64-2.XXX.X.tar.gz

tar xzf ./actions-runner-linux-x64.tar.gz

./config.sh --url https://github.com/SEU_USUARIO/auditoria-argos --token ABCDEF1234567890
```

Durante o `./config.sh`, ele vai perguntar algumas coisas:
- **Nome do runner**: pode deixar o padrão, ou algo como `servidor-argos`
- **Additional labels**: digite `argos-auditoria` (é esse label que o `deploy.yml` procura —
  sem isso o workflow não vai encontrar o runner)
- **Nome do work folder**: pode deixar o padrão (`_work`)

4. Instalar como serviço (pra sobreviver a reboot do servidor):
```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```
Deve aparecer algo como `active (running)`.

5. Dar permissão do Docker pro usuário do runner:
```bash
# descubra qual usuário está rodando o serviço, geralmente é o seu usuário atual
whoami
sudo usermod -aG docker $(whoami)

# reinicie o serviço do runner pra pegar a nova permissão de grupo
sudo ./svc.sh stop
sudo ./svc.sh start
```

6. Confira no GitHub: **Settings → Actions → Runners** — deve aparecer com uma bolinha verde
   "Idle".

---

## Parte 7 — Cadastrar os secrets e variables

No repositório: **Settings → Secrets and variables → Actions**

Aba **Secrets** → **New repository secret**, um de cada vez:

| Nome | Valor |
|---|---|
| `POSTGRES_PASSWORD` | gere uma senha forte, ex: `openssl rand -base64 24` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `LDAP_URL` | ex: `ldap://192.168.0.10:389` |
| `LDAP_BIND_DN` | DN da conta de serviço no AD |
| `LDAP_BIND_PASSWORD` | senha dessa conta |
| `LDAP_BASE_DN` | ex: `dc=argos,dc=local` |
| `LDAP_USER_SEARCH_BASE` | ex: `ou=Usuarios,dc=argos,dc=local` |
| `LDAP_GROUP_AUDITORES_LIDERES` | DN completo do grupo |
| `SMTP_HOST` | ex: `smtp.office365.com` |
| `SMTP_USER` | conta de envio |
| `SMTP_PASSWORD` | senha/app password |

Aba **Variables** → **New repository variable** (não é sensível, mas fica separado dos secrets):

| Nome | Valor |
|---|---|
| `APP_URL` | `https://auditoria.suporteargos.com.br` |
| `LDAP_UPN_SUFFIX` | `argos.local` |
| `SMTP_PORT` | `587` |
| `SMTP_FROM` | `Auditoria Interna Argos <auditoria@argospatologia.com.br>` |
| `LIDERES_NOTIFY_EMAIL` | e-mail/lista que recebe notificação |

Você pode rodar `openssl rand -hex 32` e `openssl rand -base64 24` direto no terminal do
servidor ou do seu PC pra gerar esses valores.

---

## Parte 8 — Testar

Aba **Actions** no GitHub → clique em **Deploy** (na lista à esquerda) → **Run workflow** →
escolha a branch `main` → **Run workflow**. Acompanhe os logs em tempo real clicando na execução
que aparecer.

Se tudo passar verde, o servidor já deve responder:
```bash
# [SERVIDOR] ou de qualquer máquina na rede
curl http://localhost:17430
```

Daqui pra frente, o fluxo normal do dia a dia é só:
```bash
# [PC] depois de editar algo
git add .
git commit -m "descrição da mudança"
git push
```
E o deploy acontece sozinho.

---

## Solução de problemas comuns

**`git push` pede senha e recusa (Opção A/token)**
→ Confirma que colou o *token*, não a senha da sua conta. Tokens começam com `ghp_` ou `github_pat_`.

**Runner aparece "Offline" no GitHub**
```bash
# [SERVIDOR]
cd ~/actions-runner
sudo ./svc.sh status
journalctl -u actions.runner.* -n 50 --no-pager
```

**Workflow falha em `docker compose exec` com "permission denied"**
→ O usuário do runner não está no grupo `docker`, ou o serviço não foi reiniciado depois do
`usermod`. Repita o passo 5 da Parte 6.

**Quero ver o log do deploy sem esperar dar push**
→ Aba **Actions** → clique em qualquer execução → clique no job → expande os steps.
