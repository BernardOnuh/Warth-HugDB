// models/CompletedTask.js
const mongoose = require('mongoose');

const CompletedTaskSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    completedAt: {
      type: Date,
      default: Date.now
    }
  });