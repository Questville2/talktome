require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

// ============ ALLOW ANY HOST (FIX FOR RENDER) ============
app.set('trust proxy', true);

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// ============ CORS FIX ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use('/uploads', express.static('uploads'));

// ============ DOMAIN CONFIGURATION ============
const BASE_URL = process.env.BASE_URL || 'https://talktome-1m1b.onrender.com';
console.log('🌐 Site URL:', BASE_URL);

// ============ EMAIL CONFIGURATION ============
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
    }
});

async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: `"Talk to Me" <${EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: html
        };
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return null;
    }
}

// ============ FILE UPLOAD ============
const uploadDirs = ['uploads/cvs', 'uploads/id_photos', 'uploads/certificates', 'uploads/profile_photos', 'uploads/ndas', 'uploads/agreements'];
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
const gifts = {};
const referrals = {};

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

// ============ GIFT SYSTEM ============
function generateGiftCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'GIFT-';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

app.post('/api/gift/create', async (req, res) => {
    try {
        const { giverName, friendName, friendEmail, message } = req.body;
        
        if (!giverName || !friendName || !friendEmail) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const giftCode = generateGiftCode();
        const giftId = 'gift_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        
        gifts[giftId] = {
            id: giftId,
            code: giftCode,
            giverName,
            friendName,
            friendEmail,
            message: message || '',
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            redeemedAt: null,
            redeemedBy: null
        };
        
        const emailHtml = `
            <div style="font-family: system-ui; max-width: 600px; margin: 0 auto; padding: 20px; background: #f7faf7;">
                <h1 style="color: #2D6A4F;">🎁 You've Received a Gift!</h1>
                <p><strong>${giverName}</strong> has gifted you a 30-minute anonymous session on Talk to Me.</p>
                ${message ? `<p style="font-style: italic; color: #4a5a4a;">"${message}"</p>` : ''}
                <div style="background: white; padding: 20px; border-radius: 12px; margin: 20px 0; border: 2px dashed #2D6A4F;">
                    <p style="font-size: 14px; color: #6a7a6a;">Your Gift Code:</p>
                    <p style="font-size: 28px; font-weight: 700; color: #2D6A4F; letter-spacing: 2px;">${giftCode}</p>
                </div>
                <a href="${BASE_URL}/redeem-gift.html?code=${giftCode}" style="background: #2D6A4F; color: white; padding: 14px 28px; border-radius: 50px; text-decoration: none; display: inline-block; font-weight: 600;">
                    Redeem Your Gift
                </a>
                <p style="font-size: 14px; color: #6a7a6a; margin-top: 20px;">This gift expires in 30 days.</p>
                <p style="font-size: 12px; color: #6a7a6a;">Talk to Me — Anonymous emotional support. 100% private.</p>
            </div>
        `;
        
        if (EMAIL_USER && EMAIL_PASSWORD) {
            await sendEmail(friendEmail, `🎁 ${giverName} sent you a gift session!`, emailHtml);
        }
        
        res.json({
            success: true,
            giftId: giftId,
            giftCode: giftCode,
            message: 'Gift created and email sent!'
        });
        
    } catch (error) {
        console.error('❌ Gift creation error:', error);
        res.status(500).json({ error: 'Failed to create gift' });
    }
});

app.post('/api/gift/redeem', (req, res) => {
    const { giftCode, recipientToken } = req.body;
    
    if (!giftCode || !recipientToken) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    let gift = null;
    let giftId = null;
    for (const [id, g] of Object.entries(gifts)) {
        if (g.code === giftCode) {
            gift = g;
            giftId = id;
            break;
        }
    }
    
    if (!gift) {
        return res.status(404).json({ error: 'Invalid gift code' });
    }
    
    if (gift.status === 'redeemed') {
        return res.status(400).json({ error: 'This gift has already been redeemed' });
    }
    
    if (gift.expiresAt < Date.now()) {
        gift.status = 'expired';
        return res.status(400).json({ error: 'This gift has expired' });
    }
    
    gift.status = 'redeemed';
    gift.redeemedAt = Date.now();
    gift.redeemedBy = recipientToken;
    
    const sessionId = 'session_' + crypto.randomBytes(8).toString('hex');
    sessions[sessionId] = {
        id: sessionId,
        clientToken: recipientToken,
        tier: 'standard',
        duration: 1800,
        price: 0,
        status: 'booked',
        scheduledAt: Date.now() + 3600000,
        note: `🎁 Gift session from ${gift.giverName}`,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        clientRating: null,
        listenerId: null,
        paymentRef: 'gift_' + giftId,
        isGift: true,
        giftCode: giftCode
    };
    
    res.json({
        success: true,
        message: 'Gift redeemed successfully!',
        sessionId: sessionId
    });
});

app.get('/api/gift/status/:code', (req, res) => {
    const { code } = req.params;
    
    let gift = null;
    for (const [id, g] of Object.entries(gifts)) {
        if (g.code === code) {
            gift = g;
            break;
        }
    }
    
    if (!gift) {
        return res.status(404).json({ error: 'Gift not found' });
    }
    
    res.json({
        code: gift.code,
        giverName: gift.giverName,
        friendName: gift.friendName,
        status: gift.status,
        createdAt: gift.createdAt,
        expiresAt: gift.expiresAt,
        isExpired: gift.expiresAt < Date.now()
    });
});

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

        sessions[sessionId] = {
            id: sessionId,
            clientToken: clientToken,
            tier: tier,
            duration: TIERS[tier].duration,
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

        res.json({
            success: true,
            sessionId: sessionId,
            token: clientToken,
            message: 'Session created! Please complete payment.',
            redirectUrl: '/book.html?status=success',
            testMode: false
        });
    } catch (error) {
        console.error('❌ Booking error:', error.message);
        
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
    const { reference, status } = req.query;
    console.log('📞 Payment callback received:', { reference, status });

    if (status === 'success' && reference) {
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
        
        res.json({ 
            success: true, 
            message: 'Membership activated!',
            token: token
        });
    } catch (error) {
        console.error('❌ Membership error:', error.message);
        res.status(500).json({ error: 'Membership activation failed' });
    }
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
        chats: Object.keys(chatSessions).length,
        gifts: Object.keys(gifts).length
    });
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Talk to Me Server Running');
    console.log('📍 http://localhost:' + PORT);
    console.log('🌐 Site URL:', BASE_URL);
    console.log('📧 Email:', EMAIL_USER ? '✅ Configured' : '❌ Not configured');
    console.log('💰 Pricing:');
    console.log('   Standard: $10');
    console.log('   Extended: $30');
    console.log('💰 Membership: $20 / YEAR');
    console.log('📊 Sessions:', Object.keys(sessions).length);
    console.log('👂 Listeners:', Object.keys(listeners).length);
    console.log('📝 Applications:', listenerApplications.length);
    console.log('💬 Chats:', Object.keys(chatSessions).length);
    console.log('🎁 Gifts:', Object.keys(gifts).length);
    console.log('✅ Press Ctrl+C to stop');
    console.log('');
});