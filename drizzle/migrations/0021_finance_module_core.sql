
-- ===== Finance roles =====
CREATE TABLE public.fin_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('finance_admin','finance_approver')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.fin_user_roles TO authenticated;
GRANT ALL ON public.fin_user_roles TO service_role;
ALTER TABLE public.fin_user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.fin_has_role(_user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fin_user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;
GRANT EXECUTE ON FUNCTION private.fin_has_role(uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_my_roles()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(role), '{}') FROM public.fin_user_roles WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.fin_my_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_my_roles() TO authenticated;

CREATE POLICY "fin roles readable by finance or admin" ON public.fin_user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::app_role) OR private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "admins grant fin roles" ON public.fin_user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins revoke fin roles" ON public.fin_user_roles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role));

-- ===== Settings =====
CREATE TABLE public.fin_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  org_name text NOT NULL DEFAULT 'LMUdanmark',
  founded_on date NOT NULL DEFAULT '2026-11-10',
  fiscal_year text NOT NULL DEFAULT 'calendar',
  treasurer_name text NOT NULL DEFAULT 'Mathias S. Nielsen',
  cutoff_at timestamptz,
  cutoff_approved_by uuid,
  cutoff_approved_at timestamptz,
  rules_approved_by uuid,
  rules_approved_at timestamptz,
  auto_posting_enabled boolean NOT NULL DEFAULT false,
  auto_posting_enabled_by uuid,
  auto_posting_enabled_at timestamptz,
  vat_note text,
  vat_confirmed_at timestamptz,
  external_backup_destination text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.fin_settings TO authenticated;
GRANT ALL ON public.fin_settings TO service_role;
ALTER TABLE public.fin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read settings" ON public.fin_settings FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin update settings" ON public.fin_settings FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin'])) WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

CREATE TABLE public.fin_membership_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'DKK',
  period_months int NOT NULL CHECK (period_months > 0),
  effective_from date NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (effective_from)
);
GRANT SELECT, INSERT ON public.fin_membership_rates TO authenticated;
GRANT ALL ON public.fin_membership_rates TO service_role;
ALTER TABLE public.fin_membership_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read rates" ON public.fin_membership_rates FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert rates" ON public.fin_membership_rates FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- ===== Accounts / periods =====
CREATE TABLE public.fin_accounts (
  code text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fin_accounts TO authenticated;
GRANT ALL ON public.fin_accounts TO service_role;
ALTER TABLE public.fin_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read accounts" ON public.fin_accounts FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin write accounts" ON public.fin_accounts FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update accounts" ON public.fin_accounts FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']) AND NOT is_system);

CREATE TABLE public.fin_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('month','year')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
  approval_stage text NOT NULL DEFAULT 'draft' CHECK (approval_stage IN ('draft','board_approved','general_assembly_approved')),
  locked_by uuid, locked_at timestamptz,
  reopened_by uuid, reopened_at timestamptz, reopen_reason text,
  UNIQUE (kind, period_start)
);
GRANT SELECT, INSERT, UPDATE ON public.fin_periods TO authenticated;
GRANT ALL ON public.fin_periods TO service_role;
ALTER TABLE public.fin_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read periods" ON public.fin_periods FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert periods" ON public.fin_periods FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update periods" ON public.fin_periods FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

CREATE OR REPLACE FUNCTION private.fin_period_locked(_d date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fin_periods WHERE status='locked' AND _d BETWEEN period_start AND period_end)
$$;

CREATE OR REPLACE FUNCTION private.fin_guard_period_reopen() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'locked' AND NEW.status = 'open' THEN
    IF coalesce(length(trim(NEW.reopen_reason)),0) < 5 THEN RAISE EXCEPTION 'Genåbning kræver en begrundelse'; END IF;
    NEW.reopened_by := auth.uid(); NEW.reopened_at := now();
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'locked' THEN NEW.locked_by := auth.uid(); NEW.locked_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_periods_guard BEFORE UPDATE ON public.fin_periods FOR EACH ROW EXECUTE FUNCTION private.fin_guard_period_reopen();

