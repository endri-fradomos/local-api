import mqtt from 'mqtt';
import { createRequire } from 'module';

// ...existing code...
const require = createRequire(import.meta.url);
let WebSocketServerConstructor;
try {
  ({ WebSocketServer: WebSocketServerConstructor } = require('ws'));
} catch {
  WebSocketServerConstructor = null;
}

export function initRealtime(server) {
  const mqttUrl = process.env.MQTT_URL || 'mqtt://192.168.100.232';
  const mqttUser = process.env.MQTT_USER || '';
  const mqttPass = process.env.MQTT_PASS || '';

  const mqttClient = mqtt.connect(mqttUrl, {
    username: mqttUser || undefined,
    password: mqttPass || undefined,
  });

  mqttClient.on('connect', () => console.log('MQTT connected'));
  mqttClient.on('reconnect', () => console.log('MQTT reconnecting...'));
  mqttClient.on('error', (err) => console.error('MQTT error:', err.message));
  mqttClient.on('close', () => console.log('MQTT disconnected'));

  if (!WebSocketServerConstructor) {
    console.error('Missing dependency "ws". Install with: npm i ws');
    return { wss: null, mqttClient };
  }

  const wss = new WebSocketServerConstructor({ server });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', (raw /*, isBinary */) => {
      const text =
        typeof raw === 'string' ? raw : (raw && typeof raw.toString === 'function' ? raw.toString() : '');
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        ws.send(JSON.stringify({ ok: false, error: 'Invalid JSON. Expected: {"device":"...","action":"..."}' }));
        return;
      }

      const device = payload && payload.device;
      const action = payload && payload.action;

      if (!device || typeof action === 'undefined') {
        ws.send(JSON.stringify({ ok: false, error: 'Missing "device" or "action"' }));
        return;
      }

      if (device === 'light') {
        const circuitId = payload.circuitId;
        const index = payload.index;
        const roomId = payload.roomId;

        if (!circuitId || (typeof index !== 'number' && typeof index !== 'string')) {
          ws.send(JSON.stringify({ ok: false, error: 'Missing "circuitId" or "index" for light' }));
          return;
        }

        const topicTpl = process.env.LIGHT_TOPIC_TEMPLATE || 'fradomos/light/{circuitId}/{index}/set';
        const topic = topicTpl.replace('{circuitId}', String(circuitId)).replace('{index}', String(index));

        mqttClient.publish(topic, String(action), (err) => {
          if (err) {
            ws.send(JSON.stringify({ ok: false, error: `MQTT publish failed: ${err.message}` }));
            return;
          }
          console.log(`➡ MQTT publish: ${topic} => ${action}`, roomId ? `(room: ${roomId})` : '');
          ws.send(JSON.stringify({ ok: true, published: { topic, action }, roomId: roomId ?? null }));
        });
        return;
      }

      // Fallback for other devices
      const topic = `fradomos/${device}/set`;
      mqttClient.publish(topic, String(action), (err) => {
        if (err) {
          ws.send(JSON.stringify({ ok: false, error: `MQTT publish failed: ${err.message}` }));
          return;
        }
        console.log(`➡ MQTT publish: ${topic} => ${action}`);
        ws.send(JSON.stringify({ ok: true, published: { topic, action } }));
      });
    });

    ws.on('close', () => console.log('WebSocket client disconnected'));
  });

  return { wss, mqttClient };
}
