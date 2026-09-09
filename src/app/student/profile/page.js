'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiUpload, HiDocumentText, HiPencil, HiCheck, HiCash, HiCheckCircle, HiClock, HiXCircle } from 'react-icons/hi';
import { DEPARTMENTS, getSubSpecializations } from '@/lib/departments';
import PaymentSlipModal, { BANK_DETAILS, BankRow } from '@/components/PaymentSlipModal';

export default function ProfilePage() {
  const { user, token, updateUser } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedBank, setCopiedBank] = useState('');

  function copyBankValue(text, key) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedBank(key);
      setTimeout(() => setCopiedBank(''), 1500);
    });
  }
  const [slipModalOpen, setSlipModalOpen] = useState(false);
  // Admin can globally disable the payment slip upload flow.
  const [paymentUploadsEnabled, setPaymentUploadsEnabled] = useState(true);
  const initialForm = {
    registration_no: '',
    full_name: '',
    linkedin: '',
    phone: '',
    department: '',
    sub_specialization: [],
    cv_consent: false,
  };
  const [form, setForm] = useState(initialForm);
  const [savedForm, setSavedForm] = useState(initialForm);
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const departments = DEPARTMENTS;
  const subSpecializations = getSubSpecializations(form.department);
  const requiresSubSpecialization = subSpecializations.length > 0;

  useEffect(() => {
    if (user) {
      const next = {
        registration_no: user.registration_no || '',
        full_name: user.full_name || '',
        linkedin: user.linkedin || '',
        phone: user.phone || '',
        department: user.department || '',
        sub_specialization: Array.isArray(user.sub_specialization)
          ? user.sub_specialization
          : user.sub_specialization
            ? [user.sub_specialization]
            : [],
        cv_consent: user.cv_consent || false,
      };
      setForm(next);
      setSavedForm(next);
    }
  }, [user]);

  // Load the admin-controlled payment-slip toggle so we know whether to
  // render the Registration Fee section at all.
  useEffect(() => {
    if (!token) return;
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.payment_slip_enabled === 'boolean') {
          setPaymentUploadsEnabled(data.payment_slip_enabled);
        }
      })
      .catch(() => {});
  }, [token]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);

    // Accept LinkedIn URLs without a scheme (e.g. "linkedin.com/in/foo")
    // by prepending https:// on submit. Empty values are left alone so the
    // field remains optional.
    const payload = { ...form };
    const raw = (payload.linkedin || '').trim();
    if (raw && !/^https?:\/\//i.test(raw)) {
      payload.linkedin = `https://${raw.replace(/^\/+/, '')}`;
    } else {
      payload.linkedin = raw;
    }

    try {
      const res = await fetch('/api/student/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success('Profile updated successfully!');
      updateUser(data.user);
      setSavedForm({ ...form, linkedin: payload.linkedin });

      const justActivated = !user?.profile_completed && data.user?.profile_completed;
      if (justActivated) {
        router.push('/student');
      }
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('cv', file);

    try {
      const res = await fetch('/api/student/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success('CV uploaded successfully!');
      updateUser({ cv_url: data.cv_url, cv_drive_id: data.cv_drive_id });
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

      {!user?.profile_completed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-amber-800 font-medium">Complete your profile</p>
          <p className="text-sm text-amber-700 mt-1">
            Please add your registration number, full name, and department to complete your profile setup.
          </p>
        </div>
      )}

      {/* Profile Details Form */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 mb-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <HiPencil /> Profile Details
        </h2>

        {user?.email && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Email (Google)</label>
            <p className="text-gray-900 flex items-center gap-2">
              {user.avatar && (
                <img src={user.avatar} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
              )}
              {user.email}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number *</label>
          <input
            type="text"
            value={form.registration_no}
            onChange={(e) => {
              let val = e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, '');
              // Auto-insert slashes: EG/XXXX/XXXX
              const digits = val.replace(/[^A-Z0-9]/g, '');
              if (digits.length <= 2) {
                val = digits;
              } else if (digits.length <= 6) {
                val = digits.slice(0, 2) + '/' + digits.slice(2);
              } else {
                val = digits.slice(0, 2) + '/' + digits.slice(2, 6) + '/' + digits.slice(6, 10);
              }
              setForm({ ...form, registration_no: val });
            }}
            maxLength={12}
            placeholder="EG/2021/1234"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
          />
          <p className="text-xs text-gray-400 mt-1">Format: EG/20XX/XXXX (e.g., EG/2021/1234)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Your full name"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
          <select
            value={form.department}
            onChange={(e) => {
              const nextDept = e.target.value;
              const nextOptions = getSubSpecializations(nextDept);
              setForm({
                ...form,
                department: nextDept,
                // Keep only sub_specializations that are valid for the new department.
                sub_specialization: form.sub_specialization.filter((s) => nextOptions.includes(s)),
              });
            }}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
          >
            <option value="">Select your department</option>
            {departments.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {form.department && requiresSubSpecialization && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Sub-specializations *</label>
              <span className="text-xs text-gray-400">
                {form.sub_specialization.length} selected
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">Select all that apply.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {subSpecializations.map((s) => {
                const checked = form.sub_specialization.includes(s);
                return (
                  <label
                    key={s}
                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition text-sm ${
                      checked
                        ? 'border-primary-500 bg-primary-50 text-primary-800'
                        : 'border-gray-300 hover:border-gray-400 text-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          sub_specialization: e.target.checked
                            ? [...form.sub_specialization, s]
                            : form.sub_specialization.filter((v) => v !== s),
                        });
                      }}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span>{s}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn Profile</label>
          <input
            type="text"
            inputMode="url"
            value={form.linkedin}
            onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
            placeholder="linkedin.com/in/yourprofile"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
          />
          <p className="text-xs text-gray-400 mt-1">You can paste it with or without <span className="font-mono">https://</span>.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number (WhatsApp preferred)
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+\s-]/g, '') })}
            placeholder="+94 71 234 5678"
            maxLength={20}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
          />
          <p className="text-xs text-gray-400 mt-1">
            Please provide a number reachable on WhatsApp so companies and organizers can contact you.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.cv_consent}
              onChange={(e) => setForm({ ...form, cv_consent: e.target.checked })}
              className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              I agree to share my CV and profile information with companies I bid on through CareerXpo. 
              I understand that my data will be handled in accordance with the{' '}
              <a href="/privacy" target="_blank" className="text-primary-600 hover:underline">Privacy Policy</a>{' '}
              and{' '}
              <a href="/terms" target="_blank" className="text-primary-600 hover:underline">Terms of Service</a>.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={
            saving ||
            !isDirty ||
            !form.cv_consent ||
            (requiresSubSpecialization && form.sub_specialization.length === 0)
          }
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <HiCheck />
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Account Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        <div className="flex justify-between">
          <div>
            <label className="text-sm font-medium text-gray-500">Remaining Credits</label>
            <p className="text-lg font-semibold text-primary-600 mt-1">{user?.remaining_credits ?? 0} credits</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Account Created</label>
            <p className="text-gray-900 mt-1">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Basic Resume Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <HiDocumentText /> Basic Resume
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload a general resume. You can also upload company-specific resumes when you bid on companies.
        </p>

        {user?.cv_url ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-700 font-medium">Basic Resume Uploaded ✓</p>
            <a
              href={user.cv_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:underline"
            >
              View on Google Drive →
            </a>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-amber-700">No basic resume uploaded yet. Please upload your resume in PDF format.</p>
          </div>
        )}

        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-sm">
          <HiUpload />
          {uploading ? 'Uploading...' : user?.cv_url ? 'Re-upload Resume' : 'Upload Resume (PDF)'}
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-400 mt-2">
          PDF only, max 5MB.
        </p>
      </div>

      {/* Registration Fee — Bank Slip. Hidden when admins disable uploads,
          unless this student already has a submission on record (so they can
          still see its status). */}
      {(paymentUploadsEnabled || user?.payment_slip_url) && (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <HiCash className="text-emerald-600 text-xl" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">Registration Fee</h2>
            <p className="text-sm text-gray-500">
              A one-time registration fee of <span className="font-semibold text-gray-800">LKR 500</span> is required.
              Deposit the fee to the bank account and upload the slip below. Please include your registration number
              {user?.registration_no ? (
                <span className="font-semibold"> ({user.registration_no}) </span>
              ) : (
                ' '
              )}
              as the payment reference.
            </p>
          </div>
        </div>

        <SlipStatusBanner status={user?.payment_slip_status || 'none'} uploaded={!!user?.payment_slip_url} user={user} />

        {/* Bank details are shown here (in addition to inside the modal) so
            students can copy them without having to open the submission form. */}
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">Bank Details</p>
          <dl className="text-sm text-gray-700 space-y-1.5">
            <BankRow
              label="Bank"
              value={BANK_DETAILS.bankName}
              onCopy={() => copyBankValue(BANK_DETAILS.bankName, 'bank')}
              copied={copiedBank === 'bank'}
            />
            <BankRow
              label="Branch"
              value={BANK_DETAILS.branch}
              onCopy={() => copyBankValue(BANK_DETAILS.branch, 'branch')}
              copied={copiedBank === 'branch'}
            />
            <BankRow
              label="Account Name"
              value={BANK_DETAILS.accountName}
              onCopy={() => copyBankValue(BANK_DETAILS.accountName, 'name')}
              copied={copiedBank === 'name'}
            />
            <BankRow
              label="Account No."
              value={BANK_DETAILS.accountNumber}
              onCopy={() => copyBankValue(BANK_DETAILS.accountNumber, 'acc')}
              copied={copiedBank === 'acc'}
            />
            <BankRow
              label="Reference"
              value={user?.registration_no || '—'}
              onCopy={() => user?.registration_no && copyBankValue(user.registration_no, 'ref')}
              copied={copiedBank === 'ref'}
            />
          </dl>
          <p className="text-xs text-gray-500 mt-3">
            Include your registration number in the payment reference so we can match your slip.
          </p>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <button
            type="button"
            onClick={() => setSlipModalOpen(true)}
            disabled={!user?.registration_no || !paymentUploadsEnabled}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <HiCash />
            {user?.payment_slip_url ? 'Re-submit Bank Slip' : 'Submit Bank Slip'}
          </button>
          {!user?.registration_no && (
            <p className="text-xs text-amber-600">
              Add your registration number above and save your profile first.
            </p>
          )}
          {!paymentUploadsEnabled && (
            <p className="text-xs text-amber-600">
              Payment slip uploads are currently closed. Your submitted slip stays on record.
            </p>
          )}
          {user?.payment_slip_url && (
            <a
              href={user.payment_slip_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:underline"
            >
              View submitted slip →
            </a>
          )}
        </div>
      </div>
      )}

      <PaymentSlipModal
        open={slipModalOpen}
        onClose={() => setSlipModalOpen(false)}
        token={token}
        user={user}
        onSuccess={(data) =>
          updateUser({
            payment_slip_url: data.payment_slip_url,
            payment_slip_drive_id: data.payment_slip_drive_id,
            payment_slip_uploaded_at: data.payment_slip_uploaded_at,
            payment_slip_status: data.payment_slip_status,
            payment_details: data.payment_details,
          })
        }
      />
    </div>
  );
}

