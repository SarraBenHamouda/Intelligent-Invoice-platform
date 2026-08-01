import {
  Navigate,
} from 'react-router-dom';

import {
  getStoredUser,
} from '../services/authService';

function ProtectedRoute({
  children,
  allowedRole,
}) {
  const token =
    localStorage.getItem('accessToken');

  const user = getStoredUser();

  if (!token || !user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (
    allowedRole &&
    user.role !== allowedRole
  ) {
    const destination =
      user.role === 'ADMIN'
        ? '/admin'
        : '/client';

    return (
      <Navigate
        to={destination}
        replace
      />
    );
  }

  return children;
}

export default ProtectedRoute;