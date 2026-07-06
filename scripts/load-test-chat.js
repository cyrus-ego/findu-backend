const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

let io;
try {
  ({ io } = require('socket.io-client'));
} catch {
  console.error('Missing dependency: socket.io-client');
  console.error('Run: npm install');
  process.exit(1);
}

// const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_BASE_URL = 'http://oc2.lifebow.net:3001';
const DEFAULT_EMAIL_DOMAIN = 'findu.local';
const DEFAULT_PASSWORD = 'Test@123456';
const DEFAULT_USERS_PER_GENDER = 50;
const DEFAULT_MESSAGES_PER_USER = 20;
const DEFAULT_MESSAGE_DELAY_MS = 3000;
const DEFAULT_LOGIN_CONCURRENCY = 20;
const DEFAULT_LOGIN_DELAY_MS = 0;
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
const DEFAULT_MATCH_TIMEOUT_MS = 180000;
const DEFAULT_ROOM_JOIN_TIMEOUT_MS = 30000;
const DEFAULT_SEND_ACK_TIMEOUT_MS = 10000;
const DEFAULT_TEST_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_ALLOW_PARTIAL_MATCHES = true;

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

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function envNonNegativeNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function envBoolean(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function padNumber(value) {
  return String(value).padStart(3, '0');
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function apiUrl(baseUrl, pathName) {
  return `${baseUrl}/api${pathName}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceWithTimeout(socket, event, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onEvent = (payload) => {
      cleanup();
      resolve(payload);
    };

    const onError = (payload) => {
      cleanup();
      const message = payload?.message || payload || `Socket error while waiting for ${label}`;
      reject(new Error(String(message)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off('error', onError);
      socket.off('connect_error', onError);
      socket.off('disconnect', onDisconnect);
    };

    const onDisconnect = (reason) => {
      cleanup();
      reject(new Error(`Socket disconnected while waiting for ${label}: ${reason}`));
    };

    socket.once(event, onEvent);
    socket.once('error', onError);
    socket.once('connect_error', onError);
    socket.once('disconnect', onDisconnect);
  });
}

async function withConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const results = new Array(items.length);

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runWorker);
  await Promise.all(workers);
  return results;
}

async function loginClients(baseUrl, clients, password, concurrency, loginDelayMs) {
  if (loginDelayMs <= 0) {
    return withConcurrency(clients, concurrency, async (client) => {
      const auth = await loginUser(baseUrl, client.email, password);
      return { ...client, ...auth };
    });
  }

  const loggedIn = [];
  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    const auth = await loginUser(baseUrl, client.email, password);
    loggedIn.push({ ...client, ...auth });
    if (index < clients.length - 1) {
      await sleep(loginDelayMs);
    }
  }
  return loggedIn;
}

function buildUsers(usersPerGender, emailDomain) {
  const users = [];
  for (const gender of ['male', 'female']) {
    for (let index = 1; index <= usersPerGender; index += 1) {
      const number = padNumber(index);
      users.push({
        gender,
        index,
        email: `test.${gender}${number}@${emailDomain}`,
      });
    }
  }
  return users;
}

async function loginUser(baseUrl, email, password) {
  const res = await fetch(apiUrl(baseUrl, '/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status} ${JSON.stringify(body)}`);
  }

  const authPayload = body?.data || body;
  if (!authPayload?.accessToken) {
    throw new Error(
      `Login response missing accessToken for ${email}: ${JSON.stringify(body).slice(0, 500)}`,
    );
  }

  return {
    email,
    accessToken: authPayload.accessToken,
    refreshToken: authPayload.refreshToken,
    user: authPayload.user,
  };
}

function connectSocket(baseUrl, namespace, token, connectTimeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}${namespace}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: connectTimeoutMs,
    });

    const timer = setTimeout(() => {
      cleanup();
      socket.disconnect();
      reject(new Error(`Connect ${namespace} timed out after ${connectTimeoutMs}ms`));
    }, connectTimeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      socket.off('error', onError);
    };

    const onConnect = () => {
      cleanup();
      resolve(socket);
    };

    const onError = (err) => {
      cleanup();
      socket.disconnect();
      reject(new Error(`Connect ${namespace} failed: ${err?.message || err}`));
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.once('error', onError);
  });
}

