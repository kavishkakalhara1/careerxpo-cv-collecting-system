'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiX, HiDownload } from 'react-icons/hi';
import { DEPARTMENTS } from '@/lib/departments';

const COLUMNS = [
  { header: 'Full Name', get: (s) => s.full_name || '' },
  { header: 'Registration No', get: (s) => s.registration_no || '' },
  { header: 'Email', get: (s) => s.email || '' },
  { header: 'Phone (WhatsApp)', get: (s) => s.phone || '' },
  { header: 'Department', get: (s) => s.department || '' },
  {
    header: 'Sub-specializations',
    get: (s) => (Array.isArray(s.sub_specialization) ? s.sub_specialization.join(', ') : ''),
  },
  { header: 'LinkedIn', get: (s) => s.linkedin || '' },
  { header: 'Credits', get: (s) => s.remaining_credits ?? 0 },
  { header: 'Bids', get: (s) => s.bids_count ?? 0 },
  { header: 'Profile Completed', get: (s) => (s.profile_completed ? 'Yes' : 'No') },
  { header: 'CV URL', get: (s) => s.cv_url || '' },
  { header: 'Payment Status', get: (s) => s.payment_slip_status || 'none' },
  {
    header: 'Payment Submitted At',
    get: (s) =>
      s.payment_slip_uploaded_at ? new Date(s.payment_slip_uploaded_at).toLocaleString() : '',
  },
  {
    header: 'Registered At',
    get: (s) => (s.created_at ? new Date(s.created_at).toLocaleString() : ''),
  },
];

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function exportRows(rows, fileBase, format) {
  const XLSX = await import('xlsx');
  const aoa = [COLUMNS.map((c) => c.header), ...rows.map((r) => COLUMNS.map((c) => c.get(r)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLUMNS.map((c, idx) => {
    const maxLen = aoa.reduce((max, row) => {
      const val = row[idx];
      return Math.max(max, val == null ? 0 : String(val).length);
    }, c.header.length);
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');

  if (format === 'csv') {
    XLSX.writeFile(wb, `${fileBase}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  }
}

export default function ExportStudentsModal({ open, onClose, token }) {
  const [department, setDepartment] = useState('');
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDepartment('');
      setFormat('xlsx');
      setBusy(false);
    }
  }, [open]);

  const fileBase = useMemo(
    () => ['students', department || 'all-depts', todayStamp()].join('_'),
    [department]
  );

  if (!open) return null;

  async function handleExport() {
    if (!token) {
      toast.error('Not authenticated.');
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (department) params.set('department', department);
      params.set('limit', '2000');
      params.set('sort', 'name');
      const res = await fetch(`/api/admin/students?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load students');
        return;
      }
      const rows = data.students || [];
      if (rows.length === 0) {
        toast.error('No matching students to export.');
        return;
      }

      await exportRows(rows, fileBase, format);
      toast.success(`Exported ${rows.length} student${rows.length === 1 ? '' : 's'}.`);
      onClose?.();
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Export Students</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <HiX className="text-xl" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">File format</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'xlsx', label: 'Excel (.xlsx)' },
                { value: 'csv', label: 'CSV (.csv)' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer text-sm ${
                    format === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-800'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="student-export-format"
                    value={opt.value}
                    checked={format === opt.value}
                    onChange={() => setFormat(opt.value)}
                    disabled={busy}
                    className="accent-primary-600"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Includes name, registration number, email, phone (WhatsApp), department, credits, bids
            and payment status. Up to 2000 students are exported.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            <HiDownload />
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
