
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
  -- Any line change marks the draft as changed so earlier approvals no longer count
  IF st = 'draft' THEN UPDATE public.fin_journal_entries SET updated_at = now() WHERE id = eid; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

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
      IF NOT EXISTS (
        SELECT 1 FROM public.fin_approvals WHERE subject_type='opening_entry' AND subject_id = NEW.id::text AND decision='approved'
          AND created_at >= CASE WHEN TG_OP='UPDATE' THEN OLD.updated_at ELSE now() END
      ) THEN RAISE EXCEPTION 'Åbningsposten skal godkendes (efter seneste ændring) før bogføring'; END IF;
      IF EXISTS (
        SELECT 1 FROM public.fin_approvals WHERE subject_type='opening_entry' AND subject_id = NEW.id::text AND decision='rejected'
          AND created_at >= CASE WHEN TG_OP='UPDATE' THEN OLD.updated_at ELSE now() END
      ) THEN RAISE EXCEPTION 'Åbningsposten er afvist af et bestyrelsesmedlem'; END IF;
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
