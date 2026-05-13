import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://vinance-frontend-vjqa.vercel.app",
  credentials: true
}));
app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI || "";
console.log("🔍 MONGO_URI:", dbURI ? "Found ✅" : "Missing ❌");
console.log("🔍 JWT_SECRET:", process.env.JWT_SECRET ? "Found ✅" : "Missing ❌");
console.log("🔍 NOWPAYMENTS_API_KEY:", process.env.NOWPAYMENTS_API_KEY ? "Found ✅" : "Missing ❌");

if (!dbURI) {
  console.error("❌ MONGO_URI is missing!");
  process.exit(1);
}

mongoose.connect(dbURI, { serverSelectionTimeoutMS: 30000 })
  .then(() => console.log("✅ Database Connected"))
  .catch(err => console.error("❌ DB Error:", err));

/* ================= SCHEMAS ================= */
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned', 'pending'], default: 'active' },
  balance: { type: Number, default: 0 },
  profileImage: { type: String, default: '' }
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'trade'], required: true },
  amount: { type: Number, required: true },
  symbol: { type: String, default: 'USDT' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  paymentId: { type: String },
  address: { type: String },
  txHash: { type: String },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  profitPercent: { type: Number, required: true },
  duration: { type: Number, required: true },
  status: { type: Boolean, default: true }
}, { timestamps: true });

const InvestmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  amount: { type: Number, required: true },
  profit: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  expireAt: { type: Date, required: true }
}, { timestamps: true });

const FuturesTradeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true, uppercase: true },
  type: { type: String, enum: ['buy', 'sell'], required: true },
  amount: { type: Number, required: true },
  leverage: { type: Number, default: 1 },
  entryPrice: { type: Number, required: true },
  tp: { type: Number, default: null },
  sl: { type: Number, default: null },
  pnl: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  createdAt: { type: Date, default: Date.now }
});

const TraderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  avatar: { type: String },
  roi: { type: Number, default: 0 },
  pnl: { type: Number, default: 0 },
  aum: { type: Number, default: 0 },
  days: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  maxFollowers: { type: Number, default: 300 },
  isApiEnabled: { type: Boolean, default: true },
  chartData: [Number],
  experience: { type: Number },
  capital: { type: Number },
  status: { type: String, default: 'pending' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Plan = mongoose.model('Plan', PlanSchema);
const Investment = mongoose.model('Investment', InvestmentSchema);
const FuturesTrade = mongoose.model('FuturesTrade', FuturesTradeSchema);
const Trader = mongoose.model('Trader', TraderSchema);

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token invalid or expired" });
  }
};

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    next();
  });
};

