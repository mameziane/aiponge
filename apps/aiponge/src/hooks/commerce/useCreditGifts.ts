/**
 * useCreditGifts Hook
 * Manages credit gifting operations: send, receive, claim
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUser } from '../../auth/store';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { wrapErrorHandler } from '../system/useAppQuery';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

export interface CreditGift {
  id: string;
  senderId: string;
  recipientEmail: string;
  creditsAmount: number;
  message?: string;
  status: 'pending' | 'claimed' | 'expired';
  createdAt: string;
  claimedAt?: string;
  expiresAt: string;
  senderName?: string;
  recipientName?: string;
  claimToken?: string;
}

interface SendGiftInput {
  recipientEmail: string;
  creditsAmount: number;
  message?: string;
}

type SendGiftResponse = ServiceResponse<{
  giftId: string;
  creditsAmount: number;
  recipientEmail: string;
  expiresAt: string;
}>;

type ClaimGiftResponse = ServiceResponse<{
  creditsReceived: number;
}>;

type GiftsListResponse = ServiceResponse<CreditGift[]>;

export function useCreditGifts() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const sentGiftsQuery = useQuery({
    queryKey: ['credits', 'gifts', 'sent', user?.id],
    queryFn: async (): Promise<CreditGift[]> => {
      const response = await apiClient.get<GiftsListResponse>(`/api/v1/app/credits/gifts/sent`);
      return response.data || [];
    },
    staleTime: QUERY_STALE_TIME.medium,
    enabled: !!user,
  });

  const receivedGiftsQuery = useQuery({
    queryKey: ['credits', 'gifts', 'received', user?.id],
    queryFn: async (): Promise<CreditGift[]> => {
      const response = await apiClient.get<GiftsListResponse>(`/api/v1/app/credits/gifts/received`);
      return response.data || [];
    },
    staleTime: QUERY_STALE_TIME.medium,
    enabled: !!user,
  });

  const sendGiftMutation = useMutation({
    mutationFn: async (input: SendGiftInput) => {
      const response = await apiClient.post<SendGiftResponse>('/api/v1/app/credits/gifts/send', input);
      return response;
    },
    onSuccess: data => {
      invalidateOnEvent(queryClient, { type: 'CREDIT_GIFT_SENT' });
      toast({
        title: t('credits.gifts.sent'),
        variant: 'default',
      });
    },
    onError: wrapErrorHandler(toast, t, 'Send Gift', undefined, {
      customTitle: t('credits.gifts.sendFailed'),
    }),
  });

  const claimGiftMutation = useMutation({
    mutationFn: async (claimToken: string) => {
      const response = await apiClient.post<ClaimGiftResponse>('/api/v1/app/credits/gifts/claim', { claimToken });
      return response;
    },
    onSuccess: data => {
      invalidateOnEvent(queryClient, { type: 'CREDIT_GIFT_CLAIMED' });
      toast({
        title: t('credits.gifts.claimed'),
        description: t('credits.gifts.claimedDescription', {
          amount: data.data!.creditsReceived,
        }),
        variant: 'default',
      });
    },
    onError: wrapErrorHandler(toast, t, 'Claim Gift', undefined, {
      customTitle: t('credits.gifts.claimFailed'),
    }),
  });

  const pendingReceivedGifts = (Array.isArray(receivedGiftsQuery.data) ? receivedGiftsQuery.data : []).filter(
    (g: CreditGift) => g.status === 'pending'
  );

  const claimedReceivedGifts = (Array.isArray(receivedGiftsQuery.data) ? receivedGiftsQuery.data : []).filter(
    (g: CreditGift) => g.status === 'claimed'
  );

  return {
    sentGifts: sentGiftsQuery.data || [],
    receivedGifts: receivedGiftsQuery.data || [],
    pendingReceivedGifts,
    claimedReceivedGifts,
    isLoading: sentGiftsQuery.isLoading || receivedGiftsQuery.isLoading,
    isError: sentGiftsQuery.isError || receivedGiftsQuery.isError,
    refetch: () => {
      sentGiftsQuery.refetch();
      receivedGiftsQuery.refetch();
    },
    sendGift: sendGiftMutation.mutateAsync,
    isSending: sendGiftMutation.isPending,
    claimGift: claimGiftMutation.mutateAsync,
    isClaiming: claimGiftMutation.isPending,
  };
}
