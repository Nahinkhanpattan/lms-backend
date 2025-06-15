const asyncHandler = require('express-async-handler');
const InstructorApplication = require('../models/instructorApplicationModel');
const User = require('../models/userModel');
const nodemailer = require('nodemailer');
const Joi = require('joi');

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Submit instructor application
 * @route   POST /api/instructor-applications
 * @access  Public
 */
const submitApplication = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    profile: Joi.object({
      bio: Joi.string().required(),
      expertise: Joi.string().required(),
      experience: Joi.string().required(),
      education: Joi.string().required(),
      linkedinUrl: Joi.string().uri().allow(''),
      githubUrl: Joi.string().uri().allow(''),
      portfolioUrl: Joi.string().uri().allow('')
    }).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { name, email, password, profile } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(400);
    throw new Error('User with this email already exists');
  }

  // Check if application already exists
  const existingApplication = await InstructorApplication.findOne({ email });
  if (existingApplication) {
    res.status(400);
    throw new Error('Application with this email already exists');
  }

  // Create instructor application
  const application = await InstructorApplication.create({
    name,
    email,
    password, // Will be hashed by the model pre-save hook
    profile,
    status: 'pending'
  });

  // Send notification email to admin
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: 'New Instructor Application - LMS Platform',
      html: `
        <h2>New Instructor Application</h2>
        <p>A new instructor application has been submitted:</p>
        <ul>
          <li><strong>Name:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Expertise:</strong> ${profile.expertise}</li>
          <li><strong>Experience:</strong> ${profile.experience}</li>
        </ul>
        <p>Please review the application in the admin dashboard.</p>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send admin notification email:', error);
  }

  res.status(201).json({
    success: true,
    message: 'Instructor application submitted successfully',
    applicationId: application._id
  });
});

/**
 * Get all instructor applications
 * @route   GET /api/instructor-applications
 * @access  Private/Admin
 */
const getApplications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status;

  let filter = {};
  if (status) {
    filter.status = status;
  }

  const applications = await InstructorApplication.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-password'); // Exclude password from response

  const total = await InstructorApplication.countDocuments(filter);

  res.json({
    applications,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get application by ID
 * @route   GET /api/instructor-applications/:id
 * @access  Private/Admin
 */
const getApplicationById = asyncHandler(async (req, res) => {
  const application = await InstructorApplication.findById(req.params.id).select('-password');

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  res.json(application);
});

/**
 * Approve instructor application
 * @route   PUT /api/instructor-applications/:id/approve
 * @access  Private/Admin
 */
const approveApplication = asyncHandler(async (req, res) => {
  const application = await InstructorApplication.findById(req.params.id);

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  if (application.status !== 'pending') {
    res.status(400);
    throw new Error('Application has already been processed');
  }

  // Create user account
  const user = await User.create({
    name: application.name,
    email: application.email,
    password: application.password, // Already hashed
    isInstructor: true,
    role: 'instructor',
    profile: application.profile
  });

  // Update application status
  application.status = 'approved';
  application.approvedBy = req.user._id;
  application.approvedAt = new Date();
  await application.save();

  // Send approval email to instructor
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: application.email,
      subject: 'Instructor Application Approved - LMS Platform',
      html: `
        <h2>Congratulations! Your Instructor Application has been Approved</h2>
        <p>Dear ${application.name},</p>
        <p>We're excited to inform you that your instructor application has been approved!</p>
        <p>You can now log in to your account and start creating courses:</p>
        <ul>
          <li><strong>Email:</strong> ${application.email}</li>
          <li><strong>Login URL:</strong> ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login</li>
        </ul>
        <p>Welcome to the LMS Platform instructor community!</p>
        <br>
        <p>Best regards,<br>LMS Platform Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send approval email:', error);
  }

  res.json({
    message: 'Application approved successfully',
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

/**
 * Reject instructor application
 * @route   PUT /api/instructor-applications/:id/reject
 * @access  Private/Admin
 */
const rejectApplication = asyncHandler(async (req, res) => {
  const application = await InstructorApplication.findById(req.params.id);

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  if (application.status !== 'pending') {
    res.status(400);
    throw new Error('Application has already been processed');
  }

  const { reason } = req.body;

  // Update application status
  application.status = 'rejected';
  application.rejectedBy = req.user._id;
  application.rejectedAt = new Date();
  application.rejectionReason = reason;
  await application.save();

  // Send rejection email to applicant
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: application.email,
      subject: 'Instructor Application Update - LMS Platform',
      html: `
        <h2>Instructor Application Update</h2>
        <p>Dear ${application.name},</p>
        <p>Thank you for your interest in becoming an instructor on our platform.</p>
        <p>After careful review, we regret to inform you that we cannot approve your application at this time.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>We encourage you to reapply in the future as our requirements may change.</p>
        <p>If you have any questions, please don't hesitate to contact our support team.</p>
        <br>
        <p>Best regards,<br>LMS Platform Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send rejection email:', error);
  }

  res.json({
    message: 'Application rejected successfully'
  });
});

/**
 * Delete instructor application
 * @route   DELETE /api/instructor-applications/:id
 * @access  Private/Admin
 */
const deleteApplication = asyncHandler(async (req, res) => {
  const application = await InstructorApplication.findById(req.params.id);

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  await application.deleteOne();

  res.json({ message: 'Application deleted successfully' });
});

module.exports = {
  submitApplication,
  getApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
  deleteApplication,
};