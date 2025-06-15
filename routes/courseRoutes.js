const express = require('express');
const router = express.Router();
const { getFullCourseProgress } = require('../controllers/progressController');
const {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  getMyCourses,
  getEnrolledCourses,
} = require('../controllers/courseController');
const { protect, instructor } = require('../middlewares/authMiddleware');

// Public routes (no authentication required)
router.get('/', getCourses);
router.get('/:id', getCourseById);

// Protected routes (authentication required)
router.use(protect);

// Student routes
router.post('/:id/enroll', enrollInCourse);
router.get('/enrolled/my-courses', getEnrolledCourses);

// Instructor routes
router.post('/', instructor, createCourse);
router.get('/my/courses', instructor, getMyCourses);
router.route('/:id')
  .put(instructor, updateCourse)
  .delete(instructor, deleteCourse);
  
// Add new consolidated progress route
router.get('/:courseId/full-progress', protect, getFullCourseProgress);

module.exports = router;  