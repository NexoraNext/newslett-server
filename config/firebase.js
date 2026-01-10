const admin = require('firebase-admin');
const { logger } = require('../middleware/logger');

let firebaseApp = null;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        logger.info("Firebase Admin initialized successfully from environment variable");
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const path = require('path');
        const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        const serviceAccount = require(serviceAccountPath);
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        logger.info("Firebase Admin initialized successfully from path");
    } else {
        logger.warn("Firebase credentials not found. Firebase Auth will operate in MOCK mode.");
    }
} catch (error) {
    logger.error("Failed to initialize Firebase Admin", error);
}

module.exports = admin;
