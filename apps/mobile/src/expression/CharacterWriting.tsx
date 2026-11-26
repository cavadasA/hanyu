// Escritura a mano de un carácter sobre un lienzo (WebView). En modo `exam` (书写 2 del
// simulacro) no hay contorno, ni pistas, ni rechazo de trazos sobre la marcha: el alumno
// dibuja libremente y, al pulsar «Hecho», se reconoce qué carácter ha escrito entre los de
// escritura de HSK 1–2, en cualquier orden de trazos. El cliente no conoce la respuesta: el
// servidor compara el carácter reconocido.
//
// En `guided` y `quiz` (Plan 13) se sabe qué carácter se escribe y cada trazo se valida al
// terminarlo, en orden (stroke-quiz.ts del dominio). `guided` muestra el contorno y anima el
// orden de trazos: es enseñanza, y quien lo usa no registra ningún evento. `quiz` no muestra
// nada hasta el tercer error en un trazo, o hasta que se pide una pista.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  quizHint,
  quizStroke,
  recognizeHandwriting,
  startWritingQuiz,
  type Point,
  type QuizStep,
  type WritingQuizState,
} from '@hanyu/domain';
import { Button } from '../ui/Button';
import { useTheme } from '../theme/ThemeProvider';

const HANDWRITING_MEDIANS = require('../../assets/hanzi-writer/handwriting-medians.json') as Record<string, Point[][]>;
/** Contorno SVG y mediana de cada trazo de los 250 caracteres de escritura (scripts/build-writing-strokes.js). */
const WRITING_STROKES = require('../../assets/hanzi-writer/writing-strokes.json') as Record<
  string,
  { strokes: string[]; medians: Point[][] }
>;

export interface WritingResult {
  mistakes: number;
  /** Pistas mostradas (guided y quiz). */
  hints: number;
  strokes: number;
  completed: boolean;
  recognized: string | null;
}

interface CharacterWritingProps {
  mode: 'exam' | 'guided' | 'quiz';
  /** El carácter que se practica (guided y quiz). En exam no se conoce. */
  hanzi?: string;
  onResult: (result: WritingResult) => void;
  /** guided y quiz: el carácter no tiene datos de trazos y no se puede practicar. */
  onContentError?: (error: { kind: 'missing_strokes'; hanzi: string }) => void;
  size?: number;
  /**
   * exam: avisa cuando un dedo empieza y deja de tocar el lienzo, para que la pantalla
   * deje de desplazarse mientras se dibuja (si no, el ScrollView se queda el trazo).
   */
  onDrawingChange?: (drawing: boolean) => void;
}

