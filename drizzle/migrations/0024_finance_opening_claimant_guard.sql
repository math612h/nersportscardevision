
CREATE OR REPLACE FUNCTION private.fin_guard_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cl uuid; p jsonb;
BEGIN
  IF NEW.subject_type = 'claim' THEN
    SELECT claimant_id INTO cl FROM public.fin_reimbursement_claims WHERE id = NEW.subject_id::uuid;
    IF cl IS NULL THEN RAISE EXCEPTION 'Udlægget findes ikke'; END IF;
    IF cl = NEW.approver_id THEN RAISE EXCEPTION 'Man kan ikke godkende sit eget udlæg'; END IF;
  END IF;
  IF NEW.subject_type = 'opening_entry' THEN
    SELECT proposal INTO p FROM public.fin_journal_entries WHERE id = NEW.subject_id::uuid;
    IF p IS NULL THEN RAISE EXCEPTION 'Åbningsposten findes ikke'; END IF;
    IF p->>'type' = 'opening_reimbursement' THEN
      IF coalesce(p->>'claimant_user_id','') = '' THEN RAISE EXCEPTION 'Angiv udlægshaverens bruger før godkendelse'; END IF;
      IF (p->>'claimant_user_id')::uuid = NEW.approver_id THEN RAISE EXCEPTION 'Udlægshaveren kan ikke godkende sin egen gæld'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.fin_opening_approvals_ok(_entry public.fin_journal_entries, _since timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.fin_approvals a WHERE a.subject_type='opening_entry' AND a.subject_id=_entry.id::text AND a.decision='rejected' AND a.created_at >= _since)
    AND (SELECT count(*) FROM public.fin_approvals a WHERE a.subject_type='opening_entry' AND a.subject_id=_entry.id::text AND a.decision='approved' AND a.created_at >= _since)
        >= greatest(1, coalesce((_entry.proposal->>'required_approvals')::int, 1))
$$;

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
    IF NEW.kind = 'opening' THEN
      IF NOT private.fin_opening_approvals_ok(NEW, CASE WHEN TG_OP='UPDATE' THEN OLD.updated_at ELSE now() END) THEN
        RAISE EXCEPTION 'Åbningsposten mangler godkendelser efter seneste ændring (eller er afvist)';
      END IF;
      IF coalesce(NEW.proposal->>'documentation_note','') = '' THEN RAISE EXCEPTION 'Åbningsposten mangler dokumentation'; END IF;
    END IF;
    NEW.posted_at := now();
    NEW.entry_no := nextval('public.fin_entry_no_seq');
    IF NOT NEW.posted_automatically THEN NEW.posted_by := auth.uid(); END IF;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