async function joinMatchmaking(baseUrl, clients, options, onPairReady, allSockets) {
  const startedAt = performance.now();
  const pairMap = new Map();
  const pairs = [];
  const pairTasks = [];

  function registerMatch(client, payload) {
    client.matched = true;
    client.roomId = payload.roomId;
    client.partnerId = payload.partnerId;
    client.matchSocket.disconnect();

    const matchedCount = clients.filter((item) => item.matched).length;
    if (matchedCount % 10 === 0 || matchedCount === clients.length) {
      console.log(`Matched users: ${matchedCount}/${clients.length}`);
    }

    if (!client.roomId) {
      throw new Error(`Missing roomId for ${client.email}`);
    }

    if (!pairMap.has(client.roomId)) pairMap.set(client.roomId, []);
    const members = pairMap.get(client.roomId);
    members.push(client);

    if (members.length === 2) {
      const pair = { roomId: client.roomId, members };
      pairs.push(pair);
      console.log(`Pair ready ${pairs.length}: ${pair.members.map((item) => item.email).join(' <-> ')}`);
      pairTasks.push(
        onPairReady(pair)
          .then(() => ({ ok: true, pair }))
          .catch((err) => ({ ok: false, pair, err })),
      );
    } else if (members.length > 2) {
      console.error(`Room ${client.roomId} has ${members.length} matched clients in test result.`);
    }
  }

  await Promise.all(
    clients.map(async (client) => {
      client.matchSocket = await connectSocket(
        baseUrl,
        '/matchmaking',
        client.accessToken,
        options.connectTimeoutMs,
      );
      allSockets.push(client.matchSocket);

      client.matchSocket.on('queue:joined', () => {
        client.queueJoined = true;
      });
      client.matchSocket.on('queue:timeout', (payload) => {
        console.warn(`Queue timeout for ${client.email}: ${payload?.message || ''}`);
      });

      client.matchPromise = onceWithTimeout(
        client.matchSocket,
        'match:found',
        options.matchTimeoutMs,
        `match:found for ${client.email}`,
      ).then((payload) => {
        registerMatch(client, payload);
        return payload;
      });

      client.matchSocket.emit('queue:join', {
        preference: client.gender === 'male' ? 'female' : 'male',
      });
    }),
  );

  const matchResults = await Promise.allSettled(clients.map((client) => client.matchPromise));
  const failedMatches = matchResults
    .map((result, index) => ({ result, client: clients[index] }))
    .filter((item) => item.result.status === 'rejected');

  if (failedMatches.length > 0) {
    const joinedCount = clients.filter((client) => client.queueJoined).length;
    const matchedCount = clients.filter((client) => client.matched).length;
    const unmatched = failedMatches.map(({ client }) =>
      `${client.email}${client.queueJoined ? '' : ' (not joined)'}`,
    );

    console.error(`Matchmaking partial result: joined=${joinedCount}/${clients.length}, matched=${matchedCount}/${clients.length}`);
    console.error(`Unmatched users: ${unmatched.join(', ')}`);

    if (!options.allowPartialMatches) {
      throw failedMatches[0].result.reason;
    }
  }

  clients.forEach((client) => {
    if (!client.matched) {
      client.matchSocket.disconnect();
    }
  });

  const invalidPairs = [...pairMap.entries()]
    .map(([roomId, members]) => ({ roomId, members }))
    .filter((pair) => pair.members.length !== 2);
  if (invalidPairs.length > 0) {
    console.error(
      `Skipping ${invalidPairs.length} rooms with invalid participant count in test result.`,
    );
  }
  if (pairs.length === 0) {
    throw new Error('No complete matched pairs available for chat load test.');
  }

  const elapsedMs = performance.now() - startedAt;
  return { pairs, pairTasks, elapsedMs };
}

async function joinChatRooms(baseUrl, pairs, options) {
  const allClients = pairs.flatMap((pair) => pair.members);
  await Promise.all(
    allClients.map(async (client) => {
      client.chatSocket = await connectSocket(
        baseUrl,
        '/chat',
        client.accessToken,
        options.connectTimeoutMs,
      );
    }),
  );

  await Promise.all(
    pairs.flatMap((pair) =>
      pair.members.map(async (client) => {
        const joined = onceWithTimeout(
          client.chatSocket,
          'room:joined',
          options.roomJoinTimeoutMs,
          `room:joined for ${client.email}`,
        );
        client.chatSocket.emit('room:join', { roomId: pair.roomId });
        await joined;
      }),
    ),
  );
}

