// User Model - Merged from server/ and backend/
// Combines Firebase auth, Google OAuth, local auth, premium, and creator features
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // ======================
    // IDENTITY & AUTH
    // ======================

    // Basic info
    name: {
        type: String,
        trim: true
    },
    displayName: String, // Legacy from server/
    email: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        select: false // Not returned by default
    },
    avatar: {
        type: String,
        default: null
    },
    photoUrl: String, // Legacy from server/

    // Firebase Auth (from server/)
    firebaseUid: {
        type: String,
        unique: true,
        sparse: true
    },

    // Google OAuth (from backend/)
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },

    // Auth provider tracking
    authProvider: {
        type: String,
        enum: ['local', 'google', 'firebase'],
        default: 'local'
    },

    // Device ID (legacy from server/)
    deviceId: {
        type: String,
        unique: true,
        sparse: true
    },

    // ======================
    // ROLES & PERMISSIONS
    // ======================

    role: {
        type: String,
        enum: ['user', 'journalist', 'admin', 'creator'],
        default: 'user'
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    isCreator: {
        type: Boolean,
        default: false
    },

    // ======================
    // PREMIUM SUBSCRIPTION
    // ======================

    isPremium: {
        type: Boolean,
        default: false
    },
    premiumExpiry: {
        type: Date,
        default: null
    },

    // ======================
    // CREATOR VERIFICATION
    // ======================

    isVerified: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected'],
        default: 'none'
    },
    certificateUrl: {
        type: String,
        default: null
    },
    verificationSubmittedAt: Date,
    verificationReviewedAt: Date,
    verificationNotes: String,

    // ======================
    // PROFILE
    // ======================

    bio: {
        type: String,
        maxlength: 500,
        default: ''
    },

    // ======================
    // PREFERENCES (from server/)
    // ======================

    preferences: {
        mood: {
            type: String,
            enum: ['calm', 'neutral', 'serious'],
            default: 'neutral'
        },
        anchorSpeed: {
            type: Number,
            default: 1.0
        },
        categories: {
            type: [String],
            default: ['general', 'technology', 'science', 'health']
        }
    },

    // ======================
    // ARTICLE INTERACTIONS (from server/)
    // ======================

    likedArticles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'News'
    }],
    savedArticles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'News'
    }],
    votedArticles: {
        type: Map,
        of: String, // 'agree', 'disagree', 'unsure'
        default: () => new Map()
    },

    // ======================
    // SOCIAL FEATURES (from backend/)
    // ======================

    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    followersCount: {
        type: Number,
        default: 0
    },
    followingCount: {
        type: Number,
        default: 0
    },

    // ======================
    // STATS & TIMESTAMPS
    // ======================

    commentsPosted: {
        type: Number,
        default: 0
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    },
    lastLoginAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ======================
// INDEXES
// ======================

// ======================
// INDEXES
// ======================

userSchema.index({ verificationStatus: 1 });

// ======================
// STATIC METHODS
// ======================

// Find or create user by Firebase UID (from server/)
userSchema.statics.getOrCreateByFirebase = async function (decodedToken) {
    const { uid, email, name, picture } = decodedToken;

    let user = await this.findOne({ firebaseUid: uid });

    if (!user && email) {
        user = await this.findOne({ email });
    }

    if (user) {
        user.firebaseUid = uid;
        user.authProvider = 'firebase';
        if (name) user.displayName = user.name = name;
        if (picture) user.photoUrl = user.avatar = picture;
    } else {
        user = await this.create({
            firebaseUid: uid,
            email,
            name: name || 'User',
            displayName: name || 'User',
            avatar: picture,
            photoUrl: picture,
            authProvider: 'firebase',
            role: 'user',
            likedArticles: [],
            savedArticles: [],
            votedArticles: new Map()
        });
    }

    user.lastActiveAt = new Date();
    user.lastLoginAt = new Date();
    await user.save();
    return user;
};

// Legacy method: Get or create by device ID (from server/)
userSchema.statics.getOrCreate = async function (deviceId) {
    if (!deviceId) throw new Error('Device ID is required');

    let user = await this.findOne({ deviceId });

    if (!user) {
        user = await this.create({
            deviceId,
            preferences: {
                mood: 'neutral',
                categories: ['general', 'technology']
            },
            votedArticles: new Map(),
            likedArticles: [],
            savedArticles: []
        });
    }

    user.lastActiveAt = new Date();
    await user.save();
    return user;
};

// ======================
// VIRTUALS
// ======================

// Public profile virtual (from backend/)
userSchema.virtual('publicProfile').get(function () {
    return {
        id: this._id,
        name: this.name || this.displayName,
        avatar: this.avatar || this.photoUrl,
        bio: this.bio,
        isVerified: this.isVerified,
        followersCount: this.followersCount,
        followingCount: this.followingCount
    };
});

// ======================
// TRANSFORMS
// ======================

userSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.firebaseUid;
        delete ret.password;
        if (doc.votedArticles) {
            ret.votedArticles = Object.fromEntries(doc.votedArticles || new Map());
        }
        return ret;
    }
});

module.exports = mongoose.model('User', userSchema);