/* ================= AUTH ROUTES ================= */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "Email already exists" });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email: email.toLowerCase(), password: hashed });
    await user.save();
    res.status(201).json({ message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: "Invalid Email or Password" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid Email or Password" });
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, profileImage } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { name, profileImage }, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= DEPOSIT ROUTES (NOWPayments Real) ================= */

// Create real crypto deposit
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, currency = 'usdttrc20' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

    if (!NOWPAYMENTS_API_KEY) {
      // Fallback: manual deposit if no API key
      const transaction = new Transaction({
        userId: req.user.id,
        type: 'deposit',
        amount: parseFloat(amount),
        symbol: 'USDT',
        status: 'pending'
      });
      await transaction.save();
      return res.json({
        message: "Deposit request submitted. Admin will approve shortly.",
        transaction,
        manual: true
      });
    }

    // NOWPayments real payment
    const paymentResponse = await axios.post(
      'https://api.nowpayments.io/v1/payment',
      {
        price_amount: parseFloat(amount),
        price_currency: 'usd',
        pay_currency: currency,
        order_id: `vinance_${req.user.id}_${Date.now()}`,
        order_description: `Vinance deposit for user ${req.user.id}`,
        ipn_callback_url: `${process.env.BACKEND_URL || 'https://vinance-backend-1.onrender.com'}/api/deposit/webhook`
      },
      {
        headers: {
          'x-api-key': NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const payment = paymentResponse.data;

    // Save transaction
    const transaction = new Transaction({
      userId: req.user.id,
      type: 'deposit',
      amount: parseFloat(amount),
      symbol: currency.toUpperCase(),
      status: 'pending',
      paymentId: payment.payment_id,
      address: payment.pay_address
    });
    await transaction.save();

    res.json({
      paymentId: payment.payment_id,
      address: payment.pay_address,
      amount: payment.pay_amount,
      currency: payment.pay_currency,
      status: payment.payment_status,
      transaction
    });

  } catch (err) {
    console.error("Deposit error:", err.response?.data || err.message);
    res.status(500).json({ message: "Deposit failed", error: err.response?.data || err.message });
  }
});

// NOWPayments Webhook - auto credit balance
app.post('/api/deposit/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['x-nowpayments-sig'];
    const body = req.body;

    // Verify signature
    if (process.env.NOWPAYMENTS_IPN_SECRET) {
      const sortedBody = JSON.stringify(JSON.parse(body), Object.keys(JSON.parse(body)).sort());
      const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
        .update(sortedBody)
        .digest('hex');
      if (hmac !== sig) {
        return res.status(401).json({ message: "Invalid signature" });
      }
    }

    const data = JSON.parse(body);
    console.log("💰 Payment webhook:", data.payment_status, data.payment_id);

    if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
      const transaction = await Transaction.findOne({ paymentId: String(data.payment_id) });
      if (transaction && transaction.status !== 'completed') {
        transaction.status = 'completed';
        transaction.txHash = data.outcome_transaction_hash || '';
        await transaction.save();

        // Credit user balance
        await User.findByIdAndUpdate(transaction.userId, {
          $inc: { balance: transaction.amount }
        });
        console.log(`✅ Balance credited: $${transaction.amount} to user ${transaction.userId}`);
      }
    }

    res.status(200).json({ message: "OK" });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// Check deposit status
app.get('/api/deposit/status/:paymentId', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      paymentId: req.params.paymentId,
      userId: req.user.id
    });
    if (!transaction) return res.status(404).json({ message: "Payment not found" });
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= WITHDRAW ROUTES ================= */
app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, address } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });
    if (!address) return res.status(400).json({ message: "Wallet address required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance!" });

    user.balance -= amount;
    await user.save();

    const transaction = new Transaction({
      userId: user._id,
      type: 'withdraw',
      amount,
      symbol: 'USDT',
      status: 'pending',
      address,
      date: new Date()
    });
    await transaction.save();

    res.json({
      message: "Withdrawal request submitted. Processing within 24 hours.",
      newBalance: user.balance,
      transaction
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= TRANSACTION ROUTES ================= */
app.get('/api/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= FUTURES ROUTES ================= */

// Get live price from Binance
const getLivePrice = async (symbol) => {
  try {
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    return parseFloat(res.data.price);
  } catch {
    return null;
  }
};

app.post('/api/futures/trade', auth, async (req, res) => {
  try {
    const { symbol, type, amount, leverage, tp, sl } = req.body;
    const user = await User.findById(req.user.id);

    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance!" });

    const entryPrice = await getLivePrice(symbol.replace('USDT', ''));
    if (!entryPrice) return res.status(400).json({ message: "Could not fetch live price" });

    user.balance -= parseFloat(amount);
    await user.save();

    const trade = new FuturesTrade({
      user: req.user.id,
      symbol: symbol.toUpperCase(),
      type,
      amount: parseFloat(amount),
      leverage: parseInt(leverage) || 1,
      entryPrice,
      tp: tp || null,
      sl: sl || null
    });
    await trade.save();

    // Log transaction
    const transaction = new Transaction({
      userId: req.user.id,
      type: 'trade',
      amount: parseFloat(amount),
      symbol: symbol.toUpperCase(),
      status: 'approved'
    });
    await transaction.save();

    res.json({ message: "Trade opened", trade, entryPrice, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/futures/positions', auth, async (req, res) => {
  try {
    const positions = await FuturesTrade.find({ user: req.user.id, status: 'open' }).sort({ createdAt: -1 });

    // Add live PNL
    const enriched = await Promise.all(positions.map(async (pos) => {
      const sym = pos.symbol.replace('USDT', '');
      const markPrice = await getLivePrice(sym) || pos.entryPrice;
      const priceDiff = pos.type === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice;
      const pnl = (priceDiff / pos.entryPrice) * pos.amount * pos.leverage;
      const pnlPercentage = ((priceDiff / pos.entryPrice) * pos.leverage * 100).toFixed(2);
      const liquidationPrice = pos.type === 'buy'
        ? pos.entryPrice * (1 - 1 / pos.leverage)
        : pos.entryPrice * (1 + 1 / pos.leverage);

      return {
        ...pos._doc,
        markPrice,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercentage,
        liquidationPrice: liquidationPrice.toFixed(2),
        side: pos.type === 'buy' ? 'Buy' : 'Sell',
        size: `${pos.amount} USDT`
      };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/futures/close/:tradeId', auth, async (req, res) => {
  try {
    const trade = await FuturesTrade.findOne({ _id: req.params.tradeId, user: req.user.id });
    if (!trade) return res.status(404).json({ message: "Trade not found" });
    if (trade.status === 'closed') return res.status(400).json({ message: "Already closed" });

    const sym = trade.symbol.replace('USDT', '');
    const closePrice = await getLivePrice(sym) || trade.entryPrice;
    const priceDiff = trade.type === 'buy' ? closePrice - trade.entryPrice : trade.entryPrice - closePrice;
    const pnl = (priceDiff / trade.entryPrice) * trade.amount * trade.leverage;

    trade.pnl = parseFloat(pnl.toFixed(2));
    trade.status = 'closed';
    await trade.save();

    const returnAmount = trade.amount + trade.pnl;
    await User.findByIdAndUpdate(req.user.id, { $inc: { balance: returnAmount > 0 ? returnAmount : 0 } });

    res.json({ message: "Trade closed", pnl: trade.pnl, closePrice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= INVESTMENT ROUTES ================= */
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (amount < plan.minAmount || amount > plan.maxAmount) {
      return res.status(400).json({ message: `Amount must be between $${plan.minAmount} and $${plan.maxAmount}` });
    }

    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance!" });

    user.balance -= amount;
    await user.save();

    const expireAt = new Date(Date.now() + plan.duration * 60 * 60 * 1000);
    const investment = new Investment({ userId: req.user.id, planId, amount, expireAt });
    await investment.save();

    res.json({ message: "Investment successful!", investment, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/my-investments', auth, async (req, res) => {
  try {
    const investments = await Investment.find({ userId: req.user.id }).populate('planId').sort({ createdAt: -1 });
    res.json(investments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Auto-complete investments (runs every 1 minute)
setInterval(async () => {
  try {
    const expired = await Investment.find({ status: 'active', expireAt: { $lte: new Date() } });
    for (const inv of expired) {
      const plan = await Plan.findById(inv.planId);
      if (!plan) continue;
      const profit = (inv.amount * plan.profitPercent) / 100;
      const total = inv.amount + profit;
      inv.profit = profit;
      inv.status = 'completed';
      await inv.save();
      await User.findByIdAndUpdate(inv.userId, { $inc: { balance: total } });
      console.log(`✅ Investment completed: $${total} credited to user ${inv.userId}`);
    }
  } catch (err) {
    console.error("Investment auto-complete error:", err.message);
  }
}, 60000);

/* ================= TRADER ROUTES ================= */
app.get('/api/traders', async (req, res) => {
  try {
    const traders = await Trader.find({ status: 'active' }).sort({ roi: -1 });
    res.json(traders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/become-trader', auth, async (req, res) => {
  try {
    const trader = new Trader({ ...req.body, userId: req.user.id, status: 'pending' });
    await trader.save();
    res.json({ message: "Application submitted!", trader });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= ADMIN ROUTES ================= */
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const users = await User.countDocuments();
    const totalBalance = await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
    const pendingDeposits = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });
    const pendingWithdraws = await Transaction.countDocuments({ type: 'withdraw', status: 'pending' });
    res.json({ users, totalBalance: totalBalance[0]?.total || 0, pendingDeposits, pendingWithdraws });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/admin/user/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/admin/delete-user/:id', adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/transactions', adminAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Handle deposit/withdraw requests
app.post('/api/admin/handle-request', adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const transaction = await Transaction.findById(id).populate('userId');
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });

    transaction.status = status;
    await transaction.save();

    if (status === 'approved' && transaction.type === 'deposit') {
      await User.findByIdAndUpdate(transaction.userId._id, { $inc: { balance: transaction.amount } });
    }

    res.json({ message: `Request ${status}`, transaction });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/pending-requests', adminAuth, async (req, res) => {
  try {
    const requests = await Transaction.find({ status: 'pending' }).populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Plans
app.post('/api/admin/create-plan', adminAuth, async (req, res) => {
  try {
    const plan = new Plan(req.body);
    await plan.save();
    res.status(201).json({ message: "Plan created", plan });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/admin/delete-plan/:id', adminAuth, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Traders
app.post('/api/admin/create-trader', adminAuth, async (req, res) => {
  try {
    const trader = new Trader({ ...req.body, status: 'active' });
    await trader.save();
    res.status(201).json({ message: "Trader created", trader });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/admin/delete-trader/:id', adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ message: "Trader deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/deposits', adminAuth, async (req, res) => {
  try {
    const deposits = await Transaction.find({ type: 'deposit' }).populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(deposits);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/admin/deposit/:id', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (status === 'approved') {
      await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
    }
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= HEALTH CHECK ================= */
app.get('/', (req, res) => res.json({ message: "🚀 Vinance System Online", status: "OK" }));
app.get('/api/health', (req, res) => res.json({ status: "OK", time: new Date() }));

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
