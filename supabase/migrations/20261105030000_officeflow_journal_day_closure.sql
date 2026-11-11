ALTER TABLE public.officeflow_notes
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE OR REPLACE FUNCTION officeflow_private.officeflow_notes_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_today date := timezone('Asia/Kolkata', now())::date;
  v_content_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized_at IS NOT NULL OR OLD.note_date < v_today THEN
      RAISE EXCEPTION 'A closed journal day cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.note_date < v_today THEN
      RAISE EXCEPTION 'Past journal days are closed; open them as PDFs';
    END IF;
    RETURN NEW;
  END IF;

  v_content_changed := (to_jsonb(NEW) - ARRAY['updated_at','finalized_at'])
                       IS DISTINCT FROM
                       (to_jsonb(OLD) - ARRAY['updated_at','finalized_at']);

  IF OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'A closed journal day is read-only';
  END IF;

  IF OLD.note_date < v_today THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Past journal days are closed and read-only';
    END IF;
    NEW.finalized_at := COALESCE(OLD.finalized_at, NEW.finalized_at, now());
    RETURN NEW;
  END IF;

  IF NEW.note_date < v_today THEN
    RAISE EXCEPTION 'A journal cannot be moved into a closed day';
  END IF;

  IF NEW.finalized_at IS NOT NULL AND v_content_changed THEN
    RAISE EXCEPTION 'Save the journal before closing the day';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION officeflow_private.officeflow_notes_immutability_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS officeflow_notes_immutability_guard ON public.officeflow_notes;
CREATE TRIGGER officeflow_notes_immutability_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.officeflow_notes
FOR EACH ROW EXECUTE FUNCTION officeflow_private.officeflow_notes_immutability_guard();

