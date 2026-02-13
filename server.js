const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Route handlers for clean URLs
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/login.html');
});

app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

app.get('/admin-login', (req, res) => {
  res.sendFile(__dirname + '/admin-login.html');
});

app.get('/points', (req, res) => {
  res.sendFile(__dirname + '/point.html');
});

// MongoDB connection
const MONGODB_URI = process.env.MONGO_URI || 'mongodb+srv://cent_wise:Senty017@cluster0.se6rjbj.mongodb.net/?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'your-super-secret-jwt-key-change-in-production';

let db;
let usersCol;
let transactionsCol;
let configCol;
let promosCol;
let pointsHistoryCol;
let redemptionsCol;
let rewardsCol;

async function connectDB() {
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    db = client.db('IG_PassChange');
    usersCol = db.collection('users');
    transactionsCol = db.collection('transactions');
    configCol = db.collection('config');
    promosCol = db.collection('promos');
    pointsHistoryCol = db.collection('pointsHistory');
    redemptionsCol = db.collection('redemptions');
    rewardsCol = db.collection('rewards');
    
    console.log('✅ Connected to MongoDB');
    
    // Create admin user if doesn't exist
    await initializeAdmin();
    
    // ONE-TIME FIX: Reset admin password (remove after first run)
    const hashedPassword = await bcrypt.hash('Senty017@', 10);
    await usersCol.updateOne(
      { username: 'admin', role: 'admin' },
      { $set: { password: hashedPassword } }
    );
    console.log('✅ Admin password reset to Senty017@');

    // Initialize default config
    await initializeConfig();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function initializeAdmin() {
  const adminExists = await usersCol.findOne({ username: 'admin' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('Senty017@', 10);
    await usersCol.insertOne({
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date()
    });
    console.log('✅ Admin user created (username: admin, password: Senty017@)');
  }
}

async function initializeConfig() {
  const config = await configCol.findOne({});
  if (!config) {
    await configCol.insertOne({
      botToken: '',
      chatId: '',
      pricePerCredit: 800 / 20,
      maxPurchase: null,
      bankName: '',
      accountNumber: '',
      accountName: '',
      // Points configuration
      pointsPerCredit: {
        threshold1: { minCredits: 200, pointsPerCredit: 0.1 }, // 20 points per 200 credits
        threshold2: { minCredits: 100, pointsPerCredit: 0.05 }  // 5 points per 100 credits
      },
      createdAt: new Date()
    });
    console.log('✅ Default config initialized');
  }
}

// Helper function to calculate points earned
function calculatePointsEarned(credits, config) {
  const pointsConfig = config.pointsPerCredit || {
    threshold1: { minCredits: 200, pointsPerCredit: 0.1 },
    threshold2: { minCredits: 100, pointsPerCredit: 0.05 }
  };

  if (credits >= pointsConfig.threshold1.minCredits) {
    return Math.floor(credits * pointsConfig.threshold1.pointsPerCredit);
  } else if (credits >= pointsConfig.threshold2.minCredits) {
    return Math.floor(credits * pointsConfig.threshold2.pointsPerCredit);
  }
  
  return 0;
}

// Telegram Bot Helper

async function sendTelegramNotification(message, transactionId = null, receiptBase64 = null, isRedemption = false) {
  try {
    const config = await configCol.findOne({});
    if (!config || !config.botToken || !config.chatId) {
      console.log('Telegram not configured');
      return;
    }

    console.log('📤 Sending notification - isRedemption:', isRedemption, 'ID:', transactionId); // DEBUG

    const keyboard = transactionId ? {
      inline_keyboard: [
        [
          { 
            text: '✅ Approve', 
            callback_data: isRedemption ? `redeem_approve_${transactionId}` : `approve_${transactionId}` 
          },
          { 
            text: '❌ Decline', 
            callback_data: isRedemption ? `redeem_decline_${transactionId}` : `decline_${transactionId}` 
          }
        ]
      ]
    } : undefined;

    if (keyboard) {
      console.log('🔘 Callback data being sent:', keyboard.inline_keyboard[0][0].callback_data); // DEBUG
    }

    if (receiptBase64) {
      const base64Data = receiptBase64.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      
      const form = new FormData();
      form.append('chat_id', config.chatId);
      form.append('photo', buffer, { filename: 'receipt.jpg' });
      form.append('caption', message);
      form.append('parse_mode', 'HTML');
      if (keyboard) {
        form.append('reply_markup', JSON.stringify(keyboard));
      }

      await axios.post(`https://api.telegram.org/bot${config.botToken}/sendPhoto`, form, {
        headers: form.getHeaders()
      });
    } else {
      await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
  } catch (error) {
    console.error('Error sending telegram notification:', error.message);
  }
}

// Telegram Webhook Handler
app.post('/telegram-webhook', async (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    const { callback_query } = req.body;
    
    if (callback_query) {
      const data = callback_query.data;
      const messageId = callback_query.message.message_id;
      const chatId = callback_query.message.chat.id;
      
      const config = await configCol.findOne({});
      
      console.log('📌 Callback data received:', data); // DEBUG
      
      // CHECK REDEMPTION PATTERN FIRST
      if (data.startsWith('redeem_approve_') || data.startsWith('redeem_decline_')) {
        console.log('✅ Processing REDEMPTION request');
        
        const redemptionId = data.startsWith('redeem_approve_') 
          ? data.substring('redeem_approve_'.length)
          : data.substring('redeem_decline_'.length);
        const redeemAction = data.startsWith('redeem_approve_') ? 'approve' : 'decline';
        
        console.log('Redemption ID:', redemptionId, '| Action:', redeemAction);
        
        if (redeemAction === 'approve') {
          await approveRedemptionById(redemptionId);
          
          if (callback_query.message.photo) {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageCaption`, {
              chat_id: chatId,
              message_id: messageId,
              caption: callback_query.message.caption + '\n\n✅ <b>APPROVED</b>',
              parse_mode: 'HTML'
            });
          } else {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: callback_query.message.text + '\n\n✅ <b>APPROVED</b>',
              parse_mode: 'HTML'
            });
          }
        } else if (redeemAction === 'decline') {
          await declineRedemptionById(redemptionId);
          
          if (callback_query.message.photo) {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageCaption`, {
              chat_id: chatId,
              message_id: messageId,
              caption: callback_query.message.caption + '\n\n❌ <b>DECLINED</b>',
              parse_mode: 'HTML'
            });
          } else {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: callback_query.message.text + '\n\n❌ <b>DECLINED</b>',
              parse_mode: 'HTML'
            });
          }
        }
        
        await axios.post(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
          callback_query_id: callback_query.id,
          text: `Redemption ${redeemAction}d successfully`
        });
      } else {
        // REGULAR TRANSACTION HANDLING
        console.log('✅ Processing TRANSACTION request');
        
        // Split only on first underscore to preserve ID format
        const firstUnderscoreIndex = data.indexOf('_');
        const action = data.substring(0, firstUnderscoreIndex);
        const transactionId = data.substring(firstUnderscoreIndex + 1);
        
        console.log('Action:', action, '| Transaction ID:', transactionId);
        
        if (action === 'approve') {
          await approveTransactionById(transactionId);
          
          if (callback_query.message.photo) {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageCaption`, {
              chat_id: chatId,
              message_id: messageId,
              caption: callback_query.message.caption + '\n\n✅ <b>APPROVED</b>',
              parse_mode: 'HTML'
            });
          } else {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: callback_query.message.text + '\n\n✅ <b>APPROVED</b>',
              parse_mode: 'HTML'
            });
          }
        } else if (action === 'decline') {
          await declineTransactionById(transactionId);
          
          if (callback_query.message.photo) {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageCaption`, {
              chat_id: chatId,
              message_id: messageId,
              caption: callback_query.message.caption + '\n\n❌ <b>DECLINED</b>',
              parse_mode: 'HTML'
            });
          } else {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: callback_query.message.text + '\n\n❌ <b>DECLINED</b>',
              parse_mode: 'HTML'
            });
          }
        }
        
        await axios.post(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
          callback_query_id: callback_query.id,
          text: `Transaction ${action}d successfully`
        });
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.sendStatus(200);
  }
});

