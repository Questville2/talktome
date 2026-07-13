require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// ============ DOMAIN CONFIGURATION ============
const BASE_URL = process.env.BASE_URL || 'https://www.talktomequestville.com';
console.log('🌐 Site URL:', BASE_URL);

// ============ PAYONEER CONFIGURATION ============
const PAYONEER_API_KEY = process.env.PAYONEER_API_KEY;
const PAYONEER_API_SECRET = process.env.PAYONEER_API_SECRET;
console.log('💳 Payoneer:', PAYONEER_API_KEY ? '✅ Connected' : '❌ Not configured');

// ============ FILE UPLOAD ============
const uploadDirs = ['uploads/cvs', 'uploads/id_photos', 'uploads/certificates', 'uploads/profile_photos'];
uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const map = { cv: 'cvs', idPhoto: 'id_photos', certificate: 'certificates', profilePhoto: 'profile_photos' };
        cb(null, 'uploads/' + (map[file.fieldname] || ''));
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ============ DATA STORES ============
const sessions = {};
const listeners = {};
const listenerApplications = [];
const membershipPayments = {};
const chatSessions = {};

// ============ PRICING ============
const TIERS = {
    standard: { duration: 1800, price: 1000, listenerEarn: 300, label: '30 min' },
    extended: { duration: 3600, price: 3000, listenerEarn: 900, label: '60 min' }
};

// ============ ADMIN ============
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@talktome.com';
let adminToken = null;

