/**
 * Live Hive Bedwars -> Discord Widget Auto-Updater
 * Player: NIVYT
 * App ID: 1521443651191050322
 */

const https = require('https');
const fs = require('fs');

// Configuration
const HIVE_PLAYER = 'NIVYT';
const POLL_INTERVAL_MS = 60000; // Check every 60 seconds
const DISCORD_APP_ID = '1521443651191050322';

// Set your authorization token here (obtained from Developer Portal Network tab, or environment variable)
const DISCORD_TOKEN = process.env.DISCORD_AUTH_TOKEN || '';

let lastBedsDestroyed = -1;
let lastWins = -1;
let lastFinalKills = -1;
let configId = null;

function requestDiscord(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    if (!DISCORD_TOKEN) {
      return reject(new Error('DISCORD_AUTH_TOKEN is not set.'));
    }

    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'discord.com',
      path: `/api/v9${endpoint}`,
      method: method,
      headers: {
        'Authorization': DISCORD_TOKEN,
        'Content-Type': 'application/json',
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
            reject(new Error(`Discord API error ${res.statusCode}: ${JSON.stringify(json)}`));
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

function buildWidgetConfig(stats) {
  return {
    "_type": "discord_widget_config",
    "surfaces": {
      "widget_top": {
        "layout": "widget_top_contained",
        "components": {
          "title": {
            "fields": {
              "text": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "NIVYT"
              }
            }
          },
          "subtitle_1": {
            "fields": {
              "text": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "6 Year Hive Veteran 🟡"
              }
            }
          }
        }
      },
      "widget_bottom": {
        "layout": "widget_bottom_stats",
        "components": {
          "stat_1": {
            "fields": {
              "value": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": stats.beds_destroyed.toLocaleString()
              },
              "label": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "Beds Broken"
              }
            }
          },
          "stat_2": {
            "fields": {
              "value": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "Level 51"
              },
              "label": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "BedWars Rank"
              }
            }
          },
          "stat_3": {
            "fields": {
              "value": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": stats.victories.toLocaleString()
              },
              "label": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "Victories"
              }
            }
          },
          "stat_4": {
            "fields": {
              "value": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": stats.final_kills.toLocaleString()
              },
              "label": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "Final Kills"
              }
            }
          },
          "stat_5": {
            "fields": {
              "value": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": stats.kills.toLocaleString()
              },
              "label": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "Total Kills"
              }
            }
          },
          "stat_6": {
            "fields": {
              "value": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": `${stats.played.toLocaleString()} Games`
              },
              "label": {
                "value_type": "custom_string",
                "presentation_type": "text",
                "value": "Played"
              }
            }
          }
        }
      }
    }
  };
}

async function syncToDiscord(stats) {
  if (!DISCORD_TOKEN) {
    console.log('⚠️ [Local Mode] DISCORD_AUTH_TOKEN not set. Saved updated payload to live_payload.json.');
    fs.writeFileSync('C:\\Users\\Nived\\Desktop\\Widget\\live_payload.json', JSON.stringify(buildWidgetConfig(stats), null, 2));
    return;
  }

  try {
    // 1. Discover config ID if not already cached
    if (!configId) {
      const configs = await requestDiscord('GET', `/applications/${DISCORD_APP_ID}/widget-configs`);
      if (Array.isArray(configs) && configs.length > 0) {
        configId = configs[0].config_id || configs[0].id;
        console.log(`Found active widget config ID: ${configId}`);
      } else {
        throw new Error('No widget configuration found on Discord application.');
      }
    }

    // 2. Patch widget config
    const configPayload = buildWidgetConfig(stats);
    await requestDiscord('PATCH', `/applications/${DISCORD_APP_ID}/widget-configs/${configId}`, configPayload);
    console.log('✅ Updated Discord widget config successfully.');

    // 3. Publish widget
    await requestDiscord('POST', `/applications/${DISCORD_APP_ID}/widget-configs/${configId}/publish`);
    console.log('🚀 Published live widget updates to Discord!');
  } catch (err) {
    console.error('❌ Failed to push update to Discord:', err.message);
  }
}

async function checkAndUpdate() {
  try {
    const stats = await fetchHiveStats();
    const time = new Date().toLocaleTimeString();

    if (stats.beds_destroyed !== lastBedsDestroyed || stats.victories !== lastWins || stats.final_kills !== lastFinalKills) {
      console.log(`[${time}] ⚡ Stats updated! Beds: ${stats.beds_destroyed}, Wins: ${stats.victories}, Final Kills: ${stats.final_kills}`);
      lastBedsDestroyed = stats.beds_destroyed;
      lastWins = stats.victories;
      lastFinalKills = stats.final_kills;

      await syncToDiscord(stats);
    } else {
      console.log(`[${time}] Stats unchanged (Beds: ${stats.beds_destroyed}, Wins: ${stats.victories}). Next check in ${POLL_INTERVAL_MS / 1000}s.`);
    }
  } catch (err) {
    console.error('Error fetching Hive stats:', err.message);
  }

  setTimeout(checkAndUpdate, POLL_INTERVAL_MS);
}

console.log(`📡 Starting Hive Bedwars auto-updater for ${HIVE_PLAYER}...`);
checkAndUpdate();
