const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Joi = require('joi');
const nodemailer = require('nodemailer');

// Configure nodemailer (you'll need to add email credentials to .env)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const registerUser = asyncHandler(async (req, res) => {
  // Validate request body
  const schema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'instructor', 'student').required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { name, email, password, role } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    isAdmin: role === 'admin',
    isInstructor: role === 'instructor',
    role: role // optional string field if needed
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isInstructor: user.isInstructor,
      role: user.role,
      token: user.generateToken()
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

/**
 * Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginUser = asyncHandler(async (req, res) => {
  // Validate request body
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    isTemporaryPassword: Joi.boolean().optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { email, password, isTemporaryPassword } = req.body;

  // Find user by email
  const user = await User.findOne({ email });

  // Check if user exists and password matches
  if (user && (await user.matchPassword(password))) {
    const response = {
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isInstructor: user.isInstructor,
      role: user.role,
      token: user.generateToken(),
      requirePasswordChange: isTemporaryPassword || false
    };

    res.json(response);
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

/**
 * Forgot password - send current password via email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { email } = req.body;

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error('User not found with this email');
  }

  // Generate a temporary password
  const tempPassword = Math.random().toString(36).slice(-8);
  
  // Update user with temporary password
  user.password = tempPassword;
  user.isTemporaryPassword = true;
  await user.save();

  // Send email with temporary password
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset - LMS Platform',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hello ${user.name},</p>
      <p>You requested a password reset. Please use the following temporary password to login:</p>
      <p><strong>Temporary Password: ${tempPassword}</strong></p>
      <p>You will be required to change this password upon login.</p>
      <p>If you didn't request this, please contact support immediately.</p>
      <br>
      <p>Best regards,<br>LMS Platform Team</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Temporary password sent to your email' });
  } catch (error) {
    console.error('Email sending failed:', error);
    res.status(500);
    throw new Error('Failed to send email. Please try again later.');
  }
});

/**
 * Change password (for temporary passwords or regular password change)
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Verify current password
  if (!(await user.matchPassword(currentPassword))) {
    res.status(400);
    throw new Error('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  user.isTemporaryPassword = false;
  await user.save();

  res.json({
    message: 'Password changed successfully',
    _id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    isInstructor: user.isInstructor,
    role: user.role,
    token: user.generateToken()
  });
});

/**
 * Get user profile
 * @route   GET /api/auth/profile
 * @access  Private
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');

  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

/**
 * Update user profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  // Validate request body
  const schema = Joi.object({
    name: Joi.string(),
    email: Joi.string().email()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      isInstructor: updatedUser.isInstructor,
      role: updatedUser.role,
      token: updatedUser.generateToken()
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  changePassword,
  getUserProfile,
  updateUserProfile
};