app.post('/api/admin/login', (req, res) => {
    const { password, email } = req.body;
    if (password === ADMIN_PASSWORD && email === ADMIN_EMAIL) {
        adminToken = 'admin_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
        res.json({ success: true, token: adminToken });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

function verifyAdmin(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token === adminToken) next();
    else res.status(401).json({ error: 'Unauthorized' });
}

// ============ NICKNAMES ============
const ADJECTIVES = ['Kind', 'Gentle', 'Wise', 'Calm', 'Strong', 'Brave', 'Patient', 'Caring', 'Warm', 'Soft', 'Bright', 'Deep', 'True', 'Pure', 'Honest', 'Real', 'Quiet', 'Still', 'Peaceful', 'Loving', 'Graceful', 'Tender', 'Noble', 'Faithful', 'Loyal', 'Devoted', 'Steadfast', 'Resilient', 'Compassionate', 'Empathetic', 'Understanding', 'Supportive', 'Encouraging'];
const NOUNS = ['Elephant', 'Dolphin', 'Eagle', 'Tiger', 'Bear', 'Wolf', 'Fox', 'Owl', 'Swan', 'Deer', 'Lion', 'Falcon', 'Hawk', 'Phoenix', 'Dragon', 'Unicorn', 'Star', 'Moon', 'Sun', 'Cloud', 'River', 'Ocean', 'Mountain', 'Forest', 'Garden', 'Lotus', 'Rose', 'Lily', 'Jade', 'Pearl', 'Amber', 'Crystal', 'Ruby', 'Sapphire', 'Diamond', 'Emerald', 'Gold', 'Silver', 'Bronze', 'Rainbow', 'Aurora', 'Meadow', 'Valley', 'Sunrise', 'Sunset', 'Haven', 'Sanctuary', 'Harbor', 'Light', 'Hope', 'Joy', 'Peace', 'Grace'];
const CLIENT_ADJECTIVES = ['Brave', 'Gentle', 'Wise', 'Calm', 'Strong', 'Patient', 'Kind', 'Warm', 'Bright', 'Deep', 'True', 'Pure', 'Honest', 'Real', 'Quiet', 'Still', 'Peaceful', 'Loving', 'Graceful', 'Tender', 'Noble', 'Faithful', 'Loyal', 'Devoted', 'Resilient', 'Compassionate', 'Thoughtful', 'Radiant', 'Serene', 'Tranquil', 'Harmonious', 'Balanced', 'Grounded', 'Open', 'Genuine', 'Sincere', 'Trustworthy', 'Hopeful', 'Joyful', 'Grateful', 'Courageous'];
const CLIENT_NOUNS = ['Star', 'Moon', 'Sun', 'Cloud', 'River', 'Ocean', 'Mountain', 'Forest', 'Garden', 'Lotus', 'Rose', 'Lily', 'Jade', 'Pearl', 'Amber', 'Crystal', 'Ruby', 'Sapphire', 'Diamond', 'Emerald', 'Gold', 'Silver', 'Bronze', 'Rainbow', 'Aurora', 'Meadow', 'Valley', 'Sunrise', 'Sunset', 'Haven', 'Sanctuary', 'Harbor', 'Light', 'Hope', 'Joy', 'Peace', 'Grace', 'Dream', 'Spirit', 'Soul', 'Heart', 'Mind', 'Voice', 'Wings'];

function generateListenerNickname() {
    let nickname, unique = false, attempts = 0;
    while (!unique && attempts < 100) {
        nickname = `Listener ${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;
        unique = !Object.values(listeners).some(l => l.nickname === nickname);
        attempts++;
    }
    return nickname || 'Listener Kind Soul';
}

function generateClientNickname() {
    return `Guest ${CLIENT_ADJECTIVES[Math.floor(Math.random() * CLIENT_ADJECTIVES.length)]} ${CLIENT_NOUNS[Math.floor(Math.random() * CLIENT_NOUNS.length)]}`;
}

// ============ ROUTES ============

// ============ SERVE HOMEPAGE ============
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// ============ GET TOKEN BY REFERENCE ============
app.get('/api/get-token/:reference', (req, res) => {
    const { reference } = req.params;
    for (const [id, session] of Object.entries(sessions)) {
        if (session.paymentRef === reference) {
            return res.json({ token: session.clientToken, sessionId: id });
        }
    }
    res.status(404).json({ error: 'Session not found' });
});

// ============ CREATE BOOKING ============
app.post('/api/create-booking', async (req, res) => {
    try {
        const { tier, scheduledAt, note, amount, testMode } = req.body;
        console.log('📝 Booking request:', { tier, scheduledAt, amount, testMode });

        if (!tier || !scheduledAt || !amount) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        if (scheduledAt < Date.now() + 3600000) {
            return res.status(400).json({ error: 'Must be 1 hour in advance' });
        }

        const sessionId = 'session_' + crypto.randomBytes(8).toString('hex');
        const clientToken = crypto.randomBytes(16).toString('hex');
        const reference = 'TALK_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

        // ============ TEST MODE ============
        if (testMode === true) {
            sessions[sessionId] = {
                id: sessionId,
                clientToken: clientToken,
                tier: tier,
                duration: TIERS[tier].duration,
                price: amount,
                status: 'booked',
                scheduledAt: scheduledAt,
                note: note || '',
                createdAt: Date.now(),
                startedAt: null,
                completedAt: null,
                clientRating: null,
                listenerId: null,
                paymentRef: 'test_payment_' + Date.now(),
                isTest: true,
                paymentVerified: true
            };

            console.log('✅ TEST session created:', sessionId);
            return res.json({
                success: true,
                sessionId: sessionId,
                token: clientToken,
                message: 'Test session created!',
                redirectUrl: '/dashboard-client.html',
                testMode: true
            });
        }

        // ============ PAYMENT FLOW ============
        const tierConfig = TIERS[tier];
        const amountUSD = amount / 100;

        sessions[sessionId] = {
            id: sessionId,
            clientToken: clientToken,
            tier: tier,
            duration: tierConfig.duration,
            price: amount,
            status: 'pending_payment',
            scheduledAt: scheduledAt,
            note: note || '',
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            clientRating: null,
            listenerId: null,
            paymentRef: reference,
            paymentVerified: false
        };

        console.log('📝 Session created:', sessionId);
        console.log('💰 Amount USD: $' + amountUSD);

        // Check if Payoneer is configured
        if (!PAYONEER_API_KEY) {
            console.log('⚠️ Payoneer not configured, falling back to test mode');
            sessions[sessionId].status = 'booked';
            sessions[sessionId].paymentVerified = true;
            sessions[sessionId].isTest = true;
            
            return res.json({
                success: true,
                sessionId: sessionId,
                token: clientToken,
                message: 'Payoneer not configured. Test session created!',
                redirectUrl: '/dashboard-client.html',
                testMode: true
            });
        }

        // Initialize Payoneer payment
        const payoneerResponse = await axios.post('https://api.payoneer.com/v4/programs/payments', {
            amount: amountUSD,
            currency: 'USD',
            description: 'Talk to Me Session - ' + tier,
            reference: reference,
            customer: {
                email: 'anonymous@talktome.com',
                country: 'US'
            },
            return_url: BASE_URL + '/payment-callback',
            cancel_url: BASE_URL + '/book.html?status=cancelled',
            metadata: {
                sessionId: sessionId,
                tier: tier,
                scheduledAt: scheduledAt,
                note: note || '',
                clientToken: clientToken
            }
        }, {
            headers: {
                'X-PAYONEER-API-KEY': PAYONEER_API_KEY,
                'X-PAYONEER-API-SECRET': PAYONEER_API_SECRET,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Payoneer initialized');

        res.json({
            authorization_url: payoneerResponse.data.payment_url,
            reference: reference,
            sessionId: sessionId,
            testMode: false
        });
    } catch (error) {
        console.error('❌ Booking error:', error.response?.data || error.message);
        
        // Fallback to test mode
        const fallbackSessionId = 'session_' + crypto.randomBytes(8).toString('hex');
        const fallbackToken = crypto.randomBytes(16).toString('hex');
        
        sessions[fallbackSessionId] = {
            id: fallbackSessionId,
            clientToken: fallbackToken,
            tier: req.body.tier || 'standard',
            duration: TIERS[req.body.tier || 'standard'].duration,
            price: req.body.amount || 1000,
            status: 'booked',
            scheduledAt: req.body.scheduledAt || Date.now() + 3600000,
            note: req.body.note || '',
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            clientRating: null,
            listenerId: null,
            paymentRef: 'fallback_' + Date.now(),
            isTest: true,
            paymentVerified: true
        };
        
        res.json({
            success: true,
            sessionId: fallbackSessionId,
            token: fallbackToken,
            message: 'Payment service unavailable. Test session created!',
            redirectUrl: '/dashboard-client.html',
            testMode: true
        });
    }
});

// ============ PAYMENT CALLBACK ============
app.get('/payment-callback', async (req, res) => {
    const { reference, status, payment_id } = req.query;
    console.log('📞 Payment callback received:', { reference, status, payment_id });

    if (status === 'success' && reference) {
        try {
            const verifyResponse = await axios.get(`https://api.payoneer.com/v4/programs/payments/${payment_id}`, {
                headers: {
                    'X-PAYONEER-API-KEY': PAYONEER_API_KEY,
                    'X-PAYONEER-API-SECRET': PAYONEER_API_SECRET,
                    'Content-Type': 'application/json'
                }
            });

            const payment = verifyResponse.data;
            console.log('✅ Payment verified:', payment);

            if (payment.status === 'completed' || payment.status === 'success') {
                let session = null;
                for (const [id, s] of Object.entries(sessions)) {
                    if (s.paymentRef === reference) {
                        session = s;
                        break;
                    }
                }

                if (session) {
                    session.status = 'booked';
                    session.paymentVerified = true;
                    session.paymentDate = Date.now();
                    console.log('✅ Session updated to booked:', session.id);
                    
                    res.redirect(`${BASE_URL}/book.html?status=success&reference=${reference}&token=${session.clientToken}`);
                } else {
                    res.redirect(`${BASE_URL}/book.html?status=error`);
                }
            } else {
                res.redirect(`${BASE_URL}/book.html?status=failed`);
            }
        } catch (error) {
            console.error('❌ Verification error:', error.message);
            res.redirect(`${BASE_URL}/book.html?status=error`);
        }
    } else {
        res.redirect(`${BASE_URL}/book.html?status=cancelled`);
    }
});

