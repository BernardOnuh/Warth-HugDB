const { User, Stake, PromoCode } = require('../models/User');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Task = require('../models/Task');
const DailyPoint = require('../models/DailyPoint');

// Helper function for error handling
const handleError = (res, error, statusCode = 500) => {
  console.error('Error:', error);
  res.status(statusCode).json({ message: error.message || 'An error occurred' });
};

// Register a new user
exports.registerUser = async (req, res) => {
  try {
    const { telegramUserId, username, referralCode } = req.body;

    // Input validation
    if (!telegramUserId || !username) {
      return res.status(400).json({ message: 'Telegram User ID and username are required' });
    }

    let referredBy = null;
    if (referralCode) {
      referredBy = await User.findOne({ username: referralCode });
      if (!referredBy) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    const user = new User({
      telegramUserId,
      username,
      referredBy: referredBy ? referredBy._id : null,
    });
    await user.save();

    if (referredBy) {
      await processReferral(referredBy, user);
      // Add referral to daily points
      await addReferral(referredBy._id);
    }

    user.addEarnings(30000); // Join bonus
    await user.save();

    // Create DailyPoint record for the new user
    const dailyPoint = new DailyPoint({ user: user._id });
    await dailyPoint.save();

    res.status(201).json(user);
  } catch (error) {
    handleError(res, error, 400);
  }
};

// Helper function to process referral bonuses
async function processReferral(referrer, newUser) {
  referrer.referrals.push(newUser._id);
  referrer.addEarnings(15000);
  await referrer.save();

  const referralBonuses = [0.20, 0.10, 0.05, 0.025, 0.0125];
  let currentReferrer = referrer;

  for (const bonus of referralBonuses) {
    if (!currentReferrer) break;
    
    const bonusAmount = Math.floor(30000 * bonus);
    currentReferrer.addEarnings(bonusAmount);
    await currentReferrer.save();

    currentReferrer = await User.findById(currentReferrer.referredBy);
  }
}

// Helper function to add referral to daily points
async function addReferral(userId) {
  try {
    const dailyPoint = await DailyPoint.findOne({ user: userId });
    if (!dailyPoint) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dailyPoint.lastReferralReset < today) {
      dailyPoint.dailyReferrals = 1;
      dailyPoint.lastReferralReset = today;
    } else {
      dailyPoint.dailyReferrals += 1;
    }

    await dailyPoint.save();
  } catch (error) {
    console.error('Error adding referral:', error);
  }
}

