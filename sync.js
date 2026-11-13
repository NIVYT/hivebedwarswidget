/**
 * GitHub Actions Hive -> Discord Widget Synchronizer
 * Player: NIVYT
 * Application ID: 1521443651191050322
 */

const https = require('https');

const HIVE_PLAYER = 'NIVYT';
const DISCORD_APP_ID = '1521443651191050322';
const DISCORD_TOKEN = process.env.DISCORD_AUTH_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('❌ Error: DISCORD_AUTH_TOKEN environment variable / secret is missing.');
  process.exit(1);
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
            reject(new Error(`Discord API ${method} ${endpoint} returned status ${res.statusCode}: ${JSON.stringify(json)}`));
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
    https.get(`https://api.playhive.com/v0/game/all/bed/${HIVE_PLAYER}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  try {
    console.log(`[1/4] Fetching latest Hive Bedwars stats for ${HIVE_PLAYER}...`);
    const stats = await fetchHiveStats();
    console.log(`✅ Current Hive Stats:
- Beds Broken:  ${stats.beds_destroyed}
- Victories:    ${stats.victories}
- Final Kills:  ${stats.final_kills}
- Total Kills:  ${stats.kills}
- Games Played: ${stats.played}`);

    console.log('\n[2/4] Fetching existing widget configs from Discord...');
    const configs = await requestDiscord('GET', `/applications/${DISCORD_APP_ID}/widget-configs`);
    if (!Array.isArray(configs) || configs.length === 0) {
      throw new Error('No widget configuration found for this Discord application.');
    }

    const activeConfig = configs[0];
    const configId = activeConfig.config_id || activeConfig.id;
    console.log(`✅ Found active config ID: ${configId}`);

    console.log('\n[3/4] Updating stats fields while preserving your existing images & styling...');
    const surfaces = activeConfig.surfaces || {};

    if (surfaces.widget_bottom && surfaces.widget_bottom.components) {
      const comps = surfaces.widget_bottom.components;

      if (comps.stat_1 && comps.stat_1.fields && comps.stat_1.fields.value) {
        comps.stat_1.fields.value.value = stats.beds_destroyed.toLocaleString();
      }
      if (comps.stat_3 && comps.stat_3.fields && comps.stat_3.fields.value) {
        comps.stat_3.fields.value.value = stats.victories.toLocaleString();
      }
      if (comps.stat_4 && comps.stat_4.fields && comps.stat_4.fields.value) {
        comps.stat_4.fields.value.value = stats.final_kills.toLocaleString();
      }
      if (comps.stat_5 && comps.stat_5.fields && comps.stat_5.fields.value) {
        comps.stat_5.fields.value.value = stats.kills.toLocaleString();
      }
      if (comps.stat_6 && comps.stat_6.fields && comps.stat_6.fields.value) {
        comps.stat_6.fields.value.value = `${stats.played.toLocaleString()} Games`;
      }
    }

    const payload = {
      _type: 'discord_widget_config',
      surfaces: surfaces
    };

    await requestDiscord('PATCH', `/applications/${DISCORD_APP_ID}/widget-configs/${configId}`, payload);
    console.log('✅ Successfully patched widget configuration with updated stats.');

    console.log('\n[4/4] Publishing updated widget to Discord...');
    await requestDiscord('POST', `/applications/${DISCORD_APP_ID}/widget-configs/${configId}/publish`);
    console.log('🚀 SUCCESS! Live Bedwars stats published to Discord widget.');
  } catch (error) {
    console.error('❌ Error updating widget:', error.message);
    process.exit(1);
  }
}

run();