// ============ CLIENT ============
app.get('/api/client/sessions/:token', (req, res) => {
    const { token } = req.params;
    const clientSessions = Object.values(sessions)
        .filter(s => s.clientToken === token)
        .sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({ 
        sessions: clientSessions, 
        loyalty: { 
            totalHours: 0, 
            sessionsCompleted: 0, 
            progress: 0, 
            qualified: false, 
            freeSessionAvailable: false 
        } 
    });
});

app.get('/api/session-status/:token', (req, res) => {
    const session = Object.values(sessions).find(s => s.clientToken === req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ 
        status: session.status, 
        scheduledAt: session.scheduledAt, 
        listenerId: session.listenerId, 
        tier: session.tier, 
        duration: session.duration, 
        isTime: session.scheduledAt <= Date.now() 
    });
});

app.post('/api/rate-session', (req, res) => {
    const { sessionId, rating } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    session.clientRating = rating;
    res.json({ success: true });
});

// ============ LISTENER ONBOARDING ============
app.post('/api/listener/apply', upload.fields([
    { name: 'cv', maxCount: 1 }, 
    { name: 'idPhoto', maxCount: 1 }, 
    { name: 'certificate', maxCount: 1 }, 
    { name: 'profilePhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        const { fullName, email, password, mpesaNumber, motivation, idType, idNumber, nameOnId, ndaSignature, ndaAgree, agreementSignature, terms, backgroundCheck, dataConsent } = req.body;

        if (!fullName || !email || !password || !mpesaNumber || !motivation) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!req.files?.cv) return res.status(400).json({ error: 'CV required' });
        if (!req.files?.idPhoto) return res.status(400).json({ error: 'ID photo required' });
        if (!req.files?.profilePhoto) return res.status(400).json({ error: 'Profile photo required' });
        if (!ndaSignature || !ndaAgree) return res.status(400).json({ error: 'NDA required' });
        if (!agreementSignature) return res.status(400).json({ error: 'Agreement required' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const applicationId = 'app_' + crypto.randomBytes(8).toString('hex');

        listenerApplications.push({
            id: applicationId,
            fullName,
            email,
            password: hashedPassword,
            mpesaNumber,
            motivation,
            idType,
            idNumber,
            nameOnId,
            cvPath: req.files.cv[0].path,
            idPhotoPath: req.files.idPhoto[0].path,
            certificatePath: req.files.certificate?.[0]?.path || null,
            profilePhotoPath: req.files.profilePhoto[0].path,
            nda: { signature: ndaSignature, agreed: ndaAgree },
            agreement: { signature: agreementSignature },
            status: 'pending_review',
            createdAt: Date.now()
        });

        res.json({ success: true, message: 'Application submitted!', applicationId });
    } catch (error) {
        console.error('Application error:', error);
        res.status(500).json({ error: 'Application failed' });
    }
});

// ============ LISTENER LOGIN ============
app.post('/api/listener/login', (req, res) => {
    const { email, password } = req.body;
    if (email && password && email.includes('@')) {
        if (listeners[email]) {
            const listener = listeners[email];
            const now = new Date();
            const expiry = new Date(listener.membershipExpiry);
            
            if (now > expiry) {
                listener.isActive = false;
                return res.status(403).json({ 
                    success: false, 
                    error: 'Membership expired. Please renew to continue.',
                    expired: true 
                });
            }
            
            return res.json({ 
                success: true, 
                token: listener.token, 
                listener: { 
                    id: listener.id, 
                    email: listener.email, 
                    fullName: listener.fullName, 
                    nickname: listener.nickname,
                    membershipPaid: listener.membershipPaid,
                    membershipExpiry: listener.membershipExpiry
                } 
            });
        }
        
        const token = 'listener_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
        const listenerId = 'listener_' + crypto.randomBytes(4).toString('hex');
        const nickname = generateListenerNickname();
        listeners[email] = { 
            id: listenerId, 
            email, 
            fullName: 'Listener', 
            nickname, 
            isOnline: false, 
            balance: 0, 
            sessionsCompleted: 0, 
            rating: 0, 
            token, 
            isActive: false,
            membershipPaid: false,
            membershipExpiry: null
        };
        res.json({ 
            success: true, 
            token, 
            listener: { 
                id: listenerId, 
                email, 
                fullName: 'Listener', 
                nickname,
                membershipPaid: false,
                requiresMembership: true 
            } 
        });
    } else res.status(401).json({ error: 'Invalid credentials' });
});

// ============ LISTENER DASHBOARD ============
app.get('/api/listener/dashboard/:token', (req, res) => {
    const listener = Object.values(listeners).find(l => l.token === req.params.token);
    if (!listener) return res.status(404).json({ success: false });
    
    let membershipStatus = 'active';
    let daysRemaining = null;
    if (listener.membershipExpiry) {
        const now = new Date();
        const expiry = new Date(listener.membershipExpiry);
        daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) {
            membershipStatus = 'expired';
            listener.isActive = false;
        } else if (daysRemaining < 30) {
            membershipStatus = 'expiring_soon';
        }
    } else {
        membershipStatus = 'pending';
    }
    
    const availableCount = Object.values(sessions).filter(s => s.status === 'booked' && s.scheduledAt > Date.now()).length;
    res.json({ 
        success: true, 
        listener: { 
            ...listener, 
            availableBookings: availableCount, 
            activeSessions: 0,
            membershipStatus,
            daysRemaining
        } 
    });
});

app.get('/api/listener/bookings/:token', (req, res) => {
    const available = Object.values(sessions)
        .filter(s => s.status === 'booked' && s.scheduledAt > Date.now())
        .slice(0, 10);
    res.json(available);
});

app.post('/api/listener/accept', (req, res) => {
    const { sessionId, token } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'booked') return res.status(400).json({ success: false, message: 'Already taken' });
    
    const listener = Object.values(listeners).find(l => l.token === token);
    if (!listener) return res.status(404).json({ success: false, message: 'Listener not found' });
    
    if (!listener.isActive) {
        return res.status(403).json({ success: false, message: 'Account inactive. Please renew membership.' });
    }
    
    session.status = 'accepted';
    session.listenerId = listener.id;
    res.json({ success: true });
});

