//
// Lista de caracteres de escritura (书写字) del sílabo oficial: 新版HSK考试大纲,
// publicado en noviembre de 2025 (https://hsk.cn-bj.ufileos.com/3.0/新版HSK考试大纲1219.pdf),
// «HSK 汉字大纲». Transcrita mirando las páginas del PDF, en el orden y con la
// numeración del sílabo, 25 por línea.
//
// El sílabo separa los caracteres que se leen (认读字) de los que se escriben
// a mano (书写字). Para HSK 1 y 2 da una sola lista conjunta; HSK 3 tiene la
// suya. Ninguno de estos datos sale de una transcripción comunitaria.
export const OFFICIAL_HANDWRITING = {
  // «HSK（一级）~（二级）书写字», p. 374, n.º 1–100.
  hsk_1_2: [
    '爱八爸百半比边不茶打大地的点对多儿二分哥个工口国过',
    '还汉好和很后会几家间叫姐今男九可来了两六妈吗么没们',
    '名那你年七去人日三少上什生十时是书说四岁他她天同为',
    '文我五午习下小现写学要也一以有语月在长这中子女字作',
  ].join('').split(''),
  // «HSK（三级）书写字», p. 375, n.º 1–150.
  hsk_3: [
    '安把般板办饱报北被必变冰才参草层查差成城除处春答带',
    '单当灯典调定丢冬段而耳发法方放风复该干刚更共故瓜海',
    '合河护化换活或级急加假讲角饺节结借斤净久句卡渴刻空',
    '哭礼李力练凉马毛目南难努怕胖片平瓶其汽且轻秋求区全',
    '如伞山勺声实适收受树特挺图闻务物夏相香响向心信行须',
    '选牙言羊阳养业页音饮应用又于育咱张者直纸种重主助总',
  ].join('').split(''),
};
