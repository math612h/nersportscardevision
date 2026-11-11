
-- Records one Stripe balance transaction in the journal exactly once per (account, environment, BT id).
CREATE OR REPLACE FUNCTION public.fin_record_stripe_posting(
  _env text, _account text, _bt_id text, _date date, _description text,
  _lines jsonb, _decision text, _reason text, _explanation text, _rule_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.fin_journal_entries; new_id uuid; s public.fin_settings; l jsonb; i int := 0; auto boolean;
BEGIN
  IF _decision NOT IN ('post','review') THEN RAISE EXCEPTION 'invalid decision'; END IF;
  SELECT * INTO s FROM public.fin_settings WHERE id = 1;
  auto := coalesce(s.auto_posting_enabled, false) AND _decision = 'post';

  -- Serialise concurrent workers on the same key
  PERFORM pg_advisory_xact_lock(hashtext('fin_bt|' || _account || '|' || _env || '|' || _bt_id));

  SELECT * INTO existing FROM public.fin_journal_entries
   WHERE source_type = 'stripe_bt' AND coalesce(stripe_account_id,'') = _account AND coalesce(environment,'') = _env AND source_key = _bt_id;

  IF existing.id IS NOT NULL THEN
    IF existing.status = 'posted' THEN RETURN jsonb_build_object('result','already_posted','entry_id',existing.id); END IF;
    -- Refresh an untouched draft proposal
    DELETE FROM public.fin_journal_lines WHERE entry_id = existing.id;
    UPDATE public.fin_journal_entries SET description = _description, entry_date = _date,
      needs_review = (_decision = 'review'), review_reason = _reason, rule_explanation = _explanation, category_rule_id = _rule_id
     WHERE id = existing.id;
    new_id := existing.id;
  ELSE
    INSERT INTO public.fin_journal_entries(entry_date, description, kind, source_type, source_key, environment, stripe_account_id,
      needs_review, review_reason, rule_explanation, category_rule_id, posted_automatically)
    VALUES (_date, _description, 'stripe', 'stripe_bt', _bt_id, _env, _account, _decision = 'review', _reason, _explanation, _rule_id, auto)
    ON CONFLICT (source_type, coalesce(stripe_account_id,''), coalesce(environment,''), source_key) WHERE source_key IS NOT NULL DO NOTHING
    RETURNING id INTO new_id;
    IF new_id IS NULL THEN RETURN jsonb_build_object('result','duplicate'); END IF;
  END IF;

  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(_lines,'[]'::jsonb)) LOOP
    i := i + 1;
    INSERT INTO public.fin_journal_lines(entry_id, line_no, account_code, debit_minor, credit_minor, memo)
    VALUES (new_id, i, l->>'account', (l->>'debit')::bigint, (l->>'credit')::bigint, l->>'memo');
  END LOOP;

  IF auto THEN
    UPDATE public.fin_journal_entries SET posted_automatically = true, status = 'posted' WHERE id = new_id;
    RETURN jsonb_build_object('result','posted','entry_id',new_id);
  END IF;
  RETURN jsonb_build_object('result', CASE WHEN _decision='review' THEN 'review' ELSE 'draft' END, 'entry_id', new_id);
END $$;
REVOKE ALL ON FUNCTION public.fin_record_stripe_posting(text,text,text,date,text,jsonb,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_record_stripe_posting(text,text,text,date,text,jsonb,text,text,text,uuid) TO service_role;

-- Posting an existing draft (manual) – must be done by a finance admin
CREATE OR REPLACE FUNCTION public.fin_post_entry(_entry_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.fin_journal_entries SET status = 'posted', posted_automatically = false WHERE id = _entry_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Kladden findes ikke eller er allerede bogført'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_post_entry(uuid) TO authenticated;

-- Reverse a posted entry with a new posted entry
CREATE OR REPLACE FUNCTION public.fin_reverse_entry(_entry_id uuid, _reason text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.fin_journal_entries; nid uuid;
BEGIN
  SELECT * INTO o FROM public.fin_journal_entries WHERE id = _entry_id;
  IF o.id IS NULL OR o.status <> 'posted' THEN RAISE EXCEPTION 'Kun bogførte poster kan tilbageføres'; END IF;
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'Angiv en begrundelse'; END IF;
  INSERT INTO public.fin_journal_entries(entry_date, description, kind, reverses_entry_id, created_by)
  VALUES (CASE WHEN private.fin_period_locked(o.entry_date) THEN current_date ELSE o.entry_date END,
          'Tilbageførsel af #' || o.entry_no || ': ' || _reason, 'reversal', o.id, auth.uid())
  RETURNING id INTO nid;
  INSERT INTO public.fin_journal_lines(entry_id, line_no, account_code, debit_minor, credit_minor, memo)
  SELECT nid, line_no, account_code, credit_minor, debit_minor, 'Tilbageførsel' FROM public.fin_journal_lines WHERE entry_id = o.id;
  UPDATE public.fin_journal_entries SET status = 'posted' WHERE id = nid;
  RETURN nid;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_reverse_entry(uuid, text) TO authenticated;