app.get('/api/listener/my-sessions/:token', (req, res) => {
    const listener = Object.values(listeners).find(l => l.token === req.params.token);
    if (!listener) return res.json([]);
    res.json(Object.values(sessions).filter(s => s.listenerId === listener.id && ['accepted', 'active', 'completed'].includes(s.status)));
});

app.post('/api/listener/join-session', (req, res) => {
    const { sessionId, token } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ success: false });
    const listener = Object.values(listeners).find(l => l.token === token);
    if (!listener || session.listenerId !== listener.id) return res.status(403).json({ success: false });
    const isTime = session.scheduledAt <= Date.now();
    if (isTime && session.status === 'accepted') {
        session.status = 'active';
        session.startedAt = Date.now();
        return res.json({ success: true, isTime: true });
    }
    res.json({ success: true, isTime: false, scheduledAt: session.scheduledAt });
});

app.get('/api/listener/earnings/:token', (req, res) => {
    const listener = Object.values(listeners).find(l => l.token === req.params.token);
    if (!listener) return res.json([]);
    const completed = Object.values(sessions).filter(s => s.listenerId === listener.id && s.status === 'completed');
    res.json(completed.map(s => ({ 
        date: s.completedAt || s.createdAt, 
        tier: s.tier, 
        amount: s.tier === 'standard' ? 3 : 9, 
        status: 'paid' 
    })));
});