async function joinChatRoomForPair(baseUrl, pair, options, allSockets) {
  await Promise.all(
    pair.members.map(async (client) => {
      client.chatSocket = await connectSocket(
        baseUrl,
        '/chat',
        client.accessToken,
        options.connectTimeoutMs,
      );
      allSockets.push(client.chatSocket);
    }),
  );

  await Promise.all(
    pair.members.map(async (client) => {
      const joined = onceWithTimeout(
        client.chatSocket,
        'room:joined',
        options.roomJoinTimeoutMs,
        `room:joined for ${client.email}`,
      );
      client.chatSocket.emit('room:join', { roomId: pair.roomId });
      await joined;
    }),
  );
}

async function runPairChat(baseUrl, pair, options, metrics, allSockets) {
  console.log(`Joining chat room ${pair.roomId}`);
  await joinChatRoomForPair(baseUrl, pair, options, allSockets);
  console.log(`Sending chat messages in room ${pair.roomId}`);
  await runConversation(pair, options, metrics);
  console.log(`Completed chat room ${pair.roomId}`);
}

function randomMessage(client, sequence) {
  const samples = [
    'Xin chao, minh dang test chat.',
    'Server ghi message nay on chu?',
    'Noi dung load test nhe.',
    'Tin nhan socket dang chay.',
    'Kiem tra latency va persistence.',
    'Match room da san sang.',
    'Gui tin nhan hai chieu.',
    'Day la message mau.',
    'Chat realtime test.',
    'Mongo write test.',
  ];
  const base = samples[Math.floor(Math.random() * samples.length)];
  return `${base} [user ${client.gender}-${padNumber(client.index)} seq ${sequence} ts ${Date.now()}]`;
}

async function sendMessage(client, roomId, content, options, metrics) {
  const startedAt = performance.now();

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`chat:message timeout for ${client.email}`));
    }, options.sendAckTimeoutMs);

    const onMessage = (payload) => {
      if (payload?.content !== content) return;
      cleanup();
      resolve(payload);
    };

    const onError = (payload) => {
      cleanup();
      reject(new Error(payload?.message || String(payload)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      client.chatSocket.off('chat:message', onMessage);
      client.chatSocket.off('error', onError);
    };

    client.chatSocket.on('chat:message', onMessage);
    client.chatSocket.once('error', onError);
  });

  client.chatSocket.emit('chat:send', {
    roomId,
    type: 'text',
    content,
  });

  await received;

  metrics.sent += 1;
  metrics.latencies.push(performance.now() - startedAt);
}

