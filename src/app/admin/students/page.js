'use client';

import { useAuth } from '@/components/AuthProvider';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiSearch, HiRefresh, HiTrash, HiEye, HiX, HiShieldCheck, HiFilter, HiExternalLink, HiDownload } from 'react-icons/hi';
import { DEPARTMENTS } from '@/lib/departments';
import ExportStudentsModal from '@/components/ExportStudentsModal';

const PERMISSION_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard', description: 'View stats and platform overview' },
  { key: 'companies', label: 'Companies', description: 'Manage companies' },
  { key: 'jobs', label: 'Job Vacancies', description: 'Manage job postings and exports' },
  { key: 'linkedin-jobs', label: 'LinkedIn Jobs', description: 'Manage LinkedIn job links' },
  { key: 'guest-posts', label: 'Guest Posts', description: 'Review guest job submissions' },
  { key: 'students', label: 'Students', description: 'Search and manage student accounts' },
  { key: 'payments', label: 'Payments', description: 'Review and approve registration fee slips' },
  { key: 'logs', label: 'Activity Logs', description: 'View admin activity history' },
];

export default function AdminStudents() {
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [bids, setBids] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [permDraft, setPermDraft] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);
  // Browse mode — table of students filtered by department
  const [browseList, setBrowseList] = useState([]);
  const [browseDepartment, setBrowseDepartment] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  async function fetchBrowseList() {
    if (!token) return;
    setBrowseLoading(true);
    try {
      const params = new URLSearchParams();
      if (browseDepartment) params.set('department', browseDepartment);
      const res = await fetch(`/api/admin/students?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load students');
        setBrowseList([]);
        return;
      }
      setBrowseList(data.students || []);
    } catch {
      toast.error('Failed to load students');
    } finally {
      setBrowseLoading(false);
    }
  }

  useEffect(() => {
    fetchBrowseList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, browseDepartment]);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!query.trim() || query.trim().length < 2) {
      toast.error('Enter at least 2 characters to search');
      return;
    }

    setSearching(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/admin/students?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStudents(data.students || []);
      if ((data.students || []).length === 0) {
        toast('No students found', { icon: '🔍' });
      }
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function viewStudent(id) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/students/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setSelected(data.student);
      setBids(data.bids || []);
      setPermDraft(Array.isArray(data.student?.admin_permissions) ? [...data.student.admin_permissions] : []);
    } catch {
      toast.error('Failed to load student');
    } finally {
      setLoadingDetail(false);
    }
  }

  function togglePerm(key) {
    setPermDraft((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  async function savePermissions(id) {
    setSavingPerms(true);
    try {
      const res = await fetch(`/api/admin/students/${id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissions: permDraft }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return; }
      toast.success('Permissions updated');
      setSelected((prev) => (prev ? { ...prev, admin_permissions: data.admin_permissions } : prev));
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setSavingPerms(false);
    }
  }

  async function resetBids(id) {
    if (!confirm('Reset all bids for this student? Credits will be refunded.')) return;
    try {
      const res = await fetch(`/api/admin/students/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(data.message);
      viewStudent(id);
      // Update student in search results
      setStudents((prev) =>
        prev.map((s) => (s._id === id ? { ...s, remaining_credits: data.remaining_credits } : s))
      );
    } catch {
      toast.error('Failed to reset bids');
    }
  }

  async function deleteStudent(id) {
    if (!confirm('Permanently delete this student account and all their bids? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/students/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success('Student account deleted');
      setSelected(null);
      setBids([]);
      setStudents((prev) => prev.filter((s) => s._id !== id));
    } catch {
      toast.error('Failed to delete student');
    }
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Student Management</h1>

      {/* Browse all students — filterable table */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">All Students</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {browseLoading ? 'Loading…' : `${browseList.length} student(s) shown`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <HiFilter className="text-gray-400" />
            <select
              value={browseDepartment}
              onChange={(e) => setBrowseDepartment(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.value}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fetchBrowseList}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <HiRefresh /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <HiDownload /> Export
            </button>
          </div>
        </div>

        {browseLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : browseList.length === 0 ? (
          <p className="p-12 text-center text-gray-400 text-sm">No students found for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Reg No</th>
                  <th className="px-4 py-3 text-left font-medium">Phone</th>
                  <th className="px-4 py-3 text-left font-medium">Dept</th>
                  <th className="px-4 py-3 text-left font-medium">Credits</th>
                  <th className="px-4 py-3 text-left font-medium">Bids</th>
                  <th className="px-4 py-3 text-left font-medium">CV</th>
                  <th className="px-4 py-3 text-left font-medium">Payment</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {browseList.map((s) => {
                  const payment = s.payment_slip_status || 'none';
                  const paymentStyle =
                    payment === 'verified'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : payment === 'pending'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : payment === 'rejected'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200';
                  return (
                    <tr
                      key={s._id}
                      className={`hover:bg-gray-50 ${
                        selected?._id === s._id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {s.avatar && (
                            <img
                              src={s.avatar}
                              alt=""
                              className="w-7 h-7 rounded-full"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{s.full_name || '—'}</p>
                            <p className="text-xs text-gray-500 truncate">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{s.registration_no || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} className="text-gray-700 hover:underline">
                            {s.phone}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.department || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-primary-600 font-medium">
                        {s.remaining_credits ?? 0}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                          {s.bids_count ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {s.cv_url ? (
                          <a
                            href={s.cv_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-green-600 hover:underline text-xs"
                          >
                            View <HiExternalLink />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${paymentStyle}`}
                        >
                          {payment}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => viewStudent(s._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 rounded hover:bg-primary-100"
                        >
                          <HiEye /> View & Bids
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, registration number, or email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-sm disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Results List */}
        <div className="lg:col-span-1">
          {students.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <p className="text-sm font-medium text-gray-600">{students.length} student(s) found</p>
              </div>
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {students.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => viewStudent(s._id)}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                      selected?._id === s._id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                    }`}
                  >
                    <p className="font-medium text-gray-900 text-sm">{s.full_name || 'No name'}</p>
                    <p className="text-xs text-gray-500">{s.registration_no || 'No reg no'}</p>
                    <p className="text-xs text-gray-400">{s.email}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Student Detail */}
        <div className="lg:col-span-2">
          {loadingDetail && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          )}

          {selected && !loadingDetail && (
            <div className="space-y-4">
              {/* Info Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {selected.avatar && (
                      <img src={selected.avatar} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                    )}
                    <div>
                      <h2 className="font-semibold text-lg text-gray-900">{selected.full_name || 'No name set'}</h2>
                      <p className="text-sm text-gray-500">{selected.email}</p>
                    </div>
                  </div>
                  <button onClick={() => { setSelected(null); setBids([]); setPermDraft([]); }} className="text-gray-400 hover:text-gray-600">
                    <HiX />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Reg No</p>
                    <p className="font-medium">{selected.registration_no || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Department</p>
                    <p className="font-medium">{selected.department || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Phone (WhatsApp)</p>
                    <p className="font-medium">
                      {selected.phone ? (
                        <a href={`tel:${selected.phone}`} className="text-primary-600 hover:underline">
                          {selected.phone}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Credits</p>
                    <p className="font-medium text-primary-600">{selected.remaining_credits}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">CV</p>
                    <p className="font-medium">
                      {selected.cv_url ? (
                        <a href={selected.cv_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                          Uploaded ✓
                        </a>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-5 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => resetBids(selected._id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition text-sm font-medium"
                  >
                    <HiRefresh /> Reset All Bids
                  </button>
                  <button
                    onClick={() => deleteStudent(selected._id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition text-sm font-medium"
                  >
                    <HiTrash /> Delete Account
                  </button>
                </div>
              </div>

              {/* Bids */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Bids ({bids.length})</h3>
                </div>
                {bids.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400">No bids placed</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {bids.map((bid) => (
                      <div key={bid._id} className="p-4 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{bid.job_id?.title || 'Unknown Position'}</p>
                          <p className="text-xs text-gray-500">
                            {bid.job_id?.company_id?.name || 'Unknown Company'} · {new Date(bid.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {bid.cv_url && (
                            <a href={bid.cv_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">
                              CV ✓
                            </a>
                          )}
                          <span className="text-sm font-medium text-primary-600">-{bid.credits_spent}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Admin Permissions (super-admin only) */}
              {isSuperAdmin && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                    <HiShieldCheck className="text-primary-600" />
                    <h3 className="font-semibold text-gray-900">Admin Dashboard Access</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-gray-500">
                      Select which admin tabs this student can access. API endpoints for unselected tabs will reject their requests.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PERMISSION_OPTIONS.map((opt) => {
                        const checked = permDraft.includes(opt.key);
                        return (
                          <label
                            key={opt.key}
                            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                              checked ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePerm(opt.key)}
                              className="mt-0.5"
                            />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                              <p className="text-xs text-gray-500">{opt.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => savePermissions(selected._id)}
                        disabled={savingPerms}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium disabled:opacity-50"
                      >
                        {savingPerms ? 'Saving...' : 'Save Permissions'}
                      </button>
                      {permDraft.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPermDraft([])}
                          disabled={savingPerms}
                          className="px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition text-sm font-medium"
                        >
                          Clear all
                        </button>
                      )}
                      <p className="text-xs text-gray-400 self-center">
                        {permDraft.length === 0
                          ? 'No admin access'
                          : `${permDraft.length} tab(s) granted`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!selected && !loadingDetail && students.length > 0 && (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 flex items-center justify-center p-12">
              <p className="text-gray-400 text-sm flex items-center gap-2"><HiEye /> Select a student to view details</p>
            </div>
          )}
        </div>
      </div>

      <ExportStudentsModal open={exportOpen} onClose={() => setExportOpen(false)} token={token} />
    </div>
  );
}
