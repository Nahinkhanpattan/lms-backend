const express = require('express');
const router = express.Router();
const { getCourseProgress, completeVideo } = require('../controllers/courseProgressController');
const { protect } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Course progress routes
router.get('/:courseId/progress', getCourseProgress);
router.post('/:courseId/progress/complete-video', completeVideo);

module.exports = router;