-- ===== Journal =====
CREATE SEQUENCE public.fin_entry_no_seq;
CREATE TABLE public.fin_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no bigint,
  entry_date date NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  kind text NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal','opening','reversal','stripe','bank','bill','bill_payment','reimbursement','repayment')),
  source_type text,
  source_key text,
  environment text CHECK (environment IN ('sandbox','live')),
  stripe_account_id text,
  reverses_entry_id uuid REFERENCES public.fin_journal_entries(id),
  category_rule_id uuid,
  rule_explanation text,
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text,
  proposal jsonb,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  posted_by uuid,
  posted_automatically boolean NOT NULL DEFAULT false,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fin_journal_entries_source_unique ON public.fin_journal_entries (source_type, coalesce(stripe_account_id,''), coalesce(environment,''), source_key) WHERE source_key IS NOT NULL;
CREATE UNIQUE INDEX fin_journal_entries_one_reversal ON public.fin_journal_entries (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_journal_entries TO authenticated;
GRANT ALL ON public.fin_journal_entries TO service_role;
GRANT USAGE ON SEQUENCE public.fin_entry_no_seq TO authenticated, service_role;
ALTER TABLE public.fin_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read entries" ON public.fin_journal_entries FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert entries" ON public.fin_journal_entries FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update entries" ON public.fin_journal_entries FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin delete draft entries" ON public.fin_journal_entries FOR DELETE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']) AND status = 'draft');

CREATE TABLE public.fin_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fin_journal_entries(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 0,
  account_code text NOT NULL REFERENCES public.fin_accounts(code),
  debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  original_currency text NOT NULL DEFAULT 'DKK',
  original_amount_minor bigint,
  fx_rate numeric,
  fx_source text,
  memo text,
  CHECK (NOT (debit_minor > 0 AND credit_minor > 0))
);
CREATE INDEX fin_journal_lines_entry ON public.fin_journal_lines(entry_id);
CREATE INDEX fin_journal_lines_account ON public.fin_journal_lines(account_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_journal_lines TO authenticated;
GRANT ALL ON public.fin_journal_lines TO service_role;
ALTER TABLE public.fin_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read lines" ON public.fin_journal_lines FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert lines" ON public.fin_journal_lines FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update lines" ON public.fin_journal_lines FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin delete lines" ON public.fin_journal_lines FOR DELETE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- Approvals (board / general assembly / opening entries / cutoff / rules)
CREATE TABLE public.fin_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('opening_entry','claim','period_board','period_general_assembly','cutoff','rules','auto_posting')),
  subject_id text NOT NULL,
  approver_id uuid NOT NULL,
  approver_name text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  note text,
  meeting_date date,
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, approver_id)
);
GRANT SELECT, INSERT ON public.fin_approvals TO authenticated;
GRANT ALL ON public.fin_approvals TO service_role;
ALTER TABLE public.fin_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read approvals" ON public.fin_approvals FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin record own approval" ON public.fin_approvals FOR INSERT TO authenticated
  WITH CHECK (approver_id = auth.uid() AND private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));

-- Entry guard: immutability, balance, period lock, auto-posting gate, opening approval
CREATE OR REPLACE FUNCTION private.fin_guard_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d bigint; c bigint; bad int; s public.fin_settings;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'Bogførte poster kan ikke slettes – brug tilbageførsel'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Bogførte poster kan ikke ændres – brug tilbageførsel';
  END IF;
  NEW.updated_at := now();
  IF NEW.status = 'posted' THEN
    SELECT coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0) INTO d, c FROM public.fin_journal_lines WHERE entry_id = NEW.id;
    IF d = 0 OR d <> c THEN RAISE EXCEPTION 'Posten balancerer ikke (debet %, kredit %)', d, c; END IF;
    SELECT count(*) INTO bad FROM public.fin_journal_lines WHERE entry_id = NEW.id AND original_currency <> 'DKK' AND (fx_rate IS NULL OR coalesce(trim(fx_source),'') = '');
    IF bad > 0 THEN RAISE EXCEPTION 'Linjer i fremmed valuta kræver dokumenteret kurs og kilde'; END IF;
    IF private.fin_period_locked(NEW.entry_date) THEN RAISE EXCEPTION 'Perioden er låst'; END IF;
    IF NEW.needs_review THEN RAISE EXCEPTION 'Posten kræver kontrol før bogføring'; END IF;
    IF NEW.posted_automatically THEN
      SELECT * INTO s FROM public.fin_settings WHERE id = 1;
      IF s IS NULL OR NOT s.auto_posting_enabled THEN RAISE EXCEPTION 'Automatisk bogføring er slået fra'; END IF;
    END IF;
    IF NEW.kind = 'opening' AND NOT EXISTS (
      SELECT 1 FROM public.fin_approvals WHERE subject_type='opening_entry' AND subject_id = NEW.id::text AND decision='approved'
    ) THEN RAISE EXCEPTION 'Åbningsposten skal godkendes før bogføring'; END IF;
    NEW.posted_at := now();
    NEW.entry_no := nextval('public.fin_entry_no_seq');
    IF NOT NEW.posted_automatically THEN NEW.posted_by := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_journal_entries FOR EACH ROW EXECUTE FUNCTION private.fin_guard_entry();

