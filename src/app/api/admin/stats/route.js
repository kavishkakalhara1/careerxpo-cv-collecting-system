import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import Bid from '@/models/Bid';
import Job from '@/models/Job';
import Company from '@/models/Company';
import LinkedInJob from '@/models/LinkedInJob';
import GuestPost from '@/models/GuestPost';
import { requirePermission, ADMIN_PERMISSIONS } from '@/lib/auth';
import { cacheGetOrSet, CacheKeys, CacheTTL } from '@/lib/cache';
import { DEPARTMENTS, SUB_SPECIALIZATIONS } from '@/lib/departments';

export async function GET(request) {
  try {
    await requirePermission(request, ADMIN_PERMISSIONS.DASHBOARD);

    const stats = await cacheGetOrSet(
      CacheKeys.adminStats(),
      CacheTTL.adminStats,
      async () => {
        await dbConnect();
        const [
          totalStudents,
          studentsWithCV,
          totalProfileCompleted,
          totalCvConsent,
          departmentAgg,
          subSpecAgg,
          bidsPerJob,
          totalCompanies,
          totalJobs,
          openJobs,
          totalBids,
          uniqueBidders,
          creditsSpentAgg,
          activeLinkedInJobs,
          totalLinkedInJobs,
          paymentStatusAgg,
          guestPostStatusAgg,
          vacancyStats,
        ] = await Promise.all([
          User.countDocuments({ role: 'student' }),
          User.countDocuments({ role: 'student', cv_drive_id: { $ne: null } }),
          User.countDocuments({ role: 'student', profile_completed: true }),
          User.countDocuments({ role: 'student', cv_consent: true }),
          User.aggregate([
            { $match: { role: 'student' } },
            {
              $group: {
                _id: { $ifNull: ['$department', null] },
                count: { $sum: 1 },
                with_cv: {
                  $sum: { $cond: [{ $ne: ['$cv_drive_id', null] }, 1, 0] },
                },
                profile_completed: {
                  $sum: { $cond: [{ $eq: ['$profile_completed', true] }, 1, 0] },
                },
                cv_consent: {
                  $sum: { $cond: [{ $eq: ['$cv_consent', true] }, 1, 0] },
                },
              },
            },
          ]),
          User.aggregate([
            { $match: { role: 'student', department: { $ne: null } } },
            {
              // Preserve students that have no sub_specialization picked
              // so they are counted as "Not specified" per department.
              $unwind: {
                path: '$sub_specialization',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $group: {
                _id: {
                  department: '$department',
                  sub_specialization: { $ifNull: ['$sub_specialization', null] },
                },
                count: { $sum: 1 },
              },
            },
          ]),
          Bid.aggregate([
            { $group: { _id: '$job_id', total_bids: { $sum: 1 } } },
            { $lookup: { from: 'jobs', localField: '_id', foreignField: '_id', as: 'job' } },
            { $unwind: '$job' },
            { $lookup: { from: 'companies', localField: 'job.company_id', foreignField: '_id', as: 'company' } },
            { $unwind: '$company' },
            { $project: { job_title: '$job.title', company_name: '$company.name', total_bids: 1 } },
            { $sort: { total_bids: -1 } },
          ]),
          Company.countDocuments(),
          Job.countDocuments(),
          Job.countDocuments({
            is_closed: false,
            $or: [{ deadline: null }, { deadline: { $gte: new Date() } }],
          }),
          Bid.countDocuments(),
          Bid.distinct('user_id').then((ids) => ids.length),
          Bid.aggregate([{ $group: { _id: null, total: { $sum: '$credits_spent' } } }]),
          LinkedInJob.countDocuments({ is_active: true }),
          LinkedInJob.countDocuments(),
          User.aggregate([
            { $match: { role: 'student' } },
            { $group: { _id: '$payment_slip_status', count: { $sum: 1 } } },
          ]),
          GuestPost.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          Job.aggregate([
            { $lookup: { from: 'bids', localField: '_id', foreignField: 'job_id', as: 'bids' } },
            { $lookup: { from: 'companies', localField: 'company_id', foreignField: '_id', as: 'company' } },
            { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                title: 1,
                company_id: 1,
                company_name: { $ifNull: ['$company.name', 'Unknown Company'] },
                credit_cost: 1,
                max_applicants: 1,
                deadline: 1,
                is_closed: 1,
                created_at: 1,
                total_bids: { $size: '$bids' },
                credits_spent: { $sum: '$bids.credits_spent' },
                first_bid_at: { $min: '$bids.timestamp' },
                last_bid_at: { $max: '$bids.timestamp' },
              },
            },
            { $sort: { created_at: -1 } },
          ]),
        ]);

        // Build a department -> stats map from the aggregation.
        const deptMap = new Map();
        let unassignedDepartment = 0;
        for (const row of departmentAgg) {
          if (row._id === null) {
            unassignedDepartment = row.count;
            continue;
          }
          deptMap.set(row._id, row);
        }

        // Build a department -> sub-specialization -> count map.
        const subMap = new Map();
        for (const row of subSpecAgg) {
          const dept = row._id.department;
          const sub = row._id.sub_specialization;
          if (!subMap.has(dept)) subMap.set(dept, new Map());
          subMap.get(dept).set(sub, row.count);
        }

        // Assemble per-department response, seeding every known department (even if 0)
        // and every known sub-specialization option so the UI can show a complete picture.
        const byDepartment = DEPARTMENTS.map((d) => {
          const row = deptMap.get(d.value);
          const knownSubs = SUB_SPECIALIZATIONS[d.value] || [];
          const deptSubMap = subMap.get(d.value) || new Map();

          const subBreakdown = knownSubs.map((s) => ({
            sub_specialization: s,
            count: deptSubMap.get(s) || 0,
          }));

          // Include students in this department whose sub_specialization is
          // missing (null) or does not match any known option (legacy/other).
          let unspecified = 0;
          for (const [sub, count] of deptSubMap.entries()) {
            if (sub === null || !knownSubs.includes(sub)) {
              unspecified += count;
            }
          }
          if (unspecified > 0 || knownSubs.length === 0) {
            subBreakdown.push({ sub_specialization: null, count: unspecified });
          }

          return {
            department: d.value,
            label: d.label,
            count: row?.count || 0,
            with_cv: row?.with_cv || 0,
            profile_completed: row?.profile_completed || 0,
            cv_consent: row?.cv_consent || 0,
            sub_specializations: subBreakdown,
          };
        });

        const toCountMap = (rows) => Object.fromEntries(rows.map((row) => [row._id || 'none', row.count]));
        const paymentStatuses = toCountMap(paymentStatusAgg);
        const guestPostStatuses = toCountMap(guestPostStatusAgg);

        return {
          total_students: totalStudents,
          total_cvs: studentsWithCV,
          total_profile_completed: totalProfileCompleted,
          total_cv_consent: totalCvConsent,
          unassigned_department: unassignedDepartment,
          by_department: byDepartment,
          bids_per_job: bidsPerJob,
          overview: {
            total_companies: totalCompanies,
            total_jobs: totalJobs,
            open_jobs: openJobs,
            closed_jobs: totalJobs - openJobs,
            total_bids: totalBids,
            unique_bidders: uniqueBidders,
            credits_spent: creditsSpentAgg[0]?.total || 0,
            total_linkedin_jobs: totalLinkedInJobs,
            active_linkedin_jobs: activeLinkedInJobs,
            total_guest_posts: Object.values(guestPostStatuses).reduce((sum, count) => sum + count, 0),
          },
          payment_statuses: paymentStatuses,
          guest_post_statuses: guestPostStatuses,
          vacancy_stats: vacancyStats,
        };
      }
    );

    return NextResponse.json(stats);
  } catch (error) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
