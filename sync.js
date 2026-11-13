/**
 * Pure GitHub 24/7 Hive Bedwars -> Discord Widget Synchronizer
 * Player: NIVYT
 * Application ID: 1521443651191050322
 */

const https = require('https');

const HIVE_PLAYER = 'NIVYT';
const DISCORD_APP_ID = '1521443651191050322';
const DISCORD_TOKEN = process.env.DISCORD_AUTH_TOKEN;

// Total duration to keep each GitHub Action runner alive (in minutes)
// Runs a 60-second polling loop during this time
const RUNNER_DURATION_MINUTES = parseInt(process.env.SYNC_DURATION_MINUTES || '14', 10);
const POLL_INTERVAL_SECONDS = 60;

if (!DISCORD_TOKEN) {
  console.error('❌ Error: DISCORD_AUTH_TOKEN secret is missing in GitHub repository.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestDiscord(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'discord.com',
      path: `/api/v9${endpoint}`,
      method: method,
      headers: {
        'Authorization': DISCORD_TOKEN,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Discord-Widget-Updater/1.0',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`Discord API ${method} ${endpoint} returned ${res.statusCode}: ${JSON.stringify(json)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function fetchHiveStats() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.playhive.com/v0/game/all/bed/${HIVE_PLAYER}`, {
      headers: { 'User-Agent': 'Hive-Bedwars-Discord-Widget/1.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`Hive API returned ${res.statusCode}: ${data}`));
          }
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

let lastStatsHash = null;

async function syncOnce() {
  const stats = await fetchHiveStats();
  const currentHash = `${stats.beds_destroyed}-${stats.victories}-${stats.final_kills}-${stats.kills}-${stats.played}`;

  if (lastStatsHash === currentHash) {
    console.log(`[${new Date().toISOString()}] No stat changes detected (Beds: ${stats.beds_destroyed}, Wins: ${stats.victories}). Skipping Discord update.`);
    return false;
  }

  console.log(`\n[${new Date().toISOString()}] 🔄 Stat change detected or initial sync!`);
  console.log(`- Beds Broken:  ${stats.beds_destroyed.toLocaleString()}`);
  console.log(`- Victories:    ${stats.victories.toLocaleString()}`);
  console.log(`- Final Kills:  ${stats.final_kills.toLocaleString()}`);
  console.log(`- Total Kills:  ${stats.kills.toLocaleString()}`);
  console.log(`- Games Played: ${stats.played.toLocaleString()}`);

  const configs = await requestDiscord('GET', `/applications/${DISCORD_APP_ID}/widget-configs`);
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new Error('No widget configuration found for this Discord application.');
  }

  const activeConfig = configs[0];
  const configId = activeConfig.config_id || activeConfig.id;
  const surfaces = activeConfig.surfaces || {};

  if (surfaces.widget_bottom && surfaces.widget_bottom.components) {
    const comps = surfaces.widget_bottom.components;

    if (comps.stat_1?.fields?.value) comps.stat_1.fields.value.value = stats.beds_destroyed.toLocaleString();
    if (comps.stat_3?.fields?.value) comps.stat_3.fields.value.value = stats.victories.toLocaleString();
    if (comps.stat_4?.fields?.value) comps.stat_4.fields.value.value = stats.final_kills.toLocaleString();
    if (comps.stat_5?.fields?.value) comps.stat_5.fields.value.value = stats.kills.toLocaleString();
    if (comps.stat_6?.fields?.value) comps.stat_6.fields.value.value = `${stats.played.toLocaleString()} Games`;
  }

  // Also update widget top subtitle if exists
  if (surfaces.widget_top?.components?.subtitle_2?.fields?.text) {
    surfaces.widget_top.components.subtitle_2.fields.text.value = `${stats.beds_destroyed.toLocaleString()} Beds Destroyed 🛏️`;
  }

  const payload = {
    _type: 'discord_widget_config',
    surfaces: surfaces
  };

  await requestDiscord('PATCH', `/applications/${DISCORD_APP_ID}/widget-configs/${configId}`, payload);
  await requestDiscord('POST', `/applications/${DISCORD_APP_ID}/widget-configs/${configId}/publish`);

  console.log(`✅ [${new Date().toISOString()}] Successfully pushed & published live stats to Discord widget!`);
  lastStatsHash = currentHash;
  return true;
}

async function main() {
  console.log(`🚀 Starting Pure GitHub Sync Engine for ${HIVE_PLAYER}`);
  console.log(`⏱️ Runner will poll every ${POLL_INTERVAL_SECONDS}s for up to ${RUNNER_DURATION_MINUTES} minutes.\n`);

  const startTime = Date.now();
  const maxDurationMs = RUNNER_DURATION_MINUTES * 60 * 1000;
  let cycle = 1;

  while (Date.now() - startTime < maxDurationMs) {
    try {
      console.log(`--- [Poll Cycle #${cycle}] ---`);
      await syncOnce();
    } catch (err) {
      console.error(`⚠️ Error during cycle #${cycle}: ${err.message}`);
    }

    cycle++;
    // Wait until next poll
    if (Date.now() - startTime < maxDurationMs) {
      await sleep(POLL_INTERVAL_SECONDS * 1000);
    }
  }

  console.log(`\n🏁 Runner duration (${RUNNER_DURATION_MINUTES}m) completed cleanly. Next GitHub cron runner will pick up seamlessly.`);
}

main().catch(err => {
  console.error('Fatal error in sync engine:', err);
  process.exit(1);
});
