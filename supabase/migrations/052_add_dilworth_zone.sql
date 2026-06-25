-- Add Dilworth / Myers Park (zip 28209) as second discovery zone
insert into public.zones (id, name, center_lat, center_lng, radius_m)
values ('dilworth-charlotte', 'Dilworth / Myers Park', 35.2040, -80.8440, 2500)
on conflict (id) do nothing;
