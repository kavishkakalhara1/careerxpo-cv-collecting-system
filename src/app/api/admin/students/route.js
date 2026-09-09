import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import Bid from '@/models/Bid';
import { requirePermission, ADMIN_PERMISSIONS } from '@/lib/auth';
import { DEPARTMENT_VALUES } from '@/lib/departments';

// GET /api/admin/students
// Two modes:
//  - Search mode: ?q=... returns up to 20 matching students (name/reg_no/email).
//  - Browse mode: any other query (or empty) returns a paginated, sortable
//    list with per-student bid counts and payment status. Supports:
//       ?department=DEIE
//       ?limit=<int, max 2000>
//       ?sort=recent|name|reg_no|bids (default: recent)
export async function GET(request) {
  try {
    await requirePermission(request, ADMIN_PERMISSIONS.STUDENTS);
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    // Users who have been granted any admin capability (e.g. lecturers with
    // sub-admin permissions) are not "students" for the purposes of these
    // listings. Exclude anyone whose admin_permissions array is non-empty.
    const notLecturer = {
      $or: [
        { admin_permissions: { $exists: false } },
        { admin_permissions: { $size: 0 } },
      ],
    };

    // Search mode — preserves the original behaviour used by the search bar.
    if (q) {
      if (q.length < 2) {
        return NextResponse.json({ students: [] });
      }
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const students = await User.find({
        role: 'student',
        ...notLecturer,
        $and: [
          {
            $or: [
              { full_name: { $regex: escaped, $options: 'i' } },
              { registration_no: { $regex: escaped, $options: 'i' } },
              { email: { $regex: escaped, $options: 'i' } },
            ],
          },
        ],
      })
        .select('-password_hash')
        .limit(20)
        .sort({ created_at: -1 });

      return NextResponse.json({ students });
    }

    // Browse mode — table view with department filter.
    const department = (searchParams.get('department') || '').trim();
    const sort = (searchParams.get('sort') || 'recent').trim();
    const limitRaw = Number(searchParams.get('limit') || 100);
    const limit = Math.max(1, Math.min(2000, Number.isFinite(limitRaw) ? limitRaw : 100));

    const filter = { role: 'student', ...notLecturer };
    if (department) {
      if (!DEPARTMENT_VALUES.includes(department)) {
        return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
      }
      filter.department = department;
    }

    let sortSpec = { created_at: -1 };
    if (sort === 'name') sortSpec = { full_name: 1 };
    else if (sort === 'reg_no') sortSpec = { registration_no: 1 };

    const students = await User.find(filter)
      .select(
        'full_name email registration_no department sub_specialization phone avatar remaining_credits ' +
          'cv_url profile_completed payment_slip_status payment_slip_uploaded_at ' +
          'linkedin created_at'
      )
      .sort(sortSpec)
      .limit(limit)
      .lean();

    // Aggregate bid counts in a single query so we don't hit the DB per row.
    const ids = students.map((s) => s._id);
    const bidCountsAgg = ids.length
      ? await Bid.aggregate([
          { $match: { user_id: { $in: ids } } },
          { $group: { _id: '$user_id', count: { $sum: 1 } } },
        ])
      : [];
    const bidCounts = new Map(bidCountsAgg.map((row) => [String(row._id), row.count]));

    const enriched = students.map((s) => ({
      ...s,
      bids_count: bidCounts.get(String(s._id)) || 0,
    }));

    if (sort === 'bids') {
      enriched.sort((a, b) => (b.bids_count || 0) - (a.bids_count || 0));
    }

    return NextResponse.json({ students: enriched, mode: 'browse' });
  } catch (error) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

