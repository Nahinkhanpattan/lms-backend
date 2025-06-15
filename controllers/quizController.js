const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Quiz = require('../models/quizModel');
const Course = require('../models/courseModel');
const Joi = require('joi');

/**
 * Get all quizzes with pagination
 * @route   GET /api/quizzes
 * @access  Private
 */
const getQuizzes = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const courseId = req.query.courseId;

  const filter = {};

  console.log("🔍 courseId received:", courseId);

  if (courseId) {
    filter.course = new mongoose.Types.ObjectId(courseId);
  }

  // For students, only show active quizzes from enrolled courses
  if (!req.user.isInstructor && !req.user.isAdmin) {
    filter.isActive = true;
    filter.startDate = { $lte: new Date() };
    filter.$or = [
      { endDate: { $gte: new Date() } },
      { endDate: { $exists: false } }
    ];

    // ✅ Get enrolled courses with ObjectId conversion
    const enrolledCourses = await Course.find({
      students: new mongoose.Types.ObjectId(req.user._id)
    }).select('_id');

    const enrolledCourseIds = enrolledCourses.map(course => course._id);

    console.log("👤 Logged-in user:", req.user._id.toString());
    console.log("📚 Enrolled course IDs:", enrolledCourseIds.map(id => id.toString()));
    console.log("👤 Is student?", !req.user.isInstructor && !req.user.isAdmin);

    if (courseId) {
      const enrolled = enrolledCourseIds.map(id => id.toString()).includes(courseId);
      console.log("🎯 Is student enrolled in courseId?", enrolled);

      if (!enrolled) {
        console.log("🚫 Student is not enrolled in the specified course.");
        return res.json({
          quizzes: [],
          page,
          pages: 0,
          total: 0,
          hasNextPage: false,
          hasPrevPage: false
        });
      }
    } else {
      // Only show quizzes from enrolled courses
      filter.course = { $in: enrolledCourseIds };
    }
  }

  // For instructors, show only their quizzes
  if (req.user.isInstructor && !req.user.isAdmin) {
    filter.instructor = req.user._id;
  }

  // Get total count first
  const total = await Quiz.countDocuments(filter);

  // Fetch quizzes
  const quizzesRaw = await Quiz.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('course', 'title')
    .populate('instructor', 'name email');

  // Transform quizzes to match frontend expectations and add attempt info
  const quizzes = await Promise.all(quizzesRaw.map(async quiz => {
    let userAttempts = 0;
    let canAttempt = true;
    let lastAttemptScore = null;

    if (!req.user.isInstructor && !req.user.isAdmin) {
      const userAttemptsList = quiz.attempts.filter(
        attempt => attempt.student.toString() === req.user._id.toString()
      );
      userAttempts = userAttemptsList.length;

      if (userAttempts > 0 && !quiz.settings.allowMultipleAttempts) {
        canAttempt = false;
      } else if (userAttempts >= quiz.settings.maxAttempts) {
        canAttempt = false;
      }

      if (userAttemptsList.length > 0) {
        lastAttemptScore = userAttemptsList[userAttemptsList.length - 1].percentage;
      }
    }

    return {
      id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      duration: quiz.timeLimit,
      questions: quiz.questions?.length || 0,
      startDate: quiz.startDate,
      endDate: quiz.endDate,
      isEnabled: quiz.isActive,
      attempts: req.user.isInstructor || req.user.isAdmin ? quiz.attempts?.length || 0 : userAttempts,
      avgScore: req.user.isInstructor || req.user.isAdmin
        ? (quiz.attempts?.length > 0
          ? quiz.attempts.reduce((acc, attempt) => acc + attempt.percentage, 0) / quiz.attempts.length
          : 0)
        : lastAttemptScore,
      course: quiz.course,
      instructor: quiz.instructor,
      canAttempt: req.user.isInstructor || req.user.isAdmin ? true : canAttempt,
      userAttempts: req.user.isInstructor || req.user.isAdmin ? undefined : userAttempts,
      maxAttempts: quiz.settings.maxAttempts,
      allowMultipleAttempts: quiz.settings.allowMultipleAttempts
    };
  }));

  res.json({
    quizzes,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});


/**
 * Get quiz by ID
 * @route   GET /api/quizzes/:id
 * @access  Private
 */
