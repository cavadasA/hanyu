-- "Cuántas tarjetas" son cuatro decisiones distintas y hasta ahora había dos
-- columnas, ninguna de las cuales limitaba la cola: cards_per_day solo pintaba
-- una meta en Today, y max_reviews_per_session recortaba el lote ya pedido.

alter table public.user_settings
  add column if not exists new_cards_per_day integer not null default 10
    check (new_cards_per_day between 0 and 100),
  add column if not exists review_limit_per_day integer not null default 200
    check (review_limit_per_day between 10 and 999),
  add column if not exists session_size integer not null default 20
    check (session_size between 5 and 200);

-- Lo que el usuario ya había configurado se traslada al nombre que describe lo
-- que de verdad hace, en vez de perderse.
update public.user_settings
set new_cards_per_day = least(100, greatest(0, coalesce(cards_per_day, 10))),
    session_size = least(200, greatest(5, coalesce(max_reviews_per_session, 20)));

alter table public.user_settings
  drop column if exists cards_per_day,
  drop column if exists max_reviews_per_session;
