// React Native compatible toast hook (stub)
import { useCallback } from 'react';
import { Alert } from 'react-native';

export interface ToastProps {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const toast = useCallback(({ title, description }: ToastProps) => {
    Alert.alert(title, description);
  }, []);

  return { toast };
}
