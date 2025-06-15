const asyncHandler = require('express-async-handler');
const Course = require('../models/courseModel');
const Video = require('../models/videoModel');
const User = require('../models/userModel');
const Chapter = require('../models/chapterModel');
const Lesson = require('../models/lessonModel');
const Quiz = require('../models/quizModel');
const Assessment = require('../models/assessmentModel');
const { createNotificationForUsers } = require('./notificationController');
const Joi = require('joi');

// @desc    Get all courses with filters, pagination, and sorting
// @route   GET /api/courses
// @access  Public
const getCourses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  const category = req.query.category || '';
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  let filter = {};
  
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  if (category) filter.category = category;
  if (!req.user || (!req.user.isAdmin && !req.user.isInstructor)) {
    filter.isPublished = true;
  }

  const total = await Course.countDocuments(filter);
  const courses = await Course.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate('instructor', 'name email')
    .populate('videos', 'title duration')
    .lean(); // Use lean for better performance

  const transformedCourses = courses.map(course => {
    // Check if user is enrolled (only if user is logged in)
    const isEnrolled = req.user ? course.students?.some(studentId => 
      studentId.toString() === req.user._id.toString()
    ) : false;

    return {
      id: course._id,
      title: course.title,
      description: course.description,
      thumbnail: course.thumbnailUrl,
      instructor: course.instructor?.name || 'Unknown',
      duration: `${course.duration} hours`,
      lessons: course.videos?.length || 0,
      price: course.price,
      level: course.level,
      category: course.category,
      enrolled: course.students?.length || 0,
      rating: course.rating,
      isPublished: course.isPublished,
      isEnrolled: isEnrolled
    };
  });

  res.json({
    courses: transformedCourses,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1
  });
});

// @desc    Get single course by ID
// @route   GET /api/courses/:id
// @access  Public
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .populate('instructor', 'name email')
    .populate('videos')
    .populate('students', 'name email');

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.isPublished && (!req.user || (!req.user.isAdmin && course.instructor._id.toString() !== req.user._id.toString()))) {
    res.status(403);
    throw new Error('Course not published');
  }

  // Check if user is enrolled
  const isEnrolled = req.user ? course.students.some(student => 
    student._id.toString() === req.user._id.toString()
  ) : false;

  // Transform course data
  const transformedCourse = {
    id: course._id,
    title: course.title,
    description: course.description,
    content: course.content,
    thumbnail: course.thumbnailUrl,
    instructor: course.instructor?.name || 'Unknown',
    instructorId: course.instructor?._id,
    duration: `${course.duration} hours`,
    lessons: course.videos?.length || 0,
    price: course.price,
    level: course.level,
    category: course.category,
    enrolled: course.students?.length || 0,
    rating: course.rating,
    isPublished: course.isPublished,
    isEnrolled: isEnrolled,
    videos: course.videos,
    students: req.user && (req.user.isAdmin || course.instructor._id.toString() === req.user._id.toString()) 
      ? course.students 
      : undefined
  };

  res.json(transformedCourse);
});

// @desc    Create a new course
// @route   POST /api/courses
// @access  Instructor/Admin
const createCourse = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    category: Joi.string().required(),
    price: Joi.number().required(),
    level: Joi.string().valid('Beginner', 'Intermediate', 'Advanced').required(),
    duration: Joi.number().required(),
    thumbnailUrl: Joi.string().optional(),
    content: Joi.string().optional(),
    isPublished: Joi.boolean().optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const course = new Course({
    ...req.body,
    instructor: req.user._id
  });

  const created = await course.save();

  // Create notifications for all students when a new course is created
  const students = await User.find({ 
    $and: [
      { isInstructor: { $ne: true } },
      { isAdmin: { $ne: true } }
    ]
  });

  if (students.length > 0) {
    const studentIds = students.map(student => student._id);
    await createNotificationForUsers(studentIds, {
      type: 'course_created',
      title: 'New Course Available',
      message: `A new course "${course.title}" has been created by ${req.user.name}`,
      data: {
        courseId: created._id,
        url: `/courses/${created._id}`
      },
      sender: req.user._id
    });
  }

  res.status(201).json(created);
});

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Instructor/Admin
const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Unauthorized');
  }

  Object.assign(course, req.body);
  const updated = await course.save();
  res.json(updated);
});

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Instructor/Admin
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Unauthorized');
  }

  // Delete related chapters and lessons
  const chapters = await Chapter.find({ course: req.params.id });
  for (const chapter of chapters) {
    // Delete lessons in this chapter
    await Lesson.deleteMany({ chapter: chapter._id });
  }
  
  // Delete chapters
  await Chapter.deleteMany({ course: req.params.id });
  
  // Delete quizzes
  await Quiz.deleteMany({ course: req.params.id });
  
  // Delete assessments
  await Assessment.deleteMany({ course: req.params.id });

  await course.deleteOne();
  res.json({ message: 'Course and all related content deleted' });
});

// @desc    Enroll in a course
// @route   POST /api/courses/:id/enroll
// @access  Private
const enrollInCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.isPublished) {
    res.status(400);
    throw new Error('Course is not published');
  }

  if (course.students.includes(req.user._id)) {
    res.status(400);
    throw new Error('Already enrolled');
  }

  course.students.push(req.user._id);
  await course.save();

  // Create notification for instructor
  await createNotificationForUsers([course.instructor], {
    type: 'course_enrollment',
    title: 'New Student Enrollment',
    message: `${req.user.name} has enrolled in your course "${course.title}"`,
    data: {
      courseId: course._id,
      url: `/courses/${course._id}`
    },
    sender: req.user._id
  });

  res.json({ message: 'Enrolled successfully' });
});

// @desc    Get courses created by the logged-in instructor
// @route   GET /api/courses/my-courses
// @access  Instructor
const getMyCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ instructor: req.user._id });
  const transformedCourses = courses.map(course => ({
    id: course._id,
    title: course.title,
    description: course.description,
    thumbnail: course.thumbnailUrl,
    instructor: req.user.name,
    duration: `${course.duration} hours`,
    lessons: course.videos?.length || 0,
    price: course.price,
    level: course.level,
    category: course.category,
    enrolled: course.students?.length || 0,
    rating: course.rating,
    isPublished: course.isPublished
  }));
  res.json({ courses: transformedCourses });
});

// @desc    Get courses enrolled by student
// @route   GET /api/courses/enrolled
// @access  Private
const getEnrolledCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ students: req.user._id })
    .populate('instructor', 'name');
  
  const transformedCourses = courses.map(course => ({
    id: course._id,
    title: course.title,
    description: course.description,
    thumbnail: course.thumbnailUrl,
    instructor: course.instructor?.name || 'Unknown',
    duration: `${course.duration} hours`,
    lessons: course.videos?.length || 0,
    price: course.price,
    level: course.level,
    category: course.category,
    enrolled: course.students?.length || 0,
    rating: course.rating,
    isPublished: course.isPublished,
    isEnrolled: true
  }));
  
  res.json({ courses: transformedCourses });
});

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  getMyCourses,
  getEnrolledCourses
};