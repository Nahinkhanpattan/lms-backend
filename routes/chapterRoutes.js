const express = require('express');
const router = express.Router();
const {
  getChapters,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
} = require('../controllers/chapterController');
const { protect, instructor } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Chapter routes
router.route('/')
  .get(getChapters)
  .post(instructor, createChapter);

router.route('/:id')
  .get(getChapterById)
  .put(instructor, updateChapter)
  .delete(instructor, deleteChapter);

module.exports = router;