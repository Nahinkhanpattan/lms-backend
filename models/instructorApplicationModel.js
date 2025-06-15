const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const instructorApplicationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    profile: {
      bio: {
        type: String,
        required: [true, 'Please add a bio'],
        trim: true,
      },
      expertise: {
        type: String,
        required: [true, 'Please add your areas of expertise'],
        trim: true,
      },
      experience: {
        type: String,
        required: [true, 'Please add your experience level'],
        enum: ['1-2 years', '3-5 years', '6-10 years', '10+ years'],
      },
      education: {
        type: String,
        required: [true, 'Please add your education background'],
        trim: true,
      },
      linkedinUrl: {
        type: String,
        trim: true,
        match: [
          /^https?:\/\/(www\.)?linkedin\.com\/.*$/,
          'Please add a valid LinkedIn URL',
        ],
      },
      githubUrl: {
        type: String,
        trim: true,
        match: [
          /^https?:\/\/(www\.)?github\.com\/.*$/,
          'Please add a valid GitHub URL',
        ],
      },
      portfolioUrl: {
        type: String,
        trim: true,
        match: [
          /^https?:\/\/.*$/,
          'Please add a valid URL',
        ],
      },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt
instructorApplicationSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Index for better performance
instructorApplicationSchema.index({ email: 1 });
instructorApplicationSchema.index({ status: 1 });
instructorApplicationSchema.index({ createdAt: -1 });

const InstructorApplication = mongoose.model('InstructorApplication', instructorApplicationSchema);

module.exports = InstructorApplication;