import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Job from '@/models/Job';
import Bid from '@/models/Bid';
import User from '@/models/User';
import Company from '@/models/Company';
import { requirePermission, isValidObjectId, ADMIN_PERMISSIONS } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { sendJobAlertEmails } from '@/lib/email';
import { invalidateCompanyCaches } from '@/lib/cache';

export async function GET(request) {
  try {
    await requirePermission(request, ADMIN_PERMISSIONS.JOBS);
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');

    const filter = companyId ? { company_id: companyId } : {};
    const jobs = await Job.find(filter).populate('company_id', 'name logo').sort({ created_at: -1 }).lean();
    const bidCounts = await Bid.aggregate([
      { $match: { job_id: { $in: jobs.map((job) => job._id) } } },
      { $group: { _id: '$job_id', count: { $sum: 1 } } },
    ]);
    const bidCountByJob = new Map(bidCounts.map(({ _id, count }) => [String(_id), count]));
    const jobsWithBidCounts = jobs.map((job) => ({
      ...job,
      bid_count: bidCountByJob.get(String(job._id)) || 0,
    }));
    return NextResponse.json({ jobs: jobsWithBidCounts });
  } catch (error) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await requirePermission(request, ADMIN_PERMISSIONS.JOBS);
    await dbConnect();

    const { company_id, title, description, credit_cost, departments, max_applicants, deadline } = await request.json();

    if (!company_id || !isValidObjectId(company_id)) {
      return NextResponse.json({ error: 'Valid company is required' }, { status: 400 });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Company and title are required' }, { status: 400 });
    }

    if (title.length > 300) {
      return NextResponse.json({ error: 'Title is too long' }, { status: 400 });
    }

    if (description && description.length > 5000) {
      return NextResponse.json({ error: 'Description is too long' }, { status: 400 });
    }

    const parsedCost = parseInt(credit_cost, 10);
    if (!parsedCost || parsedCost < 1) {
      return NextResponse.json({ error: 'Credit cost must be a positive integer' }, { status: 400 });
    }

    const parsedMax = max_applicants ? parseInt(max_applicants, 10) : null;
    if (parsedMax !== null && (isNaN(parsedMax) || parsedMax < 1)) {
      return NextResponse.json({ error: 'Max applicants must be a positive integer' }, { status: 400 });
    }

    const job = await Job.create({
      company_id,
      title,
      description: description || '',
      credit_cost: parsedCost,
      max_applicants: parsedMax,
      deadline: deadline ? new Date(deadline) : null,
      departments: departments || [],
    });
    await logActivity(admin.id, 'job_created', 'job', job._id, `Created job "${title}"`);
    await invalidateCompanyCaches();

    // Send email alerts to students in relevant departments (non-blocking)
    try {
      const depts = departments || [];
      const userFilter = { role: 'student', profile_completed: true };
      if (depts.length > 0) {
        userFilter.$or = [
          { department: { $in: depts } },
          { department: null },
        ];
      }
      const students = await User.find(userFilter).select('email').lean();
      const emails = students.map((s) => s.email).filter(Boolean);

      if (emails.length > 0) {
        const company = await Company.findById(company_id).select('name').lean();
        sendJobAlertEmails({
          recipients: emails,
          jobTitle: title,
          companyName: company?.name || 'Unknown Company',
          creditCost: parsedCost,
          deadline: deadline ? new Date(deadline) : null,
          departments: depts,
        }).catch((err) => console.error('Failed to send job alert emails:', err));
      }
    } catch (emailErr) {
      console.error('Job alert email setup error:', emailErr);
    }

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
