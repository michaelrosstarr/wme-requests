'use strict';

const axios = require('axios');

/**
 * Build a human-readable notification message for a request.
 * @param {object} request - The request row from the database.
 * @param {string} countryName
 * @returns {object} - { title, body, color }
 */
function buildMessage(request, countryName) {
  const typeLabel = request.type === 'downlock' ? '🔒 Downlock Request' : '🖼️ Imagery Request';
  const lockInfo = request.type === 'downlock' && request.lock_level != null
    ? `\nLock Level: **${request.lock_level}**`
    : '';
  const submitter = request.submitted_by ? `\nSubmitted by: ${request.submitted_by}` : '';
  const notes = request.notes ? `\nNotes: ${request.notes}` : '';

  const title = `${typeLabel} — ${countryName}`;
  const body = `Permalink: ${request.permalink}${lockInfo}${submitter}${notes}`;
  const color = request.type === 'downlock' ? 0xe74c3c : 0x3498db;

  return { title, body, color };
}

/**
 * Send a notification to a Slack incoming webhook.
 * @param {string} webhookUrl
 * @param {object} message
 */
async function sendSlack(webhookUrl, message) {
  const payload = {
    text: `*${message.title}*\n${message.body}`,
    attachments: [
      {
        color: `#${message.color.toString(16).padStart(6, '0')}`,
        text: message.body,
        title: message.title,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
  await axios.post(webhookUrl, payload, { timeout: 8000 });
}

/**
 * Send a notification to a Discord webhook.
 * @param {string} webhookUrl
 * @param {object} message
 */
async function sendDiscord(webhookUrl, message) {
  const payload = {
    embeds: [
      {
        title: message.title,
        description: message.body,
        color: message.color,
        timestamp: new Date().toISOString(),
      },
    ],
  };
  await axios.post(webhookUrl, payload, { timeout: 8000 });
}

/**
 * Send a notification via the Telegram Bot API.
 * @param {string} botToken
 * @param {string} chatId
 * @param {object} message
 */
async function sendTelegram(botToken, chatId, message) {
  const text = `*${escapeMarkdown(message.title)}*\n${escapeMarkdown(message.body)}`;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
  }, { timeout: 8000 });
}

/**
 * Escape special MarkdownV2 characters for Telegram.
 * @param {string} text
 * @returns {string}
 */
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Dispatch a notification to a single channel record.
 * @param {object} channel - A row from notification_channels.
 * @param {object} message - Built message object from buildMessage().
 * @returns {Promise<{channel_id: number, success: boolean, error?: string}>}
 */
async function dispatchToChannel(channel, message) {
  try {
    if (channel.platform === 'slack') {
      await sendSlack(channel.webhook_url, message);
    } else if (channel.platform === 'discord') {
      await sendDiscord(channel.webhook_url, message);
    } else if (channel.platform === 'telegram') {
      await sendTelegram(channel.bot_token, channel.chat_id, message);
    }
    return { channel_id: channel.id, success: true };
  } catch (err) {
    return {
      channel_id: channel.id,
      success: false,
      error: err.message,
    };
  }
}

/**
 * Send notifications for a newly created request.
 * Channels are resolved in priority order:
 *   1. Channels specific to the request event_type (downlock | imagery)
 *   2. Global channels for the country
 * Both sets are notified (not exclusive).
 *
 * @param {object} db - better-sqlite3 database instance.
 * @param {object} request - The newly created request row.
 * @param {string} countryName
 * @returns {Promise<Array>} - Results for each channel.
 */
async function sendNotifications(db, request, countryName) {
  const channels = db
    .prepare(
      `SELECT * FROM notification_channels
       WHERE country_id = ?
         AND event_type IN ('global', ?)
       ORDER BY event_type DESC`
    )
    .all(request.country_id, request.type);

  if (channels.length === 0) return [];

  const message = buildMessage(request, countryName);
  const results = await Promise.all(channels.map((ch) => dispatchToChannel(ch, message)));
  return results;
}

module.exports = { sendNotifications, buildMessage, dispatchToChannel };
