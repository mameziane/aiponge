import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CONTENT_VISIBILITY, BOOK_LIFECYCLE } from '@aiponge/shared-contracts';
import { apiRequest } from '../../../lib/axiosApiClient';
import { useToast } from '../../../hooks/ui/use-toast';
import { useMediaPicker } from '../../../hooks/ui/useMediaPicker';
import { ProfileService } from '../../../hooks/profile/ProfileService';
import { invalidateOnEvent } from '../../../lib/cacheManager';
import { queryKeys } from '../../../lib/queryKeys';
import type { BookCardData } from '../../../components/book/BookCard';
import type { GeneratedBookBlueprint } from '../../../hooks/book/useBookGenerator';
import { logger } from '../../../lib/logger';
import { initialFormData, type BookFormData } from './types';

export interface BookMutationsOptions {
  refetchManageBooks: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  userId?: string;
}

export function useBookMutations({ refetchManageBooks, t, userId }: BookMutationsOptions) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pickMedia } = useMediaPicker({ aspect: [2, 3], quality: 0.85 });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingBook, setEditingBook] = useState<BookCardData | null>(null);
  const [formData, setFormData] = useState<BookFormData>(initialFormData);

  const handleBookPress = useCallback(
    (book: BookCardData) => {
      if (book.userId === userId) {
        router.push(`/book-detail?bookId=${book.id}` as Href);
      } else {
        router.push({
          pathname: '/(library)/private-book-detail',
          params: { bookId: book.id },
        } as Href);
      }
    },
    [userId, router]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleCreateFromBlueprint = async (blueprint: GeneratedBookBlueprint, bookTypeId?: string): Promise<void> => {
    try {
      const typeId = bookTypeId;
      const response = (await apiRequest('/api/v1/app/library/books', {
        method: 'POST',
        data: {
          ...blueprint,
          // AI can return null for optional string fields; send undefined so the schema accepts them
          subtitle: blueprint.subtitle ?? undefined,
          typeId,
          scope: 'shared',
          visibility: CONTENT_VISIBILITY.SHARED,
        },
      })) as { data?: { book?: { id: string }; id?: string }; book?: { id: string }; id?: string };
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED' });
      const bookId = response?.data?.book?.id || response?.data?.id || response?.book?.id || response?.id;
      if (bookId) {
        router.push(`/book-detail?bookId=${bookId}` as Href);
      }
    } catch {
      toast({
        title: t('common.error'),
        description: t('librarian.books.createFailed') || 'Failed to create book',
        variant: 'destructive',
      });
      throw new Error('Failed to create book');
    }
  };

  const updateBookMutation = useMutation({
    mutationFn: async ({ bookId, data }: { bookId: string; data: Partial<BookFormData> }) => {
      return apiRequest(`/api/v1/app/library/books/${bookId}`, {
        method: 'PATCH',
        data,
      });
    },
    onSuccess: (_data, variables) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: variables.bookId });
      setEditModalVisible(false);
      setEditingBook(null);
      setFormData(initialFormData);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('librarian.books.updateFailed') || 'Failed to update book',
        variant: 'destructive',
      });
    },
  });

  const deleteBookMutation = useMutation({
    mutationFn: async (bookId: string) => {
      if (!bookId || bookId === 'undefined') {
        throw new Error('Invalid book ID');
      }
      const response = (await apiRequest(`/api/v1/app/library/books/${bookId}`, {
        method: 'DELETE',
      })) as { success?: boolean; error?: unknown };
      if (response?.success === false) {
        throw new Error('Delete failed');
      }
      return bookId;
    },
    onMutate: async bookId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.library.manageBooks() });
      queryClient.setQueriesData(
        { queryKey: queryKeys.library.manageBooks() },
        (
          old:
            | {
                pages: Array<{ books: BookCardData[]; nextCursor: string | null; hasMore: boolean }>;
                pageParams: unknown[];
              }
            | undefined
        ) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              books: page.books.filter(book => book.id !== bookId),
            })),
          };
        }
      );
    },
    onSuccess: (_data, bookId) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_DELETED', bookId });
    },
    onError: (error, _bookId) => {
      const axiosErr = error as import('axios').AxiosError<{ message?: string; error?: { message?: string } }>;
      const errResponse = axiosErr?.response;
      const statusCode = errResponse?.status;
      const errMessage =
        errResponse?.data?.message ||
        errResponse?.data?.error?.message ||
        (error instanceof Error ? error.message : undefined);
      logger.error('[BookListScreen] Delete book failed', error instanceof Error ? error : undefined, {
        statusCode,
        errMessage,
        bookId: _bookId,
      });
      toast({
        title: t('common.error'),
        description:
          statusCode === 403
            ? t('librarian.books.deleteForbidden') || 'You do not have permission to delete this book'
            : t('librarian.books.deleteFailed') || 'Failed to delete book. Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      refetchManageBooks();
    },
  });

  const publishBookMutation = useMutation({
    mutationFn: async (bookId: string) => {
      return apiRequest(`/api/v1/app/library/books/${bookId}`, {
        method: 'PATCH',
        data: { status: BOOK_LIFECYCLE.ACTIVE },
      });
    },
    onSuccess: (_data, bookId) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_PUBLISHED', bookId });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('librarian.books.publishFailed') || 'Failed to publish book',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      refetchManageBooks();
    },
  });

  const handleUploadCover = useCallback(
    async (book: BookCardData) => {
      if (!userId) return;
      const result = await pickMedia();
      if (!result) return;

      try {
        const uploadResult = await ProfileService.uploadAvatar(result.uri, userId);
        if (!uploadResult.success || !uploadResult.data?.url) {
          toast({
            title: t('common.error'),
            description: t('bookDetail.coverUploadFailed') || 'Failed to upload cover',
            variant: 'destructive',
          });
          return;
        }

        await apiRequest(`/api/v1/app/library/books/${book.id}/cover`, {
          method: 'PUT',
          data: { url: uploadResult.data.url },
        });

        invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: book.id });
        refetchManageBooks();
      } catch {
        toast({
          title: t('common.error'),
          description: t('bookDetail.coverUploadFailed') || 'Failed to upload cover',
          variant: 'destructive',
        });
      }
    },
    [userId, pickMedia, toast, t, queryClient, refetchManageBooks]
  );

  const handleEdit = (book: BookCardData) => {
    setEditingBook(book);
    setFormData({
      title: book.title,
      subtitle: book.subtitle || '',
      description: book.description || '',
      author: book.author || '',
      category: book.category,
      visibility: book.visibility || CONTENT_VISIBILITY.SHARED,
      status: book.status || BOOK_LIFECYCLE.ACTIVE,
    });
    setEditModalVisible(true);
  };

  const handleDelete = (book: BookCardData) => {
    Alert.alert(
      t('librarian.books.deleteConfirmTitle') || 'Delete Book',
      t('librarian.books.deleteConfirmMessage', { title: book.title }) ||
        `Are you sure you want to delete "${book.title}"? This will also delete all chapters and entries.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteBookMutation.mutate(book.id) },
      ]
    );
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: t('librarian.books.titleRequired') || 'Title is required', variant: 'destructive' });
      return;
    }
    if (editingBook) {
      updateBookMutation.mutate({ bookId: editingBook.id, data: formData });
    }
  };

  return {
    editModalVisible,
    setEditModalVisible,
    editingBook,
    formData,
    setFormData,
    handleBookPress,
    handleBack,
    handleCreateFromBlueprint,
    handleEdit,
    handleDelete,
    handleSubmit,
    updateBookMutation,
    publishBookMutation,
    handleUploadCover,
    bookActions: {
      onEdit: handleEdit,
      onDelete: handleDelete,
      onPublish: (book: BookCardData) => publishBookMutation.mutate(book.id),
      onGenerateCover: handleUploadCover,
    },
  };
}
