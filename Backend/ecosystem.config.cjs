/**
 * PM2 process file — cluster mode for basic horizontal scale on one VPS.
 *
 * Usage on VPS:
 *   cd Backend
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *
 * Scale instances (CPU-bound):
 *   pm2 scale kinbech-backend 2
 *   # or edit instances below and `pm2 reload ecosystem.config.cjs`
 */
module.exports = {
  apps: [
    {
      name: 'kinbech-backend',
      script: 'src/server.js',
      cwd: __dirname,
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
