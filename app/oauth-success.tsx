import * as WebBrowser from 'expo-web-browser';
import { Redirect } from 'expo-router';

// Deep-link landing page for Android OAuth callbacks.
// On Android, Chrome Custom Tabs let the custom-scheme redirect (socialseller://oauth-success)
// escape to the OS, which opens this route directly. On iOS, ASWebAuthenticationSession
// intercepts the redirect before it reaches the app, so this screen is never shown there.
//
// maybeCompleteAuthSession() MUST be called here (and not only in _layout.tsx) because
// on Android, if the main activity is already running, _layout.tsx module-level code
// does not re-execute when the deep link arrives. This route is what actually renders
// at that moment, so this is the reliable place to close the Chrome Custom Tab.
WebBrowser.maybeCompleteAuthSession();

export default function OAuthSuccessScreen() {
  return <Redirect href="/(tabs)/channels" />;
}
