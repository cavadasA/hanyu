# Licencias de datos de terceros en `server/db/seeds/`

## `hanzi-decomposition.json`

Subconjunto, para los caracteres de HSK 1–2, de **Make Me a Hanzi**
(https://github.com/skishore/makemeahanzi, de Shaunak Kishore). Lo genera
`scripts/import-hanzi-data.js` a partir de los dos ficheros del proyecto:

- `decomposition` y `matches` vienen de `dictionary.txt`, derivado de Unihan y CJKlib.
  Se distribuye bajo la **GNU Lesser General Public License (LGPL)**, versión 3 o posterior.
- `strokes` viene de `graphics.txt`, derivado de las fuentes Arphic PL KaitiM GB y Arphic PL UKai.
  Se distribuye bajo la **Arphic Public License**: http://ftp.gnu.org/non-gnu/chinese-fonts-truetype/LICENSE

El subconjunto conserva los valores originales sin modificarlos; solo se seleccionan
caracteres. Se usa para validar 书写 1 y para dibujar los caracteres incompletos del simulacro.
