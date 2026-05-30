const express    = require('express');
const mongoose   = require('mongoose');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const cors       = require('cors');
const axios      = require('axios');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));

mongoose.connect(process.env.MONGO_URI).then(() => console.log('MongoDB connected')).catch(e => console.error(e));

/* ════════════════════════════════════════
   SCHEMAS & MODELS
════════════════════════════════════════ */

const UserSchema = new mongoose.Schema({
  name:      { type:String, required:true },
  email:     { type:String, required:true, unique:true },
  password:  { type:String, required:true },
  balance:   { type:Number, default:0 },
  role:      { type:String, default:'user' },
  // Creator Center
  xp:        { type:Number, default:0 },
  level:     { type:String, default:'Explorer' },
  followers: { type:Number, default:0 },
  following: { type:Number, default:0 },
}, { timestamps:true });
const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
  userId:  { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  type:    String,
  amount:  Number,
  status:  { type:String, default:'pending' },
  method:  String,
  address: String,
  txId:    String,
}, { timestamps:true });
const Transaction = mongoose.model('Transaction', TransactionSchema);

const PlanSchema = new mongoose.Schema({
  name:          String,
  minAmount:     Number,
  maxAmount:     Number,
  profitPercent: Number,
  duration:      { type:Number, default:24 },
});
const Plan = mongoose.model('Plan', PlanSchema);

const InvestmentSchema = new mongoose.Schema({
  userId:   { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  planId:   { type:mongoose.Schema.Types.ObjectId, ref:'Plan' },
  amount:   Number,
  profit:   { type:Number, default:0 },
  status:   { type:String, default:'active' },
  expireAt: Date,
}, { timestamps:true });
const Investment = mongoose.model('Investment', InvestmentSchema);

const TraderSchema = new mongoose.Schema({
  name:        String,
  image:       String,
  img:         String,
  avatar:      String,
  roi:         { type:Number, default:0 },
  pnl:         { type:Number, default:0 },
  profit:      { type:Number, default:0 },
  winRate:     { type:Number, default:0 },
  aum:         { type:Number, default:0 },
  mdd:         { type:Number, default:0 },
  days:        { type:Number, default:0 },
  followers:   { type:Number, default:0 },
  maxFollowers:{ type:Number, default:500 },
  status:      { type:String, default:'pending' },
}, { timestamps:true });
const Trader = mongoose.model('Trader', TraderSchema);

const FuturesTradeSchema = new mongoose.Schema({
  userId:     { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  symbol:     String,
  type:       String,
  amount:     Number,
  leverage:   Number,
  entryPrice: Number,
  closePrice: Number,
  pnl:        { type:Number, default:0 },
  status:     { type:String, default:'open' },
}, { timestamps:true });
const FuturesTrade = mongoose.model('FuturesTrade', FuturesTradeSchema);

const SpotTradeSchema = new mongoose.Schema({
  userId: { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  symbol: String,
  type:   String,
  amount: Number,
  price:  Number,
  status: { type:String, default:'completed' },
}, { timestamps:true });
const SpotTrade = mongoose.model('SpotTrade', SpotTradeSchema);

/* ── NEW: Square Post ── */
const PostSchema = new mongoose.Schema({
  userId:     { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  author:     String,
  handle:     String,
  content:    String,
  type:       { type:String, default:'text' }, // text, image, video, poll, thread, article
  title:      String,
  tag:        String,
  visibility: { type:String, default:'public' },
  likes:      [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
  comments:   [{
    userId: mongoose.Schema.Types.ObjectId,
    author: String,
    handle: String,
    text:   String,
    time:   String,
    createdAt: { type:Date, default:Date.now },
  }],
  shares:     { type:Number, default:0 },
  views:      { type:Number, default:0 },
  verified:   { type:Boolean, default:false },
}, { timestamps:true });
const Post = mongoose.model('Post', PostSchema);

/* ── NEW: API Key ── */
const ApiKeySchema = new mongoose.Schema({
  userId:    { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  label:     String,
  apiKey:    String,
  secretKey: String,
  ip:        { type:String, default:'Unrestricted' },
  perms:     { read:Boolean, spot:Boolean, futures:Boolean, withdraw:Boolean },
  status:    { type:String, default:'active' },
  calls:     { type:Number, default:0 },
  lastUsed:  Date,
}, { timestamps:true });
const ApiKey = mongoose.model('ApiKey', ApiKeySchema);

/* ── NEW: Capital Connect Application ── */
const CapitalAppSchema = new mongoose.Schema({
  userId:   { type:mongoose.Schema.Types.ObjectId, ref:'User' },
  name:     String,
  email:    String,
  fundName: String,
  amount:   Number,
  type:     String, // fund, vc
  message:  String,
  status:   { type:String, default:'pending' },
}, { timestamps:true });
const CapitalApp = mongoose.model('CapitalApp', CapitalAppSchema);

/* ════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════ */
const auth = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ message:'No token' });
  try {
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message:'Invalid token' });
    next();
  } catch { res.status(401).json({ message:'Invalid token' }); }
};

const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message:'Admin only' });
    next();
  });
};

