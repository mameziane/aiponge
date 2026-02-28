import {
  CONTENT_VISIBILITY,
  BOOK_LIFECYCLE,
  BOOK_CATEGORIES,
  BOOK_ERAS,
  BOOK_TRADITIONS,
} from '@aiponge/shared-contracts';
import type { BookCardData } from '../../../components/book/BookCard';

export const CATEGORIES = [...BOOK_CATEGORIES];
export const ERAS = [...BOOK_ERAS];
export const TRADITIONS = [...BOOK_TRADITIONS];
export const VISIBILITY_OPTIONS = [
  CONTENT_VISIBILITY.PERSONAL,
  CONTENT_VISIBILITY.SHARED,
  CONTENT_VISIBILITY.PUBLIC,
] as const;
export const LIFECYCLE_OPTIONS = [BOOK_LIFECYCLE.DRAFT, BOOK_LIFECYCLE.ACTIVE, BOOK_LIFECYCLE.ARCHIVED] as const;

export interface BookFormData {
  title: string;
  subtitle: string;
  description: string;
  author: string;
  era: string;
  tradition: string;
  category: string;
  visibility: string;
  status: string;
}

export const initialFormData: BookFormData = {
  title: '',
  subtitle: '',
  description: '',
  author: '',
  era: '',
  tradition: '',
  category: 'growth',
  visibility: CONTENT_VISIBILITY.SHARED,
  status: BOOK_LIFECYCLE.ACTIVE,
};

export interface BookListScreenProps {
  embedded?: boolean;
  externalCreateTrigger?: number;
  onStudioPress?: () => void;
}

export interface BookSection {
  id: string;
  title: string;
  icon: string;
  books: BookCardData[];
  showProgress?: boolean;
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    anxiety: 'leaf-outline',
    growth: 'trending-up-outline',
    purpose: 'compass-outline',
    love: 'heart-outline',
    grief: 'water-outline',
    gratitude: 'sunny-outline',
    mindfulness: 'flower-outline',
    resilience: 'shield-outline',
    wisdom: 'book-outline',
    general: 'library-outline',
  };
  return icons[category] || 'book-outline';
}
