import { Redirect } from 'expo-router';

// Deep-link landing page for Android OAuth callbacks.
// On Android, Chrome Custom Tabs let the custom-scheme redirect (socialseller://oauth-success)
// escape to the OS, which opens this route directly. On iOS, ASWebAuthenticationSession
// intercepts the redirect before it reaches the app, so this screen is never shown there.
// Redirect immediately (during render) to avoid a flash of the default tab.
export default function OAuthSuccessScreen() {
  return <Redirect href="/(tabs)/channels" />;
}
