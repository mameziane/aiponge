import { createContext, useContext, useState, useCallback, useMemo, type ReactNode, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

interface CreateAction {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

interface AdminCreateContextValue {
  createAction: CreateAction | null;
  registerCreateAction: (action: CreateAction | null) => void;
}

const AdminCreateContext = createContext<AdminCreateContextValue>({
  createAction: null,
  registerCreateAction: () => {},
});

export function AdminCreateProvider({ children }: { children: ReactNode }) {
  const [createAction, setCreateAction] = useState<CreateAction | null>(null);

  const registerCreateAction = useCallback((action: CreateAction | null) => {
    setCreateAction(action);
  }, []);

  const value = useMemo(() => ({ createAction, registerCreateAction }), [createAction, registerCreateAction]);

  return <AdminCreateContext.Provider value={value}>{children}</AdminCreateContext.Provider>;
}

export function useAdminCreateAction() {
  return useContext(AdminCreateContext);
}
