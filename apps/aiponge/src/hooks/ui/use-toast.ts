// React Native compatible toast hook (stub)
import { Alert } from 'react-native';

export interface ToastProps {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const toast = ({ title, description, variant }: ToastProps) => {
    // Use React Native Alert as a simple toast replacement
    Alert.alert(title, description);
  };

  return { toast };
}
