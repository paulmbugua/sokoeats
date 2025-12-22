
insert into org_payment_accounts(org_id, provider, account_ref, display_name)
values
  ('d75de97b-a777-4a0c-a272-2d350c78ca2f', 'mpesa', '600984', 'Org Paybill 600984'),
  ('d75de97b-a777-4a0c-a272-2d350c78ca2f', 'bank', 'KCB-0123456789', 'KCB Fee Account')
on conflict (provider, account_ref)
do update set
  org_id = excluded.org_id,
  display_name = excluded.display_name,
  updated_at = now();
