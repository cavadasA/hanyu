// Escritura a mano de un carácter sobre un lienzo (WebView). En modo `exam` (书写 2 del
// simulacro) no hay contorno, ni pistas, ni rechazo de trazos sobre la marcha: el alumno
// dibuja libremente y, al pulsar «Hecho», se reconoce qué carácter ha escrito entre los de
// escritura de HSK 1–2, en cualquier orden de trazos. El cliente no conoce la respuesta: el
// servidor compara el carácter reconocido. `guided` y `quiz` los implementa el Plan 13.
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { recognizeHandwriting, type Point } from '@hanyu/domain';
import { Button } from '../ui/Button';
import { useTheme } from '../theme/ThemeProvider';

const HANDWRITING_MEDIANS = require('../../assets/hanzi-writer/handwriting-medians.json') as Record<string, Point[][]>;

export interface WritingResult {
  mistakes: number;
  strokes: number;
  completed: boolean;
  recognized: string | null;
}

interface CharacterWritingProps {
  mode: 'exam' | 'guided' | 'quiz';
  /** El carácter que se practica (guided y quiz, Plan 13). En exam no se conoce. */
  hanzi?: string;
  onResult: (result: WritingResult) => void;
  size?: number;
}

/**
 * Lienzo con cuadrícula 米字格. Cada trazo se guarda en el sistema de hanzi-writer-data
 * (1024 unidades, y hacia arriba, base en 900) y se manda entero al terminarlo.
 */
function canvasHtml(ink: string, grid: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent;touch-action:none}canvas{width:100%;height:100%;display:block}</style></head>
<body><canvas id="c"></canvas><script>
var c=document.getElementById('c'),x=c.getContext('2d'),strokes=[],current=null,ratio=window.devicePixelRatio||1;
function size(){c.width=c.clientWidth*ratio;c.height=c.clientHeight*ratio;draw();}
function grid(){var w=c.width,h=c.height;x.save();x.strokeStyle='${grid}';x.lineWidth=ratio;x.setLineDash([6*ratio,6*ratio]);
x.beginPath();x.moveTo(w/2,0);x.lineTo(w/2,h);x.moveTo(0,h/2);x.lineTo(w,h/2);x.moveTo(0,0);x.lineTo(w,h);x.moveTo(w,0);x.lineTo(0,h);x.stroke();x.restore();}
function toScreen(p){return [p[0]/1024*c.width,(900-p[1])/1024*c.height];}
function line(s){if(!s.length)return;x.beginPath();var a=toScreen(s[0]);x.moveTo(a[0],a[1]);for(var i=1;i<s.length;i++){var b=toScreen(s[i]);x.lineTo(b[0],b[1]);}x.stroke();}
function draw(){x.clearRect(0,0,c.width,c.height);grid();x.strokeStyle='${ink}';x.lineWidth=10*ratio;x.lineCap='round';x.lineJoin='round';strokes.forEach(line);if(current)line(current);}
function point(e){var r=c.getBoundingClientRect();return [Math.round((e.clientX-r.left)/r.width*1024),Math.round(900-(e.clientY-r.top)/r.height*1024)];}
c.addEventListener('pointerdown',function(e){c.setPointerCapture(e.pointerId);current=[point(e)];draw();});
c.addEventListener('pointermove',function(e){if(!current)return;current.push(point(e));draw();});
function end(){if(!current)return;if(current.length>1)strokes.push(current);current=null;draw();
window.ReactNativeWebView.postMessage(JSON.stringify({type:'strokes',strokes:strokes}));}
c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
window.clearCanvas=function(){strokes=[];current=null;draw();};
window.addEventListener('resize',size);size();
</script></body></html>`;
}

export function CharacterWriting({ mode, onResult, size = 260 }: CharacterWritingProps) {
  if (mode !== 'exam') {
    throw new Error(`CharacterWriting: el modo ${mode} lo implementa el Plan 13`);
  }
  const { colors } = useTheme();
  const webView = useRef<WebView>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as { type: string; strokes?: Point[][] };
    if (message.type === 'strokes' && Array.isArray(message.strokes)) setStrokes(message.strokes);
  };

  const finish = () => {
    const result = recognizeHandwriting(strokes, HANDWRITING_MEDIANS);
    onResult({
      mistakes: result.mistakes,
      strokes: result.strokes,
      completed: result.recognized !== null,
      recognized: result.recognized,
    });
  };

  const clear = () => {
    webView.current?.injectJavaScript('window.clearCanvas(); true;');
    setStrokes([]);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.canvas, { width: size, height: size, borderColor: colors.border, backgroundColor: colors.surface }]}>
        <WebView
          ref={webView}
          originWhitelist={['*']}
          source={{ html: canvasHtml(colors.text, colors.border) }}
          onMessage={onMessage}
          scrollEnabled={false}
          bounces={false}
          style={styles.web}
        />
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Borrar" variant="outline" onPress={clear} />
        </View>
        <View style={styles.action}>
          <Button label="Hecho" onPress={finish} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  canvas: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  web: { backgroundColor: 'transparent' },
  actions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  action: { flex: 1 },
});
