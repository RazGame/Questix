import { ComponentType } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface PrivateRouteProps {
  component: ComponentType;
  role?: string;
  roles?: string[]; // достаточно любой из перечисленных ролей
}

export default function PrivateRoute({ component: Component, role, roles }: PrivateRouteProps) {
  const { token, user } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" />;
  }

  const requiredRoles = roles ?? (role ? [role] : []);

  if (
    requiredRoles.length > 0 &&
    !requiredRoles.some((r) => user?.roles?.includes(r))
  ) {
    return <Navigate to="/" />;
  }

  return <Component />;
}
