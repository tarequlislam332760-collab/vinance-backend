import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("🔍 MONGO_URI:",          dbURI                          ? "Found ✅" : "Missing ❌");
console.log("🔍 JWT_SECRET:",         process.env.JWT_SECRET         ? "Found ✅" : "Missing ❌");
console.log("🔍 NOWPAYMENTS_API_KEY:",process.env.NOWPAYMENTS_API_KEY? "Found ✅" : "Missing ❌");

if (!dbURI) { console.error("❌ MONGO_URI is missing!"); process.exit(1); }

mongoose.connect(dbURI, { serverSelectionTimeoutMS: 30000 })
  .then(() => console.log("✅ Database Connected"))
  .catch(err => { console.error("❌ DB Error:", err.message); process.exit(1); });

/* ================= SCHEMAS / MODELS ================= */

const UserSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, unique: true, required: true, lowercase: true, trim: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['user','admin'], default: 'user' },
  balance:      { type: Number, default: 0 },
  profileImage: { type: String, default: '' },
  img:          { type: String, default: '' },
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, required: true },
  amount:        { type: Number, required: true },
  symbol:        { type: String, default: 'USDT' },
  status:        { type: String, enum: ['pending','approved','rejected','completed'], default: 'pending' },
  method:        { type: String },
  txId:          { type: String },
  transactionId: { type: String },
  address:       { type: String },
  paymentId:     { type: String },
  txHash:        { type: String },
  entryPrice:    { type: Number, default: 0 },
  details:       { type: String },
  date:          { type: Date, default: Date.now },
}, { timestamps: true });

const PlanSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  minAmount:     { type: Number, required: true },
  maxAmount:     { type: Number, required: true },
  profitPercent: { type: Number, required: true },
  duration:      { type: Number, required: true },
  durationHours: { type: Number },
  status:        { type: Boolean, default: true },
}, { timestamps: true });

const InvestmentSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  amount:   { type: Number, required: true },
  profit:   { type: Number, default: 0 },
  status:   { type: String, enum: ['active','completed'], default: 'active' },
  expireAt: { type: Date },
}, { timestamps: true });

const FuturesTradeSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  symbol:     { type: String, required: true, uppercase: true },
  type:       { type: String, enum: ['buy','sell'], required: true },
  amount:     { type: Number, required: true },
  leverage:   { type: Number, default: 1 },
  entryPrice: { type: Number, required: true },
  closePrice: { type: Number, default: null },
  tp:         { type: Number, default: null },
  sl:         { type: Number, default: null },
  pnl:        { type: Number, default: 0 },
  status:     { type: String, enum: ['open','closed'], default: 'open' },
}, { timestamps: true });

const TraderSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  image:        { type: String, default: '' },
  img:          { type: String, default: '' },
  avatar:       { type: String, default: '' },
  profit:       { type: Number, default: 0 },
  pnl:          { type: Number, default: 0 },
  winRate:      { type: Number, default: 0 },
  roi:          { type: Number, default: 0 },
  aum:          { type: Number, default: 0 },
  mdd:          { type: Number, default: 0 },
  days:         { type: Number, default: 0 },
  followers:    { type: Number, default: 0 },
  maxFollowers: { type: Number, default: 500 },
  isApiEnabled: { type: Boolean, default: true },
  chartData:    [Number],
  experience:   { type: Number },
  capital:      { type: Number },
  status:       { type: String, default: 'pending' },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const SpotTradeSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol:    { type: String, required: true, uppercase: true },
  side:      { type: String, enum: ['buy','sell'], required: true },
  orderType: { type: String, enum: ['market','limit'], default: 'market' },
  amount:    { type: Number, required: true },
  price:     { type: Number, required: true },
  total:     { type: Number, required: true },
  fee:       { type: Number, default: 0 },
  status:    { type: String, enum: ['filled','pending','cancelled'], default: 'filled' },
}, { timestamps: true });

