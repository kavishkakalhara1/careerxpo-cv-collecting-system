'use client';

import { useAuth } from '@/components/AuthProvider';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiUserGroup,
  HiDocumentText,
  HiChartBar,
  HiCurrencyDollar,
  HiCheckCircle,
  HiShieldCheck,
  HiAcademicCap,
  HiExclamationCircle,
  HiBriefcase,
  HiOfficeBuilding,
  HiGlobeAlt,
  HiInbox,
  HiDownload,
} from 'react-icons/hi';

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDepartment, setCreditDepartment] = useState('all');
  const [addingCredits, setAddingCredits] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentDepartment, setPaymentDepartment] = useState('all');

  const DEPARTMENT_OPTIONS = [
    { value: 'all', label: 'All Departments' },
    { value: 'DEIE', label: 'DEIE' },
    { value: 'DMME', label: 'DMME' },
    { value: 'COM', label: 'COM' },
    { value: 'DCEE', label: 'DCEE' },
    { value: 'DMENA', label: 'DMENA' },
  ];

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const vacancyStats = Array.isArray(stats?.vacancy_stats) ? stats.vacancy_stats : [];
  const companies = useMemo(() => {
    const unique = new Map(vacancyStats.map((job) => [String(job.company_id), job.company_name]));
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [vacancyStats]);

  const getVacancyStatus = (job) => {
    if (job.is_closed) return 'closed';
    if (job.deadline && new Date(job.deadline) < new Date()) return 'expired';
    return 'open';
  };

  const filteredVacancies = vacancyStats.filter((job) => {
    const createdAt = new Date(job.created_at);
    if (companyFilter !== 'all' && String(job.company_id) !== companyFilter) return false;
    if (statusFilter !== 'all' && getVacancyStatus(job) !== statusFilter) return false;
    if (dateFrom && createdAt < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && createdAt > new Date(`${dateTo}T23:59:59.999`)) return false;
    return true;
  });

  function downloadVacancyReport() {
    const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = filteredVacancies.map((job) => [
      job.title,
      job.company_name,
      getVacancyStatus(job),
      job.total_bids,
      job.max_applicants || 'Unlimited',
      job.max_applicants ? `${Math.round((job.total_bids / job.max_applicants) * 100)}%` : '',
      job.credit_cost,
      job.credits_spent,
      job.created_at ? new Date(job.created_at).toISOString() : '',
      job.deadline ? new Date(job.deadline).toISOString() : '',
      job.first_bid_at ? new Date(job.first_bid_at).toISOString() : '',
      job.last_bid_at ? new Date(job.last_bid_at).toISOString() : '',
    ]);
    const headings = ['Vacancy', 'Company', 'Status', 'Bids', 'Max Applicants', 'Fill Rate', 'Credits Per Bid', 'Credits Spent', 'Created', 'Deadline', 'First Bid', 'Last Bid'];
    const csv = [headings, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `careerxpo-vacancy-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadPaymentReport() {
    const rows = (stats?.by_department || []).map((department) => [
      department.department,
      department.count,
      department.payment_statuses?.verified || 0,
      department.payment_statuses?.pending || 0,
      department.payment_statuses?.rejected || 0,
      department.payment_statuses?.none || 0,
    ]);
    const csv = [
      ['Department', 'Students', 'Verified', 'Pending', 'Rejected', 'No Submission'],
      ...rows,
    ].map((row) => row.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `careerxpo-payment-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const totalStudents = stats?.total_students ?? 0;
  const totalCvs = stats?.total_cvs ?? 0;
  const totalProfileCompleted = stats?.total_profile_completed ?? 0;
  const totalCvConsent = stats?.total_cv_consent ?? 0;
  const unassignedDepartment = stats?.unassigned_department ?? 0;
  const byDepartment = Array.isArray(stats?.by_department) ? stats.by_department : [];
  const selectedPaymentStatuses = paymentDepartment === 'all'
    ? stats?.payment_statuses
    : byDepartment.find((department) => department.department === paymentDepartment)?.payment_statuses;

  const pct = (part, total) => {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  };

  // Colour palette per department so charts stay visually distinct.
  const DEPT_COLORS = {
    DEIE: { bar: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700', ring: 'ring-blue-200' },
    DMME: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200' },
    COM: { bar: 'bg-purple-500', chip: 'bg-purple-100 text-purple-700', ring: 'ring-purple-200' },
    DCEE: { bar: 'bg-orange-500', chip: 'bg-orange-100 text-orange-700', ring: 'ring-orange-200' },
    DMENA: { bar: 'bg-cyan-500', chip: 'bg-cyan-100 text-cyan-700', ring: 'ring-cyan-200' },
  };
  const fallbackColor = { bar: 'bg-gray-500', chip: 'bg-gray-100 text-gray-700', ring: 'ring-gray-200' };
  const colorFor = (dept) => DEPT_COLORS[dept] || fallbackColor;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Stats</h1>
        <p className="text-sm text-gray-500 mt-1">Website activity, student readiness, and vacancy bidding performance</p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-100 rounded-lg">
              <HiUserGroup className="text-primary-600 text-xl" />
            </div>
            <p className="text-sm text-gray-500">Total Students</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <HiDocumentText className="text-green-600 text-xl" />
            </div>
            <p className="text-sm text-gray-500">CVs Uploaded</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalCvs}</p>
          <p className="text-xs text-gray-400 mt-1">{pct(totalCvs, totalStudents)}% of students</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-teal-100 rounded-lg">
              <HiCheckCircle className="text-teal-600 text-xl" />
            </div>
            <p className="text-sm text-gray-500">Profiles Completed</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalProfileCompleted}</p>
          <p className="text-xs text-gray-400 mt-1">{pct(totalProfileCompleted, totalStudents)}% of students</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <HiShieldCheck className="text-indigo-600 text-xl" />
            </div>
            <p className="text-sm text-gray-500">CV Consent Granted</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalCvConsent}</p>
          <p className="text-xs text-gray-400 mt-1">{pct(totalCvConsent, totalStudents)}% of students</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Companies', value: stats?.overview?.total_companies ?? 0, icon: HiOfficeBuilding, color: 'text-blue-600 bg-blue-50' },
          { label: 'Vacancies', value: stats?.overview?.total_jobs ?? 0, detail: `${stats?.overview?.open_jobs ?? 0} open`, icon: HiBriefcase, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total Bids', value: stats?.overview?.total_bids ?? 0, detail: `${stats?.overview?.unique_bidders ?? 0} students`, icon: HiChartBar, color: 'text-orange-600 bg-orange-50' },
          { label: 'Credits Spent', value: stats?.overview?.credits_spent ?? 0, icon: HiCurrencyDollar, color: 'text-rose-600 bg-rose-50' },
          { label: 'LinkedIn Jobs', value: stats?.overview?.total_linkedin_jobs ?? 0, detail: `${stats?.overview?.active_linkedin_jobs ?? 0} active`, icon: HiGlobeAlt, color: 'text-cyan-600 bg-cyan-50' },
          { label: 'Guest Posts', value: stats?.overview?.total_guest_posts ?? 0, detail: `${stats?.guest_post_statuses?.pending ?? 0} pending`, icon: HiInbox, color: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, detail, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
            <div className={`p-2 rounded-lg ${color}`}><Icon className="text-lg" /></div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
              {detail && <p className="text-xs text-gray-400">{detail}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Payment Verification</h2>
              <p className="text-xs text-gray-500 mt-1">Student payment status by department</p>
            </div>
            <div className="flex items-end gap-2">
              <label className="text-xs text-gray-500">Department
                <select value={paymentDepartment} onChange={(e) => setPaymentDepartment(e.target.value)} className="block mt-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700">
                  {DEPARTMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button onClick={downloadPaymentReport} title="Download payment statistics by department" className="h-10 inline-flex items-center gap-2 px-3 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700">
                <HiDownload /> CSV
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['verified', 'pending', 'rejected', 'none'].map((status) => (
              <div key={status} className="bg-gray-50 rounded-md p-3">
                <p className="text-xs text-gray-500 capitalize">{status === 'none' ? 'No submission' : status}</p>
                <p className="text-xl font-semibold text-gray-900 tabular-nums">{selectedPaymentStatuses?.[status] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Guest Vacancy Submissions</h2>
          <div className="grid grid-cols-3 gap-3">
            {['pending', 'approved', 'rejected'].map((status) => (
              <div key={status} className="bg-gray-50 rounded-md p-3">
                <p className="text-xs text-gray-500 capitalize">{status}</p>
                <p className="text-xl font-semibold text-gray-900 tabular-nums">{stats?.guest_post_statuses?.[status] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Student Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 mb-8">
        <div className="p-5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-50 rounded-lg">
              <HiAcademicCap className="text-primary-600 text-lg" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Student Preferences</h2>
              <p className="text-xs text-gray-500">Distribution by department and sub-specialization</p>
            </div>
          </div>
          {unassignedDepartment > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
              <HiExclamationCircle />
              {unassignedDepartment} student{unassignedDepartment !== 1 ? 's' : ''} without a department
            </div>
          )}
        </div>

        <div className="p-5 space-y-6">
          {/* Department distribution */}
          <div>
            <div className="flex justify-between items-baseline mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Department distribution</h3>
              <span className="text-xs text-gray-400">Share of {totalStudents} student{totalStudents !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {byDepartment.map((d) => {
                const color = colorFor(d.department);
                const percent = pct(d.count, totalStudents);
                return (
                  <div key={d.department}>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${color.chip} shrink-0`}>
                          {d.department}
                        </span>
                        <span className="text-gray-600 truncate">{d.label}</span>
                      </div>
                      <span className="text-gray-700 font-medium shrink-0 tabular-nums">
                        {d.count} <span className="text-gray-400 font-normal">({percent}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color.bar} transition-all`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {byDepartment.length === 0 && (
                <p className="text-sm text-gray-500">No student data yet.</p>
              )}
            </div>
          </div>

          {/* Per-department detail cards */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Sub-specialization breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {byDepartment.map((d) => {
                const color = colorFor(d.department);
                const deptTotal = d.count;
                const subs = d.sub_specializations || [];
                const hasKnownSubs = subs.some((s) => s.sub_specialization !== null);
                return (
                  <div
                    key={d.department}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${color.chip} shrink-0`}>
                          {d.department}
                        </span>
                        <p className="text-sm font-medium text-gray-900 truncate">{d.label}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{deptTotal}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                      <div className="bg-gray-50 rounded-md p-2 text-center">
                        <p className="text-gray-500">Profiles</p>
                        <p className="font-semibold text-gray-900">
                          {d.profile_completed}
                          <span className="text-gray-400 font-normal">/{deptTotal}</span>
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-md p-2 text-center">
                        <p className="text-gray-500">CVs</p>
                        <p className="font-semibold text-gray-900">
                          {d.with_cv}
                          <span className="text-gray-400 font-normal">/{deptTotal}</span>
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-md p-2 text-center">
                        <p className="text-gray-500">Consent</p>
                        <p className="font-semibold text-gray-900">
                          {d.cv_consent}
                          <span className="text-gray-400 font-normal">/{deptTotal}</span>
                        </p>
                      </div>
                    </div>

                    {hasKnownSubs ? (
                      <div className="space-y-2">
                        {subs.map((s) => {
                          const label = s.sub_specialization === null ? 'Not specified' : s.sub_specialization;
                          const isUnspecified = s.sub_specialization === null;
                          const percent = pct(s.count, deptTotal);
                          if (isUnspecified && s.count === 0) return null;
                          return (
                            <div key={label}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={isUnspecified ? 'text-gray-400 italic' : 'text-gray-700'}>
                                  {label}
                                </span>
                                <span className="text-gray-500 tabular-nums">
                                  {s.count} <span className="text-gray-400">({percent}%)</span>
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${isUnspecified ? 'bg-gray-300' : color.bar} transition-all`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No sub-specializations configured for this department.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 mb-8 overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Vacancy Bidding Report</h2>
            <p className="text-xs text-gray-500 mt-1">Dates filter by vacancy creation date</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-500">Company
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="block mt-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700">
                <option value="all">All companies</option>
                {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block mt-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700">
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <label className="text-xs text-gray-500">From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700" />
            </label>
            <label className="text-xs text-gray-500">To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700" />
            </label>
            <button onClick={downloadVacancyReport} disabled={filteredVacancies.length === 0} className="h-10 inline-flex items-center gap-2 px-3 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-40">
              <HiDownload /> CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Vacancy', 'Status', 'Bids', 'Capacity', 'Fill Rate', 'Credits Used', 'First Bid', 'Last Bid', 'Created'].map((heading) => (
                  <th key={heading} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredVacancies.map((job) => {
                const status = getVacancyStatus(job);
                const fillRate = job.max_applicants ? Math.round((job.total_bids / job.max_applicants) * 100) : null;
                return (
                  <tr key={job._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{job.title}</p><p className="text-xs text-gray-500">{job.company_name}</p></td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium capitalize px-2 py-1 rounded-full ${status === 'open' ? 'bg-green-100 text-green-700' : status === 'expired' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'}`}>{status}</span></td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums">{job.total_bids}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{job.max_applicants || 'Unlimited'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fillRate === null ? 'N/A' : `${fillRate}%`}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">{job.credits_spent || 0}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{job.first_bid_at ? new Date(job.first_bid_at).toLocaleDateString() : 'None'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{job.last_bid_at ? new Date(job.last_bid_at).toLocaleDateString() : 'None'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(job.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
              {filteredVacancies.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No vacancies match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 text-xs text-gray-500">Showing {filteredVacancies.length} of {vacancyStats.length} vacancies</div>
      </div>

      {/* Bulk Credit Top-Up */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 rounded-lg">
            <HiCurrencyDollar className="text-amber-600 text-xl" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Add Credits to Students</h2>
            <p className="text-sm text-gray-500">Increase student credit balances by a fixed amount — either for all students or a specific department</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const amount = parseInt(creditAmount, 10);
            if (!amount || amount < 1) { toast.error('Enter a valid positive number'); return; }
            const scopeLabel = creditDepartment === 'all' ? 'ALL students' : `${creditDepartment} students`;
            if (!confirm(`Add ${amount} credits to ${scopeLabel}?`)) return;
            setAddingCredits(true);
            try {
              const res = await fetch('/api/admin/credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ amount, department: creditDepartment }),
              });
              const data = await res.json();
              if (!res.ok) { toast.error(data.error); return; }
              toast.success(data.message);
              setCreditAmount('');
            } catch {
              toast.error('Failed to add credits');
            } finally {
              setAddingCredits(false);
            }
          }}
          className="flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={creditDepartment}
              onChange={(e) => setCreditDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
            >
              {DEPARTMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Credits to add</label>
            <input
              type="number"
              min="1"
              max="10000"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="e.g. 50"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={addingCredits}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium text-sm disabled:opacity-50"
          >
            {addingCredits
              ? 'Adding...'
              : creditDepartment === 'all'
                ? 'Add to All Students'
                : `Add to ${creditDepartment}`}
          </button>
        </form>
      </div>
    </div>
  );
}
