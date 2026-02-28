import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useIsAdmin } from '../../src/hooks/admin/useAdminQuery';
import { ReflectScreen } from '../../src/screens/user/ReflectScreen';

function ReflectRoute() {
  const isAdmin = useIsAdmin();
  const router = useRouter();

  useEffect(() => {
    if (isAdmin) {
      router.replace('/admin');
    }
  }, [isAdmin, router]);

  if (isAdmin) {
    return null;
  }

  return <ReflectScreen />;
}

export default ReflectRoute;
