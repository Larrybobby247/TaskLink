import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './components/shared/ProtectedRoute.jsx';

import RegisterPage from './pages/auth/RegisterPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import VerifyEmailPage from './pages/auth/VerifyEmailPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';

import RootGate from './pages/public/RootGate.jsx';
import AboutPage from './pages/public/AboutPage.jsx';
import FaqPage from './pages/public/FaqPage.jsx';
import ContactPage from './pages/public/ContactPage.jsx';
import PrivacyPage from './pages/public/PrivacyPage.jsx';
import TermsPage from './pages/public/TermsPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';

import HomePage from './pages/shared/HomePage.jsx';
import TaskListPage from './pages/shared/TaskListPage.jsx';
import TaskDetailPage from './pages/shared/TaskDetailPage.jsx';
import OrderDetailPage from './pages/shared/OrderDetailPage.jsx';
import WalletPage from './pages/shared/WalletPage.jsx';
import ProfilePage from './pages/shared/ProfilePage.jsx';
import SettingsPage from './pages/shared/SettingsPage.jsx';
import NotificationsPage from './pages/shared/NotificationsPage.jsx';
import MessagesPage from './pages/shared/MessagesPage.jsx';
import ConversationPage from './pages/shared/ConversationPage.jsx';
import ReviewsPage from './pages/shared/ReviewsPage.jsx';
import PaymentCallbackPage from './pages/shared/PaymentCallbackPage.jsx';
import HelpPage from './pages/shared/HelpPage.jsx';
import PublicProfilePage from './pages/shared/PublicProfilePage.jsx';
import SearchPage from './pages/shared/SearchPage.jsx';
import GigDetailPage from './pages/shared/GigDetailPage.jsx';
import SavedWorkersPage from './pages/shared/SavedWorkersPage.jsx';

import PostTaskPage from './pages/client/PostTaskPage.jsx';
import MyTasksPage from './pages/client/MyTasksPage.jsx';
import TaskApplicationsPage from './pages/client/TaskApplicationsPage.jsx';
import ActiveOrdersPage from './pages/client/ActiveOrdersPage.jsx';

import MyApplicationsPage from './pages/worker/MyApplicationsPage.jsx';
import MyJobsPage from './pages/worker/MyJobsPage.jsx';
import WorkerProfileSettingsPage from './pages/worker/WorkerProfileSettingsPage.jsx';
import MyGigsPage from './pages/worker/MyGigsPage.jsx';
import GigFormPage from './pages/worker/GigFormPage.jsx';

import AdminLayout from './components/layout/AdminLayout.jsx';
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx';
import AdminUsersPage from './pages/admin/AdminUsersPage.jsx';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage.jsx';
import AdminTasksPage from './pages/admin/AdminTasksPage.jsx';
import AdminGigsPage from './pages/admin/AdminGigsPage.jsx';
import AdminTransactionsPage from './pages/admin/AdminTransactionsPage.jsx';
import AdminWithdrawalsPage from './pages/admin/AdminWithdrawalsPage.jsx';
import AdminDisputesPage from './pages/admin/AdminDisputesPage.jsx';
import AdminDisputeDetailPage from './pages/admin/AdminDisputeDetailPage.jsx';
import AdminReportsPage from './pages/admin/AdminReportsPage.jsx';
import AdminSettingsPage from './pages/admin/AdminSettingsPage.jsx';
import AdminActivityLogPage from './pages/admin/AdminActivityLogPage.jsx';
import PublicLayout from './components/public/PublicLayout.jsx';

export default function App() {
  return (
    <Routes>

      {/* "/" shows the landing page to visitors and the dashboard to signed-in users */}
      <Route path="/" element={<RootGate />} />

      {/* Public marketing + legal pages */}
      <Route element={<PublicLayout />}>
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Route>
      {/* Public auth routes */}
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Paystack callback must be public */}
      <Route
        path="/payments/callback"
        element={<PaymentCallbackPage />}
      />

      {/* Authenticated app shell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/tasks" element={<TaskListPage />} />
          <Route path="/tasks/saved" element={<TaskListPage />} />
          <Route path="/tasks/create" element={<PostTaskPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />

          <Route path="/client/tasks" element={<MyTasksPage />} />
          <Route
            path="/client/tasks/:taskId/applications"
            element={<TaskApplicationsPage />}
          />
          <Route path="/client/orders" element={<ActiveOrdersPage />} />
          <Route
            path="/client/orders/:id"
            element={<OrderDetailPage />}
          />

          <Route
            path="/worker/applications"
            element={<MyApplicationsPage />}
          />
          <Route path="/worker/jobs" element={<MyJobsPage />} />
          <Route
            path="/worker/jobs/:id"
            element={<OrderDetailPage />}
          />

          {/* Gig marketplace: discovery */}
          <Route path="/search" element={<SearchPage />} />
          <Route path="/gigs/:id" element={<GigDetailPage />} />
          <Route path="/saved-workers" element={<SavedWorkersPage />} />

          {/* Gig marketplace: worker gig management */}
          <Route path="/worker/gigs" element={<MyGigsPage />} />
          <Route path="/worker/gigs/create" element={<GigFormPage />} />
          <Route path="/worker/gigs/:id/edit" element={<GigFormPage />} />

          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/pro" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/profile/:id" element={<PublicProfilePage />} />
          <Route
            path="/settings/worker-profile"
            element={<WorkerProfileSettingsPage />}
          />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route
            path="/messages/:conversationId"
            element={<ConversationPage />}
          />
          <Route
            path="/reviews/:userId"
            element={<ReviewsPage />}
          />
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
            <Route path="/admin/tasks" element={<AdminTasksPage />} />
            <Route path="/admin/gigs" element={<AdminGigsPage />} />
            <Route path="/admin/transactions" element={<AdminTransactionsPage />} />
            <Route path="/admin/withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="/admin/disputes" element={<AdminDisputesPage />} />
            <Route path="/admin/disputes/:id" element={<AdminDisputeDetailPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/activity-log" element={<AdminActivityLogPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