function SlipStatusBanner({ status, uploaded, user }) {
  if (!uploaded) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        No bank slip submitted yet.
      </div>
    );
  }

  const uploadedAt = user?.payment_slip_uploaded_at
    ? new Date(user.payment_slip_uploaded_at).toLocaleString()
    : null;

  const map = {
    pending: {
      cls: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: <HiClock className="text-blue-600 text-lg shrink-0" />,
      label: 'Pending verification',
    },
    verified: {
      cls: 'bg-green-50 border-green-200 text-green-800',
      icon: <HiCheckCircle className="text-green-600 text-lg shrink-0" />,
      label: 'Verified',
    },
    rejected: {
      cls: 'bg-red-50 border-red-200 text-red-800',
      icon: <HiXCircle className="text-red-600 text-lg shrink-0" />,
      label: 'Rejected — please re-submit',
    },
  };
  const entry = map[status] || map.pending;

  return (
    <div className={`border rounded-lg p-3 text-sm flex items-start gap-2 ${entry.cls}`}>
      {entry.icon}
      <div className="min-w-0">
        <p className="font-medium">{entry.label}</p>
        {uploadedAt && <p className="text-xs opacity-80 mt-0.5">Submitted on {uploadedAt}</p>}
      </div>
    </div>
  );
}
