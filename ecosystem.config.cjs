module.exports = {
  apps: [
    {
      name: 'server-monitor',
      script: 'server/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      env: {
        NODE_ENV: 'production',
        PORT: 4400,
        AUTH_PASSWORD: 'CHANGE_ME',
      },
      watch: false,
      max_memory_restart: '200M',
    },
  ],
}
