import { ComponentType } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface PrivateRouteProps {
  component: ComponentType;
  role?: string;
}

export default function PrivateRoute({ component: Component, role }: PrivateRouteProps) {
  const { token, user } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (role && !user?.roles?.includes(role)) {
    return <Navigate to="/" />;
  }

  return <Component />;
}
