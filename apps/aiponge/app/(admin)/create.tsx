/**
 * Admin Create Tab — placeholder route for center tab bar button.
 * The actual create action is dispatched via AdminCreateContext based on which
 * admin screen is active. This screen redirects back to dashboard.
 */
import { Redirect } from 'expo-router';

export default function AdminCreate() {
  return <Redirect href="/(admin)/dashboard" />;
}
