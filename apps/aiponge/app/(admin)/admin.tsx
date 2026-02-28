import { Redirect } from 'expo-router';

export default function LegacyAdminRoute() {
  return <Redirect href="/(admin)/dashboard" />;
}
