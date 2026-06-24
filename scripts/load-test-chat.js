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

  if (!body.accessToken) {
    throw new Error(`Login response missing accessToken for ${email}`);
  }

  return {
    email,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    user: body.user,
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

async function joinMatchmaking(baseUrl, clients, options) {
  const startedAt = performance.now();

  await Promise.all(
    clients.map(async (client) => {
      client.matchSocket = await connectSocket(
        baseUrl,
        '/matchmaking',
        client.accessToken,
        options.connectTimeoutMs,
      );

      client.matchPromise = onceWithTimeout(
        client.matchSocket,
        'match:found',
        options.matchTimeoutMs,
        `match:found for ${client.email}`,
      );

      client.matchSocket.emit('queue:join', {
        preference: 'opposite',
        preferredGender: client.gender === 'male' ? 'female' : 'male',
      });
    }),
  );

  const matchedPayloads = await Promise.all(clients.map((client) => client.matchPromise));
  const pairMap = new Map();

  clients.forEach((client, index) => {
    client.roomId = matchedPayloads[index].roomId;
    client.partnerId = matchedPayloads[index].partnerId;
    client.matchSocket.disconnect();

    if (!client.roomId) {
      throw new Error(`Missing roomId for ${client.email}`);
    }

    if (!pairMap.has(client.roomId)) pairMap.set(client.roomId, []);
    pairMap.get(client.roomId).push(client);
  });

  const pairs = [...pairMap.entries()].map(([roomId, members]) => ({ roomId, members }));
  const invalidPairs = pairs.filter((pair) => pair.members.length !== 2);
  if (invalidPairs.length > 0) {
    throw new Error(`Invalid pair count in ${invalidPairs.length} rooms.`);
  }

  const elapsedMs = performance.now() - startedAt;
  return { pairs, elapsedMs };
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
  return `${base} [${client.email} #${sequence} ${Date.now()}]`;
}

async function sendMessage(client, roomId, content, options, metrics) {
  const startedAt = performance.now();

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`chat:message timeout for ${client.email}`));
    }, options.sendAckTimeoutMs);

    const onMessage = (payload) => {
      if (payload?.roomId !== roomId) return;
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

  const options = {
    messagesPerUser,
    messageDelayMs,
    connectTimeoutMs,
    matchTimeoutMs,
    roomJoinTimeoutMs,
    sendAckTimeoutMs,
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

  const testTimer = setTimeout(() => {
    console.error(`Load test exceeded ${testTimeoutMs}ms.`);
    process.exit(1);
  }, testTimeoutMs);

  const allSockets = [];
  const startedAt = performance.now();

  try {
    console.log('Logging in users...');
    const loggedIn = await loginClients(baseUrl, clients, password, loginConcurrency, loginDelayMs);

    console.log('Joining matchmaking queue...');
    const { pairs, elapsedMs: matchElapsedMs } = await joinMatchmaking(baseUrl, loggedIn, options);
    console.log(`Matched ${pairs.length} rooms.`);

    console.log('Joining chat rooms...');
    await joinChatRooms(baseUrl, pairs, options);

    for (const client of loggedIn) {
      if (client.matchSocket) allSockets.push(client.matchSocket);
      if (client.chatSocket) allSockets.push(client.chatSocket);
    }

    console.log('Sending chat messages...');
    const metrics = { sent: 0, latencies: [] };
    await Promise.all(pairs.map((pair) => runConversation(pair, options, metrics)));

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