async function approveTransactionById(transactionId) {
  const transaction = await transactionsCol.findOne({ _id: new ObjectId(transactionId) });
  if (transaction && transaction.status === 'pending') {
    await transactionsCol.updateOne(
      { _id: new ObjectId(transactionId) },
      { $set: { status: 'approved', processedAt: new Date() } }
    );
    
    await usersCol.updateOne(
      { _id: transaction.userId },
      { $inc: { credits: transaction.credits } }
    );
    
    // Award points based on credits
    const config = await configCol.findOne({});
    const pointsEarned = calculatePointsEarned(transaction.credits, config);
    
    if (pointsEarned > 0) {
      await usersCol.updateOne(
        { _id: transaction.userId },
        { $inc: { points: pointsEarned } }
      );
      
      // Record points history
      await pointsHistoryCol.insertOne({
        userId: transaction.userId,
        points: pointsEarned,
        type: 'earned',
        description: `Earned from ${transaction.credits} credit purchase`,
        transactionId: new ObjectId(transactionId),
        createdAt: new Date()
      });
      
      console.log(`✅ Approved transaction ${transactionId} - Added ${transaction.credits} credits and ${pointsEarned} points to user ${transaction.userId}`);
    } else {
      console.log(`✅ Approved transaction ${transactionId} - Added ${transaction.credits} credits (no points earned - below threshold)`);
    }
  }
}