const getQuizById = asyncHandler(async (req, res) => {
  let quiz = await Quiz.findById(req.params.id)
    .populate('course', 'title')
    .populate('instructor', 'name email');

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check permissions
  const isInstructor = quiz.instructor._id.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (!isInstructor && !isAdmin) {
    // For students, check if they're enrolled in the course
    if (quiz.course) {
      const course = await Course.findById(quiz.course._id);
      if (!course || !course.students.includes(req.user._id)) {
        res.status(403);
        throw new Error('You must be enrolled in the course to access this quiz');
      }
    }

    // Check if quiz is active
    if (!quiz.isActive) {
      res.status(403);
      throw new Error('Quiz is not active');
    }

    // Check if quiz has started
    if (quiz.startDate && new Date() < quiz.startDate) {
      res.status(403);
      throw new Error('Quiz has not started yet');
    }

    // Check if quiz has ended
    if (quiz.endDate && new Date() > quiz.endDate) {
      res.status(403);
      throw new Error('Quiz has ended');
    }

    // Check if user can attempt
    const userAttempts = quiz.attempts.filter(
      attempt => attempt.student.toString() === req.user._id.toString()
    );

    if (userAttempts.length > 0 && !quiz.settings.allowMultipleAttempts) {
      res.status(403);
      throw new Error('You have already attempted this quiz');
    }

    if (userAttempts.length >= quiz.settings.maxAttempts) {
      res.status(403);
      throw new Error('You have reached the maximum number of attempts');
    }

    // Remove correct answers from questions for students
    quiz = quiz.toObject();
    quiz.questions = quiz.questions.map(question => ({
      ...question,
      options: question.options.map(option => ({
        text: option.text,
        _id: option._id
      }))
    }));

    // Shuffle questions if enabled
    if (quiz.settings.shuffleQuestions) {
      quiz.questions = shuffleArray(quiz.questions);
    }

    // Shuffle options if enabled
    if (quiz.settings.shuffleOptions) {
      quiz.questions = quiz.questions.map(question => ({
        ...question,
        options: shuffleArray(question.options)
      }));
    }

    // Remove attempts data
    delete quiz.attempts;
  }

  // Transform quiz to match frontend expectations
  const transformedQuiz = {
    id: quiz._id,
    title: quiz.title,
    description: quiz.description,
    duration: quiz.timeLimit,
    questions: quiz.questions?.map((q, index) => ({
      id: q._id || index.toString(),
      question: q.question,
      options: q.options?.map(opt => opt.text) || [],
      isMultiple: false // Assuming single choice for now
    })) || [],
    startDate: quiz.startDate,
    endDate: quiz.endDate,
    isEnabled: quiz.isActive,
    passingScore: 70, // Default passing score
    course: quiz.course,
    instructor: quiz.instructor,
    settings: quiz.settings
  };

  res.json(transformedQuiz);
});

// Helper function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Create a new quiz
 * @route   POST /api/quizzes
 * @access  Private/Instructor
 */
const createQuiz = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    timeLimit: Joi.number().min(1),
    questions: Joi.array().items(
      Joi.object({
        question: Joi.string().required(),
        options: Joi.array().items(
          Joi.object({
            text: Joi.string().required(),
            isCorrect: Joi.boolean().required()
          })
        ).min(2).required(),
        explanation: Joi.string(),
        points: Joi.number().min(1).default(1)
      })
    ).min(1).required(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    settings: Joi.object({
      allowMultipleAttempts: Joi.boolean(),
      maxAttempts: Joi.number().min(1),
      showResults: Joi.boolean(),
      shuffleQuestions: Joi.boolean(),
      shuffleOptions: Joi.boolean()
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, ...quizData } = req.body;

  // Verify course exists and user has permission
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to create quiz for this course');
  }

  const quiz = await Quiz.create({
    ...quizData,
    course: courseId,
    instructor: req.user._id,
    isActive: true
  });

  res.status(201).json(quiz);
});

/**
 * Update quiz
 * @route   PUT /api/quizzes/:id
 * @access  Private/Instructor
 */
const updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check ownership
  if (quiz.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this quiz');
  }

  const updatedQuiz = await Quiz.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('course', 'title').populate('instructor', 'name email');

  res.json(updatedQuiz);
});

/**
 * Delete quiz
 * @route   DELETE /api/quizzes/:id
 * @access  Private/Instructor
 */
const deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check ownership
  if (quiz.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this quiz');
  }

  await quiz.deleteOne();

  res.json({ message: 'Quiz removed' });
});

/**
 * Submit quiz attempt
 * @route   POST /api/quizzes/:id/attempt
 * @access  Private
 */
