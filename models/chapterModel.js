const mongoose = require('mongoose');

const chapterSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a chapter title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      trim: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    orderIndex: {
      type: Number,
      required: true,
      default: 1,
    },
    lessons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
    }],
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
chapterSchema.index({ course: 1, orderIndex: 1 });
chapterSchema.index({ instructor: 1 });

const Chapter = mongoose.model('Chapter', chapterSchema);

module.exports = Chapter;