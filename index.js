import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ================= DB ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!dbURI) { console.error("❌ MONGO_URI missing"); process.exit(1); }
mongoose.connect(dbURI, { serverSelectionTimeoutMS: 30000 })
  .then(() => console.log("✅ Database Connected"))
  .catch(err => { console.error("❌ DB:", err.message); process.exit(1); });

/* ================= SCHEMAS ================= */

const UserSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, unique: true, required: true, lowercase: true, trim: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['user','admin'], default: 'user' },
  balance:      { type: Number, default: 0 },
  profileImage: { type: String, default: '' },
  img:          { type: String, default: '' },
  xp:           { type: Number, default: 0 },
  followers:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, required: true },
  amount:        { type: Number, required: true },
  symbol:        { type: String, default: 'USDT' },
  status:        { type: String, enum: ['pending','approved','rejected','completed'], default: 'pending' },
  method:        String,
  txId:          String,
  transactionId: String,
  address:       String,
  paymentId:     String,
  txHash:        String,
  entryPrice:    { type: Number, default: 0 },
  details:       String,
  date:          { type: Date, default: Date.now },
}, { timestamps: true });

const PlanSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  minAmount:     { type: Number, required: true },
  maxAmount:     { type: Number, required: true },
  profitPercent: { type: Number, required: true },
  duration:      { type: Number, required: true },
  durationHours: Number,
  status:        { type: Boolean, default: true },
}, { timestamps: true });

const InvestmentSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  amount:   { type: Number, required: true },
  profit:   { type: Number, default: 0 },
  status:   { type: String, enum: ['active','completed'], default: 'active' },
  expireAt: Date,
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
  experience:   Number,
  capital:      Number,
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

/* ── NEW: Square Post Schema ── */
const PostSchema = new mongoose.Schema({
  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  authorHandle: { type: String },
  content:    { type: String, required: true, maxlength: 280 },
  tag:        { type: String, default: 'All' },
  likes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments:   [{
    author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    text:       String,
    createdAt:  { type: Date, default: Date.now },
  }],
  shares:     { type: Number, default: 0 },
  views:      { type: Number, default: 0 },
  verified:   { type: Boolean, default: false },
}, { timestamps: true });

/* ── NEW: Notification Schema ── */
const NotificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:    { type: String, default: 'system' },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  amount:  Number,
  read:    { type: Boolean, default: false },
  link:    String,
}, { timestamps: true });

/* ── NEW: CopyTrade Schema ── */
const CopyTradeSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  traderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trader', required: true },
  amount:   { type: Number, required: true },
  profit:   { type: Number, default: 0 },
  status:   { type: String, enum: ['active','stopped'], default: 'active' },
  trades:   { type: Number, default: 0 },
  roi:      { type: Number, default: 0 },
}, { timestamps: true });

/* ── NEW: CapitalConnect Application Schema ── */
const CapitalApplicationSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:        { type: String, enum: ['fund_invest','vc_apply','fund_register'], required: true },
  targetName:  String,
  fundName:    String,
  website:     String,
  aum:         String,
  strategy:    String,
  description: String,
  status:      { type: String, enum: ['pending','reviewed','approved','rejected'], default: 'pending' },
  email:       String,
}, { timestamps: true });

const User               = mongoose.models.User               || mongoose.model('User',               UserSchema);
const Transaction        = mongoose.models.Transaction        || mongoose.model('Transaction',        TransactionSchema);
const Plan               = mongoose.models.Plan               || mongoose.model('Plan',               PlanSchema);
const Investment         = mongoose.models.Investment         || mongoose.model('Investment',         InvestmentSchema);
const FuturesTrade       = mongoose.models.FuturesTrade       || mongoose.model('FuturesTrade',       FuturesTradeSchema);
const Trader             = mongoose.models.Trader             || mongoose.model('Trader',             TraderSchema);
const SpotTrade          = mongoose.models.SpotTrade          || mongoose.model('SpotTrade',          SpotTradeSchema);
const Post               = mongoose.models.Post               || mongoose.model('Post',               PostSchema);
const Notification       = mongoose.models.Notification       || mongoose.model('Notification',       NotificationSchema);
const CopyTrade          = mongoose.models.CopyTrade          || mongoose.model('CopyTrade',          CopyTradeSchema);
const CapitalApplication = mongoose.models.CapitalApplication || mongoose.model('CapitalApplication', CapitalApplicationSchema);

