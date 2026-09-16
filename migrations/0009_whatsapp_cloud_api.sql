CREATE TABLE IF NOT EXISTS webhook_events (
  channel TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel, event_id)
);

CREATE TABLE IF NOT EXISTS channel_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender TEXT,
  destination TEXT,
  event_id TEXT,
  message_type TEXT NOT NULL,
  command TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  occurred_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (channel, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_updated ON webhook_events(channel, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_channel_messages_status_updated ON channel_messages(channel, status, updated_at);
