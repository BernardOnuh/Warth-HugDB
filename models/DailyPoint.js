const mongoose = require('mongoose');

const dailyPointSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  lastClaimDate: {
    type: Date
  },
  nextClaimAmount: {
    type: Number,
    default: 1000
  },
  dailyReferrals: {
    type: Number,
    default: 0
  },
  lastReferralReset: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('DailyPoint', dailyPointSchema);