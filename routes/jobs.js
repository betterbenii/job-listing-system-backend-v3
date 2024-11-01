const express = require('express');
const verifyToken = require('../middleware/authMiddleware.js');
const Job = require('../models/job.js');  // Import the Job model
const Application = require('../models/application.js');  // Import the Application model
const Notification= require('../models/notification.js')
const User = require('../models/user.js');
const router = express.Router();





// Route to create a new job
router.post('/', verifyToken, async (req, res) => {
  if (req.userRole !== 'recruiter') {
    return res.status(403).json({ message: 'Access forbidden: Recruiters only' });
  }

  try {
    const newJob = new Job({
      title: req.body.title,
      description: req.body.description,
      location: req.body.location,
      requirements: req.body.requirements,
      recruiter: req.userId,  // Recruiter who posted the job
      company: req.body.company,
      jobType: req.body.jobType,
      experienceLevel: req.body.experienceLevel,
    });

    await newJob.save();  // Save the job to the database
    

    // Notify candidates who opted in for new job notifications
    const candidates = await User.find({ 
      role: 'candidate', 
      'notificationPreferences.newJobPosts': true,
    });
    

    for (const candidate of candidates) {
      const notification = new Notification({
        user: candidate._id,
        message: `A new job has been posted: ${newJob.title} at ${newJob.company}`,
      });
      await notification.save();
     
    }

    // Send the response with the newly created job
    res.status(201).json({ message: 'Job created successfully', job: newJob });
  } catch (error) {
    console.error('Error creating job or notifications:', error);
    res.status(400).json({ message: error.message });
  }
});

