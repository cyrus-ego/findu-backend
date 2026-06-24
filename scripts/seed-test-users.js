const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/strangerconfide';
const DEFAULT_PASSWORD = 'Test@123456';
const DEFAULT_EMAIL_DOMAIN = 'findu.local';
const DEFAULT_COUNT_PER_GENDER = 50;
const SALT_ROUNDS = 12;

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function padNumber(value) {
  return String(value).padStart(3, '0');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserAndProfile({ gender, index, passwordHash, emailDomain, now }) {
  const number = padNumber(index);
  const label = gender === 'male' ? 'Male' : 'Female';
  const email = `test.${gender}${number}@${emailDomain}`;
  const userId = new mongoose.Types.ObjectId();

  const user = {
    _id: userId,
    email,
    password: passwordHash,
    displayName: `${label} Test ${number}`,
    avatar: '',
    gender,
    provider: 'local',
    role: 'user',
    isEmailVerified: true,
    isBanned: false,
    bannedAt: null,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  };

  const profile = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    gender,
    age: 18 + ((index - 1) % 18),
    bio: `Seeded ${gender} test profile ${number}`,
    avatar: '',
    chatPreference: 'any',
    isVip: false,
    vipExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  };

  return { user, profile };
}

async function main() {
  loadEnvFile();

  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production' && process.env.ALLOW_TEST_SEED !== 'true') {
    throw new Error('Refusing to seed in production unless ALLOW_TEST_SEED=true is set.');
  }

  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;
  const password = process.env.TEST_USER_PASSWORD || DEFAULT_PASSWORD;
  const emailDomain = process.env.TEST_USER_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN;
  const countPerGender = Number(process.env.TEST_USER_COUNT_PER_GENDER || DEFAULT_COUNT_PER_GENDER);

  if (!Number.isInteger(countPerGender) || countPerGender <= 0) {
    throw new Error('TEST_USER_COUNT_PER_GENDER must be a positive integer.');
  }

  await mongoose.connect(mongoUri);

  const users = mongoose.connection.collection('users');
  const profiles = mongoose.connection.collection('profiles');
  const emailPattern = new RegExp(`^test\\.(male|female)\\d{3}@${escapeRegExp(emailDomain)}$`);

  const existingUsers = await users.find({ email: emailPattern }, { projection: { _id: 1 } }).toArray();
  const existingUserIds = existingUsers.map((user) => user._id);

  if (existingUserIds.length > 0) {
    await profiles.deleteMany({ userId: { $in: existingUserIds } });
    await users.deleteMany({ _id: { $in: existingUserIds } });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = new Date();
  const userDocs = [];
  const profileDocs = [];

  for (const gender of ['male', 'female']) {
    for (let index = 1; index <= countPerGender; index += 1) {
      const { user, profile } = buildUserAndProfile({
        gender,
        index,
        passwordHash,
        emailDomain,
        now,
      });
      userDocs.push(user);
      profileDocs.push(profile);
    }
  }

  await users.insertMany(userDocs, { ordered: true });
  await profiles.insertMany(profileDocs, { ordered: true });

  console.log(`Seeded ${userDocs.length} users and ${profileDocs.length} profiles.`);
  console.log(`Male users: ${countPerGender}`);
  console.log(`Female users: ${countPerGender}`);
  console.log(`Email domain: ${emailDomain}`);
  console.log(`Password: ${password}`);
  console.log(`Example accounts:`);
  console.log(`  test.male001@${emailDomain}`);
  console.log(`  test.female001@${emailDomain}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
