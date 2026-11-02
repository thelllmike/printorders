module.exports = {
  apps: [
    {
      name: "print-orders",
      script: "npm",
      args: "start -- -H 127.0.0.1",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: 3000 },
    },
  ],
};
