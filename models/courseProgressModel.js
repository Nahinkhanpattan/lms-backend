
const mongoose = require('mongoose');

// Add a new Schema for tracking progress
const courseProgressSchema = mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    completedVideos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
      },
    ],
  },
  {
    timestamps: true,
  }
);

const CourseProgress = mongoose.model('CourseProgress', courseProgressSchema);

module.exports = CourseProgress;
