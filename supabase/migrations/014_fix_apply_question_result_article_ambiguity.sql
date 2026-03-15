-- Fix RPC error: column reference "article" is ambiguous
-- Recreate apply_question_result with fully qualified/aliased column references.

DROP FUNCTION IF EXISTS public.apply_question_result(integer, boolean);

CREATE FUNCTION public.apply_question_result(
  p_question_id integer,
  p_is_correct boolean
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_article text;
  v_total_answered integer;
  v_total_correct integer;
  v_mastery_pct integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT q.article
    INTO v_article
  FROM public.questions AS q
  WHERE q.id = p_question_id;

  IF v_article IS NULL THEN
    RAISE EXCEPTION 'Question % not found or has no article', p_question_id;
  END IF;

  INSERT INTO public.article_mastery AS am (
    user_id,
    article,
    total_answered,
    total_correct,
    mastery_pct,
    updated_at
  )
  VALUES (
    v_user_id,
    v_article,
    1,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    CASE WHEN p_is_correct THEN 100 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id, article)
  DO UPDATE SET
    total_answered = am.total_answered + 1,
    total_correct = am.total_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    mastery_pct = ROUND(
      (
        (am.total_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END)::numeric
        / (am.total_answered + 1)::numeric
      ) * 100
    )::integer,
    updated_at = now()
  RETURNING
    am.total_answered,
    am.total_correct,
    am.mastery_pct
  INTO
    v_total_answered,
    v_total_correct,
    v_mastery_pct;

  RETURN jsonb_build_object(
    'ok', true,
    'article', v_article,
    'total_answered', v_total_answered,
    'total_correct', v_total_correct,
    'mastery_pct', v_mastery_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_question_result(integer, boolean) TO authenticated;
