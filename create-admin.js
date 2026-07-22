/**
 * create-admin.js
 *
 * Creates a new admin user OR promotes an existing user to admin.
 * Uses the native MongoDB driver — no TypeScript compilation needed.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='strong-password' node create-admin.js
 *   node create-admin.js existing@email.com      → promotes existing user to admin
 *
 * Run from the server directory:
 *   node create-admin.js
 */

const { MongoClient } = require('mongodb');
const bcrypt          = require('bcryptjs');
require('dotenv/config');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required. Add it to .env or the environment.');
  }

  const targetEmail = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!targetEmail) {
    throw new Error('Provide an email argument or set ADMIN_EMAIL.');
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();

    // Uses the database selected in MONGO_URI.
    const db     = client.db();
    const users  = db.collection('users');

    const existing = await users.findOne({ email: targetEmail });

    if (existing) {
      // Promote existing user
      await users.updateOne({ email: targetEmail }, { $set: { role: 'admin' } });
      console.log(`\n✅ "${existing.name}" (${targetEmail}) has been promoted to admin.`);
      console.log('   Log in with their existing password.\n');
    } else {
      const password = process.env.ADMIN_PASSWORD;
      if (!password) {
        throw new Error('ADMIN_PASSWORD is required when creating a new admin.');
      }
      if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD must contain at least 8 characters.');
      }

      // Create brand-new admin
      const hashed = await bcrypt.hash(password, 12);
      await users.insertOne({
        name:        process.env.ADMIN_NAME || 'Admin',
        email:       targetEmail,
        password:    hashed,
        role:        'admin',
        avatarColor: '#7c6fff',
        createdAt:   new Date(),
        updatedAt:   new Date(),
      });
      console.log('\n✅ Admin account created:');
      console.log(`   Email: ${targetEmail}`);
      console.log('   Password was read from ADMIN_PASSWORD and is not displayed.\n');
    }

    // Show all admins
    const admins = await users.find({ role: 'admin' }).toArray();
    console.log(`Admins in database (${admins.length}):`);
    admins.forEach((a) => console.log(`  • ${a.name} <${a.email}>`));

  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
