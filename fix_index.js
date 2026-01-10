const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

async function fixIndexes() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('users');

        // List indexes
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes);

        const indexName = 'deviceId_1';
        const indexExists = indexes.some(idx => idx.name === indexName);

        if (indexExists) {
            console.log(`Dropping index: ${indexName}...`);
            await collection.dropIndex(indexName);
            console.log('Index dropped successfully.');
        } else {
            console.log(`Index ${indexName} not found.`);
        }

        console.log('Please restart the server now. Mongoose will recreate the index with the correct "sparse" option.');

    } catch (error) {
        console.error('Error fixing indexes:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
    }
}

fixIndexes();
