const asyncHandler = require('express-async-handler');
const Course = require('../models/courseModel');
const CourseProgress = require('../models/courseProgressModel');
const Quiz = require('../models/quizModel');
const Assessment = require('../models/assessmentModel');

const getFullCourseProgress = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user._id;

  // Validate course exists & get videos
  const course = await Course.findById(courseId).populate('videos').lean();
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }
  const totalVideos = course.videos?.length || 0;

  // Get user's completed videos from CourseProgress
  const progressDoc = await CourseProgress.findOne({ student: userId, course: courseId }).lean();
  const completedVideos = progressDoc?.completedVideos?.length || 0;

  // Get quizzes in this course
  const quizzes = await Quiz.find({ course: courseId }).lean();
  const totalQuizzes = quizzes.length;

  // Count quizzes completed by user
  let quizzesCompleted = 0;
  for (const quiz of quizzes) {
    const attempt = quiz.inProgressAttempts.find(
      a => a.student.toString() === userId.toString()
    );
    if (attempt && attempt.lastQuestionIndex >= (quiz.questions.length - 1)) {
      quizzesCompleted++;
    }
  }

  // Get assessments in course
  const assessments = await Assessment.find({ course: courseId }).lean();
  const totalAssessments = assessments.length;

  // Count assessments completed by user (submitted)
  let assessmentsCompleted = 0;
  for (const assessment of assessments) {
    if (assessment.submissions?.some(s => s.student.toString() === userId.toString())) {
      assessmentsCompleted++;
    }
  }

  res.json({
    lessons: {
      completed: completedVideos,
      total: totalVideos,
    },
    quizzes: {
      completed: quizzesCompleted,
      total: totalQuizzes,
    },
    assessments: {
      completed: assessmentsCompleted,
      total: totalAssessments,
    },
  });
});

module.exports = {
  getFullCourseProgress,
};
