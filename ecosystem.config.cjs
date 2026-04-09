/**
 * PM2 misol konfiguratsiyasi (production).
 * `connection_limit` ni cluster o‘lchamiga moslang — docs/DATABASE_POOL.md
 */
module.exports = {
  apps: [
    {
      name: "salec-api",
      cwd: "./backend",
      script: "dist/src/index.js",
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
