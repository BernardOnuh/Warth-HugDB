const { User, Stake } = require('../models/User');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

exports.createStake = async (req, res) => {
  try {
    const { userId, amount, period } = req.body;
    const user = await User.findByTelegramUserId(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const stake = await user.stake(amount, period);
    res.status(201).json({ message: 'Stake created successfully', stake });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.claimStake = async (req, res) => {
  try {
    const { userId, stakeId } = req.body;
    const user = await User.findOne({ telegramUserId: userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const claimResult = await user.claimStake(stakeId);

      // Add both principal and interest to the user's balance
      user.balance += claimResult.principal + claimResult.interest;
    
    res.status(200).json({
      message: 'Stake claimed successfully',
      principal: claimResult.principal,
      interest: claimResult.interest,
      totalClaimed: claimResult.totalAmount
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.unstake = async (req, res) => {
  try {
    const { userId, stakeId } = req.body;
    const user = await User.findOne({ telegramUserId: userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const unstakeResult = await user.unstake(stakeId);

    // Add both principal and interest to the user's balance
    user.balance += unstakeResult.principal + unstakeResult.interest;
    res.status(200).json({
      message: 'Stake unstaked successfully',
      principal: unstakeResult.principal,
      interest: unstakeResult.interest,
      totalUnstaked: unstakeResult.totalAmount
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getActiveStakes = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByTelegramUserId(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const activeStakes = await user.getActiveStakes();
    res.status(200).json(activeStakes);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getClaimableStakes = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByTelegramUserId(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const claimableStakes = await user.getClaimableStakes();
    res.status(200).json(claimableStakes);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};