/**
 * PM2 Ecosystem Configuration
 * Use with: pm2 start ecosystem.config.js
 * 
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

module.exports = {
    apps: [{
        // Application name
        name: 'vaporbooster',

        // Entry script
        script: 'src/accountHandler.js',

        // Working directory
        cwd: __dirname,

        // Arguments
        args: '',

        // Instances (1 for Steam limitation)
        instances: 1,

        // Auto-restart on crash
        autorestart: true,

        // Watch for file changes (disable in production)
        watch: false,

        // Max memory before restart
        max_memory_restart: '500M',

        // Environment variables
        env: {
            NODE_ENV: 'production'
        },

        // Development environment
        env_development: {
            NODE_ENV: 'development'
        },

        // Log configuration
        log_file: 'logs/pm2-combined.log',
        out_file: 'logs/pm2-out.log',
        error_file: 'logs/pm2-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',

        // Merge logs from all instances
        merge_logs: true,

        // Restart delay
        restart_delay: 5000,

        // Graceful shutdown timeout
        kill_timeout: 5000,

        // Wait for ready signal
        wait_ready: false,

        // Listen for shutdown message
        listen_timeout: 3000,

        // Exponential backoff restart
        exp_backoff_restart_delay: 100,

        // Max restarts in time window
        max_restarts: 10,
        min_uptime: '10s'
    }]
};