const User         = mongoose.models.User         || mongoose.model('User',         UserSchema);
const Transaction  = mongoose.models.Transaction  || mongoose.model('Transaction',  TransactionSchema);
const Plan         = mongoose.models.Plan         || mongoose.model('Plan',         PlanSchema);
const Investment   = mongoose.models.Investment   || mongoose.model('Investment',   InvestmentSchema);
const FuturesTrade = mongoose.models.FuturesTrade || mongoose.model('FuturesTrade', FuturesTradeSchema);
const Trader       = mongoose.models.Trader       || mongoose.model('Trader',       TraderSchema);
const SpotTrade    = mongoose.models.SpotTrade    || mongoose.model('SpotTrade',    SpotTradeSchema);

/* ================= AUTH MIDDLEWARE ================= */

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token invalid or expired' });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === 'admin') next();
  else res.status(403).json({ message: 'Admin only' });
};

/* ================= HELPER ================= */

const getLivePrice = async (symbol) => {
  try {
    const res = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`
    );
    return parseFloat(res.data.price);
  } catch { return null; }
};

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC ROUTES
═══════════════════════════════════════════════════════════════════ */

app.get('/',        (req, res) => res.json({ message: '🚀 Vinance System Online', status: 'OK' }));
app.get('/health',  (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', time: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

/* ── Register ── */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashed });
    res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ── Login ── */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid Email or Password' });
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const userData = user.toObject();
    delete userData.password;
    res.json({ success: true, token, user: userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ── Plans (public) ── */
app.get('/api/plans', async (req, res) => {
  try { res.json(await Plan.find({ status: true })); }
  catch { res.status(500).json([]); }
});

/* ── Traders (public) — both routes ── */
app.get('/api/traders', async (req, res) => {
  try {
    const traders = await Trader.find({ status: { $in: ['active','approved'] } }).sort({ roi: -1, profit: -1 });
    res.json(traders);
  } catch { res.status(500).json([]); }
});

app.get('/api/traders/all', async (req, res) => {
  try {
    const traders = await Trader.find({ status: { $in: ['active','approved'] } }).sort({ createdAt: -1 });
    res.json(traders);
  } catch { res.status(500).json([]); }
});

/* ═══════════════════════════════════════════════════════════════════
   USER ROUTES (auth required)
═══════════════════════════════════════════════════════════════════ */

/* ── Profile ── */
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, profileImage, img } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, profileImage: profileImage || img },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/profile/update', auth, async (req, res) => {
  try {
    const { name, email, password, img } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (name)  user.name  = name;
    if (email) user.email = email.toLowerCase();
    if (img)   { user.img = img; user.profileImage = img; }
    if (password?.trim()) user.password = await bcrypt.hash(password, 10);
    await user.save();
    const updated = user.toObject(); delete updated.password;
    res.json({ success: true, message: 'Profile Updated!', user: updated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Transactions ── */
app.get('/api/transactions', auth, async (req, res) => {
  try {
    const trx = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(trx);
  } catch { res.status(500).json([]); }
});

/* ── Deposit ── */
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, currency, method, txId, transactionId } = req.body;
    if (!amount || amount < 10)
      return res.status(400).json({ message: 'Minimum deposit is $10' });

    const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

    if (!NOWPAYMENTS_API_KEY) {
      // Manual deposit — admin will approve
      await Transaction.create({
        userId: req.user.id,
        type: 'deposit',
        amount: Number(amount),
        symbol: 'USDT',
        status: 'pending',
        method: method || 'Manual',
        txId: txId || transactionId || '',
        transactionId: txId || transactionId || '',
      });
      return res.json({
        success: true,
        message: 'Deposit request submitted! Admin will verify within 24 hours.',
        manual: true,
      });
    }

    // NOWPayments
    const payment = await axios.post(
      'https://api.nowpayments.io/v1/payment',
      {
        price_amount: Number(amount),
        price_currency: 'usd',
        pay_currency: currency || 'usdttrc20',
        order_id: `vinance_${req.user.id}_${Date.now()}`,
        order_description: `Deposit for user ${req.user.id}`,
        ipn_callback_url: `${process.env.BACKEND_URL || 'https://vinance-backend-1.onrender.com'}/api/deposit/webhook`,
      },
      { headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' } }
    );

    const trx = await Transaction.create({
      userId: req.user.id,
      type: 'deposit',
      amount: Number(amount),
      symbol: 'USDT',
      status: 'pending',
      paymentId: payment.data.payment_id,
      address: payment.data.pay_address,
    });

    res.json({
      success: true,
      paymentId: payment.data.payment_id,
      address: payment.data.pay_address,
      amount: payment.data.pay_amount,
      currency: payment.data.pay_currency,
      transaction: trx,
    });
  } catch (err) {
    console.error('Deposit error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Deposit failed', error: err.response?.data || err.message });
  }
});

/* ── Withdraw ── */
app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, address, method } = req.body;
    if (!amount || amount < 10)
      return res.status(400).json({ message: 'Minimum withdrawal is $10' });
    if (!address)
      return res.status(400).json({ message: 'Wallet address is required' });

    const user = await User.findById(req.user.id);
    if (user.balance < amount)
      return res.status(400).json({ message: 'Insufficient balance' });

    await Transaction.create({
      userId: req.user.id,
      type: 'withdraw',
      amount: Number(amount),
      symbol: 'USDT',
      status: 'pending',
      method: method || 'USDT (TRC20)',
      address,
      details: `Address: ${address}`,
    });

    res.json({ success: true, message: 'Withdrawal request submitted! Processing within 24 hours.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Spot Trade ── */
app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, amount, symbol, orderType, limitPrice } = req.body;
    if (!amount || amount <= 0)
      return res.status(400).json({ message: 'Invalid amount' });

    const user = await User.findById(req.user.id);
    if (user.balance < amount)
      return res.status(400).json({ message: 'Insufficient balance' });

    const livePrice  = await getLivePrice(symbol || 'BTC') || parseFloat(limitPrice) || 1;
    const tradePrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : livePrice;
    const fee        = parseFloat(amount) * 0.001;

    if (type === 'buy') {
      user.balance -= (parseFloat(amount) + fee);
    } else {
      user.balance += (parseFloat(amount) - fee);
    }
    await user.save();

    await SpotTrade.create({
      user: req.user.id,
      symbol: (symbol || 'BTC').toUpperCase(),
      side: type,
      orderType: orderType || 'market',
      amount: parseFloat(amount),
      price: tradePrice,
      total: parseFloat(amount),
      fee,
    });

    await Transaction.create({
      userId: req.user.id,
      type: type === 'buy' ? 'spot_buy' : 'spot_sell',
      amount: parseFloat(amount),
      symbol: (symbol || 'BTC').toUpperCase(),
      status: 'completed',
      entryPrice: tradePrice,
    });

    res.json({
      success: true,
      message: `${type === 'buy' ? '✅ Buy' : '✅ Sell'} order filled at $${tradePrice.toFixed(2)}`,
      entryPrice: tradePrice,
      fee,
      newBalance: user.balance,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/trade/history', auth, async (req, res) => {
  try {
    res.json(await SpotTrade.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50));
  } catch { res.status(500).json([]); }
});

/* ── Futures Trade ── */
app.post('/api/futures/trade', auth, async (req, res) => {
  try {
    const { symbol, type, amount, leverage, entryPrice, tp, sl } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

    const price = entryPrice || await getLivePrice(symbol?.replace('USDT','') || 'BTC');
    if (!price) return res.status(400).json({ message: 'Could not fetch entry price' });

    user.balance -= parseFloat(amount);
    await user.save();

    const trade = await FuturesTrade.create({
      user:       req.user.id,
      userId:     req.user.id,
      symbol:     (symbol || 'BTC').toUpperCase().replace('USDT','') + 'USDT',
      type,
      amount:     parseFloat(amount),
      leverage:   parseInt(leverage) || 1,
      entryPrice: parseFloat(price),
      tp:         tp || null,
      sl:         sl || null,
      status:     'open',
    });

    await Transaction.create({
      userId:     req.user.id,
      type:       `futures-${type}`,
      amount:     parseFloat(amount),
      symbol:     symbol?.toUpperCase(),
      status:     'completed',
      entryPrice: parseFloat(price),
      details:    `Leverage: ${leverage}x | Entry: $${price}`,
    });

    res.json({
      success: true,
      message: `${type === 'buy' ? '↑ Long' : '↓ Short'} opened at $${parseFloat(price).toFixed(2)}`,
      trade,
      entryPrice: price,
      newBalance: user.balance,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Futures Positions ── */
app.get('/api/futures/positions', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const positions = await FuturesTrade.find({
      $or: [{ user: userId }, { userId }],
      status: 'open',
    }).sort({ createdAt: -1 });

    const enriched = await Promise.all(positions.map(async (pos) => {
      const sym       = pos.symbol.replace('USDT', '');
      const markPrice = await getLivePrice(sym) || pos.entryPrice;
      const priceDiff = pos.type === 'buy'
        ? markPrice - pos.entryPrice
        : pos.entryPrice - markPrice;
      const pnl           = (priceDiff / pos.entryPrice) * pos.amount * pos.leverage;
      const pnlPercentage = ((priceDiff / pos.entryPrice) * pos.leverage * 100).toFixed(2);
      const liqPrice      = pos.type === 'buy'
        ? (pos.entryPrice * (1 - 1 / pos.leverage)).toFixed(2)
        : (pos.entryPrice * (1 + 1 / pos.leverage)).toFixed(2);

      return {
        ...pos.toObject(),
        markPrice,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercentage,
        liquidationPrice: liqPrice,
        side: pos.type === 'buy' ? 'Buy' : 'Sell',
        size: `${pos.amount} USDT`,
      };
    }));

    res.json(enriched);
  } catch { res.status(500).json([]); }
});

/* ── Close Position (body) ── */
app.post('/api/futures/close', auth, async (req, res) => {
  try {
    const { positionId } = req.body;
    const userId = req.user.id;
    const trade  = await FuturesTrade.findOne({
      _id: positionId,
      $or: [{ user: userId }, { userId }],
    });
    if (!trade)                  return res.status(404).json({ message: 'Position not found' });
    if (trade.status === 'closed') return res.status(400).json({ message: 'Already closed' });

    const sym        = trade.symbol.replace('USDT', '');
    const closePrice = await getLivePrice(sym) || trade.entryPrice;
    const priceDiff  = trade.type === 'buy'
      ? closePrice - trade.entryPrice
      : trade.entryPrice - closePrice;
    const pnl = (priceDiff / trade.entryPrice) * trade.amount * trade.leverage;

    trade.pnl        = parseFloat(pnl.toFixed(2));
    trade.closePrice = closePrice;
    trade.status     = 'closed';
    await trade.save();

    const returnAmt = trade.amount + trade.pnl;
    if (returnAmt > 0)
      await User.findByIdAndUpdate(userId, { $inc: { balance: returnAmt } });

    res.json({
      success: true,
      message: `Position closed. PNL: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl}`,
      pnl: trade.pnl,
      closePrice,
      returnAmount: returnAmt,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Close Position (URL param) ── */
app.post('/api/futures/close/:tradeId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const trade  = await FuturesTrade.findOne({
      _id: req.params.tradeId,
      $or: [{ user: userId }, { userId }],
    });
    if (!trade)                  return res.status(404).json({ message: 'Trade not found' });
    if (trade.status === 'closed') return res.status(400).json({ message: 'Already closed' });

    const sym        = trade.symbol.replace('USDT', '');
    const closePrice = await getLivePrice(sym) || trade.entryPrice;
    const priceDiff  = trade.type === 'buy'
      ? closePrice - trade.entryPrice
      : trade.entryPrice - closePrice;
    const pnl = (priceDiff / trade.entryPrice) * trade.amount * trade.leverage;

    trade.pnl        = parseFloat(pnl.toFixed(2));
    trade.closePrice = closePrice;
    trade.status     = 'closed';
    await trade.save();

    const returnAmt = trade.amount + trade.pnl;
    if (returnAmt > 0)
      await User.findByIdAndUpdate(userId, { $inc: { balance: returnAmt } });

    res.json({ success: true, message: 'Trade closed', pnl: trade.pnl, closePrice });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/futures/history', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    res.json(await FuturesTrade.find({ $or: [{ user: userId }, { userId }] }).sort({ createdAt: -1 }).limit(50));
  } catch { res.status(500).json([]); }
});

/* ── Investment ── */
app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (amount < plan.minAmount || amount > plan.maxAmount)
      return res.status(400).json({ message: `Amount must be $${plan.minAmount}–$${plan.maxAmount}` });

    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

    user.balance -= Number(amount);
    await user.save();

    const duration = plan.duration || plan.durationHours || 24;
    const expireAt = new Date(Date.now() + duration * 3600000);
    await Investment.create({ userId: req.user.id, planId, amount, expireAt });
    await Transaction.create({ userId: req.user.id, type: 'investment', amount, symbol: 'USDT', status: 'completed' });

    res.json({ success: true, message: 'Investment successful!', newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/my-investments', auth, async (req, res) => {
  try {
    res.json(await Investment.find({ userId: req.user.id }).populate('planId').sort({ createdAt: -1 }));
  } catch { res.status(500).json([]); }
});

/* ── Auto-complete investments every minute ── */
setInterval(async () => {
  try {
    const expired = await Investment.find({ status: 'active', expireAt: { $lte: new Date() } });
    for (const inv of expired) {
      const plan = await Plan.findById(inv.planId);
      if (!plan) continue;
      const profit = (inv.amount * plan.profitPercent) / 100;
      inv.profit = profit;
      inv.status = 'completed';
      await inv.save();
      await User.findByIdAndUpdate(inv.userId, { $inc: { balance: inv.amount + profit } });
    }
  } catch (err) { console.error('Auto-complete error:', err.message); }
}, 60000);

/* ── Become Trader ── */
app.post('/api/become-trader', auth, async (req, res) => {
  try {
    const { name, img, image, profit, winRate, aum, mdd, experience, capital } = req.body;
    await Trader.create({
      name,
      img:          img || image || '',
      image:        img || image || '',
      avatar:       img || image || '',
      profit:       Number(profit)   || 0,
      winRate:      Number(winRate)  || 0,
      aum:          Number(aum)      || 0,
      mdd:          Number(mdd)      || 0,
      experience:   Number(experience) || 0,
      capital:      Number(capital)  || 0,
      userId:       req.user.id,
      status:       'pending',
    });
    res.json({ success: true, message: 'Application submitted!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/traders/apply', auth, async (req, res) => {
  try {
    const { name, img, image, profit, winRate, aum, mdd } = req.body;
    await Trader.create({
      name,
      img: img || image || '',
      image: img || image || '',
      profit: Number(profit) || 0,
      winRate: Number(winRate) || 0,
      aum: Number(aum) || 0,
      mdd: Number(mdd) || 0,
      userId: req.user.id,
      status: 'pending',
    });
    res.json({ success: true, message: 'Application submitted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ═══════════════════════════════════════════════════════════════════
   ADMIN ROUTES
═══════════════════════════════════════════════════════════════════ */

/* ── All data ── */
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const [users, requests, traders, plans, investments] = await Promise.all([
      User.find().select('-password').sort({ createdAt: -1 }),
      Transaction.find().populate('userId', 'name email').sort({ createdAt: -1 }),
      Trader.find().sort({ createdAt: -1 }),
      Plan.find(),
      Investment.find().populate('userId','name email').populate('planId','name profitPercent').sort({ createdAt: -1 }),
    ]);
    res.json({ success: true, users, requests, traders, plans, investments });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ── Stats ── */
app.get('/api/admin/stats', auth, adminAuth, async (req, res) => {
  try {
    const users           = await User.countDocuments();
    const totalBalanceAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
    const pendingDeposits = await Transaction.countDocuments({ type:'deposit',  status:'pending' });
    const pendingWithdaws = await Transaction.countDocuments({ type:'withdraw', status:'pending' });
    res.json({ users, totalBalance: totalBalanceAgg[0]?.total || 0, pendingDeposits, pendingWithdaws });
  } catch (err) { res.status(500).json({}); }
});

/* ── Users ── */
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try { res.json(await User.find().select('-password').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.put('/api/admin/user/:id', auth, adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/update-user', auth, adminAuth, async (req, res) => {
  try {
    const { userId, ...data } = req.body;
    await User.findByIdAndUpdate(userId, data);
    res.json({ success: true, message: 'User Updated' });
  } catch { res.status(500).json({ success: false }); }
});

app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    if (balance < 0) return res.status(400).json({ message: 'Balance cannot be negative' });
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: 'Balance Updated' });
  } catch { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/delete-user/:id', auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User Deleted' });
  } catch { res.status(500).json({ success: false }); }
});

/* ── Handle deposit/withdraw requests ── */
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { id, requestId, status } = req.body;
    const trx = await Transaction.findById(id || requestId);
    if (!trx) return res.status(404).json({ message: 'Transaction not found' });
    if (trx.status === status) return res.status(400).json({ message: `Already ${status}` });

    if (status === 'approved') {
      if (trx.type === 'deposit') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      } else if (trx.type === 'withdraw') {
        const user = await User.findById(trx.userId);
        if (!user || user.balance < trx.amount)
          return res.status(400).json({ message: 'Insufficient user balance' });
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: -trx.amount } });
      }
    }

    trx.status = status;
    await trx.save();
    res.json({ success: true, message: `Request ${status}`, transaction: trx });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/pending-requests', auth, adminAuth, async (req, res) => {
  try {
    res.json(await Transaction.find({ status: 'pending' }).populate('userId','name email').sort({ createdAt: -1 }));
  } catch { res.status(500).json([]); }
});

app.get('/api/admin/transactions', auth, adminAuth, async (req, res) => {
  try {
    res.json(await Transaction.find().populate('userId','name email').sort({ createdAt: -1 }));
  } catch { res.status(500).json([]); }
});

app.get('/api/admin/deposits', auth, adminAuth, async (req, res) => {
  try {
    res.json(await Transaction.find({ type: 'deposit' }).populate('userId','name email').sort({ createdAt: -1 }));
  } catch { res.status(500).json([]); }
});

app.put('/api/admin/deposit/:id', auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const trx = await Transaction.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (status === 'approved')
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    res.json({ success: true, transaction: trx });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ── Traders (admin) ── */
app.post('/api/admin/create-trader', auth, adminAuth, async (req, res) => {
  try {
    const { name, image, img, profit, winRate, roi, pnl, aum, mdd, days, followers, maxFollowers, isApiEnabled, chartData } = req.body;
    const traderImg = image || img || '';
    await Trader.create({
      name,
      image: traderImg, img: traderImg, avatar: traderImg,
      profit:       Number(profit)       || 0,
      winRate:      Number(winRate)      || 0,
      roi:          Number(roi)          || 0,
      pnl:          Number(pnl)          || 0,
      aum:          Number(aum)          || 0,
      mdd:          Number(mdd)          || 0,
      days:         Number(days)         || 0,
      followers:    Number(followers)    || 0,
      maxFollowers: Number(maxFollowers) || 500,
      isApiEnabled: isApiEnabled !== false,
      chartData:    Array.isArray(chartData) ? chartData : [],
      status:       'approved',
    });
    res.json({ success: true, message: 'Trader Created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/edit-trader/:id', auth, adminAuth, async (req, res) => {
  try {
    const data = { ...req.body };
    ['profit','winRate','roi','pnl','aum','mdd','days','followers','maxFollowers'].forEach(k => {
      if (data[k] !== undefined) data[k] = Number(data[k]);
    });
    if (data.image) data.img = data.avatar = data.image;
    if (data.img)   data.image = data.avatar = data.img;
    const updated = await Trader.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!updated) return res.status(404).json({ message: 'Trader not found' });
    res.json({ success: true, message: 'Trader Updated', trader: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/delete-trader/:id', auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Trader Deleted' });
  } catch { res.status(500).json({ success: false }); }
});

/* ── Plans (admin) ── */
app.post('/api/admin/create-plan', auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: 'Plan Created' });
  } catch { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/delete-plan/:id', auth, adminAuth, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Plan Deleted' });
  } catch { res.status(500).json({ success: false }); }
});

/* ── Pending requests (alias) ── */
app.get('/api/admin/pending', auth, adminAuth, async (req, res) => {
  try {
    res.json(await Transaction.find({ status: 'pending' }).populate('userId','name email').sort({ createdAt: -1 }));
  } catch { res.status(500).json([]); }
});

/* ═══════════════════════════════════════════════════════════════════
   START SERVER
═══════════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));

export default app;
