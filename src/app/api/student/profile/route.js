import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { authenticate } from '@/lib/auth';
import { validateRegistrationNo, normalizeRegNo, validatePhone, normalizePhone } from '@/lib/validation';
import {
  DEPARTMENT_VALUES,
  getSubSpecializations,
  validateSubSpecializations,
} from '@/lib/departments';

export async function GET(request) {
  try {
    const decoded = authenticate(request);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();
    const user = await User.findById(decoded.id).select('-password_hash');
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const decoded = authenticate(request);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();
    const user = await User.findById(decoded.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { registration_no, full_name, linkedin, phone, department, sub_specialization, cv_consent } =
      await request.json();

    // Handle CV consent
    if (cv_consent !== undefined) {
      user.cv_consent = !!cv_consent;
      if (cv_consent && !user.cv_consent_at) {
        user.cv_consent_at = new Date();
      }
    }

    // Validate registration number if provided
    if (registration_no !== undefined && registration_no !== '') {
      if (!validateRegistrationNo(registration_no)) {
        return NextResponse.json(
          { error: 'Invalid registration number. Must match format: EG/20XX/XXXX (e.g., EG/2021/1234)' },
          { status: 400 }
        );
      }

      const regNo = normalizeRegNo(registration_no);

      // Check if reg_no is taken by another user
      if (regNo !== user.registration_no) {
        const existing = await User.findOne({ registration_no: regNo, _id: { $ne: user._id } });
        if (existing) {
          return NextResponse.json({ error: 'This registration number is already in use' }, { status: 409 });
        }
        user.registration_no = regNo;
      }
    }

    if (full_name !== undefined) {
      user.full_name = full_name.trim();
    }

    if (linkedin !== undefined) {
      user.linkedin = linkedin.trim();
    }

    if (phone !== undefined) {
      if (!validatePhone(phone)) {
        return NextResponse.json(
          { error: 'Invalid phone number. Use 9\u201315 digits, optionally starting with +' },
          { status: 400 }
        );
      }
      user.phone = normalizePhone(phone);
    }

    const validDepartments = DEPARTMENT_VALUES;
    if (department !== undefined) {
      if (department && !validDepartments.includes(department)) {
        return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
      }
      user.department = department || null;
      // Filter out any previously-saved sub-specializations that are no longer
      // valid for the new department.
      const check = validateSubSpecializations(user.department, user.sub_specialization || []);
      user.sub_specialization = check.valid ? check.cleaned : [];
    }

    if (sub_specialization !== undefined) {
      const targetDept = department !== undefined ? department : user.department;
      const options = getSubSpecializations(targetDept);
      const result = validateSubSpecializations(targetDept, sub_specialization);
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (options.length > 0 && result.cleaned.length === 0) {
        return NextResponse.json(
          { error: 'Please select at least one sub-specialization for your department' },
          { status: 400 }
        );
      }
      user.sub_specialization = result.cleaned;
    }

    // Mark profile as completed if reg_no, full_name, department, and cv_consent are set.
    // Also require a sub_specialization when the department offers any.
    const subOptions = getSubSpecializations(user.department);
    const currentSubs = Array.isArray(user.sub_specialization) ? user.sub_specialization : [];
    const subOk = subOptions.length === 0 || currentSubs.length > 0;
    if (user.registration_no && user.full_name && user.department && subOk && user.cv_consent) {
      user.profile_completed = true;
    } else {
      user.profile_completed = false;
    }

    await user.save();

    const updatedUser = user.toObject();
    delete updatedUser.password_hash;

    return NextResponse.json({ user: updatedUser, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
