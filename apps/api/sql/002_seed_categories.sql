insert into categories (id, name, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Access', true),
  ('00000000-0000-0000-0000-000000000002', 'Hardware', true),
  ('00000000-0000-0000-0000-000000000003', 'Software', true),
  ('00000000-0000-0000-0000-000000000004', 'Security', true),
  ('00000000-0000-0000-0000-000000000005', 'Network', true),
  ('00000000-0000-0000-0000-000000000006', 'Other', true)
on conflict (name) do update
set is_active = excluded.is_active;