async function declineTransactionById(transactionId) {
  const transaction = await transactionsCol.findOne({ _id: new ObjectId(transactionId) });
  if (transaction && transaction.status === 'pending') {
    await transactionsCol.updateOne(
      { _id: new ObjectId(transactionId) },
      { $set: { status: 'declined', processedAt: new Date() } }
    );
  }
}

async function approveRedemptionById(redemptionId) {
  const redemption = await redemptionsCol.findOne({ _id: new ObjectId(redemptionId) });
  if (redemption && redemption.status === 'pending') {
    await redemptionsCol.updateOne(
      { _id: new ObjectId(redemptionId) },
      { $set: { status: 'approved', completedAt: new Date() } }
    );
    
    const reward = await rewardsCol.findOne({ _id: redemption.rewardId });
    
    // Process redemption based on reward type
    if (reward.type === 'credits') {
      await usersCol.updateOne(
        { _id: redemption.userId },
        { $inc: { credits: reward.value } }
      );
    } else if (reward.type === 'referral' && redemption.formData.referralChatId) {
      // Award free credits to referred user
      await usersCol.updateOne(
        { chat_id: redemption.formData.referralChatId },
        { $inc: { credits: reward.value } }
      );
    }
    
    console.log(`✅ Approved redemption ${redemptionId}`);
  }
}