CREATE OR REPLACE FUNCTION private.fin_guard_line() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text; eid uuid;
BEGIN
  eid := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
  SELECT status INTO st FROM public.fin_journal_entries WHERE id = eid;
  IF st = 'posted' THEN RAISE EXCEPTION 'Linjer på bogførte poster kan ikke ændres'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.entry_id <> NEW.entry_id THEN
    SELECT status INTO st FROM public.fin_journal_entries WHERE id = OLD.entry_id;
    IF st = 'posted' THEN RAISE EXCEPTION 'Linjer på bogførte poster kan ikke ændres'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fin_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_journal_lines FOR EACH ROW EXECUTE FUNCTION private.fin_guard_line();

-- Settings guard: auto posting only after cutoff, rules and opening entries approved
CREATE OR REPLACE FUNCTION private.fin_guard_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.cutoff_at IS DISTINCT FROM OLD.cutoff_at AND OLD.cutoff_approved_at IS NOT NULL THEN
    NEW.cutoff_approved_at := NULL; NEW.cutoff_approved_by := NULL; NEW.auto_posting_enabled := false;
  END IF;
  IF NEW.auto_posting_enabled AND NOT OLD.auto_posting_enabled THEN
    IF NEW.cutoff_at IS NULL OR NEW.cutoff_approved_at IS NULL THEN RAISE EXCEPTION 'Skæringspunktet skal godkendes først'; END IF;
    IF NEW.rules_approved_at IS NULL THEN RAISE EXCEPTION 'Kategoriseringsreglerne skal godkendes først'; END IF;
    IF EXISTS (SELECT 1 FROM public.fin_journal_entries WHERE kind='opening' AND status <> 'posted') THEN
      RAISE EXCEPTION 'Åbningsposterne skal være godkendt og bogført først';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fin_journal_entries WHERE kind='opening') THEN
      RAISE EXCEPTION 'Åbningsposterne mangler';
    END IF;
    NEW.auto_posting_enabled_by := auth.uid(); NEW.auto_posting_enabled_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_settings_guard BEFORE UPDATE ON public.fin_settings FOR EACH ROW EXECUTE FUNCTION private.fin_guard_settings();

-- ===== Stripe =====
CREATE TABLE public.fin_stripe_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  stripe_account_id text NOT NULL DEFAULT 'default',
  object_type text NOT NULL,
  stripe_id text NOT NULL,
  status text,
  amount_minor bigint,
  currency text,
  stripe_created_at timestamptz,
  source_id text,
  data jsonb NOT NULL,
  is_historical boolean NOT NULL DEFAULT false,
  unresolved boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, stripe_account_id, stripe_id)
);
CREATE INDEX fin_stripe_objects_unresolved ON public.fin_stripe_objects(environment) WHERE unresolved;
CREATE TABLE public.fin_stripe_events (
  event_id text PRIMARY KEY,
  environment text NOT NULL,
  type text NOT NULL,
  object_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text
);
CREATE TABLE public.fin_stripe_sync_state (
  environment text NOT NULL,
  object_type text NOT NULL,
  cursor text,
  completed boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  PRIMARY KEY (environment, object_type)
);
CREATE TABLE public.fin_sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text,
  context text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE public.fin_stripe_access_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  results jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_stripe_objects, public.fin_stripe_events, public.fin_stripe_sync_state, public.fin_stripe_access_checks TO authenticated;
