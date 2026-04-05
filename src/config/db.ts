/**
 * @file db.ts
 * @description Mongoose connection setup. Connects to MongoDB Atlas using the
 *              MONGO_URI environment variable and logs connection status.
 */

import mongoose from 'mongoose';

/**
 * @description Establishes a connection to MongoDB using Mongoose.
 *              Exits the process if the connection fails.
 * @returns {Promise<void>}
 */
const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not defined in environment variables');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