async function declineRedemptionById(redemptionId) {
  const redemption = await redemptionsCol.findOne({ _id: new ObjectId(redemptionId) });
  if (redemption && redemption.status === 'pending') {
    await redemptionsCol.updateOne(
      { _id: new ObjectId(redemptionId) },
      { $set: { status: 'declined', completedAt: new Date() } }
    );
    
    // Refund points
    await usersCol.updateOne(
      { _id: redemption.userId },
      { $inc: { points: redemption.pointsUsed } }
    );
    
    // Record points history
    await pointsHistoryCol.insertOne({
      userId: redemption.userId,
      points: redemption.pointsUsed,
      type: 'earned',
      description: `Refunded from declined redemption: ${redemption.rewardName}`,
      redemptionId: new ObjectId(redemptionId),
      createdAt: new Date()
    });
  }
}

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await usersCol.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = { 
      id: user._id.toString(), 
      username: user.username || `User_${user.chat_id}`,
      role: user.role || 'user',
      chatId: user.chat_id,
      credits: user.credits || 0,
      points: user.points || 0
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Auth Routes
app.post('/api/login', async (req, res) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(401).json({ error: 'Chat ID is required' });
    }

    const user = await usersCol.findOne({ chat_id: parseInt(chatId) });
    if (!user) {
      return res.status(401).json({ error: 'User not found. Please check your Chat ID.' });
    }

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        chatId: user.chat_id,
        credits: user.credits || 0,
        points: user.points || 0,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await usersCol.findOne({ username, role: 'admin' });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// FIXED: This endpoint now fetches fresh user data from database instead of using cached JWT data
app.get('/api/verify', authMiddleware, async (req, res) => {
  try {
    // Fetch fresh user data from database
    const user = await usersCol.findOne({ _id: new ObjectId(req.user.id) });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ 
      user: {
        id: user._id.toString(),
        username: user.username || `User_${user.chat_id}`,
        role: user.role || 'user',
        chatId: user.chat_id,
        credits: user.credits || 0,
        points: user.points || 0
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Config Routes
app.get('/api/config', async (req, res) => {
  try {
    const config = await configCol.findOne({});
    res.json({
      pricePerCredit: config.pricePerCredit,
      maxPurchase: config.maxPurchase,
      bankName: config.bankName,
      accountNumber: config.accountNumber,
      accountName: config.accountName
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Promo Routes
app.post('/api/promo/validate', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    
    const promo = await promosCol.findOne({ code: code.toUpperCase(), active: true });
    
    if (!promo) {
      return res.json({ valid: false, message: 'Invalid or inactive promo code' });
    }

    res.json({
      valid: true,
      promo: {
        code: promo.code,
        discount: promo.discount
      }
    });
  } catch (error) {
    console.error('Error validating promo:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/transaction/create', authMiddleware, async (req, res) => {
  try {
    const { credits, amount, promoCode, receipt, note } = req.body;

    if (!credits || !amount || !receipt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transaction = {
      userId: new ObjectId(req.user.id),
      username: req.user.username,
      chatId: req.user.chatId,
      credits,
      amount,
      promoCode: promoCode || null,
      receipt,
      note: note || '',
      status: 'pending',
      createdAt: new Date()
    };

    const result = await transactionsCol.insertOne(transaction);
    
    const message = `
🔔 <b>New Transaction</b>

👤 Username: @${req.user.username}
💬 Chat ID: ${req.user.chatId}
💳 Credits: ${credits}
💰 Amount: ₦${amount.toFixed(2)}
${promoCode ? `🎟️ Promo: ${promoCode}\n` : ''}${note ? `📝 Note: ${note}\n` : ''}🆔 Transaction ID: ${result.insertedId}

⏳ Status: PENDING
    `.trim();
    
    await sendTelegramNotification(message, result.insertedId.toString(), receipt);

    res.json({ success: true, transactionId: result.insertedId });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/transactions/user', authMiddleware, async (req, res) => {
  try {
    const transactions = await transactionsCol
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// POINTS SYSTEM ROUTES
// ============================================

// Get user's points balance
app.get('/api/points/balance', authMiddleware, async (req, res) => {
  try {
    const user = await usersCol.findOne({ _id: new ObjectId(req.user.id) });
    res.json({ points: user.points || 0 });
  } catch (error) {
    console.error('Error fetching points:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get points configuration
app.get('/api/points/config', async (req, res) => {
  try {
    const config = await configCol.findOne({});
    res.json({
      pointsPerCredit: config.pointsPerCredit || {
        threshold1: { minCredits: 200, pointsPerCredit: 0.1 },
        threshold2: { minCredits: 100, pointsPerCredit: 0.05 }
      }
    });
  } catch (error) {
    console.error('Error fetching points config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get available rewards
app.get('/api/points/rewards', async (req, res) => {
  try {
    const rewards = await rewardsCol.find({}).sort({ pointsCost: 1 }).toArray();
    res.json({ rewards });
  } catch (error) {
    console.error('Error fetching rewards:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Redeem a reward
app.post('/api/points/redeem', authMiddleware, async (req, res) => {
  try {
    const { rewardId, formData } = req.body;

    const reward = await rewardsCol.findOne({ _id: new ObjectId(rewardId) });
    if (!reward) {
      return res.status(404).json({ error: 'Reward not found' });
    }

    if (!reward.active) {
      return res.status(400).json({ error: 'Reward is not active' });
    }

    const user = await usersCol.findOne({ _id: new ObjectId(req.user.id) });
    const userPoints = user.points || 0;

    if (userPoints < reward.pointsCost) {
      return res.status(400).json({ error: 'Insufficient points' });
    }

    // Validate form data based on reward type
    if (reward.type === 'referral') {
      const referredUser = await usersCol.findOne({ chat_id: formData.referralChatId });
      if (!referredUser) {
        return res.status(400).json({ error: 'Referred user not found. Please check the Chat ID.' });
      }
      if (referredUser._id.toString() === req.user.id) {
        return res.status(400).json({ error: 'You cannot refer yourself!' });
      }
    }

    // Deduct points
    await usersCol.updateOne(
      { _id: new ObjectId(req.user.id) },
      { $inc: { points: -reward.pointsCost } }
    );

    // Create redemption request
    const redemption = {
      userId: new ObjectId(req.user.id),
      username: req.user.username,
      chatId: req.user.chatId,
      rewardId: new ObjectId(rewardId),
      rewardName: reward.name,
      rewardType: reward.type,
      pointsUsed: reward.pointsCost,
      formData: formData || {},
      status: 'pending',
      createdAt: new Date()
    };

    const result = await redemptionsCol.insertOne(redemption);

    // Record points deduction history
    await pointsHistoryCol.insertOne({
      userId: new ObjectId(req.user.id),
      points: reward.pointsCost,
      type: 'spent',
      description: `Redeemed: ${reward.name}`,
      redemptionId: result.insertedId,
      createdAt: new Date()
    });

    // Send Telegram notification to admin
    let message = `
🎁 <b>New Points Redemption</b>

👤 Username: @${req.user.username}
💬 Chat ID: ${req.user.chatId}
🏆 Reward: ${reward.name}
💎 Points Used: ${reward.pointsCost}
`;

    if (reward.type === 'password_reset') {
      message += `\n🔐 Type: Password Reset Link`;
      if (formData.username) {
        message += `\n📝 IG Username: @${formData.username}`;
      }
      message += `\n💳 Credits to Award: ${reward.value}`;
    } else if (reward.type === 'referral') {
      message += `\n👥 Type: Referral`;
      message += `\n📱 Referred Chat ID: ${formData.referralChatId}`;
      message += `\n💳 Free Credits for Friend: ${reward.value}`;
    } else if (reward.type === 'cash') {
      message += `\n💰 Type: Cash Withdrawal`;
      message += `\n💵 Amount: ₦${reward.value}`;
      message += `\n🏦 Bank: ${formData.bankDetails.bankName}`;
      message += `\n💳 Account: ${formData.bankDetails.accountNumber}`;
      message += `\n👤 Name: ${formData.bankDetails.accountName}`;
    } else if (reward.type === 'credits') {
      message += `\n💳 Type: Credit Reward`;
      message += `\n💎 Credits to Award: ${reward.value}`;
    }

    message += `\n🆔 Redemption ID: ${result.insertedId}`;
    message += `\n\n⏳ Status: PENDING`;

    await sendTelegramNotification(message, result.insertedId.toString(), null, true);

    res.json({ 
      success: true, 
      message: '🎉 Redemption request submitted! Your request is being processed.',
      redemptionId: result.insertedId 
    });
  } catch (error) {
    console.error('Error redeeming reward:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's points history
app.get('/api/points/history', authMiddleware, async (req, res) => {
  try {
    const history = await pointsHistoryCol
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ history });
  } catch (error) {
    console.error('Error fetching points history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's redemption history
app.get('/api/points/redemptions', authMiddleware, async (req, res) => {
  try {
    const redemptions = await redemptionsCol
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ redemptions });
  } catch (error) {
    console.error('Error fetching redemptions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ADMIN POINTS MANAGEMENT ROUTES
// ============================================

// Get all redemptions (admin)
app.get('/api/admin/redemptions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const redemptions = await redemptionsCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ redemptions });
  } catch (error) {
    console.error('Error fetching redemptions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get redemption details (admin)
app.get('/api/admin/redemption/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const redemption = await redemptionsCol.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    res.json({ redemption });
  } catch (error) {
    console.error('Error fetching redemption:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve redemption (admin)
app.post('/api/admin/redemption/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await approveRedemptionById(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error approving redemption:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Decline redemption (admin)
app.post('/api/admin/redemption/:id/decline', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await declineRedemptionById(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error declining redemption:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all rewards (admin)
app.get('/api/admin/rewards', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rewards = await rewardsCol.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ rewards });
  } catch (error) {
    console.error('Error fetching rewards:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create reward (admin)
app.post('/api/admin/reward/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, type, pointsCost, value, active } = req.body;

    if (!name || !type || !pointsCost) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const reward = {
      name,
      description: description || '',
      type, // 'credits', 'password_reset', 'referral', 'cash', 'custom'
      pointsCost,
      value: value || 0,
      active: active !== false,
      createdAt: new Date()
    };

    await rewardsCol.insertOne(reward);
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating reward:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update reward (admin)
app.put('/api/admin/reward/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, pointsCost, value, active } = req.body;

    const update = {};
    if (name) update.name = name;
    if (description !== undefined) update.description = description;
    if (pointsCost) update.pointsCost = pointsCost;
    if (value !== undefined) update.value = value;
    if (active !== undefined) update.active = active;

    await rewardsCol.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating reward:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete reward (admin)
app.delete('/api/admin/reward/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await rewardsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reward:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update points configuration (admin)
app.post('/api/admin/config/points', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { pointsPerCredit } = req.body;

    await configCol.updateOne({}, { $set: { pointsPerCredit } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating points config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Routes
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const pending = await transactionsCol.countDocuments({ status: 'pending' });
    const approved = await transactionsCol.countDocuments({ status: 'approved' });
    const declined = await transactionsCol.countDocuments({ status: 'declined' });
    
    const revenueResult = await transactionsCol.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    
    const revenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // Points stats
    const pendingRedemptions = await redemptionsCol.countDocuments({ status: 'pending' });
    const totalPointsAwarded = await pointsHistoryCol.aggregate([
      { $match: { type: 'earned' } },
      { $group: { _id: null, total: { $sum: '$points' } } }
    ]).toArray();
    const pointsAwarded = totalPointsAwarded.length > 0 ? totalPointsAwarded[0].total : 0;

    res.json({ 
      pending, 
      approved, 
      declined, 
      revenue,
      pendingRedemptions,
      pointsAwarded
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/transactions/recent', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transactions = await transactionsCol
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/transactions/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transactions = await transactionsCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/transaction/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transaction = await transactionsCol.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/transaction/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transaction = await transactionsCol.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction already processed' });
    }

    await approveTransactionById(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error approving transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/transaction/:id/decline', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transaction = await transactionsCol.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction already processed' });
    }

    await declineTransactionById(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error declining transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await configCol.findOne({});
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/config/telegram', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    
    await configCol.updateOne({}, { $set: { botToken, chatId } });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving telegram config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/config/pricing', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { pricePerCredit, maxPurchase } = req.body;
    
    const update = {};
    if (pricePerCredit !== null) update.pricePerCredit = pricePerCredit;
    if (maxPurchase !== null) update.maxPurchase = maxPurchase;
    else update.maxPurchase = null;
    
    await configCol.updateOne({}, { $set: update });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving pricing config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/config/account', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { bankName, accountNumber, accountName } = req.body;
    
    await configCol.updateOne({}, { 
      $set: { bankName, accountNumber, accountName } 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving account config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Webhook setup endpoints
app.post('/api/admin/setup-webhook', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    const config = await configCol.findOne({});
    
    if (!config.botToken) {
      return res.status(400).json({ error: 'Bot token not configured' });
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${config.botToken}/setWebhook`,
      { url: webhookUrl }
    );
    
    if (response.data.ok) {
      res.json({ success: true, message: 'Webhook set successfully' });
    } else {
      res.status(400).json({ error: response.data.description });
    }
  } catch (error) {
    console.error('Error setting webhook:', error);
    res.status(500).json({ error: 'Failed to set webhook' });
  }
});

app.get('/api/admin/webhook-info', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await configCol.findOne({});
    
    if (!config.botToken) {
      return res.status(400).json({ error: 'Bot token not configured' });
    }

    const response = await axios.get(
      `https://api.telegram.org/bot${config.botToken}/getWebhookInfo`
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error getting webhook info:', error);
    res.status(500).json({ error: 'Failed to get webhook info' });
  }
});

// Promo Admin Routes
app.get('/api/admin/promos', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const promos = await promosCol.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ promos });
  } catch (error) {
    console.error('Error fetching promos:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/promo/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { code, discount, active } = req.body;
    
    const existing = await promosCol.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: 'Promo code already exists' });
    }

    await promosCol.insertOne({
      code: code.toUpperCase(),
      discount,
      active,
      createdAt: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error creating promo:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/promo/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    
    await promosCol.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { active } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling promo:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/promo/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await promosCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting promo:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Admin Login: username=admin, password=Senty017@`);
  });
});
