import { Redirect } from 'expo-router';

// Language picker removed — the app now follows the device language.
// Users can change the app language via iOS Settings → aiponge → Language
// or Android Settings → Apps → aiponge → Language.
// This redirect prevents crashes if a deep link or bookmark targets /language.
export default function LanguageRedirect() {
  return <Redirect href="/preferences" />;
}
