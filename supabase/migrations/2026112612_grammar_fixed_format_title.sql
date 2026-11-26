-- El punto 4.1 (固定格式) de HSK 2 y HSK 3 no tiene título en el sílabo oficial:
-- se importó con title = '' y el «Grammar focus» de las lecturas mostraba sólo
-- «4.1». El importador ya le da el título de su epígrafe padre; esto lo corrige
-- en las bases creadas antes.
update public.grammar_points set title = '固定格式'
where code = '4.1' and hsk_level in (2, 3) and title = '';

update public.unit set title = '固定格式'
where code = '4.1' and hsk_level in (2, 3) and title = '';
