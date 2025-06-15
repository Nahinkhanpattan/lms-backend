const asyncHandler = require('express-async-handler');
const CourseProgress = require('../models/courseProgressModel');
const Course = require('../models/courseModel');

/**
 * Get progress for a user in a course
 * @route   GET /api/courses/:courseId/progress
 * @access  Private (student)
 */
const getCourseProgress = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user._id;

  // Validate course exists
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Find or create progress document
  let progress = await CourseProgress.findOne({ student: userId, course: courseId });

  if (!progress) {
    // No progress yet, send empty progress
    progress = {
      completedVideos: [],
    };
  }

  res.json(progress);
});

/**
 * Mark video as completed for user in course
 * @route   POST /api/courses/:courseId/progress/complete-video
 * @access  Private (student)
 */
const completeVideo = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { videoId } = req.body;
  const userId = req.user._id;

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Check if video belongs to course
  if (!course.videos.includes(videoId)) {
    res.status(400);
    throw new Error('Video does not belong to this course');
  }

  let progress = await CourseProgress.findOne({ student: userId, course: courseId });

  if (!progress) {
    progress = new CourseProgress({ student: userId, course: courseId, completedVideos: [] });
  }

  if (!progress.completedVideos.includes(videoId)) {
    progress.completedVideos.push(videoId);
    await progress.save();
  }

  res.json({ message: 'Video marked as completed', completedVideos: progress.completedVideos });
});

module.exports = {
  getCourseProgress,
  completeVideo,
};
