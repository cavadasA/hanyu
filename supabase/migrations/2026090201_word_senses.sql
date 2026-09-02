--
-- Una fila de `words` pasa a representar un sentido, no una forma escrita.
-- Hasta ahora 还 hái y 还 huán compartían glosa porque el importador elegía un
-- único bloque de diccionario por hanzi. Estas columnas guardan lo que ya venía
-- en la fuente y se estaba descartando.

alter table public.words
  add column if not exists traditional text,
  add column if not exists classifier text;

-- Normalizar en SQL, y no en cada cliente, evita que dos implementaciones de
-- "quitar el tono" diverjan. Se quitan las marcas de tono combinantes pero se
-- conserva la diéresis: ü forma parte de la sílaba, no del tono.
alter table public.words
  add column if not exists pinyin_normalized text
  generated always as (
    lower(
      regexp_replace(
        translate(
          normalize(pinyin, nfd),
          u&'\0300\0301\0304\030C',
          ''
        ),
        '[[:space:]''0-9-]',
        '',
        'g'
      )
    )
  ) stored;

create index if not exists idx_words_hanzi_reading
  on public.words(hanzi, pinyin_normalized);

-- El corpus lleva glosa española en las 1010 filas, pero la app muestra inglés
-- en todas las pantallas. El idioma de apoyo pasa a ser una preferencia real.
alter table public.user_settings
  add column if not exists support_language text not null default 'es'
  check (support_language in ('es', 'en'));
