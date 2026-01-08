-- RPC function to update call_status for ALL orders belonging to a customer
-- This ensures that when a customer has multiple orders, all get the same call status
-- Run this in your Supabase SQL Editor

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS update_call_status(text, text);
DROP FUNCTION IF EXISTS update_call_status_by_phone(text, text);

-- Create new function that updates ALL orders for a customer
-- Note: call_feedback table uses customer_phone, not customer_email
-- But we keep the function name as update_call_status(p_email) for backward compatibility
-- and internally map email to phone by looking up the customer
CREATE FUNCTION update_call_status(
  p_email text,
  p_status text
)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_phone text;
  v_order_record RECORD;
  v_agent text;
  v_rows integer;
BEGIN
  -- Get current agent from context (if available)
  v_agent := current_setting('request.jwt.claims', true)::json->>'email';
  IF v_agent IS NULL THEN
    v_agent := '';
  END IF;
  
  -- First, try to find the phone number from orders_All table using email
  SELECT DISTINCT phone INTO v_phone
  FROM "orders_All"
  WHERE email = p_email
  LIMIT 1;
  
  -- If we found a phone, process all orders for that customer
  IF v_phone IS NOT NULL THEN
    -- Get all unique order numbers for this customer
    FOR v_order_record IN 
      SELECT DISTINCT order_number, phone, email
      FROM "orders_All"
      WHERE phone = v_phone AND order_number IS NOT NULL
    LOOP
      -- Update existing call_feedback row for this order_number; if none exists, insert a new one.
      UPDATE call_feedback
      SET
        call_status = p_status,
        agent = CASE WHEN COALESCE(v_agent, '') <> '' THEN v_agent ELSE agent END,
        customer_phone = COALESCE(customer_phone, v_phone)
      WHERE order_number = v_order_record.order_number;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_count := v_count + v_rows;

      IF NOT FOUND THEN
        INSERT INTO call_feedback (
          order_number,
          customer_phone,
          agent,
          call_status
        )
        VALUES (
          v_order_record.order_number,
          v_phone,
          NULLIF(v_agent, ''),
          p_status
        );
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;
  
  RETURN QUERY SELECT v_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_call_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_call_status(text, text) TO anon;

-- Alternative version using phone number (if needed)
CREATE FUNCTION update_call_status_by_phone(
  p_phone text,
  p_status text
)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Update all call_feedback records for this customer (by phone)
  UPDATE call_feedback
  SET call_status = p_status
  WHERE customer_phone = p_phone;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION update_call_status_by_phone(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_call_status_by_phone(text, text) TO anon;