const submitQuizAttempt = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    answers: Joi.array().items(
      Joi.object({
        questionId: Joi.string().required(),
        selectedOption: Joi.number().required()
      })
    ).required(),
    startTime: Joi.date().required(),
    endTime: Joi.date().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const quiz = await Quiz.findById(req.params.id).populate('course');

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  if (!quiz.isActive) {
    res.status(400);
    throw new Error('Quiz is not active');
  }

  // Check if user is enrolled in the course
  if (quiz.course && !quiz.course.students.includes(req.user._id)) {
    res.status(403);
    throw new Error('You must be enrolled in the course to attempt this quiz');
  }

  // Check if quiz has ended
  if (quiz.endDate && new Date() > quiz.endDate) {
    res.status(400);
    throw new Error('Quiz has ended');
  }

  // Check previous attempts
  const userAttempts = quiz.attempts.filter(
    attempt => attempt.student.toString() === req.user._id.toString()
  );

  if (!quiz.settings.allowMultipleAttempts && userAttempts.length > 0) {
    res.status(400);
    throw new Error('Multiple attempts not allowed');
  }

  if (userAttempts.length >= quiz.settings.maxAttempts) {
    res.status(400);
    throw new Error('Maximum attempts reached');
  }

  const { answers, startTime, endTime } = req.body;

  // Calculate score
  let score = 0;
  const processedAnswers = answers.map(answer => {
    const question = quiz.questions.id(answer.questionId);
    if (!question) {
      throw new Error('Invalid question ID');
    }

    const selectedOption = question.options[answer.selectedOption];
    const isCorrect = selectedOption && selectedOption.isCorrect;
    const points = isCorrect ? question.points : 0;

    score += points;

    return {
      questionId: answer.questionId,
      selectedOption: answer.selectedOption,
      isCorrect,
      points
    };
  });

  const percentage = (score / quiz.totalPoints) * 100;
  const timeSpent = Math.floor((new Date(endTime) - new Date(startTime)) / 1000);

  // Add attempt to quiz
  quiz.attempts.push({
    student: req.user._id,
    answers: processedAnswers,
    score,
    totalPoints: quiz.totalPoints,
    percentage,
    startTime,
    endTime,
    timeSpent
  });

  await quiz.save();

  res.json({
    score,
    totalPoints: quiz.totalPoints,
    percentage,
    timeSpent,
    showResults: quiz.settings.showResults
  });
});

/**
 * Get quiz results
 * @route   GET /api/quizzes/:id/results
 * @access  Private
 */
const getQuizResults = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('attempts.student', 'name email');

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  const isInstructor = quiz.instructor.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (isInstructor || isAdmin) {
    // Return all results for instructor/admin
    const results = quiz.attempts.map(attempt => ({
      id: attempt._id,
      student: attempt.student,
      score: attempt.score,
      totalPoints: attempt.totalPoints,
      percentage: attempt.percentage,
      timeSpent: attempt.timeSpent,
      submittedAt: attempt.endTime,
      answers: attempt.answers
    }));
    res.json(results);
  } else {
    // Return only user's attempts
    const userAttempts = quiz.attempts.filter(
      attempt => attempt.student._id.toString() === req.user._id.toString()
    );
    res.json(userAttempts);
  }
});

/**
 * Mock quiz attempt (for instructors to test)
 * @route   POST /api/quizzes/:id/mock-attempt
 * @access  Private/Instructor
 */
const mockQuizAttempt = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check if user is instructor or admin
  const isInstructor = quiz.instructor.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (!isInstructor && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to mock attempt this quiz');
  }

  const schema = Joi.object({
    answers: Joi.array().items(
      Joi.object({
        questionId: Joi.string().required(),
        selectedOption: Joi.number().required()
      })
    ).required(),
    startTime: Joi.date().required(),
    endTime: Joi.date().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { answers, startTime, endTime } = req.body;

  // Calculate score
  let score = 0;
  const processedAnswers = answers.map(answer => {
    const question = quiz.questions.id(answer.questionId);
    if (!question) {
      throw new Error('Invalid question ID');
    }

    const selectedOption = question.options[answer.selectedOption];
    const isCorrect = selectedOption && selectedOption.isCorrect;
    const points = isCorrect ? question.points : 0;

    score += points;

    return {
      questionId: answer.questionId,
      selectedOption: answer.selectedOption,
      isCorrect,
      points,
      correctAnswer: question.options.findIndex(opt => opt.isCorrect),
      explanation: question.explanation
    };
  });

  const percentage = (score / quiz.totalPoints) * 100;
  const timeSpent = Math.floor((new Date(endTime) - new Date(startTime)) / 1000);

  // Return mock result without saving
  res.json({
    score,
    totalPoints: quiz.totalPoints,
    percentage,
    timeSpent,
    answers: processedAnswers,
    showResults: true,
    isMockAttempt: true
  });
});

module.exports = {
  getQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  submitQuizAttempt,
  getQuizResults,
  mockQuizAttempt,
};