module.exports = {
  apps: [
    {
      name: "salec-backend",
      cwd: "/opt/salec/backend",
      script: "dist/src/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "4000"
      },
      error_file: "/var/log/salec/backend-error.log",
      out_file: "/var/log/salec/backend-out.log",
      time: true
    },
    {
      name: "salec-frontend",
      cwd: "/opt/salec/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      },
      error_file: "/var/log/salec/frontend-error.log",
      out_file: "/var/log/salec/frontend-out.log",
      time: true
    }
  ]
};
