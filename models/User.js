const mongoose = require('mongoose');
const Task = require('./Task');

// Define StakeSchema
const StakeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  period: {
    type: Number,
    required: true
  },
  interestRate: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'claimed', 'unstaked'],
    default: 'active'
  },
  appliedPromoCodes: [{
    type: String
  }],
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  telegramUserId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true, // This allows multiple users to have null wallet addresses
  },
  role: {
    type: String,
    enum: ['User', 'MonthlyBooster', 'LifeTimeBooster', 'Monthly3xBooster', 'LifeTime6xBooster'],
    default: 'User',
  },
  balance: {
    type: Number,
    default: 0,
  },
  lastClaimTime: {
    type: Date,
    default: null,
  },
  lastStartTime: {
    type: Date,
    default: null,
  },
  roleExpiryDate: {
    type: Date,
    default: null,
  },
  isEarning: {
    type: Boolean,
    default: false,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  referrals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  joinBonus: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  gameScore: {
    type: Number,
    default: 0,
  },
  tasksCompleted: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
  }],
  stakes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stake',
  }],
  lastActive: {
    type: Date,
    default: Date.now,
  },
  usedPromoCodes: [{
    promoCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PromoCode'
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],
}, { timestamps: true });

// Static method to find a user by telegramUserId
UserSchema.statics.findByTelegramUserId = function(telegramUserId) {
  return this.findOne({ telegramUserId: telegramUserId });
};

UserSchema.methods.startEarning = function() {
  if (!this.isEarning) {
    this.isEarning = true;
    this.lastStartTime = new Date();
    return true;
  }
  return false;
};

UserSchema.methods.stopEarning = function() {
  if (this.isEarning) {
    this.isEarning = false;
    return true;
  }
  return false;
};

UserSchema.methods.calculateEarnings = function() {
  if (!this.lastStartTime || !this.isEarning) {
    return 0;
  }
  
  const now = new Date();
  const hoursSinceStart = (now - this.lastStartTime) / (1000 * 60 * 60);
  let baseEarnings = 10800 * hoursSinceStart; // Calculate earnings based on exact time

  switch (this.role) {
    case 'MonthlyBooster':
    case 'LifeTimeBooster':
      return Math.floor(baseEarnings);
    case 'Monthly3xBooster':
      return Math.floor(baseEarnings * 3);
    case 'LifeTime6xBooster':
      return Math.floor(baseEarnings * 6);
    case 'User':
      return Math.min(Math.floor(baseEarnings), 3600); // Cap at 10800 for User role
    default:
      return 0;
  }
};

UserSchema.methods.claim = function() {
  const earnings = this.calculateEarnings();
  if (earnings > 0) {
    this.addEarnings(earnings);
    this.lastClaimTime = new Date();
    this.stopEarning(); // Stop earning for all roles after claiming
    this.lastStartTime = null; // Reset lastStartTime
    return earnings;
  }
  return 0;
};

UserSchema.methods.addEarnings = function(amount) {
  this.balance += amount;
  this.totalEarnings += amount;
};

UserSchema.methods.setRole = function(role, durationInDays = null) {
  this.role = role;
  if (durationInDays) {
    this.roleExpiryDate = new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000);
  } else if (role.includes('LifeTime')) {
    this.roleExpiryDate = null;
  }
};

UserSchema.methods.checkAndUpdateRole = function() {
  if (this.roleExpiryDate && this.roleExpiryDate <= new Date()) {
    this.role = 'User';
    this.roleExpiryDate = null;
    this.stopEarning(); // Stop earning when role changes to User
  }
};

UserSchema.methods.canStartEarning = function() {
  // All roles can start earning at any time if they're not already earning
  return !this.isEarning;
};

UserSchema.methods.stake = async function(amount, period) {
  if (this.balance < amount) {
    throw new Error('Insufficient balance for staking');
  }

  let interestRate;
  switch (period) {
    case 3:
      interestRate = 0.03;
      break;
    case 15:
      interestRate = 0.10;
      break;
    case 45:
      interestRate = 0.35;
      break;
    default:
      throw new Error('Invalid staking period');
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + period * 24 * 60 * 60 * 1000);

  const stake = new Stake({
    user: this._id,
    amount,
    period,
    interestRate,
    startDate,
    endDate,
    status: 'active'
  });

  await stake.save();
  
  this.stakes.push(stake._id);
  this.balance -= amount; // Deduct staked amount from balance
  await this.save();

  return stake;
};