GRANT SELECT, UPDATE ON public.fin_sync_errors TO authenticated;
GRANT ALL ON public.fin_stripe_objects, public.fin_stripe_events, public.fin_stripe_sync_state, public.fin_sync_errors, public.fin_stripe_access_checks TO service_role;
ALTER TABLE public.fin_stripe_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_stripe_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_stripe_access_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read stripe objects" ON public.fin_stripe_objects FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin read stripe events" ON public.fin_stripe_events FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin read sync state" ON public.fin_stripe_sync_state FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin read access checks" ON public.fin_stripe_access_checks FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin read sync errors" ON public.fin_sync_errors FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin resolve sync errors" ON public.fin_sync_errors FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- ===== Category rules =====
CREATE TABLE public.fin_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  match_type text NOT NULL CHECK (match_type IN ('product_id','price_id','lookup_key','metadata')),
  match_key text,
  match_value text NOT NULL,
  category text NOT NULL CHECK (category IN ('membership','donation','sponsorship','coaching','other_income')),
  account_code text NOT NULL REFERENCES public.fin_accounts(code),
  environment text CHECK (environment IN ('sandbox','live')),
  active boolean NOT NULL DEFAULT false,
  approved_by uuid, approved_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (match_type <> 'metadata' OR match_key IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_category_rules TO authenticated;
GRANT ALL ON public.fin_category_rules TO service_role;
ALTER TABLE public.fin_category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read rules" ON public.fin_category_rules FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert rules" ON public.fin_category_rules FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update rules" ON public.fin_category_rules FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin delete rules" ON public.fin_category_rules FOR DELETE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- ===== Documents =====
CREATE TABLE public.fin_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text,
  kind text NOT NULL DEFAULT 'receipt' CHECK (kind IN ('receipt','invoice','statement','reimbursement_statement','minutes','other')),
  description text,
  ai_extraction jsonb,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fin_documents TO authenticated;
GRANT ALL ON public.fin_documents TO service_role;
ALTER TABLE public.fin_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read documents" ON public.fin_documents FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin insert documents" ON public.fin_documents FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin update documents" ON public.fin_documents FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- ===== Bank =====
CREATE TABLE public.fin_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_number text,
  account_code text NOT NULL REFERENCES public.fin_accounts(code) DEFAULT '1000',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.fin_bank_accounts(id),
  filename text NOT NULL,
  row_count int NOT NULL DEFAULT 0,
  statement_date date,
  statement_balance_minor bigint,
  document_id uuid REFERENCES public.fin_documents(id),
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.fin_bank_accounts(id),
  import_id uuid REFERENCES public.fin_bank_imports(id),
  booked_on date NOT NULL,
  amount_minor bigint NOT NULL,
  text text NOT NULL DEFAULT '',
  balance_after_minor bigint,
  bank_tx_id text,
  dedupe_key text NOT NULL,
  suspected_duplicate_of uuid,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','ignored')),
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id, dedupe_key)
);
CREATE TABLE public.fin_bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.fin_bank_accounts(id),
  statement_date date NOT NULL,
  balance_minor bigint NOT NULL,
  document_id uuid REFERENCES public.fin_documents(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id, statement_date)
);
GRANT SELECT, INSERT, UPDATE ON public.fin_bank_accounts, public.fin_bank_imports, public.fin_bank_transactions, public.fin_bank_statements TO authenticated;
GRANT ALL ON public.fin_bank_accounts, public.fin_bank_imports, public.fin_bank_transactions, public.fin_bank_statements TO service_role;
ALTER TABLE public.fin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read bank accounts" ON public.fin_bank_accounts FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert bank accounts" ON public.fin_bank_accounts FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update bank accounts" ON public.fin_bank_accounts FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin read bank imports" ON public.fin_bank_imports FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert bank imports" ON public.fin_bank_imports FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update bank imports" ON public.fin_bank_imports FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin read bank tx" ON public.fin_bank_transactions FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert bank tx" ON public.fin_bank_transactions FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update bank tx" ON public.fin_bank_transactions FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin read statements" ON public.fin_bank_statements FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert statements" ON public.fin_bank_statements FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update statements" ON public.fin_bank_statements FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- ===== Bills =====
CREATE TABLE public.fin_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  description text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'DKK',
  fx_rate numeric,
  fx_source text,
  amount_dkk_minor bigint NOT NULL CHECK (amount_dkk_minor > 0),
  expense_account_code text NOT NULL REFERENCES public.fin_accounts(code),
  paid_by text NOT NULL DEFAULT 'association' CHECK (paid_by IN ('association','private')),
  private_person_name text,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (currency = 'DKK' OR (fx_rate IS NOT NULL AND fx_source IS NOT NULL))
);
CREATE TABLE public.fin_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.fin_bills(id),
  bank_transaction_id uuid REFERENCES public.fin_bank_transactions(id),
  paid_on date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fin_bills, public.fin_bill_payments TO authenticated;
