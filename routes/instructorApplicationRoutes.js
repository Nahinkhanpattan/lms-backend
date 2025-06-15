const express = require('express');
const router = express.Router();
const {
  submitApplication,
  getApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
  deleteApplication,
} = require('../controllers/instructorApplicationController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public route for submitting applications
router.post('/', submitApplication);

// Admin only routes
router.use(protect);
router.use(admin);

router.get('/', getApplications);
router.get('/:id', getApplicationById);
router.put('/:id/approve', approveApplication);
router.put('/:id/reject', rejectApplication);
router.delete('/:id', deleteApplication);

module.exports = router;