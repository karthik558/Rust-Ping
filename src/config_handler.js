const fs = require('fs');
const path = require('path');

function updateConfigFile(content) {
    try {
        const configPath = path.join(__dirname, '../static/config.js');
        fs.writeFileSync(configPath, content);
        return true;
    } catch (error) {
        console.error('Error updating config file:', error);
        return false;
    }
}

module.exports = {
    updateConfigFile
}; 