GRANT ALL ON public.fin_bills, public.fin_bill_payments TO service_role;
ALTER TABLE public.fin_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read bills" ON public.fin_bills FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert bills" ON public.fin_bills FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin admin update bills" ON public.fin_bills FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));
CREATE POLICY "fin read bill payments" ON public.fin_bill_payments FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert bill payments" ON public.fin_bill_payments FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- ===== Reimbursements =====
CREATE TABLE public.fin_reimbursement_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_id uuid NOT NULL,
  claimant_name text NOT NULL,
  title text NOT NULL,
  expense_date date,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  expense_account_code text REFERENCES public.fin_accounts(code),
  is_opening boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  document_ids uuid[] NOT NULL DEFAULT '{}',
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_id uuid NOT NULL,
  paid_on date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  bank_transaction_id uuid REFERENCES public.fin_bank_transactions(id),
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fin_reimbursement_claims TO authenticated;
GRANT SELECT, INSERT ON public.fin_repayments TO authenticated;
GRANT ALL ON public.fin_reimbursement_claims, public.fin_repayments TO service_role;
ALTER TABLE public.fin_reimbursement_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read claims" ON public.fin_reimbursement_claims FOR SELECT TO authenticated USING (claimant_id = auth.uid() OR private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin submit own claim" ON public.fin_reimbursement_claims FOR INSERT TO authenticated WITH CHECK (claimant_id = auth.uid() AND status = 'submitted' AND private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin update claims" ON public.fin_reimbursement_claims FOR UPDATE TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin read repayments" ON public.fin_repayments FOR SELECT TO authenticated USING (claimant_id = auth.uid() OR private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin admin insert repayments" ON public.fin_repayments FOR INSERT TO authenticated WITH CHECK (private.fin_has_role(auth.uid(), ARRAY['finance_admin']));

-- No self-approval of claims; status change to approved requires a non-claimant approval
CREATE OR REPLACE FUNCTION private.fin_guard_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cl uuid;
BEGIN
  IF NEW.subject_type = 'claim' THEN
    SELECT claimant_id INTO cl FROM public.fin_reimbursement_claims WHERE id = NEW.subject_id::uuid;
    IF cl IS NULL THEN RAISE EXCEPTION 'Udlægget findes ikke'; END IF;
    IF cl = NEW.approver_id THEN RAISE EXCEPTION 'Man kan ikke godkende sit eget udlæg'; END IF;
  END IF;
  IF NEW.subject_type = 'opening_entry' AND EXISTS (
    SELECT 1 FROM public.fin_reimbursement_claims c WHERE c.is_opening AND c.claimant_id = NEW.approver_id
      AND EXISTS (SELECT 1 FROM public.fin_journal_entries e WHERE e.id = NEW.subject_id::uuid AND e.proposal->>'type' = 'opening_reimbursement')
  ) THEN RAISE EXCEPTION 'Udlægshaveren kan ikke godkende åbningsposten for sin egen gæld'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_approvals_guard BEFORE INSERT ON public.fin_approvals FOR EACH ROW EXECUTE FUNCTION private.fin_guard_approval();

CREATE OR REPLACE FUNCTION private.fin_guard_claim() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.claimant_id <> OLD.claimant_id OR NEW.amount_minor <> OLD.amount_minor AND OLD.status <> 'submitted' THEN
    RAISE EXCEPTION 'Udlægshaver og beløb kan ikke ændres efter behandling';
  END IF;
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF auth.uid() = NEW.claimant_id THEN RAISE EXCEPTION 'Man kan ikke godkende sit eget udlæg'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fin_approvals WHERE subject_type='claim' AND subject_id = NEW.id::text AND decision='approved' AND approver_id <> NEW.claimant_id) THEN
      RAISE EXCEPTION 'Udlægget mangler godkendelse fra en anden end udlægshaveren';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_claims_guard BEFORE UPDATE ON public.fin_reimbursement_claims FOR EACH ROW EXECUTE FUNCTION private.fin_guard_claim();

-- ===== Audit + backups =====
CREATE TABLE public.fin_audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  subject_type text,
  subject_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_audit_log TO authenticated;
GRANT ALL ON public.fin_audit_log TO service_role;
GRANT USAGE ON SEQUENCE public.fin_audit_log_id_seq TO service_role;
ALTER TABLE public.fin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read audit" ON public.fin_audit_log FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));

CREATE OR REPLACE FUNCTION private.fin_audit_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fin_audit_log(actor_id, actor_label, action, subject_type, subject_id, details)
  VALUES (auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' END, lower(TG_OP), TG_TABLE_NAME,
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'id',
    CASE WHEN TG_OP='UPDATE' THEN jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
         WHEN TG_OP='DELETE' THEN jsonb_build_object('old', to_jsonb(OLD)) ELSE jsonb_build_object('new', to_jsonb(NEW)) END);
  RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fin_user_roles','fin_settings','fin_membership_rates','fin_accounts','fin_periods','fin_journal_entries','fin_approvals','fin_category_rules','fin_documents','fin_bank_accounts','fin_bank_imports','fin_bank_statements','fin_bills','fin_bill_payments','fin_reimbursement_claims','fin_repayments']
  LOOP EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.fin_audit_trigger()', t || '_audit', t); END LOOP;
END $$;

CREATE TABLE public.fin_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('download','scheduled','external','restore_test')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  destination text,
  size_bytes bigint,
  file_count int,
  row_counts jsonb,
  checks jsonb,
  error text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.fin_backup_runs TO authenticated;
GRANT ALL ON public.fin_backup_runs TO service_role;
ALTER TABLE public.fin_backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin read backups" ON public.fin_backup_runs FOR SELECT TO authenticated USING (private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));

-- ===== Storage policies for private bucket accounting-docs =====
CREATE POLICY "fin read accounting docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'accounting-docs' AND private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));
CREATE POLICY "fin upload accounting docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'accounting-docs' AND private.fin_has_role(auth.uid(), ARRAY['finance_admin','finance_approver']));

-- ===== Reference data: settings + chart of accounts + first rate =====
INSERT INTO public.fin_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO public.fin_accounts (code, name, type, is_system) VALUES
 ('1000','Bank','asset',true),
 ('1010','Stripe-beholdning','asset',true),
 ('1020','Overførsler undervejs','asset',true),
 ('1100','Tilgodehavender','asset',true),
 ('2000','Leverandørgæld','liability',true),
 ('2100','Gæld til udlægshavere','liability',true),
 ('3000','Egenkapital','equity',true),
 ('4000','Kontingenter','income',true),
 ('4100','Donationer','income',true),
 ('4200','Sponsorindtægter','income',true),
 ('4300','Coachingindtægter','income',true),
 ('4900','Øvrige indtægter','income',true),
 ('6000','Hjemmeside, hosting og domæne','expense',true),
 ('6100','Software','expense',true),
 ('6200','Pokaler og præmier','expense',true),
 ('6300','Markedsføring','expense',true),
 ('6400','Stripe- og bankgebyrer','expense',true),
 ('6900','Øvrige udgifter','expense',true)
ON CONFLICT DO NOTHING;
INSERT INTO public.fin_membership_rates (amount_minor, period_months, effective_from, note)
VALUES (15000, 6, '2026-11-10', 'Kontingent ved stiftelsen') ON CONFLICT DO NOTHING;
