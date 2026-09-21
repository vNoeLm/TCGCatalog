-- Loads a whole prices upload in one step (used by the upload page in the admin area, through the
-- service role). Needs card_price_history from 20260921000000_card_price_history.sql.
--
-- p_prices is a JSON array of { id, eur, eur_foil, moved }. Every card listed gets its new price and
-- update time; a row in card_price_history is added only where "moved" is true, i.e. where the
-- price really moved (not merely re-expressed at a newer exchange rate).

CREATE OR REPLACE FUNCTION public.apply_price_import(p_prices jsonb, p_recorded_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recorded integer;
    v_updated integer;
BEGIN
    INSERT INTO public.card_price_history (card_id, price_eur, price_foil_eur, recorded_at)
    SELECT i.id, i.eur, i.eur_foil, p_recorded_at
    FROM jsonb_to_recordset(p_prices) AS i(id uuid, eur numeric, eur_foil numeric, moved boolean)
    JOIN public.cards c ON c.id = i.id
    WHERE i.moved IS TRUE;
    GET DIAGNOSTICS v_recorded = ROW_COUNT;

    UPDATE public.cards c
    SET market_price_eur = i.eur,
        market_price_foil_eur = i.eur_foil,
        last_price_updated_at = p_recorded_at
    FROM jsonb_to_recordset(p_prices) AS i(id uuid, eur numeric, eur_foil numeric, moved boolean)
    WHERE c.id = i.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN jsonb_build_object('updated', v_updated, 'recorded', v_recorded);
END;
$$;

-- Only the server (service role) may call it.
REVOKE ALL ON FUNCTION public.apply_price_import(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_price_import(jsonb, timestamptz) TO service_role;