/* ════════════════════════════════════════
   AUTH ROUTES
════════════════════════════════════════ */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message:'Email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password:hashed });
    res.json({ message:'Registered successfully', user });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(400).json({ message:'Invalid credentials' });
    const token = jwt.sign({ id:user._id }, process.env.JWT_SECRET, { expiresIn:'30d' });
    res.json({ token, user:{ _id:user._id, name:user.name, email:user.email, balance:user.balance, role:user.role, xp:user.xp, level:user.level } });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/profile', auth, async (req, res) => {
  res.json(req.user);
});

/* ════════════════════════════════════════
   DEPOSIT / WITHDRAW
════════════════════════════════════════ */
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method, txId, address } = req.body;
    const trx = await Transaction.create({ userId:req.user._id, type:'deposit', amount, method, txId, address, status:'pending' });
    res.json({ message:'Deposit request submitted', transaction:trx });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    if (!req.user.balance || req.user.balance < amount)
      return res.status(400).json({ message:'Insufficient balance' });
    const trx = await Transaction.create({ userId:req.user._id, type:'withdraw', amount, method, address, status:'pending' });
    res.json({ message:'Withdrawal request submitted', transaction:trx });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/transactions', auth, async (req, res) => {
  try {
    const txns = await Transaction.find({ userId:req.user._id }).sort({ createdAt:-1 }).limit(50);
    res.json(txns);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   TRADING
════════════════════════════════════════ */
app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, amount, symbol } = req.body;
    const user = await User.findById(req.user._id);
    if (type === 'buy') {
      if (user.balance < amount) return res.status(400).json({ message:'Insufficient balance' });
      await User.findByIdAndUpdate(req.user._id, { $inc:{ balance:-amount } });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $inc:{ balance:amount } });
    }
    let price = 0;
    try {
      const r = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
      price = parseFloat(r.data.price);
    } catch {}
    const trade = await SpotTrade.create({ userId:req.user._id, symbol, type, amount, price, status:'completed' });
    await Transaction.create({ userId:req.user._id, type:`spot_${type}`, amount, status:'completed' });
    const updated = await User.findById(req.user._id);
    res.json({ message:'Trade executed', trade, balance:updated.balance });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/trades', auth, async (req, res) => {
  try {
    const trades = await SpotTrade.find({ userId:req.user._id }).sort({ createdAt:-1 }).limit(50);
    res.json(trades);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   FUTURES
════════════════════════════════════════ */
app.post('/api/futures/trade', auth, async (req, res) => {
  try {
    const { type, amount, leverage, symbol, entryPrice } = req.body;
    const user = await User.findById(req.user._id);
    if (user.balance < amount) return res.status(400).json({ message:'Insufficient balance' });
    await User.findByIdAndUpdate(req.user._id, { $inc:{ balance:-amount } });
    const trade = await FuturesTrade.create({ userId:req.user._id, symbol, type, amount, leverage, entryPrice, status:'open' });
    await Transaction.create({ userId:req.user._id, type:`futures-${type}`, amount, status:'completed' });
    const updated = await User.findById(req.user._id);
    res.json({ success:true, message:'Position opened', trade, balance:updated.balance });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/futures/positions', auth, async (req, res) => {
  try {
    const positions = await FuturesTrade.find({ userId:req.user._id, status:'open' }).sort({ createdAt:-1 });
    res.json({ positions });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/futures/close', auth, async (req, res) => {
  try {
    const { positionId } = req.body;
    const pos = await FuturesTrade.findById(positionId);
    if (!pos || String(pos.userId) !== String(req.user._id))
      return res.status(404).json({ message:'Position not found' });

    let closePrice = pos.entryPrice;
    try {
      const r = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${pos.symbol}USDT`);
      closePrice = parseFloat(r.data.price);
    } catch {}

    const isLong = pos.type === 'buy';
    const pnl    = isLong
      ? (closePrice - pos.entryPrice) * (pos.amount / pos.entryPrice) * pos.leverage
      : (pos.entryPrice - closePrice) * (pos.amount / pos.entryPrice) * pos.leverage;
    const returnAmt = pos.amount + pnl;

    await User.findByIdAndUpdate(req.user._id, { $inc:{ balance:Math.max(returnAmt, 0) } });
    await FuturesTrade.findByIdAndUpdate(positionId, { status:'closed', closePrice, pnl });
    await Transaction.create({ userId:req.user._id, type:'futures-close', amount:returnAmt, status:'completed' });
    const updated = await User.findById(req.user._id);
    res.json({ success:true, pnl:pnl.toFixed(2), returnAmount:returnAmt.toFixed(2), balance:updated.balance });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   INVESTMENT
════════════════════════════════════════ */
app.get('/api/plans', async (req, res) => {
  try { res.json(await Plan.find()); }
  catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message:'Plan not found' });
    if (amount < plan.minAmount || amount > plan.maxAmount)
      return res.status(400).json({ message:`Amount must be $${plan.minAmount}–$${plan.maxAmount}` });
    const user = await User.findById(req.user._id);
    if (user.balance < amount) return res.status(400).json({ message:'Insufficient balance' });
    await User.findByIdAndUpdate(req.user._id, { $inc:{ balance:-amount } });
    const profit   = (amount * plan.profitPercent) / 100;
    const expireAt = new Date(Date.now() + plan.duration * 60 * 60 * 1000);
    const inv = await Investment.create({ userId:req.user._id, planId, amount, profit, expireAt });
    await Transaction.create({ userId:req.user._id, type:'investment', amount, status:'active' });
    res.json({ message:'Investment created', investment:inv });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/my-investments', auth, async (req, res) => {
  try {
    const invs = await Investment.find({ userId:req.user._id }).populate('planId').sort({ createdAt:-1 });
    res.json(invs);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   TRADERS / COPY TRADE
════════════════════════════════════════ */
app.get('/api/traders', async (req, res) => {
  try { res.json(await Trader.find({ status:'approved' })); }
  catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/traders/all', async (req, res) => {
  try { res.json(await Trader.find()); }
  catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/become-trader', auth, async (req, res) => {
  try {
    const t = await Trader.create({ ...req.body, userId:req.user._id, status:'pending' });
    res.json({ message:'Application submitted', trader:t });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   SQUARE POSTS (REAL - DATABASE)
════════════════════════════════════════ */
app.get('/api/posts', async (req, res) => {
  try {
    const { tag, limit=30, page=1 } = req.query;
    const filter = tag && tag !== 'All' ? { tag, visibility:'public' } : { visibility:'public' };
    const posts  = await Post.find(filter)
      .sort({ createdAt:-1 })
      .skip((page-1)*limit)
      .limit(Number(limit));
    res.json(posts);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/posts', auth, async (req, res) => {
  try {
    const { content, type, title, tag, visibility } = req.body;
    if (!content?.trim()) return res.status(400).json({ message:'Content required' });
    const post = await Post.create({
      userId:     req.user._id,
      author:     req.user.name,
      handle:     '@' + req.user.email.split('@')[0],
      content,
      type:       type || 'text',
      title:      title || '',
      tag:        tag || 'All',
      visibility: visibility || 'public',
      verified:   req.user.role === 'admin',
    });
    // XP reward
    await User.findByIdAndUpdate(req.user._id, { $inc:{ xp:5 } });
    res.json({ message:'Post created', post });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message:'Post not found' });
    const liked = post.likes.includes(req.user._id);
    if (liked) {
      await Post.findByIdAndUpdate(req.params.id, { $pull:{ likes:req.user._id } });
    } else {
      await Post.findByIdAndUpdate(req.params.id, { $addToSet:{ likes:req.user._id } });
      await User.findByIdAndUpdate(post.userId, { $inc:{ xp:2 } });
    }
    res.json({ liked:!liked });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/posts/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message:'Comment required' });
    const comment = {
      userId: req.user._id,
      author: req.user.name,
      handle: '@' + req.user.email.split('@')[0],
      text,
      time:   'just now',
    };
    const post = await Post.findByIdAndUpdate(req.params.id, { $push:{ comments:comment }, $inc:{ views:1 } }, { new:true });
    await User.findByIdAndUpdate(post.userId, { $inc:{ xp:1 } });
    res.json({ comment, post });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/posts/:id/share', auth, async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { $inc:{ shares:1 } });
    await User.findByIdAndUpdate(req.user._id, { $inc:{ xp:4 } });
    res.json({ message:'Shared' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message:'Not found' });
    if (String(post.userId) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ message:'Not authorized' });
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message:'Post deleted' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/my-posts', auth, async (req, res) => {
  try {
    const posts = await Post.find({ userId:req.user._id }).sort({ createdAt:-1 });
    res.json(posts);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   API KEY MANAGEMENT (REAL - DATABASE)
════════════════════════════════════════ */
const genKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length:32 }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
};

app.get('/api/apikeys', auth, async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId:req.user._id }).sort({ createdAt:-1 });
    // Mask secret keys
    const masked = keys.map(k => ({
      ...k.toObject(),
      secretKey: k.secretKey.slice(0,8) + '●'.repeat(24),
    }));
    res.json(masked);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/apikeys', auth, async (req, res) => {
  try {
    const { label, ip, perms } = req.body;
    if (!label?.trim()) return res.status(400).json({ message:'Label required' });
    const existingCount = await ApiKey.countDocuments({ userId:req.user._id });
    if (existingCount >= 10) return res.status(400).json({ message:'Maximum 10 API keys allowed' });
    const apiKey    = genKey();
    const secretKey = genKey();
    const key = await ApiKey.create({
      userId: req.user._id,
      label,
      apiKey,
      secretKey,
      ip: ip || 'Unrestricted',
      perms: perms || { read:true, spot:false, futures:false, withdraw:false },
    });
    // Return full secret ONCE
    res.json({ message:'API key created', key:{ ...key.toObject(), secretKey } });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.patch('/api/apikeys/:id', auth, async (req, res) => {
  try {
    const key = await ApiKey.findOne({ _id:req.params.id, userId:req.user._id });
    if (!key) return res.status(404).json({ message:'Key not found' });
    const { status } = req.body;
    await ApiKey.findByIdAndUpdate(req.params.id, { status });
    res.json({ message:'Key updated' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.delete('/api/apikeys/:id', auth, async (req, res) => {
  try {
    const key = await ApiKey.findOne({ _id:req.params.id, userId:req.user._id });
    if (!key) return res.status(404).json({ message:'Key not found' });
    await ApiKey.findByIdAndDelete(req.params.id);
    res.json({ message:'Key deleted' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   CAPITAL CONNECT (REAL - DATABASE)
════════════════════════════════════════ */
app.post('/api/capital/apply', auth, async (req, res) => {
  try {
    const { fundName, amount, type, message } = req.body;
    const app2 = await CapitalApp.create({
      userId:   req.user._id,
      name:     req.user.name,
      email:    req.user.email,
      fundName,
      amount,
      type:     type || 'fund',
      message,
    });
    res.json({ message:'Application submitted successfully!', application:app2 });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/capital/my-applications', auth, async (req, res) => {
  try {
    const apps = await CapitalApp.find({ userId:req.user._id }).sort({ createdAt:-1 });
    res.json(apps);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   CREATOR CENTER (XP / LEVEL)
════════════════════════════════════════ */
const LEVEL_TIERS = [
  { name:'Explorer',        min:0    },
  { name:'Content Creator', min:100  },
  { name:'Rising Star',     min:500  },
  { name:'Top Creator',     min:2000 },
  { name:'Elite Creator',   min:5000 },
];

const getLevel = (xp) => {
  let level = 'Explorer';
  for (const t of LEVEL_TIERS) { if (xp >= t.min) level = t.name; }
  return level;
};

app.get('/api/creator/stats', auth, async (req, res) => {
  try {
    const user  = await User.findById(req.user._id);
    const posts = await Post.find({ userId:req.user._id });
    const level = getLevel(user.xp || 0);
    await User.findByIdAndUpdate(req.user._id, { level });
    res.json({
      xp:        user.xp || 0,
      level,
      followers: user.followers || 0,
      following: user.following || 0,
      posts:     posts.length,
      totalViews: posts.reduce((s,p) => s + (p.views||0), 0),
      totalLikes: posts.reduce((s,p) => s + (p.likes?.length||0), 0),
    });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   ADMIN ROUTES
════════════════════════════════════════ */
app.get('/api/admin/all-data', adminAuth, async (req, res) => {
  try {
    const [users, requests, traders, plans, investments] = await Promise.all([
      User.find().select('-password'),
      Transaction.find().populate('userId','name email').sort({ createdAt:-1 }),
      Trader.find(),
      Plan.find(),
      Investment.find().populate('userId','name').populate('planId','name'),
    ]);
    res.json({ users, requests, traders, plans, investments });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/admin/handle-request', adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const trx = await Transaction.findById(id);
    if (!trx) return res.status(404).json({ message:'Transaction not found' });
    await Transaction.findByIdAndUpdate(id, { status });
    if (status === 'approved' && trx.type === 'deposit') {
      await User.findByIdAndUpdate(trx.userId, { $inc:{ balance:trx.amount } });
    }
    if (status === 'approved' && trx.type === 'withdraw') {
      await User.findByIdAndUpdate(trx.userId, { $inc:{ balance:-trx.amount } });
    }
    res.json({ message:`Request ${status}` });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/admin/update-balance', adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance });
    res.json({ message:'Balance updated' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.delete('/api/admin/delete-user/:id', adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message:'User deleted' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/admin/create-trader', adminAuth, async (req, res) => {
  try {
    const t = await Trader.create({ ...req.body, status: req.body.status || 'approved' });
    res.json({ message:'Trader created', trader:t });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.put('/api/admin/edit-trader/:id', adminAuth, async (req, res) => {
  try {
    const t = await Trader.findByIdAndUpdate(req.params.id, req.body, { new:true });
    res.json({ message:'Trader updated', trader:t });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.delete('/api/admin/delete-trader/:id', adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ message:'Trader deleted' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.post('/api/admin/create-plan', adminAuth, async (req, res) => {
  try {
    const p = await Plan.create(req.body);
    res.json({ message:'Plan created', plan:p });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.delete('/api/admin/delete-plan/:id', adminAuth, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message:'Plan deleted' });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

app.get('/api/admin/capital-applications', adminAuth, async (req, res) => {
  try {
    const apps = await CapitalApp.find().populate('userId','name email').sort({ createdAt:-1 });
    res.json(apps);
  } catch (e) { res.status(500).json({ message:e.message }); }
});

/* ════════════════════════════════════════
   AUTO-COMPLETE INVESTMENTS
════════════════════════════════════════ */
const autoComplete = async () => {
  try {
    const expired = await Investment.find({ status:'active', expireAt:{ $lte:new Date() } });
    for (const inv of expired) {
      await Investment.findByIdAndUpdate(inv._id, { status:'completed' });
      await User.findByIdAndUpdate(inv.userId, { $inc:{ balance: inv.amount + inv.profit } });
      await Transaction.create({ userId:inv.userId, type:'investment_return', amount:inv.amount + inv.profit, status:'completed' });
    }
    if (expired.length) console.log(`Completed ${expired.length} investments`);
  } catch (e) { console.error('AutoComplete error:', e.message); }
};
setInterval(autoComplete, 60 * 1000);

/* ════════════════════════════════════════
   HEALTH
════════════════════════════════════════ */
app.get('/health', (req, res) => res.json({ status:'ok', time:new Date() }));
app.get('/',       (req, res) => res.json({ message:'Vinance API running' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