async function runConversation(pair, options, metrics) {
  const [first, second] = pair.members;
  const schedule = [];

  for (let index = 1; index <= options.messagesPerUser; index += 1) {
    schedule.push({ client: first, index });
    schedule.push({ client: second, index });
  }

  for (let position = 0; position < schedule.length; position += 1) {
    const item = schedule[position];
    const content = randomMessage(item.client, item.index);
    await sendMessage(item.client, pair.roomId, content, options, metrics);

    if (position < schedule.length - 1) {
      await sleep(options.messageDelayMs);
    }
  }
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(metrics, totalElapsedMs, matchElapsedMs, pairCount) {
  const totalMessages = metrics.sent;
  const avgLatency =
    metrics.latencies.length === 0
      ? 0
      : metrics.latencies.reduce((sum, value) => sum + value, 0) / metrics.latencies.length;

  console.log('');
  console.log('Load test summary');
  console.log('=================');
  console.log(`Pairs: ${pairCount}`);
  console.log(`Messages saved/echoed: ${totalMessages}`);
  console.log(`Matchmaking elapsed: ${(matchElapsedMs / 1000).toFixed(2)}s`);
  console.log(`Total elapsed: ${(totalElapsedMs / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${(totalMessages / (totalElapsedMs / 1000)).toFixed(2)} msg/s`);
  console.log(`Send latency avg: ${avgLatency.toFixed(1)}ms`);
  console.log(`Send latency p50: ${percentile(metrics.latencies, 50).toFixed(1)}ms`);
  console.log(`Send latency p95: ${percentile(metrics.latencies, 95).toFixed(1)}ms`);
  console.log(`Send latency max: ${Math.max(0, ...metrics.latencies).toFixed(1)}ms`);
}

async function main() {
  loadEnvFile();

  const baseUrl = normalizeBaseUrl(process.env.LOAD_TEST_BASE_URL || DEFAULT_BASE_URL);
  const emailDomain = process.env.TEST_USER_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN;
  const password = process.env.TEST_USER_PASSWORD || DEFAULT_PASSWORD;
  const usersPerGender = envNumber('LOAD_TEST_USERS_PER_GENDER', DEFAULT_USERS_PER_GENDER);
  const messagesPerUser = envNumber('LOAD_TEST_MESSAGES_PER_USER', DEFAULT_MESSAGES_PER_USER);
  const messageDelayMs = envNumber('LOAD_TEST_MESSAGE_DELAY_MS', DEFAULT_MESSAGE_DELAY_MS);
  const loginConcurrency = envNumber('LOAD_TEST_LOGIN_CONCURRENCY', DEFAULT_LOGIN_CONCURRENCY);
  const loginDelayMs = envNonNegativeNumber('LOAD_TEST_LOGIN_DELAY_MS', DEFAULT_LOGIN_DELAY_MS);
  const connectTimeoutMs = envNumber('LOAD_TEST_CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS);
  const matchTimeoutMs = envNumber('LOAD_TEST_MATCH_TIMEOUT_MS', DEFAULT_MATCH_TIMEOUT_MS);
  const roomJoinTimeoutMs = envNumber('LOAD_TEST_ROOM_JOIN_TIMEOUT_MS', DEFAULT_ROOM_JOIN_TIMEOUT_MS);
  const sendAckTimeoutMs = envNumber('LOAD_TEST_SEND_ACK_TIMEOUT_MS', DEFAULT_SEND_ACK_TIMEOUT_MS);
  const testTimeoutMs = envNumber('LOAD_TEST_TIMEOUT_MS', DEFAULT_TEST_TIMEOUT_MS);
  const allowPartialMatches = envBoolean(
    'LOAD_TEST_ALLOW_PARTIAL_MATCHES',
    DEFAULT_ALLOW_PARTIAL_MATCHES,
  );

  const options = {
    messagesPerUser,
    messageDelayMs,
    connectTimeoutMs,
    matchTimeoutMs,
    roomJoinTimeoutMs,
    sendAckTimeoutMs,
    allowPartialMatches,
  };

  const clients = buildUsers(usersPerGender, emailDomain);
  const expectedMessages = clients.length * messagesPerUser;

  console.log(`Target: ${baseUrl}`);
  console.log(`Users: ${clients.length} (${usersPerGender} male, ${usersPerGender} female)`);
  console.log(`Messages per user: ${messagesPerUser}`);
  console.log(`Expected messages: ${expectedMessages}`);
  console.log(`Message delay: ${messageDelayMs}ms`);
  console.log(`Login concurrency: ${loginDelayMs > 0 ? 1 : loginConcurrency}`);
  console.log(`Login delay: ${loginDelayMs}ms`);
  console.log(`Allow partial matches: ${allowPartialMatches}`);

  const testTimer = setTimeout(() => {
    console.error(`Load test exceeded ${testTimeoutMs}ms.`);
    process.exit(1);
  }, testTimeoutMs);

  const allSockets = [];
  const startedAt = performance.now();

  try {
    console.log('Logging in users...');
    const loggedIn = await loginClients(baseUrl, clients, password, loginConcurrency, loginDelayMs);

    const metrics = { sent: 0, latencies: [] };

    console.log('Joining matchmaking queue...');
    const { pairs, pairTasks, elapsedMs: matchElapsedMs } = await joinMatchmaking(
      baseUrl,
      loggedIn,
      options,
      (pair) => runPairChat(baseUrl, pair, options, metrics, allSockets),
      allSockets,
    );
    console.log(`Matched ${pairs.length} rooms.`);

    console.log('Waiting for active chat conversations to finish...');
    const chatResults = await Promise.all(pairTasks);
    const failedChats = chatResults.filter((result) => !result.ok);
    if (failedChats.length > 0) {
      for (const result of failedChats) {
        console.error(`Chat failed in room ${result.pair.roomId}: ${result.err?.message || result.err}`);
      }
      throw failedChats[0].err;
    }

    summarize(metrics, performance.now() - startedAt, matchElapsedMs, pairs.length);
  } finally {
    clearTimeout(testTimer);
    for (const socket of allSockets) {
      socket.disconnect();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
