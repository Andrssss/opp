// index.js
const express = require("express");
const path = require("path");
const http = require("http");
const { WebSocketServer } = require("ws");
const { Kafka } = require("kafkajs");

// --------- ENV VARS ----------
const PORT = process.env.PORT || 8080;
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || "demo-stream";

if (!KAFKA_BROKER) {
  console.error("Missing KAFKA_BROKER env var");
  process.exit(1);
}

const saslUsername = process.env.KAFKA_SASL_USERNAME;
const saslPassword = process.env.KAFKA_SASL_PASSWORD;

if (!saslUsername || !saslPassword) {
  console.error("Missing KAFKA_SASL_USERNAME or KAFKA_SASL_PASSWORD env vars");
  process.exit(1);
}

console.log("Using broker:", KAFKA_BROKER, "topic:", KAFKA_TOPIC);

// --------- EXPRESS + HTTP SERVER ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

// --------- WEBSOCKET SERVER ----------
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(json) {
  const data = JSON.stringify(json);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
}

wss.on("connection", (socket) => {
  console.log("Client connected");
  socket.on("close", () => console.log("Client disconnected"));
});

// --------- KAFKA SETUP ----------
const kafka = new Kafka({
  clientId: "kafka-game-demo",
  brokers: [KAFKA_BROKER],
  ssl: true,
  sasl: {
    mechanism: "plain",
    username: saslUsername,
    password: saslPassword,
  },
});

const consumer = kafka.consumer({ groupId: "kafka-game-live" });
const producer = kafka.producer();

// live stream: consume from Kafka and push to WS clients
async function startKafka() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  console.log(`Subscribed to topic: ${KAFKA_TOPIC}`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const valueStr = message.value?.toString() || "{}";
        let payload;

        try {
          payload = JSON.parse(valueStr);
        } catch {
          payload = { raw: valueStr };
        }

        const event = {
          topic,
          partition,
          offset: message.offset,
          timestamp: message.timestamp,
          key: message.key ? message.key.toString() : null,
          value: payload,
          stream: "live",
        };

        broadcast(event);
      } catch (err) {
        console.error("Error processing message:", err);
      }
    },
  });
}

// --------- PRODUCE GAME EVENTS ----------
app.post("/produce", async (req, res) => {
  try {
    const event = req.body || {};
    if (!event.type) {
      return res.status(400).json({ error: "event.type is required" });
    }

    if (!event.createdAt) {
      event.createdAt = new Date().toISOString();
    }

    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [{ value: JSON.stringify(event) }],
    });

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("Error producing message:", err);
    return res.status(500).json({ error: "failed to produce message" });
  }
});

// --------- REPLAY (for snapshot + slider) ----------
// Client sends a sessionId; we tag all replayed events with it.
// Each browser only processes replay events with its own sessionId.
// Kafka remains the *only* persistent state; this just re-reads the log.
app.post("/replay", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const replayConsumer = kafka.consumer({
      groupId: `kafka-game-replay-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`,
    });

    await replayConsumer.connect();
    await replayConsumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });

    // Fire-and-forget replay; response returns immediately
    (async () => {
      console.log("Starting replay for session", sessionId);
      broadcast({ control: "REPLAY_START", sessionId });

      await replayConsumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const valueStr = message.value?.toString() || "{}";
          let payload;

          try {
            payload = JSON.parse(valueStr);
          } catch {
            payload = { raw: valueStr };
          }

          const event = {
            topic,
            partition,
            offset: message.offset,
            timestamp: message.timestamp,
            key: message.key ? message.key.toString() : null,
            value: payload,
            stream: "replay",
            sessionId,
          };

          broadcast(event);
        },
      });
    })().catch((err) => {
      console.error("Replay error:", err);
    });

    // Stop replay after 15s (demo) so consumer doesn’t live forever
    setTimeout(() => {
      replayConsumer
        .disconnect()
        .then(() => {
          console.log("Replay finished for session", sessionId);
          broadcast({ control: "REPLAY_END", sessionId });
        })
        .catch((err) => console.error("Error stopping replay", err));
    }, 15000);

    res.json({ status: "replay-started" });
  } catch (err) {
    console.error("Error starting replay:", err);
    res.status(500).json({ error: "failed to start replay" });
  }
});

// --------- START ----------
server.listen(PORT, () => {
  console.log(`HTTP/WebSocket server listening on port ${PORT}`);
  startKafka().catch((err) => {
    console.error("Kafka error:", err);
    process.exit(1);
  });
});
