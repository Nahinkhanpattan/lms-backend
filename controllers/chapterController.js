const asyncHandler = require('express-async-handler');
const Chapter = require('../models/chapterModel');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const { createNotificationForUsers } = require('./notificationController');
const Joi = require('joi');

/**
 * Get all chapters for a course
 * @route   GET /api/chapters
 * @access  Private
 */
const getChapters = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const courseId = req.query.courseId;

  let filter = {};
  
  if (courseId) {
    filter.course = courseId;
  }

  // For instructors, show only their chapters
  if (req.user.isInstructor && !req.user.isAdmin) {
    filter.instructor = req.user._id;
  }

  const chapters = await Chapter.find(filter)
    .sort({ orderIndex: 1 })
    .skip(skip)
    .limit(limit)
    .populate('course', 'title')
    .populate('instructor', 'name email')
    .populate({
      path: 'lessons',
      select: 'title duration orderIndex isPublished',
      options: { sort: { orderIndex: 1 } }
    });

  const total = await Chapter.countDocuments(filter);

  res.json({
    chapters,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get chapter by ID
 * @route   GET /api/chapters/:id
 * @access  Private
 */
const getChapterById = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id)
    .populate('course', 'title')
    .populate('instructor', 'name email')
    .populate({
      path: 'lessons',
      select: 'title description duration orderIndex isPublished viewCount',
      options: { sort: { orderIndex: 1 } }
    });

  if (!chapter) {
    res.status(404);
    throw new Error('Chapter not found');
  }

  // Check permissions
  const isInstructor = chapter.instructor._id.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (!isInstructor && !isAdmin && !chapter.isPublished) {
    res.status(403);
    throw new Error('Chapter not published');
  }

  res.json(chapter);
});

/**
 * Create a new chapter
 * @route   POST /api/chapters
 * @access  Private/Instructor
 */
const createChapter = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    orderIndex: Joi.number().min(1).default(1),
    isPublished: Joi.boolean().default(false)
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, ...chapterData } = req.body;

  // Verify course exists and user has permission
  const course = await Course.findById(courseId).populate('students');
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to create chapter for this course');
  }

  const chapter = await Chapter.create({
    ...chapterData,
    course: courseId,
    instructor: req.user._id,
  });

  const populatedChapter = await Chapter.findById(chapter._id)
    .populate('course', 'title')
    .populate('instructor', 'name email');

  // Create notifications for enrolled students
  if (course.students && course.students.length > 0) {
    await createNotificationForUsers(course.students, {
      type: 'chapter_created',
      title: 'New Chapter Added',
      message: `A new chapter "${chapter.title}" has been added to "${course.title}"`,
      data: {
        courseId: course._id,
        chapterId: chapter._id,
        url: `/courses/${course._id}`
      },
      sender: req.user._id
    });
  }

  res.status(201).json(populatedChapter);
});

/**
 * Update chapter
 * @route   PUT /api/chapters/:id
 * @access  Private/Instructor
 */
const updateChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);

  if (!chapter) {
    res.status(404);
    throw new Error('Chapter not found');
  }

  // Check ownership
  if (chapter.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this chapter');
  }

  const updatedChapter = await Chapter.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('course', 'title').populate('instructor', 'name email');

  res.json(updatedChapter);
});

/**
 * Delete chapter
 * @route   DELETE /api/chapters/:id
 * @access  Private/Instructor
 */
const deleteChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);

  if (!chapter) {
    res.status(404);
    throw new Error('Chapter not found');
  }

  // Check ownership
  if (chapter.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this chapter');
  }

  // Delete associated lessons
  await Lesson.deleteMany({ chapter: chapter._id });

  await chapter.deleteOne();

  res.json({ message: 'Chapter and all lessons removed' });
});

module.exports = {
  getChapters,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
};