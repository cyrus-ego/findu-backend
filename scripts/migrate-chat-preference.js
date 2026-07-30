#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/strangerconfide';
const DEFAULT_CHAT_PREFERENCE = 'female';
const VALID_GENDERS = ['male', 'female', 'other'];

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

async function main() {
  loadEnvFile();

  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production' && process.env.ALLOW_PROFILE_MIGRATION !== 'true') {
    throw new Error(
      'Refusing to migrate in production unless ALLOW_PROFILE_MIGRATION=true is set.',
    );
  }

  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;
  await mongoose.connect(mongoUri);

  const profiles = mongoose.connection.collection('profiles');
  const result = await profiles.updateMany(
    {},
    [
      {
        $set: {
          chatPreference: {
            $switch: {
              branches: [
                {
                  case: { $in: ['$preferredGender', VALID_GENDERS] },
                  then: '$preferredGender',
                },
                {
                  case: { $in: ['$chatPreference', VALID_GENDERS] },
                  then: '$chatPreference',
                },
                {
                  case: { $eq: ['$chatPreference', 'same'] },
                  then: {
                    $cond: [
                      { $in: ['$gender', VALID_GENDERS] },
                      '$gender',
                      DEFAULT_CHAT_PREFERENCE,
                    ],
                  },
                },
                {
                  case: { $eq: ['$chatPreference', 'opposite'] },
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$gender', 'male'] }, then: 'female' },
                        { case: { $eq: ['$gender', 'female'] }, then: 'male' },
                        { case: { $eq: ['$gender', 'other'] }, then: 'other' },
                      ],
                      default: DEFAULT_CHAT_PREFERENCE,
                    },
                  },
                },
                {
                  case: { $eq: ['$chatPreference', 'any'] },
                  then: DEFAULT_CHAT_PREFERENCE,
                },
              ],
              default: DEFAULT_CHAT_PREFERENCE,
            },
          },
        },
      },
      { $unset: 'preferredGender' },
    ],
  );

  console.log(`Matched profiles: ${result.matchedCount}`);
  console.log(`Modified profiles: ${result.modifiedCount}`);
  console.log(`Default for legacy any/unknown: ${DEFAULT_CHAT_PREFERENCE}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
