# CI/CD — Deploy automático via GitHub Actions

Fluxo: dar `git push` na branch `main` → runner instalado no próprio servidor da Argos puxa o
código, escreve o `.env` a partir dos secrets do repositório, sobe o `docker compose` e roda o
seed. Sem copiar arquivo manualmente, sem abrir porta nenhuma pra internet (o runner só faz
conexões de saída pro GitHub).

## 1. Criar o repositório no GitHub

```bash
cd project
git init
git add .
git commit -m "Sistema de Auditoria Interna — versão inicial"
git branch -M main
git remote add origin https://github.com/<sua-org>/auditoria-argos.git
git push -u origin main
```

Use um repositório **privado** — o `.env` não vai pro Git (está no `.gitignore`), mas o código
em si (schema, rotas) não precisa ficar público.

## 2. Instalar o runner self-hosted no servidor

No servidor onde o `docker compose` vai rodar (o mesmo que já hospeda os outros sistemas Argos):

1. No GitHub: **Settings → Actions → Runners → New self-hosted runner** (escolha Linux x64)
2. Copie os comandos que o GitHub mostra na tela — algo parecido com:

```bash
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/vX.X.X/actions-runner-linux-x64-X.X.X.tar.gz
tar xzf ./actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/<sua-org>/auditoria-argos --token <TOKEN_MOSTRADO_NA_TELA>
```

3. Quando o `config.sh` perguntar as **labels** do runner, adicione `argos-auditoria`
   (é o label que o `deploy.yml` procura em `runs-on: [self-hosted, argos-auditoria]`)

4. Instale como serviço, pra sobreviver a reboot do servidor:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

5. O usuário que roda o serviço do runner precisa conseguir rodar `docker compose` sem sudo
   (adicione ele ao grupo `docker`: `sudo usermod -aG docker <usuario>`), e o diretório onde o
   runner faz checkout precisa ter espaço/permissão pra isso.

## 3. Criar a pasta de dados persistentes no servidor

O `docker-compose.yml` grava os dados do Postgres (e uploads futuros) direto em
`/opt/Auditoria` no host — não em volume "escondido" do Docker — pra você conseguir ver, dar
backup e restaurar sem precisar saber onde o Docker guarda as coisas por baixo dos panos.

```bash
# [SERVIDOR]
sudo mkdir -p /opt/Auditoria/postgres-data /opt/Auditoria/uploads

# a imagem oficial do Postgres roda como o usuário "postgres" (UID 999) dentro do container
sudo chown -R 999:999 /opt/Auditoria/postgres-data
sudo chown -R $(whoami):$(whoami) /opt/Auditoria/uploads
```

> Se na primeira subida o container do Postgres cair com erro de permissão, rode
> `docker compose logs postgres` — ele avisa exatamente qual UID está esperando; ajuste o
> `chown` acima se for diferente da imagem que você está usando.

Isso deixa o backup simples: `sudo tar czf backup-$(date +%F).tar.gz /opt/Auditoria`.

## 4. Configurar o nginx do servidor (fora do Docker)

Seu nginx já roda direto no servidor — então o container do frontend **não** deve tentar ser o
nginx público. Ele só escuta em `127.0.0.1:17430` (veja o `docker-compose.yml`), e é o nginx do
host que recebe o tráfego de verdade e repassa pra essa porta.

```bash
# [SERVIDOR] — depois de clonar o repositório em algum lugar (ex: ~/auditoria-argos)
sudo cp nginx-host/auditoria.suporteargos.com.br.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/auditoria.suporteargos.com.br /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Pra HTTPS, se você já usa Certbot nos outros domínios `*.suporteargos.com.br`:
```bash
sudo certbot --nginx -d auditoria.suporteargos.com.br
```

> Isso é uma configuração **manual, uma vez só** — o `deploy.yml` não mexe no nginx do host,
> só builda/sobe os containers. Se mudar a porta interna (`17430`) no `docker-compose.yml`,
> lembre de atualizar o `proxy_pass` desse arquivo também.

## 5. Configurar os secrets no GitHub

**Settings → Secrets and variables → Actions**

### Secrets (sensível — nunca aparece nos logs)
| Nome | Valor |
|---|---|
| `POSTGRES_PASSWORD` | senha forte pro Postgres |
| `JWT_SECRET` | string aleatória longa (`openssl rand -hex 32`) |
| `LDAP_URL` | ex: `ldap://192.168.0.10:389` |
| `LDAP_BIND_DN` | DN da conta de serviço |
| `LDAP_BIND_PASSWORD` | senha da conta de serviço |
| `LDAP_BASE_DN` | ex: `dc=argos,dc=local` |
| `LDAP_USER_SEARCH_BASE` | ex: `ou=Usuarios,dc=argos,dc=local` |
| `LDAP_GROUP_AUDITORES_LIDERES` | DN completo do grupo |
| `SMTP_HOST` | ex: `smtp.office365.com` |
| `SMTP_USER` | conta de envio |
| `SMTP_PASSWORD` | senha/app password |

### Variables (não sensível, só configuração)
| Nome | Valor |
|---|---|
| `APP_URL` | `https://auditoria.suporteargos.com.br` |
| `LDAP_UPN_SUFFIX` | `argos.local` |
| `SMTP_PORT` | `587` |
| `SMTP_FROM` | `Auditoria Interna Argos <auditoria@argospatologia.com.br>` |
| `LIDERES_NOTIFY_EMAIL` | e-mail/lista que recebe notificação de aprovação pendente |
| `POSTGRES_DB` / `POSTGRES_USER` | só se quiser mudar do padrão `auditoria` / `auditoria_app` |

## 6. Como funciona no dia a dia

- **Push numa branch qualquer / abrir PR** → dispara `ci.yml` num runner do GitHub (não mexe no
  servidor), só valida que o backend não tem erro de sintaxe e o frontend builda.
- **Merge/push direto em `main`** → dispara `deploy.yml` no runner self-hosted: escreve o `.env`,
  builda as imagens Docker, sobe os containers, espera o backend responder, roda o seed
  (é idempotente — pode rodar toda vez, só atualiza o que mudou) e limpa imagens antigas.
- Pra rodar o deploy manualmente sem dar push (ex: só reprocessar o seed), use a aba
  **Actions → Deploy → Run workflow** no GitHub.

## 7. Rollback rápido

Como é tudo baseado em `git`, reverter é:
```bash
git revert <commit-problemático>
git push origin main
```
Isso dispara o `deploy.yml` de novo com o código revertido. Se precisar ser mais rápido que isso,
dá pra rodar direto no servidor: `git checkout <commit-bom> && docker compose up -d --build`.
