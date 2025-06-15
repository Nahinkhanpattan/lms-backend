const mongoose = require('mongoose');

const resourceSchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['pdf', 'code', 'link', 'file'],
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  fileSize: Number,
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const lessonSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a lesson title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      trim: true,
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      required: true,
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
    videoUrl: {
      type: String,
    },
    videoFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
    },
    duration: {
      type: String, // Format: "MM:SS"
      required: true,
    },
    orderIndex: {
      type: Number,
      required: true,
      default: 1,
    },
    resources: [resourceSchema],
    isPublished: {
      type: Boolean,
      default: false,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
lessonSchema.index({ chapter: 1, orderIndex: 1 });
lessonSchema.index({ course: 1 });
lessonSchema.index({ instructor: 1 });

const Lesson = mongoose.model('Lesson', lessonSchema);

module.exports = Lesson;