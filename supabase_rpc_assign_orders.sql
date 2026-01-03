-- RPC function to assign orders by order_number (bypasses RLS)
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION assign_orders_by_number(
  p_order_numbers text[],
  p_assigned_to text,
  p_assigned_at timestamptz,
  p_team_id integer
)
RETURNS TABLE(order_number text, updated boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE "orders_All"
  SET 
    assigned_to = p_assigned_to,
    assigned_at = p_assigned_at
  WHERE "orders_All".order_number = ANY(p_order_numbers)
    AND ("orders_All".team_id = p_team_id OR "orders_All".team_id IS NULL)
  RETURNING "orders_All".order_number, true;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION assign_orders_by_number(text[], text, timestamptz, integer) TO authenticated;