app.post('/api/listener/withdraw', (req, res) => {
    const listener = Object.values(listeners).find(l => l.token === req.body.token);
    if (!listener) return res.status(404).json({ success: false });
    const amount = listener.balance || 0;
    if (amount <= 0) return res.status(400).json({ success: false, message: 'No balance' });
    listener.balance = 0;
    res.json({ success: true, amount });
});

app.post('/api/listener/status', (req, res) => {
    const listener = Object.values(listeners).find(l => l.token === req.body.token);
    if (!listener) return res.status(404).json({ success: false });
    listener.isOnline = req.body.isOnline;
    res.json({ success: true });
});

// ============ MEMBERSHIP ($20 / YEAR) ============
app.post('/api/listener/initiate-membership', async (req, res) => {
    try {
        const { email, fullName, mpesaNumber, applicationId } = req.body;
        if (!email || !fullName || !mpesaNumber) return res.status(400).json({ error: 'Missing fields' });
        
        const reference = 'MEM_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        membershipPayments[reference] = { 
            email, 
            fullName, 
            mpesaNumber, 
            applicationId, 
            amount: 20,
            status: 'pending', 
            createdAt: Date.now() 
        };
        
        if (!PAYONEER_API_KEY) {
            const nickname = generateListenerNickname();
            const token = 'listener_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
            const listenerId = 'listener_' + crypto.randomBytes(4).toString('hex');
            const expiryDate = new Date();
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            
            listeners[email] = {
                id: listenerId,
                email: email,
                fullName: fullName,
                nickname: nickname,
                mpesaNumber: mpesaNumber,
                isOnline: false,
                balance: 0,
                sessionsCompleted: 0,
                rating: 0,
                token: token,
                isActive: true,
                membershipPaid: true,
                membershipExpiry: expiryDate.toISOString(),
                joinedAt: Date.now()
            };
            
            return res.json({ 
                success: true, 
                message: 'Membership activated (test mode)!',
                token: token
            });
        }
        
        const payoneerResponse = await axios.post('https://api.payoneer.com/v4/programs/payments', {
            amount: 20,
            currency: 'USD',
            description: 'Talk to Me Listener Membership',
            reference: reference,
            customer: {
                email: email,
                country: 'US'
            },
            return_url: BASE_URL + '/membership-callback',
            cancel_url: BASE_URL + '/dashboard-listener.html?membership=cancelled',
            metadata: { 
                type: 'listener_membership', 
                email, 
                fullName, 
                mpesaNumber, 
                applicationId 
            }
        }, {
            headers: {
                'X-PAYONEER-API-KEY': PAYONEER_API_KEY,
                'X-PAYONEER-API-SECRET': PAYONEER_API_SECRET,
                'Content-Type': 'application/json'
            }
        });
        
        res.json({ authorization_url: payoneerResponse.data.payment_url, reference });
    } catch (error) {
        console.error('❌ Membership error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

app.get('/membership-callback', async (req, res) => {
    const { reference, status, payment_id } = req.query;
    if (status === 'success' && reference) {
        try {
            const verifyResponse = await axios.get(`https://api.payoneer.com/v4/programs/payments/${payment_id}`, {
                headers: {
                    'X-PAYONEER-API-KEY': PAYONEER_API_KEY,
                    'X-PAYONEER-API-SECRET': PAYONEER_API_SECRET,
                    'Content-Type': 'application/json'
                }
            });

            if (verifyResponse.data.status === 'completed' || verifyResponse.data.status === 'success') {
                const payment = membershipPayments[reference];
                if (payment) {
                    const nickname = generateListenerNickname();
                    const token = 'listener_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
                    const listenerId = 'listener_' + crypto.randomBytes(4).toString('hex');
                    
                    const expiryDate = new Date();
                    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                    
                    listeners[payment.email] = {
                        id: listenerId,
                        email: payment.email,
                        fullName: payment.fullName,
                        nickname,
                        mpesaNumber: payment.mpesaNumber,
                        isOnline: false,
                        balance: 0,
                        sessionsCompleted: 0,
                        rating: 0,
                        token,
                        isActive: true,
                        membershipPaid: true,
                        membershipExpiry: expiryDate.toISOString(),
                        joinedAt: Date.now()
                    };
                    
                    console.log('✅ Listener activated:', payment.email);
                }
                res.redirect(`${BASE_URL}/dashboard-listener.html?membership=success&reference=${reference}`);
            } else res.redirect(`${BASE_URL}/dashboard-listener.html?membership=failed`);
        } catch { res.redirect(`${BASE_URL}/dashboard-listener.html?membership=error`); }
    } else res.redirect(`${BASE_URL}/dashboard-listener.html?membership=cancelled`);
});

// ============ CHAT SYSTEM ============
app.get('/api/chat/client-nickname/:sessionId', (req, res) => {
    const session = sessions[req.params.sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!chatSessions[req.params.sessionId]) {
        chatSessions[req.params.sessionId] = { 
            messages: [], 
            clientNickname: generateClientNickname(), 
            listenerNickname: null, 
            startedAt: Date.now() 
        };
    }
    res.json({ nickname: chatSessions[req.params.sessionId].clientNickname });
});

app.get('/api/chat/listener-nickname/:sessionId', (req, res) => {
    const session = sessions[req.params.sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    let listenerNickname = null;
    if (session.listenerId) {
        const listener = Object.values(listeners).find(l => l.id === session.listenerId);
        if (listener) listenerNickname = listener.nickname || 'Listener';
    }
    if (chatSessions[req.params.sessionId]) {
        chatSessions[req.params.sessionId].listenerNickname = listenerNickname;
    }
    res.json({ nickname: listenerNickname || 'Listener' });
});

app.post('/api/chat/send', (req, res) => {
    const { sessionId, sender, message, senderType } = req.body;
    if (!sessionId || !sender || !message || !senderType) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!chatSessions[sessionId]) {
        chatSessions[sessionId] = { 
            messages: [], 
            clientNickname: generateClientNickname(), 
            listenerNickname: null, 
            startedAt: Date.now() 
        };
    }
    
    let senderName = sender;
    if (senderType === 'client') {
        senderName = chatSessions[sessionId].clientNickname;
    } else if (senderType === 'listener') {
        if (!chatSessions[sessionId].listenerNickname) {
            const session = sessions[sessionId];
            if (session?.listenerId) {
                const listener = Object.values(listeners).find(l => l.id === session.listenerId);
                if (listener) {
                    chatSessions[sessionId].listenerNickname = listener.nickname || 'Listener';
                }
            }
        }
        senderName = chatSessions[sessionId].listenerNickname || 'Listener';
    }
    
    const messageObj = {
        id: 'msg_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        sender: senderName,
        senderType: senderType,
        message: message,
        timestamp: Date.now()
    };
    
    chatSessions[sessionId].messages.push(messageObj);
    console.log(`💬 Chat [${sessionId}] - ${senderName}: ${message.substring(0, 50)}...`);
    
    res.json({ success: true, message: messageObj });
});

app.get('/api/chat/history/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { token, role } = req.query;
    
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    let hasAccess = false;
    if (role === 'client' && session.clientToken === token) {
        hasAccess = true;
    } else if (role === 'listener') {
        const listener = Object.values(listeners).find(l => l.token === token);
        if (listener && listener.id === session.listenerId) {
            hasAccess = true;
        }
    }
    
    if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!chatSessions[sessionId]) {
        return res.json({ messages: [] });
    }
    
    res.json({ 
        messages: chatSessions[sessionId].messages,
        clientNickname: chatSessions[sessionId].clientNickname,
        listenerNickname: chatSessions[sessionId].listenerNickname
    });
});

// ============ ADMIN ENDPOINTS ============
app.get('/api/admin/listeners', verifyAdmin, (req, res) => {
    const listenerList = Object.values(listeners).map(l => ({
        id: l.id,
        email: l.email,
        fullName: l.fullName || 'Listener',
        nickname: l.nickname || 'Unnamed',
        isActive: l.isActive || false,
        balance: l.balance || 0,
        sessionsCompleted: l.sessionsCompleted || 0,
        rating: l.rating || 0,
        membershipPaid: l.membershipPaid || false,
        membershipStatus: l.membershipExpiry ? 
            (new Date(l.membershipExpiry) > new Date() ? 'active' : 'expired') : 'pending',
        membershipExpiry: l.membershipExpiry || null,
        mpesaNumber: l.mpesaNumber || 'N/A'
    }));
    res.json(listenerList);
});

app.get('/api/admin/applications', verifyAdmin, (req, res) => {
    const pending = listenerApplications.filter(a => a.status === 'pending_review');
    res.json(pending);
});

app.get('/api/admin/sessions', verifyAdmin, (req, res) => {
    const allSessions = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);
    res.json(allSessions);
});