// Route to get all jobs
router.get('/', async (req, res) => {
    try {
      const jobs = await Job.find();  // Find all job postings in the database
      res.json(jobs);  // Return job listings as JSON
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Route to update a job by ID
router.put('/:id', verifyToken, async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
  
      // Check if the job exists
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
  
      // Check if the logged-in user is the recruiter who posted the job
      if (job.recruiter.toString() !== req.userId) {
        return res.status(403).json({ message: 'Access forbidden: You can only edit jobs you posted' });
      }
  
      // Update job details
      job.title = req.body.title || job.title;
      job.description = req.body.description || job.description;
      job.location = req.body.location || job.location;
      job.requirements = req.body.requirements || job.requirements;
  
      // Save the updated job
      const updatedJob = await job.save();
      res.json({ message: 'Job updated successfully', job: updatedJob });
  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Route to delete a job by ID
router.delete('/:id', verifyToken, async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
  
      // Check if the job exists
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
  
      // Check if the logged-in user is the recruiter who posted the job
      if (job.recruiter.toString() !== req.userId) {
        return res.status(403).json({ message: 'Access forbidden: You can only delete jobs you posted' });
      }
  
      // Delete the job
      await Job.deleteOne({ _id: req.params.id });
      res.json({ message: 'Job deleted successfully' });
  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
// Route for candidates to apply for a job
router.post('/:id/apply', verifyToken, async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
  
      // Check if the job exists
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
  
      // Ensure only candidates (not recruiters) can apply for jobs
      if (req.userRole === 'recruiter') {
        return res.status(403).json({ message: 'Access forbidden: Recruiters cannot apply for jobs' });
      }
  
      // Create a new application
      const newApplication = new Application({
        candidate: req.userId,  // Candidate's user ID from the JWT token
        job: job._id,
        resume: req.body.resume,  // Candidate's resume
        coverLetter: req.body.coverLetter || ''  // Optional cover letter
      });

      const notification = new Notification({
        user: job.recruiter,  //  `job.recruiter` holds the recruiter's ID
        message: `A new candidate applied for your job posting: ${job.title}`,
      });
      await notification.save();
  
  
      await newApplication.save();
      res.status(201).json({ message: 'Application submitted successfully', application: newApplication });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Route to view applications for a specific job (Recruiters only)
router.get('/:id/applications', verifyToken, async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
  
      // Check if the job exists
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
  
      // Ensure that only the recruiter who posted the job can view applications
      if (job.recruiter.toString() !== req.userId) {
        return res.status(403).json({ message: 'Access forbidden: You can only view applications for jobs you posted' });
      }
  
      // Find all applications for the job
      const applications = await Application.find({ job: job._id }).populate('candidate', 'username email');
  
      // Send a "viewed" notification to each candidate
    for (const application of applications) {
      const notification = new Notification({
        user: application.candidate._id,
        message: `Your application for the job "${job.title}" has been viewed by the recruiter.`,
      });
      await notification.save();
    }





      res.json({ jobTitle: job.title, applications });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

    // Route to search for jobs by keywords (title, location, or company)
    router.get('/search', async (req, res) => {
      
      try {
        const keyword = req.query.q || '';
        const filters = {};
    
        // Apply jobType filter if provided
        if (req.query.jobType) {
          filters.jobType = req.query.jobType;
        }
    
        // Apply experienceLevel filter if provided
        if (req.query.experienceLevel) {
          filters.experienceLevel = req.query.experienceLevel;
        }
    
        // Apply location filter if provided
        if (req.query.location) {
          filters.location = req.query.location;
        }
    
        // Build search query with keyword and filters
        const jobs = await Job.find({
          $and: [
            {
              $or: [
                { title: { $regex: keyword, $options: 'i' } },
                { location: { $regex: keyword, $options: 'i' } },
                { company: { $regex: keyword, $options: 'i' } }
              ]
            },
            filters
          ]
        });
    
        res.json({ results: jobs });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
      }
    });
    
    // Route for recruiter to respond to a candidate's application
router.patch('/:jobId/applications/:applicationId/respond', verifyToken, async (req, res) => {
  try {
    const { jobId, applicationId } = req.params;
    const { action } = req.body; // Expected values: 'accepted' or 'rejected'

    const job = await Job.findById(jobId);

    // Check if job exists and the recruiter owns it
    if (!job || job.recruiter.toString() !== req.userId) {
      return res.status(403).json({ message: 'Access forbidden: Only the job\'s recruiter can respond to applications' });
    }

    // Find the application
    const application = await Application.findById(applicationId).populate('candidate', 'username email');
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Ensure valid action
    if (action !== 'accepted' && action !== 'rejected') {
      return res.status(400).json({ message: 'Invalid action. Use "accepted" or "rejected"' });
    }

    // Send notification based on the action taken
    const message = action === 'accepted'
      ? `Congratulations! Your application for "${job.title}" was accepted by the recruiter.`
      : `We're sorry to inform you that your application for "${job.title}" was rejected by the recruiter.`;

    const notification = new Notification({
      user: application.candidate._id,
      message,
    });
    await notification.save();

    // Optionally, update application status (if you’re tracking application statuses)
    application.status = action; // For example, you can have a status field in Application schema
    await application.save();

    res.json({ message: `Application ${action}`, notification });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Route for recruiters to update job status
router.patch('/:id/status', verifyToken, async (req, res) => {
  const { status } = req.body; // Expected values: 'closed' or 'expired'
  
  if (req.userRole !== 'recruiter') {
    return res.status(403).json({ message: 'Access forbidden: Only recruiters can update job status' });
  }

  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.recruiter.toString() !== req.userId) {
      return res.status(403).json({ message: 'Access forbidden: You can only update jobs you posted' });
    }

    // Ensure valid status
    if (!['closed', 'expired'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use "closed" or "expired"' });
    }

    job.status = status;
    await job.save();

    // Notify candidates who bookmarked or applied for this job
    const applicants = await Application.find({ job: job._id }).populate('candidate');
    const bookmarkedCandidates = await User.find({ bookmarkedJobs: job._id });

    const candidatesToNotify = [...new Set([...applicants.map(app => app.candidate), ...bookmarkedCandidates])];

    for (const candidate of candidatesToNotify) {
      const notification = new Notification({
        user: candidate._id,
        message: `The job "${job.title}" has been marked as ${status}.`,
      });
      await notification.save();
    }

    res.json({ message: `Job status updated to ${status}`, job });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


    

module.exports = router;