UserSchema.methods.claimStake = async function(stakeId) {
  const stake = await Stake.findById(stakeId);
  
  if (!stake || !this.stakes.includes(stakeId)) {
    throw new Error('Stake not found or does not belong to this user');
  }

  if (stake.status !== 'active') {
    throw new Error('Stake is not active');
  }

  if (new Date() < stake.endDate) {
    throw new Error('Staking period has not ended yet');
  }

  const interest = stake.amount * stake.interestRate;
  const totalAmount = stake.amount + interest;

  this.balance += totalAmount;
  stake.status = 'claimed';

  this.stakes = this.stakes.filter(id => id.toString() !== stakeId.toString());

  await stake.save();
  await this.save();

  return { principal: stake.amount, interest, totalAmount };
};

UserSchema.methods.unstake = async function(stakeId) {
  const stake = await Stake.findById(stakeId);
  
  if (!stake || !this.stakes.includes(stakeId)) {
    throw new Error('Stake not found or does not belong to this user');
  }

  if (stake.status !== 'active') {
    throw new Error('Stake is not active');
  }

  let principal = stake.amount;
  let interest = 0;

  if (new Date() >= stake.endDate) {
    // If the stake has matured, calculate interest
    interest = stake.amount * stake.interestRate;
  }

  const totalAmount = principal + interest;

  this.balance += totalAmount;
  stake.status = 'unstaked';

  this.stakes = this.stakes.filter(id => id.toString() !== stakeId.toString());

  await stake.save();
  await this.save();

  return { principal, interest, totalAmount };
};

UserSchema.methods.getActiveStakes = async function() {
  return Stake.find({
    _id: { $in: this.stakes },
    status: 'active'
  });
};

UserSchema.methods.getClaimableStakes = async function() {
  return Stake.find({
    _id: { $in: this.stakes },
    status: 'active',
    endDate: { $lte: new Date() }
  });
};

// Methods for managing wallet address
UserSchema.methods.setWalletAddress = function(address) {
  this.walletAddress = address;
  return this.save();
};

UserSchema.methods.getWalletAddress = function() {
  return this.walletAddress;
};
// Add this new schema for promo codes
const PromoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  pointsBoost: {
    type: Number,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  expirationDate: {
    type: Date,
  },
}, { timestamps: true });


UserSchema.methods.applyPromoCode = async function(promoCode) {
  // Check if all tasks are completed
  const allTasks = await Task.find({ isActive: true });
  const completedTasksCount = this.tasksCompleted.length;

  if (completedTasksCount < allTasks.length) {
    throw new Error('You must complete all available tasks before using a promo code');
  }

  // Find the promo code in the database
  const promoCodeDoc = await PromoCode.findOne({ code: promoCode, isActive: true });

  if (!promoCodeDoc) {
    throw new Error('Invalid or inactive promo code');
  }

  // Check if the promo code has expired
  if (promoCodeDoc.expirationDate && promoCodeDoc.expirationDate < new Date()) {
    throw new Error('Promo code has expired');
  }

  // Check if user has used this promo code in the last 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentUse = this.usedPromoCodes.find(usage => 
    usage.promoCode.equals(promoCodeDoc._id) && usage.usedAt > twentyFourHoursAgo
  );

  if (recentUse) {
    const timeLeft = new Date(recentUse.usedAt.getTime() + 24 * 60 * 60 * 1000) - new Date();
    const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
    throw new Error(`You can use this promo code again in ${hoursLeft} hours`);
  }

  // Apply the promo code
  this.balance += promoCodeDoc.pointsBoost;
  this.usedPromoCodes.push({
    promoCode: promoCodeDoc._id,
    usedAt: new Date()
  });

  await this.save();

  return promoCodeDoc.pointsBoost;
};

const User = mongoose.model('User', UserSchema);
const Stake = mongoose.model('Stake', StakeSchema);
const PromoCode = mongoose.model('PromoCode', PromoCodeSchema);

module.exports = { User, Stake, PromoCode };