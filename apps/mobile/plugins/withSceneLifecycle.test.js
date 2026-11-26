const {
  addSceneLifecycleToAppDelegate,
  addSceneManifest,
} = require('./withSceneLifecycle');

// AppDelegate.swift tal como lo genera `expo prebuild` con la plantilla de Expo 57.
const TEMPLATE_57 = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins
}
`;

describe('addSceneLifecycleToAppDelegate', () => {
  const out = addSceneLifecycleToAppDelegate(TEMPLATE_57);

  it('hace que AppDelegate entregue su factoría de React Native a la escena', () => {
    expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  });

  it('deja de crear la ventana y arrancar React Native en el AppDelegate', () => {
    expect(out).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(out).not.toContain('factory.startReactNative(');
    expect(out).toContain('reactNativeFactory = factory');
    expect(out).toContain('return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
  });

  it('declara el SceneDelegate sobre ExpoAppSceneDelegate', () => {
    expect(out).toMatch(/@objc\(SceneDelegate\)\s*\nclass SceneDelegate: ExpoAppSceneDelegate \{/);
  });

  it('es idempotente', () => {
    expect(addSceneLifecycleToAppDelegate(out)).toBe(out);
  });

  it('falla con un AppDelegate que no reconoce, en vez de dejar la app sin escenas', () => {
    expect(() => addSceneLifecycleToAppDelegate('class AppDelegate: Foo {}')).toThrow(/AppDelegate/);
  });
});

describe('addSceneManifest', () => {
  it('declara una única escena con el SceneDelegate del módulo', () => {
    const plist = addSceneManifest({ CFBundleName: 'Hanyu' });
    expect(plist.CFBundleName).toBe('Hanyu');
    expect(plist.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    });
  });
});
