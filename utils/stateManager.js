/**
 * VaporBooster - State Manager
 * Handles persistence, snapshots, and recovery
 * 
 * @author VaporBooster Team
 */

const fs = require('fs');
const path = require('path');
const { sanitizeObject } = require('./validator');

const STATE_VERSION = '1.0.0';

class StateManager {
    constructor() {
        this.stateDir = path.join(__dirname, '..', 'data', 'state');
        this.backupDir = path.join(__dirname, '..', 'data', 'backups');
        this.maxBackups = 10;
        this.autoSaveInterval = null;
        this.init();
    }

    /**
     * Initialize state directories
     */
    init() {
        [this.stateDir, this.backupDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            }
        });
    }

    /**
     * Save current state snapshot
     * @param {Object} state 
     * @returns {boolean}
     */
    saveState(state) {
        try {
            const snapshot = {
                version: STATE_VERSION,
                timestamp: new Date().toISOString(),
                state: sanitizeObject(state)
            };

            const statePath = path.join(this.stateDir, 'current.json');
            const tempPath = `${statePath}.tmp`;

            // Write to temp file first
            fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), {
                mode: 0o600
            });

            // Atomic rename
            fs.renameSync(tempPath, statePath);

            return true;
        } catch (err) {
            console.error('Failed to save state:', err.message);
            return false;
        }
    }

    /**
     * Load state snapshot
     * @returns {Object|null}
     */
    loadState() {
        try {
            const statePath = path.join(this.stateDir, 'current.json');

            if (!fs.existsSync(statePath)) {
                return null;
            }

            const data = fs.readFileSync(statePath, 'utf8');
            const snapshot = JSON.parse(data);

            // Verify version compatibility
            if (snapshot.version !== STATE_VERSION) {
                console.warn('State version mismatch, attempting migration...');
                return this.migrateState(snapshot);
            }

            return sanitizeObject(snapshot.state);
        } catch (err) {
            console.error('Failed to load state:', err.message);
            return null;
        }
    }

    /**
     * Create backup of current state
     * @returns {string|null} Backup filename
     */
    createBackup() {
        try {
            const statePath = path.join(this.stateDir, 'current.json');

            if (!fs.existsSync(statePath)) {
                return null;
            }

            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const backupName = `backup_${timestamp}.json`;
            const backupPath = path.join(this.backupDir, backupName);

            fs.copyFileSync(statePath, backupPath);

            // Cleanup old backups
            this.cleanupBackups();

            return backupName;
        } catch (err) {
            console.error('Failed to create backup:', err.message);
            return null;
        }
    }

    /**
     * Restore from backup
     * @param {string} backupName 
     * @returns {boolean}
     */
    restoreBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            const statePath = path.join(this.stateDir, 'current.json');

            if (!fs.existsSync(backupPath)) {
                console.error('Backup not found:', backupName);
                return false;
            }

            fs.copyFileSync(backupPath, statePath);
            return true;
        } catch (err) {
            console.error('Failed to restore backup:', err.message);
            return false;
        }
    }

    /**
     * List available backups
     * @returns {Array<Object>}
     */
    listBackups() {
        try {
            const files = fs.readdirSync(this.backupDir);

            return files
                .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
                .map(f => {
                    const stats = fs.statSync(path.join(this.backupDir, f));
                    return {
                        name: f,
                        size: stats.size,
                        created: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);
        } catch (err) {
            console.error('Failed to list backups:', err.message);
            return [];
        }
    }

    /**
     * Cleanup old backups
     */
    cleanupBackups() {
        try {
            const backups = this.listBackups();

            if (backups.length > this.maxBackups) {
                const toDelete = backups.slice(this.maxBackups);

                toDelete.forEach(backup => {
                    const filePath = path.join(this.backupDir, backup.name);
                    fs.unlinkSync(filePath);
                });
            }
        } catch (err) {
            console.error('Failed to cleanup backups:', err.message);
        }
    }

    /**
     * Enable auto-save
     * @param {Function} getStateCallback 
     * @param {number} intervalMs 
     */
    enableAutoSave(getStateCallback, intervalMs = 300000) {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(() => {
            const state = getStateCallback();
            if (state) {
                this.saveState(state);
            }
        }, intervalMs);
    }

    /**
     * Disable auto-save
     */
    disableAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Migrate state from old version
     * @param {Object} oldSnapshot 
     * @returns {Object}
     */
    migrateState(oldSnapshot) {
        // Add migration logic here for future versions
        console.warn('State migration not implemented, returning as-is');
        return oldSnapshot.state;
    }

    /**
     * Export state to file
     * @param {string} filepath 
     * @param {Object} state 
     * @returns {boolean}
     */
    exportState(filepath, state) {
        try {
            const data = {
                version: STATE_VERSION,
                exported: new Date().toISOString(),
                state: sanitizeObject(state)
            };

            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), {
                mode: 0o600
            });

            return true;
        } catch (err) {
            console.error('Failed to export state:', err.message);
            return false;
        }
    }

    /**
     * Import state from file
     * @param {string} filepath 
     * @returns {Object|null}
     */
    importState(filepath) {
        try {
            if (!fs.existsSync(filepath)) {
                return null;
            }

            const data = fs.readFileSync(filepath, 'utf8');
            const imported = JSON.parse(data);

            return sanitizeObject(imported.state);
        } catch (err) {
            console.error('Failed to import state:', err.message);
            return null;
        }
    }
}

module.exports = new StateManager();