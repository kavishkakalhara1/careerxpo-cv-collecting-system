'use client';

import { useAuth } from '@/components/AuthProvider';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { HiOfficeBuilding, HiBriefcase, HiChartBar, HiUserGroup, HiClipboardList, HiInbox, HiGlobeAlt, HiKey, HiCash } from 'react-icons/hi';

const ADMIN_LINKS = [
  { href: '/admin', label: 'Stats', icon: <HiChartBar />, permission: 'dashboard' },
  { href: '/admin/companies', label: 'Companies', icon: <HiOfficeBuilding />, permission: 'companies' },
  { href: '/admin/jobs', label: 'Job Vacancies', icon: <HiBriefcase />, permission: 'jobs' },
  { href: '/admin/linkedin-jobs', label: 'LinkedIn Jobs', icon: <HiGlobeAlt />, permission: 'linkedin-jobs' },
  { href: '/admin/guest-posts', label: 'Guest Posts', icon: <HiInbox />, permission: 'guest-posts' },
  { href: '/admin/students', label: 'Students', icon: <HiUserGroup />, permission: 'students' },
  { href: '/admin/payments', label: 'Payments', icon: <HiCash />, permission: 'payments' },
  { href: '/admin/admins', label: 'Admins', icon: <HiKey />, superAdminOnly: true },
  { href: '/admin/logs', label: 'Activity Logs', icon: <HiClipboardList />, permission: 'logs' },
];

function isSuperAdmin(user) {
  return !!user && user.role === 'admin';
}

function hasAnyAdminAccess(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return Array.isArray(user.admin_permissions) && user.admin_permissions.length > 0;
}

function findActiveLink(pathname) {
  // Prefer the longest matching href so e.g. /admin/companies wins over /admin
  return [...ADMIN_LINKS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((l) => pathname === l.href || pathname.startsWith(l.href + '/'));
}

function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const visibleLinks = useMemo(() => {
    if (isSuperAdmin(user)) return ADMIN_LINKS;
    const perms = new Set(user?.admin_permissions || []);
    return ADMIN_LINKS.filter((l) => !l.superAdminOnly && perms.has(l.permission));
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!hasAnyAdminAccess(user)) {
      router.push('/login');
      return;
    }
    if (isSuperAdmin(user)) return;
    // Sub-admin: redirect away from tabs they do not have permission for
    const active = findActiveLink(pathname);
    const perms = new Set(user?.admin_permissions || []);
    const canAccess = active && !active.superAdminOnly && perms.has(active.permission);
    if (active && !canAccess) {
      const fallback = visibleLinks[0]?.href || '/student';
      router.replace(fallback);
    }
  }, [user, loading, router, pathname, visibleLinks]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!hasAnyAdminAccess(user)) return null;

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden flex flex-col">
      <Navbar />
      <div className="flex flex-1 min-w-0 max-w-full">
        <Sidebar links={visibleLinks} />
        <main className="flex-1 min-w-0 max-w-full p-4 sm:p-6 md:p-8">{children}</main>
      </div>
      <Footer />
    </div>
  );
}

export default function AdminLayout({ children }) {
  return (
    <AdminGuard>{children}</AdminGuard>
  );
}