// Claim daily points
exports.claimDailyPoints = async (req, res) => {
  try {
    const { telegramUserId } = req.params;

    const user = await User.findOne({ telegramUserId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let dailyPoint = await DailyPoint.findOne({ user: user._id });
    if (!dailyPoint) {
      dailyPoint = new DailyPoint({ user: user._id });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dailyPoint.lastClaimDate && dailyPoint.lastClaimDate.getTime() === today.getTime()) {
      return res.status(400).json({ message: 'Daily points already claimed today' });
    }

    if (!dailyPoint.lastClaimDate || dailyPoint.lastClaimDate.getTime() < today.getTime() - 86400000) {
      // Reset streak if it's been more than a day since last claim
      dailyPoint.currentStreak = 0;
      dailyPoint.nextClaimAmount = 1000;
    }

    // Check for referral bonus
    let bonusMultiplier = 1;
    if (dailyPoint.dailyReferrals > 2) {
      bonusMultiplier = 2;
    }

    // Claim points
    const claimedAmount = dailyPoint.nextClaimAmount * bonusMultiplier;
    user.addEarnings(claimedAmount);
    await user.save();

    // Update daily point record
    dailyPoint.currentStreak += 1;
    dailyPoint.lastClaimDate = today;
    dailyPoint.nextClaimAmount = Math.min(dailyPoint.currentStreak * 1000, 30000);
    dailyPoint.dailyReferrals = 0; // Reset daily referrals
    dailyPoint.lastReferralReset = today;
    await dailyPoint.save();

    res.status(200).json({
      message: 'Daily points claimed successfully',
      claimedAmount,
      currentStreak: dailyPoint.currentStreak,
      nextClaimAmount: dailyPoint.nextClaimAmount,
      newBalance: user.balance,
      bonusApplied: bonusMultiplier > 1
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get daily point status
exports.getDailyPointStatus = async (req, res) => {
  try {
    const { telegramUserId } = req.params;

    const user = await User.findOne({ telegramUserId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let dailyPoint = await DailyPoint.findOne({ user: user._id });
    if (!dailyPoint) {
      dailyPoint = new DailyPoint({ user: user._id });
      await dailyPoint.save();
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const canClaimToday = !dailyPoint.lastClaimDate || dailyPoint.lastClaimDate < today;

    res.status(200).json({
      currentStreak: dailyPoint.currentStreak,
      nextClaimAmount: dailyPoint.nextClaimAmount,
      lastClaimDate: dailyPoint.lastClaimDate,
      canClaimToday,
      dailyReferrals: dailyPoint.dailyReferrals,
      bonusEligible: dailyPoint.dailyReferrals > 2
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get all referrals for a user
exports.getUserReferrals = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await User.findById(userId).populate('referrals', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.referrals);
  } catch (error) {
    handleError(res, error);
  }
};

// Get user details
exports.getUserDetails = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const user = await User.findOne({ telegramUserId }).populate('referrals', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.checkAndUpdateRole();
    const currentEarnings = user.isEarning ? user.calculateEarnings() : 0;

    res.json({
      telegramUserId: user.telegramUserId,
      username: user.username,
      role: user.role,
      balance: user.balance,
      currentEarnings,
      isEarning: user.isEarning,
      lastStartTime: user.lastStartTime,
      lastClaimTime: user.lastClaimTime,
      roleExpiryDate: user.roleExpiryDate,
      referralCode: user.username,
      referredBy: user.referredBy,
      referrals: user.referrals.map(ref => ref.username),
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Play game and update user score
exports.playGame = async (req, res) => {
  try {
    const { username, score } = req.body;

    if (!username || typeof score !== 'number') {
      return res.status(400).json({ message: 'Invalid input' });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldBalance = user.balance;
    user.balance += score;
    user.totalEarnings += score;
    user.lastActive = new Date();

    await user.save();

    res.status(200).json({
      message: 'Game score added to balance successfully',
      newHighScore: user.balance > oldBalance,
      scoreAdded: score,
      newBalance: user.balance,
      previousBalance: oldBalance
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Update wallet address using username
exports.updateWalletAddress = async (req, res) => {
  try {
    const { username, walletAddress } = req.body;

    // Check if username and wallet address are provided
    if (!username || !walletAddress) {
      return res.status(400).json({ message: 'Username and wallet address are required' });
    }

    // Find the user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the wallet address is already in use by another user
    const existingUser = await User.findOne({ walletAddress });
    if (existingUser && existingUser.username !== user.username) {
      return res.status(400).json({ message: 'Wallet address is already in use' });
    }

    // Update wallet address for the found user
    user.walletAddress = walletAddress;
    await user.save();

    // Send success response
    res.json({ message: 'Wallet address updated successfully', walletAddress: user.walletAddress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get wallet address using username
exports.getWalletAddress = async (req, res) => {
  try {
    const { username } = req.query; // Assuming you pass username as a query parameter

    // Check if the username is provided
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Find the user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the wallet address exists
    if (!user.walletAddress) {
      return res.status(404).json({ message: 'Wallet address not set' });
    }

    // Respond with the wallet address
    res.json({ walletAddress: user.walletAddress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllUsersWithWallets = async (req, res) => {
  try {
    // Fetch all users, selecting the username, wallet address, and telegramUserId
    const users = await User.find({}, 'telegramUserId username walletAddress');

    if (!users || users.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getRoleDetails = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const { role, durationInDays } = req.body;

    // Input validation
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    // Find the user
    const user = await User.findOne({ telegramUserId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the user's role
    user.setRole(role, durationInDays);
    await user.save();

    // Prepare the response
    const response = {
      message: 'User role updated successfully',
      user: {
        telegramUserId: user.telegramUserId,
        username: user.username,
        role: user.role,
        roleExpiryDate: user.roleExpiryDate
      }
    };

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

// Complete a task
exports.completeTask = async (req, res) => {
  try {
    const { username, taskId } = req.body;

    if (!username || !taskId) {
      return res.status(400).json({ message: 'Username and taskId are required' });
    }

    const [user, task] = await Promise.all([
      User.findOne({ username }),
      Task.findById(taskId)
    ]);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (user.tasksCompleted.includes(taskId)) {
      return res.status(400).json({ message: 'Task already completed' });
    }

    user.tasksCompleted.push(taskId);
    user.addEarnings(task.points);

    if (user.tasks) {
      user.tasks = user.tasks.filter(t => t.toString() !== taskId);
    }

    await user.save();

    res.status(200).json({ message: 'Task completed successfully', user });
  } catch (error) {
    handleError(res, error);
  }
};

// Get completed tasks (continued)
exports.getCompletedTasks = async (req, res) => {
  try {
    const { userId } = req.params;
    let user;

    if (ObjectId.isValid(userId)) {
      user = await User.findById(userId).populate('tasksCompleted');
    } else {
      user = await User.findOne({ telegramUserId: userId }).populate('tasksCompleted');
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.tasksCompleted);
  } catch (error) {
    handleError(res, error);
  }
};

// Start earning points
exports.startEarning = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const user = await User.findOne({ telegramUserId });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.isEarning) {
      return res.status(400).json({ message: 'User is already earning points' });
    }
    
    if (!user.canStartEarning()) {
      return res.status(400).json({ message: 'User cannot start earning right now.' });
    }
    
    user.startEarning();
    user.lastActive = new Date();
    await user.save();
    
    res.status(200).json({ message: 'Started earning points', user });
  } catch (error) {
    handleError(res, error);
  }
};

// Claim earned points
exports.claimPoints = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const user = await User.findOne({ telegramUserId });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.checkAndUpdateRole();
    const claimedAmount = user.claim();
    
    if (claimedAmount > 0) {
      user.lastActive = new Date();
      await user.save();
      
      res.status(200).json({
        message: 'Points claimed successfully',
        claimedAmount,
        newBalance: user.balance,
        isEarning: user.isEarning
      });
    } else {
      res.status(400).json({ message: 'No points available to claim' });
    }
  } catch (error) {
    handleError(res, error);
  }
};

// Set user role
exports.setUserRole = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const { role, durationInDays } = req.body;

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const user = await User.findOne({ telegramUserId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.setRole(role, durationInDays);
    await user.save();

    res.status(200).json({ message: 'User role updated successfully', user });
  } catch (error) {
    handleError(res, error);
  }
};

// Get total stats
exports.getTotalStats = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    const [totalStats, dailyUsers, onlineUsers] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalMined: { $sum: '$totalEarnings' }
          }
        }
      ]),
      User.countDocuments({ lastClaimTime: { $gte: oneDayAgo } }),
      User.countDocuments({ lastActive: { $gte: oneHourAgo } })
    ]);

    const stats = totalStats[0] || { totalUsers: 0, totalMined: 0 };

    res.status(200).json({
      totalUsers: stats.totalUsers,
      totalMined: stats.totalMined,
      dailyUsers,
      onlineUsers
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.applyPromoCode = async (req, res) => {
  try {
    const { telegramUserId, promoCode } = req.body;

    // Input validation
    if (!telegramUserId || !promoCode) {
      return res.status(400).json({ message: 'Telegram User ID and promo code are required' });
    }

    // Find user
    const user = await User.findOne({ telegramUserId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find promo code
    const promoCodeDoc = await PromoCode.findOne({ code: promoCode });
    if (!promoCodeDoc) {
      return res.status(404).json({ message: 'Promo code not found' });
    }

    // Check if promo code is active
    if (!promoCodeDoc.isActive) {
      return res.status(400).json({ message: 'Promo code is not active' });
    }

    // Check if promo code has expired
    if (promoCodeDoc.expirationDate && promoCodeDoc.expirationDate < new Date()) {
      return res.status(400).json({ message: 'Promo code has expired' });
    }

    // Check if user has used this promo code in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUse = user.usedPromoCodes && user.usedPromoCodes.find(usage => 
      usage.promoCode.equals(promoCodeDoc._id) && usage.usedAt > twentyFourHoursAgo
    );

    if (recentUse) {
      const timeLeft = new Date(recentUse.usedAt.getTime() + 24 * 60 * 60 * 1000) - new Date();
      const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
      return res.status(400).json({ 
        message: `You can use this promo code again in ${hoursLeft} hours` 
      });
    }

    // Apply promo code
    const pointsAdded = promoCodeDoc.pointsBoost;
    user.balance += pointsAdded;

    // Update user's used promo codes
    if (!user.usedPromoCodes) {
      user.usedPromoCodes = [];
    }
    user.usedPromoCodes.push({
      promoCode: promoCodeDoc._id,
      usedAt: new Date()
    });

    await user.save();

    res.status(200).json({
      message: 'Promo code applied successfully',
      pointsAdded,
      newBalance: user.balance
    });
  } catch (error) {
    console.error('Error applying promo code:', error);
    res.status(500).json({ message: 'An error occurred while applying the promo code' });
  }
};

exports.createPromoCode = async (req, res) => {
  try {
    const { code, pointsBoost, isActive, expirationDate } = req.body;

    // Validate input
    if (!code || !pointsBoost) {
      return res.status(400).json({ message: 'Code and pointsBoost are required' });
    }

    // Check if promo code already exists
    const existingPromoCode = await PromoCode.findOne({ code });
    if (existingPromoCode) {
      return res.status(400).json({ message: 'Promo code already exists' });
    }

    const newPromoCode = new PromoCode({
      code,
      pointsBoost,
      isActive: isActive !== undefined ? isActive : true,
      expirationDate: expirationDate ? new Date(expirationDate) : undefined
    });

    await newPromoCode.save();

    res.status(201).json({
      message: 'Promo code created successfully',
      promoCode: newPromoCode
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating promo code', error: error.message });
  }
} 