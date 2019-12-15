const express = require('express');
const Course = require('../models/course');
const Answer = require('../models/answer'); 
const catchErrors = require('../lib/async-error');


module.exports = io => {
  const router = express.Router();
  
  // 동일한 코드가 users.js에도 있습니다. 이것은 나중에 수정합시다.
  function needAuth(req, res, next) {
    if (req.isAuthenticated()) {
      next();
    } else {
      req.flash('danger', 'Please signin first.');
      res.redirect('/signin');
    }
  }

  /* GET courses listing. */
  router.get('/', catchErrors(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    var query = {};
    const term = req.query.term;
    if (term) {
      query = {$or: [
        {title: {'$regex': term, '$options': 'i'}},
        {content: {'$regex': term, '$options': 'i'}}
      ]};
    }
    const courses = await Course.paginate(query, {
      sort: {createdAt: -1}, 
      populate: 'author', 
      page: page, limit: limit
    });
    res.render('courses/index', {courses: courses, term: term, query: req.query});
  }));

  router.get('/new', needAuth, (req, res, next) => {
    res.render('courses/new', {course: {}});
  });

  router.get('/:id/edit', needAuth, catchErrors(async (req, res, next) => {
    const course = await Course.findById(req.params.id);
    res.render('courses/edit', {course: course});
  }));

  router.get('/:id', catchErrors(async (req, res, next) => {
    const course = await Course.findById(req.params.id).populate('author');
    const answers = await Answer.find({course: course.id}).populate('author');
    course.numReads++;    // TODO: 동일한 사람이 본 경우에 Read가 증가하지 않도록???

    await course.save();
    res.render('courses/show', {course: course, answers: answers});
  }));

  router.put('/:id', catchErrors(async (req, res, next) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
      req.flash('danger', 'Not exist course');
      return res.redirect('back');
    }
    course.title = req.body.title;
    course.content = req.body.content;
    course.tags = req.body.tags.split(" ").map(e => e.trim());

    await course.save();
    req.flash('success', 'Successfully updated');
    res.redirect('/courses');
  }));

  router.delete('/:id', needAuth, catchErrors(async (req, res, next) => {
    await Course.findOneAndRemove({_id: req.params.id});
    req.flash('success', 'Successfully deleted');
    res.redirect('/courses');
  }));

  router.post('/', needAuth, catchErrors(async (req, res, next) => {
    const user = req.user;
    var course = new Course({
      title: req.body.title,
      author: user._id,
      content: req.body.content,
      tags: req.body.tags.split(" ").map(e => e.trim()),
    });
    await course.save();
    req.flash('success', 'Successfully posted');
    res.redirect('/courses');
  }));

  router.post('/:id/answers', needAuth, catchErrors(async (req, res, next) => {
    const user = req.user;
    const course = await Course.findById(req.params.id);

    if (!course) {
      req.flash('danger', 'Not exist course');
      return res.redirect('back');
    }

    var answer = new Answer({
      author: user._id,
      course: course._id,
      content: req.body.content
    });
    await answer.save();
    course.numAnswers++;
    await course.save();

    const url = `/courses/${course._id}#${answer._id}`;
    io.to(course.author.toString())
      .emit('answered', {url: url, course: course});
    console.log('SOCKET EMIT', course.author.toString(), 'answered', {url: url, course: course})
    req.flash('success', 'Successfully answered');
    res.redirect(`/courses/${req.params.id}`);
  }));

  return router;
}