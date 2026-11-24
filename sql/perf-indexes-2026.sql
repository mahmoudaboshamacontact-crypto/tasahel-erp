-- فهارس أداء إضافية (Idempotent) لتسريع تقارير المناديب والبحث في الأرشيف مع نمو البيانات
create index if not exists courier_trips_courier_day_idx
  on public.courier_trips (courier, trip_day desc);

create index if not exists rl_arch_2026_q3_tx_idx
  on public.request_lines_archive_2026_q3 (transaction_id);

create index if not exists rl_arch_2026_q3_received_idx
  on public.request_lines_archive_2026_q3 (received_at desc);