app.post('/api/admin/block-listener', verifyAdmin, (req, res) => {
    const { listenerId, reason } = req.body;
    
    let found = false;
    for (const [email, data] of Object.entries(listeners)) {
        if (data.id === listenerId) {
            data.isActive = false;
            data.blockedReason = reason || 'Admin action';
            data.blockedAt = Date.now();
            found = true;
            console.log('🚫 Listener blocked:', email);
            break;
        }
    }
    
    if (found) {
        res.json({ success: true, message: 'Listener blocked successfully' });
    } else {
        res.status(404).json({ success: false, message: 'Listener not found' });
    }
});

app.post('/api/admin/unblock-listener', verifyAdmin, (req, res) => {
    const { listenerId } = req.body;
    
    let found = false;
    for (const [email, data] of Object.entries(listeners)) {
        if (data.id === listenerId) {
            data.isActive = true;
            data.blockedReason = null;
            data.blockedAt = null;
            found = true;
            console.log('✅ Listener unblocked:', email);
            break;
        }
    }
    
    if (found) {
        res.json({ success: true, message: 'Listener unblocked successfully' });
    } else {
        res.status(404).json({ success: false, message: 'Listener not found' });
    }
});

// ============ DEBUG ============
app.get('/api/debug/sessions', (req, res) => {
    const sessionList = Object.values(sessions).map(s => ({
        id: s.id,
        status: s.status,
        tier: s.tier,
        price: s.price,
        priceUSD: '$' + (s.price / 100).toFixed(2),
        scheduledAt: new Date(s.scheduledAt).toLocaleString(),
        clientToken: s.clientToken ? s.clientToken.substring(0, 10) + '...' : null,
        paymentRef: s.paymentRef,
        paymentVerified: s.paymentVerified || false,
        listenerId: s.listenerId || 'unassigned',
        isTest: s.isTest || false,
        createdAt: new Date(s.createdAt).toLocaleString()
    }));
    
    res.json({
        count: Object.keys(sessions).length,
        sessions: sessionList
    });
});

// ============ STATUS ============
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: Date.now(), 
        sessions: Object.keys(sessions).length, 
        listeners: Object.keys(listeners).length, 
        applications: listenerApplications.length, 
        chats: Object.keys(chatSessions).length 
    });
});

// ============ START SERVER ============
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 Talk to Me Server Running');
    console.log('📍 http://localhost:' + PORT);
    console.log('🌐 Site URL:', BASE_URL);
    console.log('💳 Payoneer:', PAYONEER_API_KEY ? '✅ Connected' : '❌ Not configured');
    console.log('💰 Pricing:');
    console.log('   Standard: $10');
    console.log('   Extended: $30');
    console.log('💰 Membership: $20 / YEAR');
    console.log('📊 Sessions:', Object.keys(sessions).length);
    console.log('👂 Listeners:', Object.keys(listeners).length);
    console.log('📝 Applications:', listenerApplications.length);
    console.log('💬 Chats:', Object.keys(chatSessions).length);
    console.log('✅ Press Ctrl+C to stop');
    console.log('');
});