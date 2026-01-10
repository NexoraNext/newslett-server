const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        unique: true,
        sparse: true // Allow nulls for old anonymous users
    },
    email: {
        type: String,
        unique: true,
        sparse: true
    },
    deviceId: { // Kept for legacy/migration purposes
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    displayName: String,
    photoUrl: String,
    role: {
        type: String,
        enum: ['user', 'journalist', 'admin'],
        default: 'user'
    },
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
    // Interaction History
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
        of: String // 'agree', 'disagree', 'unsure'
    },
    // Stats
    commentsPosted: {
        type: Number,
        default: 0
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Static method to find or create user by Firebase UID
userSchema.statics.getOrCreateByFirebase = async function (decodedToken) {
    const { uid, email, name, picture } = decodedToken;

    let user = await this.findOne({ firebaseUid: uid });

    if (!user) {
        // Check if we can link by email (if migrated) - unlikely for anonymous device users but good for future
        if (email) {
            user = await this.findOne({ email });
        }

        if (user) {
            // Link existing user
            user.firebaseUid = uid;
            if (name) user.displayName = name;
            if (picture) user.photoUrl = picture;
        } else {
            // Create new user
            user = await this.create({
                firebaseUid: uid,
                email,
                displayName: name || 'User',
                photoUrl: picture,
                role: 'user',
                likedArticles: [],
                savedArticles: [],
                votedArticles: new Map()
            });
        }
    } else {
        // Update metadata on login
        if (name && user.displayName !== name) user.displayName = name;
        if (picture && user.photoUrl !== picture) user.photoUrl = picture;
    }

    user.lastActiveAt = new Date();
    await user.save();
    return user;
};

// Legacy method: Get or create by device ID (Deprecated but kept for transition)
userSchema.statics.getOrCreate = async function (deviceId) {
    if (!deviceId) throw new Error('Device ID is required');

    let user = await this.findOne({ deviceId });

    if (!user) {
        user = await this.create({
            deviceId,
            preferences: {
                mood: 'neutral',
                categories: ['general', 'technology']
            }
        });
    }

    user.lastActiveAt = new Date();
    await user.save();
    return user;
};

// Transform output (hide internal fields)
userSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.firebaseUid; // Don't expose internal IDs if not needed
        // Convert Map to object for JSON
        ret.votedArticles = Object.fromEntries(doc.votedArticles || new Map());
        return ret;
    }
});

module.exports = mongoose.model('User', userSchema);