export function hasWritingStrokes(hanzi: string): boolean {
  return Boolean(WRITING_STROKES[hanzi]);
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

/**
 * Lienzo de guided y quiz. Cada trazo se manda solo, al terminarlo, y React Native decide:
 * `accept(i)` lo sustituye por el trazo i bien dibujado, `reject()` lo borra, `hint(i)`
 * resalta el trazo i, `animate()` enseña el orden de trazos y `reset()` vuelve a empezar.
 */
function traceHtml(paths: string[], outline: boolean, colors: { ink: string; grid: string; accent: string }) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent;touch-action:none}canvas{width:100%;height:100%;display:block}</style></head>
<body><canvas id="c"></canvas><script>
var paths=${JSON.stringify(paths)};var outline=${outline ? 'true' : 'false'};
var c=document.getElementById('c'),x=c.getContext('2d'),done=[],current=null,pending=null,hinted=-1,shown=-1,timer=null,ratio=window.devicePixelRatio||1;
function size(){c.width=c.clientWidth*ratio;c.height=c.clientHeight*ratio;draw();}
function grid(){var w=c.width,h=c.height;x.save();x.strokeStyle='${colors.grid}';x.lineWidth=ratio;x.setLineDash([6*ratio,6*ratio]);
x.beginPath();x.moveTo(w/2,0);x.lineTo(w/2,h);x.moveTo(0,h/2);x.lineTo(w,h/2);x.moveTo(0,0);x.lineTo(w,h);x.moveTo(w,0);x.lineTo(0,h);x.stroke();x.restore();}
function fill(i,color,alpha){x.save();x.setTransform(c.width/1024,0,0,-c.height/1024,0,900*c.height/1024);x.globalAlpha=alpha;x.fillStyle=color;x.fill(new Path2D(paths[i]));x.restore();}
function toScreen(p){return [p[0]/1024*c.width,(900-p[1])/1024*c.height];}
function line(s){if(!s.length)return;x.beginPath();var a=toScreen(s[0]);x.moveTo(a[0],a[1]);for(var i=1;i<s.length;i++){var b=toScreen(s[i]);x.lineTo(b[0],b[1]);}x.stroke();}
function draw(){x.clearRect(0,0,c.width,c.height);grid();
if(outline)for(var i=0;i<paths.length;i++)fill(i,'${colors.grid}',1);
if(shown>=0){for(var j=0;j<=shown&&j<paths.length;j++)fill(j,'${colors.accent}',1);}
else{done.forEach(function(i){fill(i,'${colors.ink}',1);});if(hinted>=0)fill(hinted,'${colors.accent}',0.35);}
x.strokeStyle='${colors.ink}';x.lineWidth=10*ratio;x.lineCap='round';x.lineJoin='round';if(pending)line(pending);if(current)line(current);}
function point(e){var r=c.getBoundingClientRect();return [Math.round((e.clientX-r.left)/r.width*1024),Math.round(900-(e.clientY-r.top)/r.height*1024)];}
c.addEventListener('pointerdown',function(e){if(shown>=0)return;c.setPointerCapture(e.pointerId);current=[point(e)];draw();});
c.addEventListener('pointermove',function(e){if(!current)return;current.push(point(e));draw();});
function end(){if(!current)return;var s=current;current=null;if(s.length>1){pending=s;window.ReactNativeWebView.postMessage(JSON.stringify({type:'stroke',stroke:s}));}draw();}
c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
window.accept=function(i){done.push(i);pending=null;hinted=-1;draw();};
window.reject=function(){pending=null;draw();};
window.hint=function(i){hinted=i;draw();};
window.reset=function(){done=[];pending=null;hinted=-1;draw();};
window.animate=function(){clearTimeout(timer);shown=0;draw();(function next(){timer=setTimeout(function(){shown++;if(shown>paths.length){shown=-1;}draw();if(shown>=0)next();},shown<paths.length-1?550:900);})();};
window.addEventListener('resize',size);size();
</script></body></html>`;
}

export function CharacterWriting(props: CharacterWritingProps) {
  if (props.mode === 'exam') return <ExamWriting {...props} />;
  return <TraceWriting {...props} mode={props.mode} />;
}

function ExamWriting({ onResult, onDrawingChange, size = 260 }: CharacterWritingProps) {
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
      hints: 0,
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
      <View
        testID="exam-writing-canvas"
        onTouchStart={() => onDrawingChange?.(true)}
        onTouchEnd={() => onDrawingChange?.(false)}
        onTouchCancel={() => onDrawingChange?.(false)}
        style={[styles.canvas, { width: size, height: size, borderColor: colors.border, backgroundColor: colors.surface }]}
      >
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

function TraceWriting({
  mode,
  hanzi = '',
  onResult,
  onContentError,
  size = 260,
}: CharacterWritingProps & { mode: 'guided' | 'quiz' }) {
  const { colors } = useTheme();
  const webView = useRef<WebView>(null);
  const data = WRITING_STROKES[hanzi];
  const quiz = useRef<WritingQuizState | null>(data ? startWritingQuiz(data.medians) : null);
  // El HTML se fija al montar: cambiarlo recargaría el lienzo y perdería lo escrito.
  const [html] = useState(() =>
    data ? traceHtml(data.strokes, mode === 'guided', { ink: colors.text, grid: colors.border, accent: colors.vermilion }) : '',
  );

  useEffect(() => {
    if (!data) onContentError?.({ kind: 'missing_strokes', hanzi });
    // Solo al montar: el carácter de un ejercicio no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || !quiz.current) return null;

  const inject = (code: string) => webView.current?.injectJavaScript(`${code}; true;`);

  const apply = (step: QuizStep, accepted: number) => {
    quiz.current = step.state;
    if (step.outcome === 'accepted') inject(`window.accept(${accepted})`);
    if (step.outcome === 'rejected') inject(step.hint === null ? 'window.reject()' : `window.reject(); window.hint(${step.hint})`);
    if (step.outcome === 'accepted' && step.state.done) {
      onResult({
        completed: true,
        mistakes: step.state.mistakes,
        hints: step.state.hints,
        strokes: data.medians.length,
        recognized: hanzi,
      });
    }
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as { type: string; stroke?: Point[] };
    if (message.type !== 'stroke' || !Array.isArray(message.stroke) || !quiz.current) return;
    const expected = quiz.current.next;
    apply(quizStroke(quiz.current, message.stroke), expected);
  };

  const hint = () => {
    if (!quiz.current) return;
    const step = quizHint(quiz.current);
    quiz.current = step.state;
    if (step.hint !== null) inject(`window.hint(${step.hint})`);
  };

  const restart = () => {
    quiz.current = startWritingQuiz(data.medians);
    inject('window.reset()');
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.canvas, { width: size, height: size, borderColor: colors.border, backgroundColor: colors.surface }]}>
        <WebView
          ref={webView}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          scrollEnabled={false}
          bounces={false}
          style={styles.web}
        />
      </View>
      <View style={styles.actions}>
        {mode === 'guided' ? (
          <>
            <View style={styles.action}>
              <Button label="Ver el orden" variant="outline" onPress={() => inject('window.animate()')} />
            </View>
            <View style={styles.action}>
              <Button label="Otra vez" variant="outline" onPress={restart} />
            </View>
          </>
        ) : (
          <View style={styles.action}>
            <Button label="Pista" variant="outline" onPress={hint} />
          </View>
        )}
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
