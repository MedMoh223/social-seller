import * as WebBrowser from 'expo-web-browser';
import { Redirect, useLocalSearchParams } from 'expo-router';

// Deep-link landing page for Android OAuth error callbacks.
// See oauth-success.tsx for the context on why this exists.
// Passes the reason as a query param so channels.tsx can surface it if needed.
//
// Same rationale as oauth-success.tsx: maybeCompleteAuthSession() must be called
// here because _layout.tsx module-level code may not re-execute on an already-running activity.
WebBrowser.maybeCompleteAuthSession();

export default function OAuthErrorScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return <Redirect href={{ pathname: '/(tabs)/channels', params: { oauthError: reason ?? 'unknown' } }} />;
}
