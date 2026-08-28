-- I-046 / spec 0011: revoke client write DML on every business table. The
-- authenticated role keeps SELECT (client reads + Realtime); ALL writes go
-- through the server's service-role connection (not subject to these grants).
-- Closes the Data-API write-bypass (member self-upgrade / org discount tamper).
REVOKE INSERT, UPDATE, DELETE ON TABLE "app_users"      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE "organizations"  FROM authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cafe_menu_items','cafe_orders','cafe_order_items',
    'time_credit_packages','facilities','bookings','print_jobs','transactions',
    'membership_tier_config','org_print_pricing'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE %I FROM authenticated', t);
  END LOOP;
END $$;
