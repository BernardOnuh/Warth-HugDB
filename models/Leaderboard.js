// models/Leaderboard.js
const mongoose = require('mongoose');

const LeaderboardSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    score: {
      type: Number,
      default: 0
    },
    role: {
      type: String,
      enum: ['User', 'Promoter', 'Influencer', 'Ambassador'],
      default: 'User'
    }
  });