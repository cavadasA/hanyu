// Config plugin: ciclo de vida UIScene para iOS 27.
//
// El SDK de iOS 27 cierra al arrancar (SIGTRAP,
// UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption) cualquier app que
// no adopte escenas. Expo 57.0.34 ya trae `ExpoAppSceneDelegate` en el runtime,
// pero la plantilla de `expo prebuild` de la SDK 57 sigue generando un AppDelegate
// sin escenas. Este plugin hace lo que la plantilla de la SDK 58:
//   - el AppDelegate crea la factoría de React Native y la expone
//     (ExpoReactNativeFactoryProvider), sin crear ventana;
//   - un SceneDelegate (ExpoAppSceneDelegate) crea la ventana de la escena y
//     arranca React Native en ella;
//   - Info.plist declara la escena.
// Al pasar a la SDK 58 este plugin sobra: quítalo de app.json.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const CLASS_DECL = 'class AppDelegate: ExpoAppDelegate {';
const CLASS_DECL_WITH_PROVIDER = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
// Bloque de la plantilla que crea la ventana y arranca React Native en ella.
const WINDOW_BLOCK =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
const SCENE_DELEGATE = `
// Ciclo de vida UIScene (iOS 27): la escena crea la ventana y arranca React Native.
// Lo añade plugins/withSceneLifecycle.js.
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

function addSceneLifecycleToAppDelegate(src) {
  if (src.includes('class SceneDelegate: ExpoAppSceneDelegate')) return src;
  if (!src.includes(CLASS_DECL) || !WINDOW_BLOCK.test(src)) {
    throw new Error(
      'withSceneLifecycle: el AppDelegate.swift generado no tiene la forma esperada de la plantilla de Expo 57; revisa el plugin.',
    );
  }
  return (
    src
      .replace(CLASS_DECL, CLASS_DECL_WITH_PROVIDER)
      .replace(
        WINDOW_BLOCK,
        '\n    // La ventana la crea SceneDelegate y arranca ahí React Native (ciclo de vida UIScene, iOS 27).\n\n',
      )
      .trimEnd() +
    '\n' +
    SCENE_DELEGATE
  );
}

function addSceneManifest(plist) {
  return {
    ...plist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    },
  };
}

function withSceneLifecycle(config) {
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: sólo sabe modificar un AppDelegate en Swift.');
    }
    c.modResults.contents = addSceneLifecycleToAppDelegate(c.modResults.contents);
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults = addSceneManifest(c.modResults);
    return c;
  });
  return config;
}

module.exports = withSceneLifecycle;
module.exports.addSceneLifecycleToAppDelegate = addSceneLifecycleToAppDelegate;
module.exports.addSceneManifest = addSceneManifest;
