import jwt from 'jsonwebtoken';



const JWT_SECRET = process.env.JWT_SECRET || 'ekazi-dev-secret';

const now = () => new Date().toISOString();

const createSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const createId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;



const categories = [

  'Plumbing', 'Electrical', 'Painting', 'Carpentry', 'Cleaning', 'Masonry', 'Appliances', 'Security', 'Gardening', 'Pest Control', 'Moving', 'Solar & Inverter',

].map((name) => ({ id: createSlug(name), name }));



const services = [

  ['tap-repair', 'plumbing', 'Tap or shower repair'], ['leak-repair', 'plumbing', 'Pipe leak repair'], ['blocked-drain', 'plumbing', 'Blocked drain or toilet'],

  ['socket-switch', 'electrical', 'Socket or switch repair'], ['lighting', 'electrical', 'Lighting installation'], ['fault-finding', 'electrical', 'Power fault diagnosis'],

  ['room-painting', 'painting', 'Room painting'], ['full-house-painting', 'painting', 'Full house painting'], ['door-repair', 'carpentry', 'Door or lock fitting'],

  ['deep-clean', 'cleaning', 'Deep cleaning'], ['tile-repair', 'masonry', 'Tile repair or replacement'], ['fridge-repair', 'appliances', 'Fridge repair'],

  ['locksmith', 'security', 'Locksmith service'], ['garden-cleanup', 'gardening', 'Garden cleanup'], ['fumigation', 'pest-control', 'Fumigation'],

  ['house-moving', 'moving', 'House moving support'], ['solar-diagnosis', 'solar', 'Solar system diagnosis'],

].map(([id, categoryId, name]) => ({ id, categoryId, name }));



const estates = ['Kilimani', 'Kileleshwa', 'Westlands', 'Lavington', 'Parklands', 'South B', 'South C', 'Langata', 'Karen', 'Runda', 'Roysambu', 'Kasarani', 'Zimmerman', 'Thome', 'Embakasi', 'Donholm', 'Umoja', 'Buruburu', 'Kahawa Sukari', 'Ruaka', 'Kitengela', 'Syokimau', 'Athi River', 'Rongai', 'Ngong', 'Juja', 'Ruiru', 'Kiambu', 'Mlolongo', 'Utawala'].map((name) => ({ id: createSlug(name), name, city: 'Nairobi' }));



const state = globalThis.__EKAZI_MEMORY_DB__ || {

  users: [{ id: 'user_demo', name: 'John Mwangi', email: 'john@example.com', phone: '+254700000001', createdAt: now() }],

  categories,

  services,

  estates,

  jobs: [],

  quotes: [],

  bookings: [],

  conversations: [],

  messages: [],

  pros: [

    { id: 'pro_james', name: 'James Kamau', ratingAvg: 4.9, ratingCount: 127, verifiedId: true, backgroundChecked: true, topRated: true, jobsCompleted: 245 },

    { id: 'pro_peter', name: 'Peter Omondi', ratingAvg: 4.8, ratingCount: 89, verifiedId: true, backgroundChecked: true, topRated: false, jobsCompleted: 180 },

    { id: 'pro_grace', name: 'Grace Wanjiku', ratingAvg: 4.7, ratingCount: 64, verifiedId: true, backgroundChecked: false, topRated: false, jobsCompleted: 132 },

  ],

};



globalThis.__EKAZI_MEMORY_DB__ = state;

export const db = () => state;

export const createSession = (userId) => jwt.sign({ id: String(userId), scope: 'ekazi-mobile' }, JWT_SECRET, { expiresIn: '30d' });

export const verifySession = (token) => jwt.verify(token, JWT_SECRET);

export const ensureConversation = (userId, proId) => {

  let conv = state.conversations.find((x) => x.userId === userId && x.proId === proId);

  if (!conv) {

    const pro = state.pros.find((x) => x.id === proId);

    conv = { id: createId('conv'), userId, proId, proName: pro?.name || 'Provider', lastMessage: 'Conversation started', lastAt: now() };

    state.conversations.unshift(conv);

  }

  return conv;

};

