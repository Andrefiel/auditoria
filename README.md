# Sistema de Auditoria Interna — Argos Patologia

Sistema standalone para digitalizar os 24 roteiros de auditoria interna: preenchimento →
relatório prévio → aprovação (grupo AD `auditores_lideres`) → relatório final em PDF.

Stack: Node/Express + PostgreSQL + React (Vite) + Docker Compose, autenticação via bind LDAP
contra o Active Directory (`argos.local`).

## Estrutura

```
.
├── docker-compose.yml
├── .env.example          # copie para .env e preencha
├── db/init/001_schema.sql
├── backend/               # API Node/Express
│   ├── src/
│   ├── scripts/seed.js    # popula os 24 templates com os 337 itens já extraídos
│   └── data/requisitos.json
└── frontend/               # React (Vite), build servido via nginx
```

## Subindo com Docker (produção)

```bash
# Dados persistentes ficam em /opt/Auditoria, não em volume Docker "escondido"
sudo mkdir -p /opt/Auditoria/postgres-data /opt/Auditoria/uploads
sudo chown -R 999:999 /opt/Auditoria/postgres-data   # UID do usuário postgres na imagem oficial
sudo chown -R $(whoami):$(whoami) /opt/Auditoria/uploads

cp .env.example .env
# edite o .env com os valores reais de LDAP, SMTP e senha do Postgres

docker compose up -d --build

# primeira subida: aplicar schema e popular os itens
docker compose exec postgres psql -U auditoria_app -d auditoria -f /docker-entrypoint-initdb.d/001_schema.sql
docker compose exec backend node scripts/seed.js
```

> O `db/init/001_schema.sql` já roda automaticamente na primeira criação do volume do Postgres
> (via `docker-entrypoint-initdb.d`). O comando manual acima só é necessário se você recriar o
> banco depois e quiser reaplicar sem apagar os dados de `/opt/Auditoria/postgres-data`.

O container do frontend expõe a porta `17430` só em `127.0.0.1` — ele **não** é o nginx público.
Como seu nginx já roda direto no servidor (fora do Docker), use o arquivo pronto em
[`nginx-host/auditoria.suporteargos.com.br.conf`](./nginx-host/auditoria.suporteargos.com.br.conf)
como reverse proxy pra essa porta. Passo a passo completo no [`DEPLOY.md`](./DEPLOY.md).

## Desenvolvimento local (sem Docker)

Backend:
```bash
cd backend
npm install
cp ../.env.example .env   # ajuste DATABASE_URL pra localhost
npm run seed               # popula os 24 templates
npm run dev                 # http://localhost:4000
```

Frontend:
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 — proxy /api já aponta pro backend local
```

## Variáveis de ambiente importantes

| Variável | Descrição |
|---|---|
| `LDAP_URL` | URL do controlador de domínio (ex: `ldap://192.168.0.10:389`) |
| `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | Conta de serviço só-leitura, usada para buscar `displayName` e `memberOf` do usuário após o bind dele |
| `LDAP_GROUP_AUDITORES_LIDERES` | DN completo do grupo — define quem assina como Líder e quem pode aprovar/reprovar |
| `LIDERES_NOTIFY_EMAIL` | E-mail/lista de distribuição que recebe notificação quando uma auditoria é enviada pra aprovação |
| `SMTP_*` | Exchange Online — usado nas notificações de envio/decisão |

## Regras de negócio implementadas

- Qualquer usuário autenticado pode preencher uma auditoria (auditor auxiliar).
- Só quem está no grupo `auditores_lideres` aparece como `auditor_lider` e só eles podem
  aprovar/reprovar (rota protegida por middleware, testado com 403 pra quem não é do grupo).
- Envio bloqueado (422) se algum item não foi respondido ou a conclusão está vazia.
- Reprovação exige observação (422 se ausente) e devolve a auditoria pro status `rascunho`.
- Aprovação é definitiva: grava `aprovado_por` + `aprovado_em`, e o PDF final passa a incluir o carimbo.
- Toda mudança de status fica registrada em `auditoria_historico` (rastreabilidade pra auditoria
  da Qualidade).
- Itens são um banco compartilhável entre templates (`template_requisitos` N:N) — evita duplicar
  o mesmo requisito em vários setores quando ele é comum (ex: os itens `GMC` que aparecem em
  Histotécnica, Imunoistoquímica e Macroscopia).

## CI/CD

Deploy automático via GitHub Actions com um runner self-hosted instalado no próprio servidor —
sem precisar copiar arquivo manualmente e sem abrir porta pra internet. Veja o passo a passo
completo em [`DEPLOY.md`](./DEPLOY.md).

## O que ainda falta antes de ir pra produção

- [ ] Testar o bind LDAP contra o AD real da Argos (aqui só foi validado com JWT simulado, já
      que não há acesso ao `argos.local` neste ambiente)
- [ ] Revisar os 3 itens que a planilha de extração ainda marcou como "precisa revisão"
- [ ] Configurar o `LIDERES_NOTIFY_EMAIL` com a lista de distribuição real da Qualidade
- [ ] Decidir se o e-mail do auditor auxiliar (usado em `notificarDecisao`) deve vir do LDAP
      (`mail` attribute, já retornado pelo `ldap.js`) em vez do padrão fixo `username@argospatologia.com.br`
      que está hardcoded em `routes/auditorias.js` — ajuste rápido, só decidir a fonte
- [ ] Gerar o certificado/DNS interno pra `auditoria.suporteargos.com.br`
