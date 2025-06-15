const express = require('express');
const router = express.Router();
const {
  getLessons,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
} = require('../controllers/lessonController');
const { protect, instructor } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Lesson routes
router.route('/')
  .get(getLessons)
  .post(instructor, createLesson);

router.route('/:id')
  .get(getLessonById)
  .put(instructor, updateLesson)
  .delete(instructor, deleteLesson);

module.exports = router;