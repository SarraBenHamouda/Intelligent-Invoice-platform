import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import PublicLayout from './layouts/PublicLayout';

import HomePage from './pages/public/HomePage';
import FeaturesPage from './pages/public/FeaturesPage';
import SecurityPage from './pages/public/SecurityPage';
import DemoPage from './pages/public/DemoPage';
import AboutPage from './pages/public/AboutPage';
import ContactPage from './pages/public/ContactPage';

import AuthPage from './pages/AuthPage';
import ClientDashboard from './pages/ClientDashboard';
import AdminDashboard from './pages/AdminDashboard';

import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route
            path="/"
            element={<HomePage />}
          />

          <Route
            path="/fonctionnalites"
            element={<FeaturesPage />}
          />

          <Route
            path="/securite"
            element={<SecurityPage />}
          />

          <Route
            path="/demonstration"
            element={<DemoPage />}
          />

          <Route
            path="/a-propos"
            element={<AboutPage />}
          />

          <Route
            path="/contact"
            element={<ContactPage />}
          />
        </Route>

        <Route
          path="/auth"
          element={<AuthPage />}
        />

        <Route
          path="/login"
          element={
            <Navigate
              to="/auth?mode=login"
              replace
            />
          }
        />

        <Route
          path="/register"
          element={
            <Navigate
              to="/auth?mode=register"
              replace
            />
          }
        />

        <Route
          path="/client"
          element={
            <ProtectedRoute
              allowedRole="CLIENT"
            >
              <ClientDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;