-- ============================================================
-- Sistema de Auditoria Interna — Argos Patologia
-- Schema inicial
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------- Templates (roteiros/setores) ----------
CREATE TABLE templates (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(80) UNIQUE NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ativo','inativo')),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Banco de requisitos (podem ser reaproveitados entre templates) ----------
CREATE TABLE requisitos (
  id            SERIAL PRIMARY KEY,
  codigo        VARCHAR(30) NOT NULL,
  nome          TEXT NOT NULL,
  requisito     TEXT NOT NULL DEFAULT '',
  evidencia     TEXT NOT NULL DEFAULT '',
  core          BOOLEAN NOT NULL DEFAULT FALSE,
  tag           VARCHAR(20),                 -- 'Novo' | 'Atualizado' | NULL
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_requisitos_codigo ON requisitos (codigo);

-- ---------- Relação N:N — quais requisitos pertencem a quais templates ----------
CREATE TABLE template_requisitos (
  template_id  INT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  requisito_id INT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
  ordem        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (template_id, requisito_id)
);

-- ---------- Auditorias (uma instância de preenchimento) ----------
CREATE TABLE auditorias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      INT NOT NULL REFERENCES templates(id),
  setor_unidade    VARCHAR(150) NOT NULL,          -- ex: 'Recepção — Unidade Aldeota'
  auditor_lider     VARCHAR(120),                   -- Auditor líder responsável
  auditor_auxiliar  VARCHAR(120) NOT NULL,           -- Auditor auxiliar (editável/manual)
  auditor_observador VARCHAR(120),                  -- Auditor observador (opcional/manual)
  conclusao        TEXT,
  status           VARCHAR(24) NOT NULL DEFAULT 'rascunho'
                     CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','reprovado')),
  criado_por       VARCHAR(60) NOT NULL,             -- username AD de quem criou
  aprovado_por     VARCHAR(60),
  aprovado_em      TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditorias_status ON auditorias (status);
CREATE INDEX idx_auditorias_template ON auditorias (template_id);
CREATE INDEX idx_auditorias_criado_por ON auditorias (criado_por);

-- ---------- Respostas por item ----------
CREATE TABLE auditoria_respostas (
  auditoria_id  UUID NOT NULL REFERENCES auditorias(id) ON DELETE CASCADE,
  requisito_id  INT NOT NULL REFERENCES requisitos(id),
  resultado     VARCHAR(3) CHECK (resultado IN ('C','NC','PA','OM','NA')),
  comentario    TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (auditoria_id, requisito_id)
);

-- ---------- Rastro de aprovação/reprovação ----------
CREATE TABLE auditoria_historico (
  id           SERIAL PRIMARY KEY,
  auditoria_id UUID NOT NULL REFERENCES auditorias(id) ON DELETE CASCADE,
  usuario      VARCHAR(60) NOT NULL,
  de_status    VARCHAR(24),
  para_status  VARCHAR(24) NOT NULL,
  observacao   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_auditoria ON auditoria_historico (auditoria_id);

-- ---------- Trigger simples pra manter atualizado_em em dia ----------
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
CREATE TRIGGER trg_requisitos_updated BEFORE UPDATE ON requisitos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
CREATE TRIGGER trg_auditorias_updated BEFORE UPDATE ON auditorias
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ---------- Segurança: Row Level Security (RLS) ----------
ALTER TABLE auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_respostas ENABLE ROW LEVEL SECURITY;

-- Política padrão para a aplicação: auditoria_app tem acesso irrestrito quando conectado via backend
CREATE POLICY app_all_auditorias ON auditorias FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY app_all_respostas ON auditoria_respostas FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

-- ---------- Trilha de Auditoria e Conformidade de Segurança (Audit Log) ----------
CREATE TABLE IF NOT EXISTS seguranca_audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  usuario     VARCHAR(80) NOT NULL,
  acao        VARCHAR(60) NOT NULL,
  recurso     VARCHAR(60),
  recurso_id  VARCHAR(100),
  ip          VARCHAR(45),
  user_agent  TEXT,
  detalhes    JSONB,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario ON seguranca_audit_logs (usuario);
CREATE INDEX IF NOT EXISTS idx_audit_logs_acao ON seguranca_audit_logs (acao);
CREATE INDEX IF NOT EXISTS idx_audit_logs_criado_em ON seguranca_audit_logs (criado_em DESC);


