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

  const handleCreateFromBlueprint = async (
    blueprint: GeneratedBookBlueprint,
    bookTypeId?: string,
    options?: { skipNavigation?: boolean; visibility?: string }
  ): Promise<void> => {
    try {
      const vis = options?.visibility || CONTENT_VISIBILITY.PERSONAL;
      const response = (await apiRequest('/api/v1/app/library/books', {
        method: 'POST',
        timeout: 30000, // Book creation is slow (creates chapters + entries) — 30s to avoid gateway timeout
        data: {
          ...blueprint,
          // AI can return null for optional string fields; send undefined so the schema accepts them
          subtitle: blueprint.subtitle ?? undefined,
          typeId: bookTypeId,
          scope: vis === CONTENT_VISIBILITY.PERSONAL ? 'personal' : 'shared',
          visibility: vis,
          // Personal books must be writable so the user can edit generated entries
          ...(vis === CONTENT_VISIBILITY.PERSONAL && { isReadOnly: false }),
        },
      })) as { success?: boolean; data?: { book?: { id: string }; id?: string }; book?: { id: string }; id?: string };

      // Always invalidate book caches — even if bookId extraction fails the book may exist
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED' });

      if (response?.success === false) {
        logger.warn('[useBookMutations] Book creation returned success:false', {
          blueprintTitle: blueprint.title,
          responseKeys: response ? Object.keys(response) : [],
        });
        toast({
          title: t('common.error'),
          description: t('librarian.books.createFailed') || 'Failed to create book',
          variant: 'destructive',
        });
        return;
      }

      const bookId = response?.data?.book?.id || response?.data?.id || response?.book?.id || response?.id;
      if (!bookId) {
        // Book likely created but response shape unexpected — log for debugging
        logger.warn('[useBookMutations] Book created but bookId not found in response', {
          blueprintTitle: blueprint.title,
          responseKeys: response ? Object.keys(response) : [],
          dataKeys: response?.data ? Object.keys(response.data) : [],
        });
      }
      if (bookId && !options?.skipNavigation) {
        router.push(`/book-detail?bookId=${bookId}` as Href);
      }
    } catch (error) {
      // Invalidate caches even on error — the server may have created the book
      // before the error occurred (timeout, partial failure, etc.)
      try {
        invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED' });
      } catch {
        // Best-effort cache invalidation
      }

      // Detect timeout errors — the book may have been created successfully on the server
      // despite the client receiving a timeout. Show a softer message instead of "Failed".
      const isTimeout =
        error instanceof Error &&
        (error.message?.includes('timeout') || (error as { code?: string }).code === 'ECONNABORTED');

      logger.error('[useBookMutations] Create book from blueprint failed', error instanceof Error ? error : undefined, {
        blueprintTitle: blueprint.title,
        bookTypeId,
        visibility: options?.visibility,
        isTimeout,
      });

      if (isTimeout) {
        // Don't show a destructive error — the book is likely being created
        toast({
          title: t('common.info', { defaultValue: 'Info' }),
          description:
            t('librarian.books.creatingInBackground', {
              defaultValue: 'Your book is being created. It may take a moment to appear.',
            }) || 'Your book is being created. It may take a moment to appear.',
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('librarian.books.createFailed') || 'Failed to create book',
          variant: 'destructive',
        });
        throw error;
      }
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
    onError: (error, variables) => {
      logger.error('[useBookMutations] Update book failed', error instanceof Error ? error : undefined, {
        bookId: variables.bookId,
        updatedFields: Object.keys(variables.data),
      });
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
    onError: (error, bookId) => {
      logger.error('[useBookMutations] Publish book failed', error instanceof Error ? error : undefined, {
        bookId,
      });
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
      } catch (error) {
        logger.error('[useBookMutations] Upload cover failed', error instanceof Error ? error : undefined, {
          bookId: book.id,
          bookTitle: book.title,
        });
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
