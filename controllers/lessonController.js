const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Lesson = require('../models/lessonModel');
const Chapter = require('../models/chapterModel');
const Course = require('../models/courseModel');
const { createNotificationForUsers } = require('./notificationController');
const Joi = require('joi');

/**
 * Get all lessons
 * @route   GET /api/lessons
 * @access  Private
 */
const getLessons = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const chapterId = req.query.chapterId;
  const courseId = req.query.courseId;

  
  const filter = {};

  if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
    filter.course = new mongoose.Types.ObjectId(courseId);
  }

  if (chapterId && mongoose.Types.ObjectId.isValid(chapterId)) {
    filter.chapter = new mongoose.Types.ObjectId(chapterId);
  }

  // For instructors, show only their lessons
  if (req.user.isInstructor && !req.user.isAdmin) {
    filter.instructor = req.user._id;
  }

  // For students, only show published lessons from enrolled courses
  if (!req.user.isInstructor && !req.user.isAdmin) {
    filter.isPublished = true;
    
    // Get enrolled courses
    const enrolledCourses = await Course.find({
      students: req.user._id
    }).select('_id');
    
    const enrolledCourseIds = enrolledCourses.map(course => course._id);
    filter.course = { $in: enrolledCourseIds };
  }

  const lessons = await Lesson.find(filter)
    .sort({ orderIndex: 1 })
    .skip(skip)
    .limit(limit)
    .populate('chapter', 'title')
    .populate('course', 'title')
    .populate('instructor', 'name email')
    .populate('videoFile', 'title fileKey');

  const total = await Lesson.countDocuments(filter);

  res.json({
    lessons,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get lesson by ID
 * @route   GET /api/lessons/:id
 * @access  Private
 */
const getLessonById = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id)
    .populate('chapter', 'title')
    .populate('course', 'title students')
    .populate('instructor', 'name email')
    .populate('videoFile', 'title fileKey');

  if (!lesson) {
    res.status(404);
    throw new Error('Lesson not found');
  }

  // Check permissions
  const isInstructor = lesson.instructor._id.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (!isInstructor && !isAdmin) {
    // For students, check if lesson is published
    if (!lesson.isPublished) {
      res.status(403);
      throw new Error('Lesson not published');
    }

    // Check if student is enrolled in the course
    if (lesson.course && lesson.course.students) {
      const isEnrolled = lesson.course.students.some(
        studentId => studentId.toString() === req.user._id.toString()
      );
      
      if (!isEnrolled) {
        res.status(403);
        throw new Error('You must be enrolled in the course to access this lesson');
      }
    }
  }

  // Increment view count for students
  if (!isInstructor && !isAdmin) {
    lesson.viewCount += 1;
    await lesson.save();
  }

  res.json(lesson);
});

/**
 * Create a new lesson
 * @route   POST /api/lessons
 * @access  Private/Instructor
 */
const createLesson = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    chapterId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    videoUrl: Joi.string().uri(),
    videoFileId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    duration: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
    orderIndex: Joi.number().min(1).default(1),
    resources: Joi.array().items(
      Joi.object({
        title: Joi.string().required(),
        type: Joi.string().valid('pdf', 'code', 'link', 'file').required(),
        url: Joi.string().required()
      })
    ),
    isPublished: Joi.boolean().default(false)
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { chapterId, videoFileId, ...lessonData } = req.body;

  // Verify chapter exists and user has permission
  const chapter = await Chapter.findById(chapterId).populate({
    path: 'course',
    populate: {
      path: 'students'
    }
  });
  if (!chapter) {
    res.status(404);
    throw new Error('Chapter not found');
  }

  if (chapter.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to create lesson for this chapter');
  }

  const courseId = (typeof chapter.course === 'object' && chapter.course._id)
  ? chapter.course._id
  : chapter.course;

const lesson = await Lesson.create({
  ...lessonData,
  chapter: chapterId,
  course: courseId,
  instructor: req.user._id,
  ...(videoFileId && { videoFile: videoFileId }),
});


  // Add lesson to chapter
  chapter.lessons.push(lesson._id);
  await chapter.save();

  const populatedLesson = await Lesson.findById(lesson._id)
    .populate('chapter', 'title')
    .populate('course', 'title')
    .populate('instructor', 'name email');

  // Create notifications for enrolled students
  if (chapter.course.students && chapter.course.students.length > 0) {
    await createNotificationForUsers(chapter.course.students, {
      type: 'lesson_created',
      title: 'New Lesson Available',
      message: `A new lesson "${lesson.title}" has been added to "${chapter.course.title}"`,
      data: {
        courseId: chapter.course._id,
        chapterId: chapter._id,
        lessonId: lesson._id,
        url: `/lessons/${lesson._id}`
      },
      sender: req.user._id
    });
  }

  res.status(201).json(populatedLesson);
});

/**
 * Update lesson
 * @route   PUT /api/lessons/:id
 * @access  Private/Instructor
 */
const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    res.status(404);
    throw new Error('Lesson not found');
  }

  // Check ownership
  if (lesson.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this lesson');
  }

  const updatedLesson = await Lesson.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('chapter', 'title')
   .populate('course', 'title')
   .populate('instructor', 'name email');

  res.json(updatedLesson);
});

/**
 * Delete lesson
 * @route   DELETE /api/lessons/:id
 * @access  Private/Instructor
 */
const deleteLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    res.status(404);
    throw new Error('Lesson not found');
  }

  // Check ownership
  if (lesson.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this lesson');
  }

  // Remove lesson from chapter
  await Chapter.findByIdAndUpdate(
    lesson.chapter,
    { $pull: { lessons: lesson._id } }
  );

  await lesson.deleteOne();

  res.json({ message: 'Lesson removed' });
});

module.exports = {
  getLessons,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
};