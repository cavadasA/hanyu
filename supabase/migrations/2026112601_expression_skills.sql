--
-- Plan 13: pronunciación y escritura pasan a ser habilidades con estado de
-- memoria propio, como las otras cinco. `production` se queda para la
-- producción escrita que corrigen las tareas comunicativas.
--
-- El sílabo 3.0 (新版HSK考试大纲, «HSK 汉字大纲») separa los caracteres que se
-- leen (认读字) de los que se escriben a mano (书写字). Hasta ahora la base no
-- distinguía unos de otros.

alter type public.learning_skill add value if not exists 'pronunciation';
alter type public.learning_skill add value if not exists 'writing';

alter table public.hsk_characters add column if not exists handwriting boolean not null default false;

-- «HSK（一级）~（二级）书写字» (p. 374, 100) y «HSK（三级）书写字» (p. 375, 150).
-- La misma lista que scripts/lib/official-handwriting.js; un test compara las dos.
update public.hsk_characters set handwriting = true where hanzi in (
  '爱', '八', '爸', '百', '半', '比', '边', '不', '茶', '打', '大', '地', '的', '点', '对', '多', '儿', '二', '分', '哥',
  '个', '工', '口', '国', '过', '还', '汉', '好', '和', '很', '后', '会', '几', '家', '间', '叫', '姐', '今', '男', '九',
  '可', '来', '了', '两', '六', '妈', '吗', '么', '没', '们', '名', '那', '你', '年', '七', '去', '人', '日', '三', '少',
  '上', '什', '生', '十', '时', '是', '书', '说', '四', '岁', '他', '她', '天', '同', '为', '文', '我', '五', '午', '习',
  '下', '小', '现', '写', '学', '要', '也', '一', '以', '有', '语', '月', '在', '长', '这', '中', '子', '女', '字', '作',
  '安', '把', '般', '板', '办', '饱', '报', '北', '被', '必', '变', '冰', '才', '参', '草', '层', '查', '差', '成', '城',
  '除', '处', '春', '答', '带', '单', '当', '灯', '典', '调', '定', '丢', '冬', '段', '而', '耳', '发', '法', '方', '放',
  '风', '复', '该', '干', '刚', '更', '共', '故', '瓜', '海', '合', '河', '护', '化', '换', '活', '或', '级', '急', '加',
  '假', '讲', '角', '饺', '节', '结', '借', '斤', '净', '久', '句', '卡', '渴', '刻', '空', '哭', '礼', '李', '力', '练',
  '凉', '马', '毛', '目', '南', '难', '努', '怕', '胖', '片', '平', '瓶', '其', '汽', '且', '轻', '秋', '求', '区', '全',
  '如', '伞', '山', '勺', '声', '实', '适', '收', '受', '树', '特', '挺', '图', '闻', '务', '物', '夏', '相', '香', '响',
  '向', '心', '信', '行', '须', '选', '牙', '言', '羊', '阳', '养', '业', '页', '音', '饮', '应', '用', '又', '于', '育',
  '咱', '张', '者', '直', '纸', '种', '重', '主', '助', '总'
);

-- Un carácter no tiene id numérico: su clave es el propio hanzi. Como
-- target_id es bigint, un estado de un carácter usa su punto de código Unicode
-- (ascii() en Postgres, codePointAt(0) en TypeScript).
--
-- La escritura solo existe para los caracteres que el sílabo pide escribir, y
-- la pronunciación solo para palabras. Se compara como texto porque un valor
-- de enum recién añadido no se puede usar como literal en la misma transacción.
create or replace function public.guard_expression_skill_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.skill::text = 'writing' and not (new.target_kind = 'character' and exists (
    select 1 from public.hsk_characters c
    where ascii(c.hanzi) = new.target_id and c.handwriting
  )) then
    raise exception 'writing solo existe para caracteres de la lista 书写字 (target % %)',
      new.target_kind, new.target_id
      using errcode = 'check_violation';
  end if;

  if new.skill::text = 'pronunciation' and new.target_kind <> 'word' then
    raise exception 'pronunciation solo existe para palabras (target % %)',
      new.target_kind, new.target_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_expression_skill_state on public.learner_skill_state;
create trigger guard_expression_skill_state before insert or update on public.learner_skill_state
for each row execute function public.guard_expression_skill_state();
