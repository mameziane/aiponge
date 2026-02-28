import { useEffect, useContext, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { isProfessionalTier } from '@aiponge/shared-contracts';
import { useIsAdmin } from '../../src/hooks/admin/useAdminQuery';
import { useSubscriptionData } from '../../src/contexts/SubscriptionContext';
import { BookListScreen } from '../../src/screens/shared/BookListScreen';
import { ChapterModalContext } from './_layout';

function BookRoute() {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const { currentTier } = useSubscriptionData();
  const { bookCreationTrigger } = useContext(ChapterModalContext);
  const canManageBooks = isProfessionalTier(currentTier);

  useEffect(() => {
    if (isAdmin) {
      router.replace('/admin');
    }
  }, [isAdmin, router]);

  const handleStudioPress = useCallback(() => {
    router.push('/(user)/studio' as any);
  }, [router]);

  if (isAdmin) {
    return null;
  }

  return (
    <BookListScreen
      embedded
      externalCreateTrigger={canManageBooks ? bookCreationTrigger : undefined}
      onStudioPress={canManageBooks ? handleStudioPress : undefined}
    />
  );
}

export default BookRoute;
