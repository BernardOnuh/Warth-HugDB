const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String
  },
  points: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date
  },
  completionDelay: {
    type: Number,
    required: true,
    default: 0
  },
  link: { // New field to store the link to the task
    type: String,
    required: true
  }
});

module.exports = mongoose.model('Task', TaskSchema);