/* ================= AUTH ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ message: 'Token invalid or expired' }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === 'admin') next();
  else res.status(403).json({ message: 'Admin only' });
};

/* ================= HELPERS ================= */
const getLivePrice = async (symbol) => {
  try {
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`);
    return parseFloat(res.data.price);
  } catch { return null; }
};

/* Push a notification to a user */
const pushNotif = async (userId, type, title, message, amount = null) => {
  try {
    await Notification.create({ userId, type, title, message, ...(amount !== null ? { amount } : {}) });
  } catch (e) { console.error('pushNotif error:', e.message); }
};

/* ═══════════════════════════════════════
   PUBLIC ROUTES
═══════════════════════════════════════ */
app.get('/',           (_, res) => res.json({ message: '🚀 Vinance Online', status: 'OK' }));
app.get('/health',     (_, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.get('/api/health', (_, res) => res.json({ status: 'OK', time: new Date() }));

/* ── Register ── */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ message: 'Email already exists' });
    await User.create({ name, email: email.toLowerCase(), password: await bcrypt.hash(password, 10) });
    res.json({ success: true, message: 'Registration successful' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Login ── */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid Email or Password' });
    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const userData = user.toObject(); delete userData.password;
    res.json({ success: true, token, user: userData });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Plans (public) ── */
app.get('/api/plans', async (_, res) => {
  try { res.json(await Plan.find({ status: true })); } catch { res.status(500).json([]); }
});

/* ── Traders (public) ── */
app.get('/api/traders', async (_, res) => {
  try { res.json(await Trader.find({ status: { $in: ['active','approved'] } }).sort({ roi: -1 })); }
  catch { res.status(500).json([]); }
});
app.get('/api/traders/all', async (_, res) => {
  try { res.json(await Trader.find({ status: { $in: ['active','approved'] } }).sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* ═══════════════════════════════════════
   USER ROUTES
═══════════════════════════════════════ */

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
    const user = await User.findByIdAndUpdate(req.user.id, { name, profileImage: profileImage || img }, { new: true }).select('-password');
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
  try { res.json(await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* ── Deposit ── */
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, currency, method, txId, transactionId } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ message: 'Minimum deposit is $10' });
    const KEY = process.env.NOWPAYMENTS_API_KEY;
    if (!KEY) {
      await Transaction.create({ userId: req.user.id, type: 'deposit', amount: Number(amount), symbol: 'USDT', status: 'pending', method: method || 'Manual', txId: txId || transactionId || '', transactionId: txId || transactionId || '' });
      await pushNotif(req.user.id, 'deposit', '💰 Deposit Submitted', `Your deposit of $${amount} is pending admin approval.`, amount);
      return res.json({ success: true, message: 'Deposit submitted. Admin will verify within 24h.', manual: true });
    }
    const payment = await axios.post('https://api.nowpayments.io/v1/payment', {
      price_amount: Number(amount), price_currency: 'usd', pay_currency: currency || 'usdttrc20',
      order_id: `vinance_${req.user.id}_${Date.now()}`,
      ipn_callback_url: `${process.env.BACKEND_URL || 'https://vinance-backend-1.onrender.com'}/api/deposit/webhook`,
    }, { headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' } });
    const trx = await Transaction.create({ userId: req.user.id, type: 'deposit', amount: Number(amount), symbol: 'USDT', status: 'pending', paymentId: payment.data.payment_id, address: payment.data.pay_address });
    res.json({ success: true, paymentId: payment.data.payment_id, address: payment.data.pay_address, amount: payment.data.pay_amount, currency: payment.data.pay_currency, transaction: trx });
  } catch (err) {
    console.error('Deposit error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Deposit failed', error: err.response?.data || err.message });
  }
});

/* ── Withdraw ── */
app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, address, method } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ message: 'Minimum withdrawal is $10' });
    if (!address) return res.status(400).json({ message: 'Wallet address required' });
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    await Transaction.create({ userId: req.user.id, type: 'withdraw', amount: Number(amount), symbol: 'USDT', status: 'pending', method: method || 'USDT (TRC20)', address, details: `Address: ${address}` });
    await pushNotif(req.user.id, 'withdraw', '💸 Withdrawal Requested', `Withdrawal of $${amount} is pending processing.`, amount);
    res.json({ success: true, message: 'Withdrawal request submitted! Processing within 24h.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ── Spot Trade ── */
app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, amount, symbol, orderType, limitPrice } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    const livePrice  = await getLivePrice(symbol || 'BTC') || parseFloat(limitPrice) || 1;
    const tradePrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : livePrice;
    const fee        = parseFloat(amount) * 0.001;
    if (type === 'buy') user.balance -= (parseFloat(amount) + fee);
    else                user.balance += (parseFloat(amount) - fee);
    await user.save();
    await SpotTrade.create({ user: req.user.id, symbol: (symbol||'BTC').toUpperCase(), side: type, orderType: orderType||'market', amount: parseFloat(amount), price: tradePrice, total: parseFloat(amount), fee });
    await Transaction.create({ userId: req.user.id, type: type==='buy'?'spot_buy':'spot_sell', amount: parseFloat(amount), symbol: (symbol||'BTC').toUpperCase(), status: 'completed', entryPrice: tradePrice });
    res.json({ success: true, message: `${type==='buy'?'✅ Buy':'✅ Sell'} order filled at $${tradePrice.toFixed(2)}`, entryPrice: tradePrice, fee, newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/trade/history', auth, async (req, res) => {
  try { res.json(await SpotTrade.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50)); }
  catch { res.status(500).json([]); }
});

/* ── Futures ── */
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
    const trade = await FuturesTrade.create({ user: req.user.id, userId: req.user.id, symbol: (symbol||'BTC').toUpperCase().replace('USDT','')+('USDT'), type, amount: parseFloat(amount), leverage: parseInt(leverage)||1, entryPrice: parseFloat(price), tp: tp||null, sl: sl||null, status: 'open' });
    await Transaction.create({ userId: req.user.id, type: `futures-${type}`, amount: parseFloat(amount), symbol: symbol?.toUpperCase(), status: 'completed', entryPrice: parseFloat(price), details: `Leverage: ${leverage}x | Entry: $${price}` });
    res.json({ success: true, message: `${type==='buy'?'↑ Long':'↓ Short'} opened at $${parseFloat(price).toFixed(2)}`, trade, entryPrice: price, newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/futures/positions', auth, async (req, res) => {
  try {
    const userId   = req.user.id;
    const positions = await FuturesTrade.find({ $or: [{ user: userId }, { userId }], status: 'open' }).sort({ createdAt: -1 });
    const enriched  = await Promise.all(positions.map(async pos => {
      const sym       = pos.symbol.replace('USDT','');
      const markPrice = await getLivePrice(sym) || pos.entryPrice;
      const priceDiff = pos.type === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice;
      const pnl       = (priceDiff / pos.entryPrice) * pos.amount * pos.leverage;
      return { ...pos.toObject(), markPrice, pnl: parseFloat(pnl.toFixed(2)), pnlPercentage: ((priceDiff / pos.entryPrice) * pos.leverage * 100).toFixed(2), liquidationPrice: pos.type==='buy' ? (pos.entryPrice*(1-1/pos.leverage)).toFixed(2) : (pos.entryPrice*(1+1/pos.leverage)).toFixed(2), side: pos.type==='buy'?'Buy':'Sell', size: `${pos.amount} USDT` };
    }));
    res.json(enriched);
  } catch { res.status(500).json([]); }
});

app.post('/api/futures/close', auth, async (req, res) => {
  try {
    const { positionId } = req.body;
    const userId  = req.user.id;
    const trade   = await FuturesTrade.findOne({ _id: positionId, $or: [{ user: userId }, { userId }] });
    if (!trade)                    return res.status(404).json({ message: 'Position not found' });
    if (trade.status === 'closed') return res.status(400).json({ message: 'Already closed' });
    const sym        = trade.symbol.replace('USDT','');
    const closePrice = await getLivePrice(sym) || trade.entryPrice;
    const priceDiff  = trade.type === 'buy' ? closePrice - trade.entryPrice : trade.entryPrice - closePrice;
    const pnl        = (priceDiff / trade.entryPrice) * trade.amount * trade.leverage;
    trade.pnl = parseFloat(pnl.toFixed(2)); trade.closePrice = closePrice; trade.status = 'closed';
    await trade.save();
    const returnAmt = trade.amount + trade.pnl;
    if (returnAmt > 0) await User.findByIdAndUpdate(userId, { $inc: { balance: returnAmt } });
    await pushNotif(userId, 'futures', '⚡ Position Closed', `${trade.symbol} closed. PNL: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl}`, trade.pnl);
    res.json({ success: true, message: `Position closed. PNL: ${trade.pnl>=0?'+':''}$${trade.pnl}`, pnl: trade.pnl, closePrice, returnAmount: returnAmt });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/futures/close/:tradeId', auth, async (req, res) => {
  try {
    const userId  = req.user.id;
    const trade   = await FuturesTrade.findOne({ _id: req.params.tradeId, $or: [{ user: userId }, { userId }] });
    if (!trade)                    return res.status(404).json({ message: 'Trade not found' });
    if (trade.status === 'closed') return res.status(400).json({ message: 'Already closed' });
    const closePrice = await getLivePrice(trade.symbol.replace('USDT','')) || trade.entryPrice;
    const priceDiff  = trade.type === 'buy' ? closePrice - trade.entryPrice : trade.entryPrice - closePrice;
    const pnl        = (priceDiff / trade.entryPrice) * trade.amount * trade.leverage;
    trade.pnl = parseFloat(pnl.toFixed(2)); trade.closePrice = closePrice; trade.status = 'closed';
    await trade.save();
    const returnAmt = trade.amount + trade.pnl;
    if (returnAmt > 0) await User.findByIdAndUpdate(userId, { $inc: { balance: returnAmt } });
    res.json({ success: true, message: 'Trade closed', pnl: trade.pnl, closePrice });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/futures/history', auth, async (req, res) => {
  try { const u = req.user.id; res.json(await FuturesTrade.find({ $or: [{ user: u }, { userId: u }] }).sort({ createdAt: -1 }).limit(50)); }
  catch { res.status(500).json([]); }
});

/* ── Investment ── */
app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    const safeMin = Math.min(plan.minAmount, plan.maxAmount);
    const safeMax = Math.max(plan.minAmount, plan.maxAmount);
    if (safeMax > 0 && (amount < safeMin || amount > safeMax))
      return res.status(400).json({ message: `Amount must be $${safeMin}–$${safeMax}` });
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    user.balance -= Number(amount); await user.save();
    const duration = plan.duration || plan.durationHours || 24;
    const expireAt = new Date(Date.now() + duration * 3600000);
    await Investment.create({ userId: req.user.id, planId, amount, expireAt });
    await Transaction.create({ userId: req.user.id, type: 'investment', amount, symbol: 'USDT', status: 'completed' });
    await pushNotif(req.user.id, 'investment', '🏦 Investment Activated', `$${amount} invested in ${plan.name}. Returns in ${duration}h.`, amount);
    res.json({ success: true, message: 'Investment successful!', newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/my-investments', auth, async (req, res) => {
  try { res.json(await Investment.find({ userId: req.user.id }).populate('planId').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* Auto-complete investments */
setInterval(async () => {
  try {
    const expired = await Investment.find({ status: 'active', expireAt: { $lte: new Date() } });
    for (const inv of expired) {
      const plan = await Plan.findById(inv.planId);
      if (!plan) continue;
      const profit = (inv.amount * plan.profitPercent) / 100;
      inv.profit = profit; inv.status = 'completed'; await inv.save();
      await User.findByIdAndUpdate(inv.userId, { $inc: { balance: inv.amount + profit } });
      await pushNotif(inv.userId, 'investment', '✅ Investment Completed!', `${plan.name} completed. Profit: +$${profit.toFixed(2)}`, profit);
    }
  } catch (err) { console.error('Auto-complete:', err.message); }
}, 60000);

/* ── Become Trader ── */
app.post('/api/become-trader', auth, async (req, res) => {
  try {
    const { name, img, image, profit, winRate, aum, mdd, experience, capital } = req.body;
    await Trader.create({ name, img: img||image||'', image: img||image||'', avatar: img||image||'', profit: Number(profit)||0, winRate: Number(winRate)||0, aum: Number(aum)||0, mdd: Number(mdd)||0, experience: Number(experience)||0, capital: Number(capital)||0, userId: req.user.id, status: 'pending' });
    res.json({ success: true, message: 'Application submitted!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/traders/apply', auth, async (req, res) => {
  try {
    const { name, img, image, profit, winRate, aum, mdd } = req.body;
    await Trader.create({ name, img: img||image||'', image: img||image||'', profit: Number(profit)||0, winRate: Number(winRate)||0, aum: Number(aum)||0, mdd: Number(mdd)||0, userId: req.user.id, status: 'pending' });
    res.json({ success: true, message: 'Application submitted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ═══════════════════════════════════════
   SQUARE POSTS — REAL
═══════════════════════════════════════ */

/* GET posts */
app.get('/api/posts', async (req, res) => {
  try {
    const { tag, limit = 30, skip = 0 } = req.query;
    const filter = tag && tag !== 'All' ? { tag } : {};
    const posts = await Post.find(filter)
      .populate('author', 'name profileImage img role')
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    res.json(posts);
  } catch (err) { res.status(500).json([]); }
});

/* POST create post */
app.post('/api/posts', auth, async (req, res) => {
  try {
    const { content, tag } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Content required' });
    if (content.length > 280) return res.status(400).json({ message: 'Max 280 characters' });
    const user = await User.findById(req.user.id);
    const post = await Post.create({
      author:       req.user.id,
      authorName:   user.name,
      authorHandle: '@' + user.email.split('@')[0],
      content:      content.trim(),
      tag:          tag || 'All',
      verified:     user.role === 'admin',
    });
    /* Give XP */
    await User.findByIdAndUpdate(req.user.id, { $inc: { xp: 5 } });
    const populated = await post.populate('author', 'name profileImage img role');
    res.json({ success: true, post: populated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* DELETE post */
app.delete('/api/posts/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.author.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' });
    await post.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* LIKE / UNLIKE post */
app.post('/api/posts/:id/like', auth, async (req, res) => {
  try {
    const post   = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const uid    = new mongoose.Types.ObjectId(req.user.id);
    const liked  = post.likes.some(l => l.equals(uid));
    if (liked) post.likes = post.likes.filter(l => !l.equals(uid));
    else {
      post.likes.push(uid);
      /* XP for post author on like */
      if (post.author.toString() !== req.user.id)
        await User.findByIdAndUpdate(post.author, { $inc: { xp: 2 } });
    }
    await post.save();
    res.json({ success: true, likes: post.likes.length, liked: !liked });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* COMMENT */
app.post('/api/posts/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Comment text required' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const user = await User.findById(req.user.id);
    post.comments.push({ author: req.user.id, authorName: user.name, text: text.trim() });
    await post.save();
    /* XP for author */
    if (post.author.toString() !== req.user.id)
      await User.findByIdAndUpdate(post.author, { $inc: { xp: 1 } });
    res.json({ success: true, comment: post.comments[post.comments.length - 1] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* INCREMENT view */
app.post('/api/posts/:id/view', async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

/* INCREMENT share */
app.post('/api/posts/:id/share', async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { $inc: { shares: 1 } });
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

/* User's own posts */
app.get('/api/my-posts', auth, async (req, res) => {
  try { res.json(await Post.find({ author: req.user.id }).sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* ═══════════════════════════════════════
   NOTIFICATIONS — REAL
═══════════════════════════════════════ */

/* GET notifications */
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    const unread  = await Notification.countDocuments({ userId: req.user.id, read: false });
    res.json({ notifications: notifs, unread });
  } catch { res.status(500).json({ notifications: [], unread: 0 }); }
});

/* MARK all read */
app.post('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

/* MARK one read */
app.post('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { read: true });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

/* DELETE notification */
app.delete('/api/notifications/:id', auth, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

/* ═══════════════════════════════════════
   COPY TRADE — REAL
═══════════════════════════════════════ */

/* Start copying a trader */
app.post('/api/copy-trade/start', auth, async (req, res) => {
  try {
    const { traderId, amount } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ message: 'Minimum copy amount is $10' });
    const user   = await User.findById(req.user.id);
    const trader = await Trader.findById(traderId);
    if (!trader) return res.status(404).json({ message: 'Trader not found' });
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

    /* Deduct from balance */
    user.balance -= Number(amount); await user.save();

    const ct = await CopyTrade.create({ userId: req.user.id, traderId, amount: Number(amount) });
    await Transaction.create({ userId: req.user.id, type: 'copy_trade', amount: Number(amount), symbol: 'USDT', status: 'completed', details: `Copying: ${trader.name}` });
    await pushNotif(req.user.id, 'trade', '📋 Copy Trade Started', `You are now copying ${trader.name} with $${amount}`, amount);

    /* Increment trader followers count */
    await Trader.findByIdAndUpdate(traderId, { $inc: { followers: 1 } });

    res.json({ success: true, message: `Now copying ${trader.name}!`, copyTrade: ct, newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* GET my copy trades */
app.get('/api/copy-trade/my', auth, async (req, res) => {
  try {
    const copies = await CopyTrade.find({ userId: req.user.id }).populate('traderId').sort({ createdAt: -1 });
    res.json(copies);
  } catch { res.status(500).json([]); }
});

/* STOP copy trade */
app.post('/api/copy-trade/stop/:id', auth, async (req, res) => {
  try {
    const ct = await CopyTrade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!ct) return res.status(404).json({ message: 'Copy trade not found' });
    ct.status = 'stopped'; await ct.save();
    /* Return amount + profit */
    const returnAmt = ct.amount + (ct.profit || 0);
    await User.findByIdAndUpdate(req.user.id, { $inc: { balance: returnAmt } });
    await Trader.findByIdAndUpdate(ct.traderId, { $inc: { followers: -1 } });
    await pushNotif(req.user.id, 'trade', '📋 Copy Trade Stopped', `Copy trade stopped. Returned: $${returnAmt.toFixed(2)}`, returnAmt);
    res.json({ success: true, message: `Copy trade stopped. $${returnAmt.toFixed(2)} returned.` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* Simulate copy trade profit every 5 minutes */
setInterval(async () => {
  try {
    const active = await CopyTrade.find({ status: 'active' }).populate('traderId');
    for (const ct of active) {
      if (!ct.traderId) continue;
      const roiRate = (ct.traderId.roi || 10) / 100 / (30 * 24 * 12); /* per 5min */
      const profit  = ct.amount * roiRate * (0.5 + Math.random()); /* some variance */
      ct.profit  = (ct.profit || 0) + profit;
      ct.roi     = (ct.profit / ct.amount) * 100;
      ct.trades  = (ct.trades || 0) + (Math.random() > 0.7 ? 1 : 0);
      await ct.save();
    }
  } catch (err) { console.error('Copy profit tick:', err.message); }
}, 5 * 60 * 1000);

/* ═══════════════════════════════════════
   CAPITAL CONNECT — REAL
═══════════════════════════════════════ */

/* Apply to invest in a fund */
app.post('/api/capital/apply-fund', auth, async (req, res) => {
  try {
    const { targetName } = req.body;
    if (!targetName) return res.status(400).json({ message: 'Fund name required' });
    const user = await User.findById(req.user.id);
    await CapitalApplication.create({ userId: req.user.id, type: 'fund_invest', targetName, email: user.email });
    await pushNotif(req.user.id, 'system', '💎 Fund Application Submitted', `Your application for ${targetName} has been received. Review takes 3-5 days.`);
    res.json({ success: true, message: `Application submitted for ${targetName}!` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* Apply for VC funding */
app.post('/api/capital/apply-vc', auth, async (req, res) => {
  try {
    const { targetName } = req.body;
    if (!targetName) return res.status(400).json({ message: 'VC name required' });
    const user = await User.findById(req.user.id);
    await CapitalApplication.create({ userId: req.user.id, type: 'vc_apply', targetName, email: user.email });
    await pushNotif(req.user.id, 'system', '🏦 VC Application Submitted', `Your application to ${targetName} has been received.`);
    res.json({ success: true, message: `Application sent to ${targetName}!` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* Register a fund */
app.post('/api/capital/register-fund', auth, async (req, res) => {
  try {
    const { fundName, website, aum, strategy, description } = req.body;
    if (!fundName?.trim()) return res.status(400).json({ message: 'Fund name required' });
    const user = await User.findById(req.user.id);
    await CapitalApplication.create({ userId: req.user.id, type: 'fund_register', fundName, website, aum, strategy, description, email: user.email });
    await pushNotif(req.user.id, 'system', '📝 Fund Registration Received', `${fundName} is under review. We'll contact you within 3-5 business days.`);
    res.json({ success: true, message: 'Fund registration submitted for review!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* GET my capital applications */
app.get('/api/capital/my-applications', auth, async (req, res) => {
  try { res.json(await CapitalApplication.find({ userId: req.user.id }).sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* ═══════════════════════════════════════
   ADMIN ROUTES
═══════════════════════════════════════ */

app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const [users, requests, traders, plans, investments] = await Promise.all([
      User.find().select('-password').sort({ createdAt: -1 }),
      Transaction.find().populate('userId','name email').sort({ createdAt: -1 }),
      Trader.find().sort({ createdAt: -1 }),
      Plan.find(),
      Investment.find().populate('userId','name email').populate('planId','name profitPercent').sort({ createdAt: -1 }),
    ]);
    res.json({ success: true, users, requests, traders, plans, investments });
  } catch { res.status(500).json({ success: false }); }
});

app.get('/api/admin/stats', auth, adminAuth, async (req, res) => {
  try {
    const [users, totalBalanceAgg, pendingDeposits, pendingWithdaws, totalPosts] = await Promise.all([
      User.countDocuments(),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      Transaction.countDocuments({ type:'deposit',  status:'pending' }),
      Transaction.countDocuments({ type:'withdraw', status:'pending' }),
      Post.countDocuments(),
    ]);
    res.json({ users, totalBalance: totalBalanceAgg[0]?.total||0, pendingDeposits, pendingWithdaws, totalPosts });
  } catch { res.status(500).json({}); }
});

app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try { res.json(await User.find().select('-password').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.put('/api/admin/user/:id', auth, adminAuth, async (req, res) => {
  try { res.json({ success: true, user: await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password') }); }
  catch { res.status(500).json({ success: false }); }
});

app.post('/api/admin/update-user', auth, adminAuth, async (req, res) => {
  try { const { userId, ...data } = req.body; await User.findByIdAndUpdate(userId, data); res.json({ success: true }); }
  catch { res.status(500).json({ success: false }); }
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
  try { await User.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch { res.status(500).json({ success: false }); }
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { id, requestId, status } = req.body;
    const trx = await Transaction.findById(id || requestId);
    if (!trx) return res.status(404).json({ message: 'Transaction not found' });
    if (trx.status === status) return res.status(400).json({ message: `Already ${status}` });
    if (status === 'approved') {
      if (trx.type === 'deposit') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
        await pushNotif(trx.userId, 'deposit', '✅ Deposit Approved!', `Your deposit of $${trx.amount} has been approved and credited.`, trx.amount);
      } else if (trx.type === 'withdraw') {
        const user = await User.findById(trx.userId);
        if (!user || user.balance < trx.amount) return res.status(400).json({ message: 'Insufficient user balance' });
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: -trx.amount } });
        await pushNotif(trx.userId, 'withdraw', '✅ Withdrawal Approved!', `Your withdrawal of $${trx.amount} has been processed.`, trx.amount);
      }
    } else if (status === 'rejected') {
      const typeLabel = trx.type === 'deposit' ? 'Deposit' : 'Withdrawal';
      await pushNotif(trx.userId, trx.type, `❌ ${typeLabel} Rejected`, `Your ${typeLabel.toLowerCase()} of $${trx.amount} was rejected. Contact support.`, trx.amount);
    }
    trx.status = status; await trx.save();
    res.json({ success: true, message: `Request ${status}`, transaction: trx });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/pending-requests', auth, adminAuth, async (req, res) => {
  try { res.json(await Transaction.find({ status:'pending' }).populate('userId','name email').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.get('/api/admin/pending', auth, adminAuth, async (req, res) => {
  try { res.json(await Transaction.find({ status:'pending' }).populate('userId','name email').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.get('/api/admin/transactions', auth, adminAuth, async (req, res) => {
  try { res.json(await Transaction.find().populate('userId','name email').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.get('/api/admin/deposits', auth, adminAuth, async (req, res) => {
  try { res.json(await Transaction.find({ type:'deposit' }).populate('userId','name email').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.put('/api/admin/deposit/:id', auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const trx = await Transaction.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (status === 'approved') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      await pushNotif(trx.userId, 'deposit', '✅ Deposit Approved!', `$${trx.amount} credited to your account.`, trx.amount);
    }
    res.json({ success: true, transaction: trx });
  } catch { res.status(500).json({ success: false }); }
});

app.post('/api/admin/create-trader', auth, adminAuth, async (req, res) => {
  try {
    const d = req.body;
    const img = d.image || d.img || '';
    await Trader.create({ name: d.name, image: img, img, avatar: img, profit: Number(d.profit)||0, winRate: Number(d.winRate)||0, roi: Number(d.roi)||0, pnl: Number(d.pnl)||0, aum: Number(d.aum)||0, mdd: Number(d.mdd)||0, days: Number(d.days)||0, followers: Number(d.followers)||0, maxFollowers: Number(d.maxFollowers)||500, isApiEnabled: d.isApiEnabled !== false, chartData: Array.isArray(d.chartData) ? d.chartData : [], status: 'approved' });
    res.json({ success: true, message: 'Trader Created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/edit-trader/:id', auth, adminAuth, async (req, res) => {
  try {
    const data = { ...req.body };
    ['profit','winRate','roi','pnl','aum','mdd','days','followers','maxFollowers'].forEach(k => { if (data[k] !== undefined) data[k] = Number(data[k]); });
    if (data.image) data.img = data.avatar = data.image;
    if (data.img)   data.image = data.avatar = data.img;
    const updated = await Trader.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!updated) return res.status(404).json({ message: 'Trader not found' });
    res.json({ success: true, message: 'Trader Updated', trader: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/delete-trader/:id', auth, adminAuth, async (req, res) => {
  try { await Trader.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch { res.status(500).json({ success: false }); }
});

app.post('/api/admin/create-plan', auth, adminAuth, async (req, res) => {
  try { await Plan.create(req.body); res.json({ success: true, message: 'Plan Created' }); }
  catch { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/delete-plan/:id', auth, adminAuth, async (req, res) => {
  try { await Plan.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch { res.status(500).json({ success: false }); }
});

/* Admin: capital applications */
app.get('/api/admin/capital-applications', auth, adminAuth, async (req, res) => {
  try { res.json(await CapitalApplication.find().populate('userId','name email').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* Admin: all posts */
app.get('/api/admin/posts', auth, adminAuth, async (req, res) => {
  try { res.json(await Post.find().populate('author','name email').sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

app.delete('/api/admin/posts/:id', auth, adminAuth, async (req, res) => {
  try { await Post.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch { res.status(500).json({ success: false }); }
});

/* Admin: send notification to a user */
app.post('/api/admin/notify', auth, adminAuth, async (req, res) => {
  try {
    const { userId, type, title, message } = req.body;
    if (!userId || !title || !message) return res.status(400).json({ message: 'userId, title, message required' });
    await pushNotif(userId, type || 'system', title, message);
    res.json({ success: true, message: 'Notification sent' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ═══════════════════════════════════════
   START
═══════════════════════════════════════ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
export default app;
