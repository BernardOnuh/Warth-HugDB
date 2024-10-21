// controllers/leaderboardController.js
const { User } = require('../models/User');

const CLASSIFICATION_THRESHOLDS = {
  PROMOTER: 1001,
  INFLUENCER: 5001,
  AMBASSADOR: 10001
};

const CLASSIFICATION_AWARDS = {
  PROMOTER: 159000,
  INFLUENCER: 500000,
  AMBASSADOR: 1200000
};

async function updateUserClassification(user) {
  const referralCount = user.referrals.length;
  let newClassification = 'User';
  let pointsAwarded = 0;

  if (referralCount >= CLASSIFICATION_THRESHOLDS.AMBASSADOR) {
    newClassification = 'Ambassador';
    if (user.role !== 'Ambassador') {
      pointsAwarded = CLASSIFICATION_AWARDS.AMBASSADOR;
    }
  } else if (referralCount >= CLASSIFICATION_THRESHOLDS.INFLUENCER) {
    newClassification = 'Influencer';
    if (user.role !== 'Influencer' && user.role !== 'Ambassador') {
      pointsAwarded = CLASSIFICATION_AWARDS.INFLUENCER;
    }
  } else if (referralCount >= CLASSIFICATION_THRESHOLDS.PROMOTER) {
    newClassification = 'Promoter';
    if (user.role !== 'Promoter' && user.role !== 'Influencer' && user.role !== 'Ambassador') {
      pointsAwarded = CLASSIFICATION_AWARDS.PROMOTER;
    }
  }

  if (newClassification !== user.role) {
    user.role = newClassification;
    user.balance += pointsAwarded;
    user.totalEarnings += pointsAwarded;
    await user.save();
    return { newClassification, pointsAwarded };
  }

  return { newClassification: user.role, pointsAwarded: 0 };
}

exports.getLeaderboard = async (req, res) => {
  try {
    const { role } = req.query;
    let query = {};
    if (role) {
      query.role = role;
    }

    const users = await User.find(query).populate('referrals', 'username');
    users.sort((a, b) => b.referrals.length - a.referrals.length);

    const promoters = [];
    const influencers = [];
    const ambassadors = [];

    for (let user of users) {
      const { newClassification, pointsAwarded } = await updateUserClassification(user);
      const referralCount = user.referrals.length;
      const rank = users.indexOf(user) + 1;

      const userInfo = {
        username: user.username,
        role: newClassification,
        referralCount: referralCount,
        rank: rank,
        pointsAwarded: pointsAwarded,
        balance: user.balance,
        totalEarnings: user.totalEarnings
      };

      switch (newClassification) {
        case 'Ambassador':
          ambassadors.push(userInfo);
          break;
        case 'Influencer':
          influencers.push(userInfo);
          break;
        case 'Promoter':
          promoters.push(userInfo);
          break;
      }
    }

    res.json({
      promoters,
      influencers,
      ambassadors
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getUserRank = async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username }).populate('referrals', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const users = await User.find({}).populate('referrals', 'username');
    users.sort((a, b) => b.referrals.length - a.referrals.length);

    const rank = users.findIndex(u => u.username === username) + 1;
    const { newClassification, pointsAwarded } = await updateUserClassification(user);

    res.json({
      username: user.username,
      referralCount: user.referrals.length,
      rank: rank,
      classification: newClassification,
      pointsAwarded: pointsAwarded,
      totalBalance: user.balance,
      totalEarnings: user.totalEarnings
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.claimHourlyPoints = async (req, res) => {
  try {
    const { telegramUserId } = req.body;
    const user = await User.findByTelegramUserId(telegramUserId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.canStartEarning()) {
      return res.status(400).json({ 
        message: 'You can\'t claim yet',
        secondsToNextClaim: 0 // The user model doesn't have a cooldown period for claiming
      });
    }

    user.startEarning(); // Start earning if not already earning
    const claimedAmount = user.claim();
    await user.save();

    res.json({
      message: 'Points claimed successfully',
      claimedAmount,
      newBalance: user.balance,
      totalEarnings: user.totalEarnings,
      secondsToNextClaim: 0 // The user can start earning again immediately
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).populate('referrals', 'username');
    users.sort((a, b) => b.referrals.length - a.referrals.length);

    const allUsers = users.map((user, index) => {
      const { newClassification, pointsAwarded } = updateUserClassification(user);
      return {
        username: user.username,
        role: newClassification,
        referralCount: user.referrals.length,
        rank: index + 1,
        pointsAwarded: pointsAwarded,
        balance: user.balance,
        totalEarnings: user.totalEarnings
      };
    });

    res.json({
      allUsers
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};