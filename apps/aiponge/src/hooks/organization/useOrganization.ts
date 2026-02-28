import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../../lib/axiosApiClient';
import type { Branding } from '../../auth/types';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

export interface Organization {
  id: string;
  name: string;
  slug?: string | null;
  branding: Branding;
  ownerUserId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  email: string;
  name?: string;
  organizationId?: string;
}

export function useOrganization(userId?: string) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<ApiEnvelope<Organization>>('/api/v1/app/organizations/me');
      if (response?.success && response?.data) {
        setOrganization(response.data);
      } else {
        setOrganization(null);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number }; message?: string };
      if (axiosErr?.response?.status === 404) {
        setOrganization(null);
      } else {
        setError(axiosErr?.message || 'Failed to load organization');
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const createOrganization = useCallback(async (name: string, branding?: Partial<Branding>) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post<ApiEnvelope<Organization>>('/api/v1/app/organizations', { name, branding });
      if (response?.success && response?.data) {
        setOrganization(response.data);
        return response.data;
      }
      throw new Error('Failed to create organization');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = axiosErr?.response?.data?.error || axiosErr?.message || 'Failed to create organization';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOrganization = useCallback(
    async (orgId: string, updates: { name?: string; branding?: Partial<Branding> }) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.patch<ApiEnvelope<Organization>>(
          `/api/v1/app/organizations/${orgId}`,
          updates
        );
        if (response?.success && response?.data) {
          setOrganization(response.data);
          return response.data;
        }
        throw new Error('Failed to update organization');
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
        const msg = axiosErr?.response?.data?.error || axiosErr?.message || 'Failed to update organization';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const fetchMembers = useCallback(async (orgId: string) => {
    try {
      const response = await apiClient.get<ApiEnvelope<OrganizationMember[]>>(
        `/api/v1/app/organizations/${orgId}/members`
      );
      if (response?.success && response?.data) {
        setMembers(response.data);
      }
    } catch (err: unknown) {
      // silently fail for members list
    }
  }, []);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  return {
    organization,
    members,
    isLoading,
    error,
    fetchOrganization,
    createOrganization,
    updateOrganization,
    fetchMembers,
  };
}
