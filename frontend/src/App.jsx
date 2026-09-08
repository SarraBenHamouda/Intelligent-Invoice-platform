import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";

/*
|--------------------------------------------------------------------------
| PUBLIC WEBSITE
|--------------------------------------------------------------------------
*/

import HomePage from "./pages/public/HomePage";

import FeaturesPage from "./pages/public/FeaturesPage/FeaturesPage.jsx";

import SecurityPage from "./pages/public/SecurityPage/SecurityPage.jsx";

import DemoPage from "./pages/public/DemoPage";

import AboutPage from "./pages/public/AboutPage";

import ContactPage from "./pages/public/ContactPage";

/*
|--------------------------------------------------------------------------
| PUBLIC QR VERIFICATION
|--------------------------------------------------------------------------
*/

import QrVerificationResult from "./pages/public/QrVerificationResult.jsx";

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

import AuthPage from "./pages/AuthPage";

import GitHubCallback from "./pages/GitHubCallback";

import ForgotPasswordPage from "./pages/ForgotPasswordPage";

import ResetPasswordPage from "./pages/ResetPasswordPage";

/*
|--------------------------------------------------------------------------
| CLIENT
|--------------------------------------------------------------------------
*/

import ClientDashboard from "./pages/public/client/ClientDashboard/ClientDashboard";

import InvoiceListPage from "./pages/public/client/List/InvoiceListPage.jsx";

import InvoiceUploadPage from "./pages/public/client/InvoiceUploadPage.jsx";

import InvoiceDetailPage from "./pages/public/client/InvoiceDetailPage/InvoiceDetailPage.jsx";

import ProfilePage from "./pages/public/client/Profile/ProfilePage.jsx";

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

import AdminDashboard from "./pages/public/admin/AdminDashboard/AdminDashboard.jsx";

import AdminProfilePage from "./pages/public/admin/AdminProfile/AdminProfile.jsx";

import AdminInvoicesPage from "./pages/public/admin/AdminInvoices/AdminInvoices.jsx";

import AdminClientsPage from "./pages/public/admin/AdminClientsPage/AdminClientsPage.jsx";

import AdminUsersPage from "./pages/public/admin/AdminUsersPage/AdminUsersPage.jsx";

import AdminErrorsPage from "./pages/public/admin/AdminErrors/AdminErrorsPage.jsx";

import AdminInvoiceDetailsPage from "./pages/public/admin/AdminInvoiceDetails/AdminInvoiceDetails.jsx";

import AdminSystemPage from "./pages/public/admin/AdminSystem/AdminSystem.jsx";

import AdminExecutionsPage from "./pages/public/admin/AdminExecutions/AdminExecutionsPage.jsx";

/*
|--------------------------------------------------------------------------
| ADMIN RETRIES
|--------------------------------------------------------------------------
*/

import AdminRetriesPage from "./pages/public/admin/AdminRetries/AdminRetriesPage.jsx";

/*
|--------------------------------------------------------------------------
| ADMIN REPORTS / STATISTICS
|--------------------------------------------------------------------------
*/

import AdminReportsPage from "./pages/public/admin/AdminReportsPage/AdminReportsPage.jsx";
/*
|--------------------------------------------------------------------------
| ADMIN AUDIT
|--------------------------------------------------------------------------
*/

import AdminAuditPage from "./pages/public/admin/AdminAudit/AdminAuditPage.jsx";

/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/

import ProtectedRoute from "./components/ProtectedRoute";

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*
        |--------------------------------------------------------------------------
        | PUBLIC WEBSITE
        |--------------------------------------------------------------------------
        */}

        <Route
          element={
            <PublicLayout />
          }
        >
          <Route
            path="/"
            element={
              <HomePage />
            }
          />

          <Route
            path="/fonctionnalites"
            element={
              <FeaturesPage />
            }
          />

          <Route
            path="/securite"
            element={
              <SecurityPage />
            }
          />

          <Route
            path="/demonstration"
            element={
              <DemoPage />
            }
          />

          <Route
            path="/a-propos"
            element={
              <AboutPage />
            }
          />

          <Route
            path="/contact"
            element={
              <ContactPage />
            }
          />
        </Route>

        {/*
        |--------------------------------------------------------------------------
        | PUBLIC QR VERIFICATION
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/verify/:token"
          element={
            <QrVerificationResult />
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | AUTHENTICATION
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/auth"
          element={
            <AuthPage />
          }
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

        {/*
        |--------------------------------------------------------------------------
        | FORGOT PASSWORD
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/forgot-password"
          element={
            <ForgotPasswordPage />
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | RESET PASSWORD
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/reset-password"
          element={
            <ResetPasswordPage />
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | GITHUB CALLBACK
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/oauth/github/callback"
          element={
            <GitHubCallback />
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | CLIENT ROOT
        |--------------------------------------------------------------------------
        */}

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

        {/*
        |--------------------------------------------------------------------------
        | CLIENT PROFILE
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/client/profile"
          element={
            <ProtectedRoute
              allowedRole="CLIENT"
            >
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | CLIENT INVOICES
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/client/invoices"
          element={
            <ProtectedRoute
              allowedRole="CLIENT"
            >
              <InvoiceListPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | CLIENT INVOICE UPLOAD
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/client/invoices/upload"
          element={
            <ProtectedRoute
              allowedRole="CLIENT"
            >
              <InvoiceUploadPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | CLIENT INVOICE DETAIL
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/client/invoices/:id"
          element={
            <ProtectedRoute
              allowedRole="CLIENT"
            >
              <InvoiceDetailPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN ROOT
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin"
          element={
            <Navigate
              to="/admin/dashboard"
              replace
            />
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN DASHBOARD
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN PROFILE
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/profile"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminProfilePage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN INVOICES
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/invoices"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminInvoicesPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN INVOICE DETAIL
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/invoices/:id"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminInvoiceDetailsPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN CLIENTS
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/clients"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminClientsPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN USERS
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN ERRORS / ANOMALIES
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/errors"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminErrorsPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN EXECUTIONS
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/executions"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminExecutionsPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN RETRIES / RELANCES
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/retries"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminRetriesPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN REPORTS / STATISTIQUES
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminReportsPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN AUDIT / JOURNAL D'ACTIVITE
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminAuditPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | ADMIN SYSTEM
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/admin/system"
          element={
            <ProtectedRoute
              allowedRole="ADMIN"
            >
              <AdminSystemPage />
            </ProtectedRoute>
          }
        />

        {/*
        |--------------------------------------------------------------------------
        | FALLBACK
        |--------------------------------------------------------------------------
        */}

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